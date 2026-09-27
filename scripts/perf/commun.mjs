// ============================================================================
// scripts/perf/commun.mjs — ce que partagent les bancs du navigateur
//
// Les bancs mesurent le BUILD DE PRODUCTION du web (servi par `node server.js`
// de la sortie autonome), branché sur l'API en mode développement — qui seule
// délivre un jeton sans mot de passe (`POST /api/auth/dev-token`). Données de
// démonstration attendues (profil `demo`) : les pages sont jugées « affichées »
// sur des textes de ce jeu de données.
//
// Réglages (variables d'environnement) :
//   ARGOS_API        origine de l'API en mode développement   (http://localhost:3005)
//   ARGOS_USER       compte du jeton de développement         (m.zraib, superadmin)
//   CHROME_PATH      Chrome à piloter                          (Chrome de macOS)
//   PLAYWRIGHT_CORE  module playwright-core à importer         (« playwright-core »)
//
// playwright-core n'est PAS une dépendance du dépôt — outil de campagne, jamais
// livré : `npx -y playwright-core --version` le dépose dans le cache npx, et
// PLAYWRIGHT_CORE reçoit le chemin de son `index.mjs`. Aucun navigateur n'est
// téléchargé : c'est le Chrome du poste qui est piloté.
// ============================================================================
import { pathToFileURL } from "node:url";

export const API = process.env.ARGOS_API ?? "http://localhost:3005";
/** Hôte de l'API (`localhost:3005`) : filtre des requêtes vers l'API dans le minutage des ressources. */
export const API_HOTE = new URL(API).host;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UTILISATEUR = process.env.ARGOS_USER ?? "m.zraib";

/**
 * Les vingt lectures du chargement du domaine (`loadDomain`) — au démarrage ET
 * à chaque événement temps réel « domain ». À tenir alignées sur
 * `apps/web/src/lib/store/slices/domain.ts`.
 */
export const LECTURES_DOMAINE = [
  "/api/incidents", "/api/units", "/api/hospitals", "/api/field-hospitals", "/api/feed",
  "/api/dispatch/queue", "/api/dispatch/movements", "/api/catalog", "/api/comms", "/api/reference",
  "/api/incident-types", "/api/dashboard/stats", "/api/sub-incident-types", "/api/comms/responsables",
  "/api/comms/notices", "/api/posts", "/api/shelters", "/api/morgues", "/api/resources/placed", "/api/incidents/map",
];

/** Chrome sans interface, piloté par playwright-core. */
export async function lancerChrome() {
  const spec = process.env.PLAYWRIGHT_CORE ?? "playwright-core";
  let pw;
  try {
    pw = await import(/[\\/]/.test(spec) ? pathToFileURL(spec).href : spec);
  } catch {
    console.error("playwright-core introuvable — voir l'en-tête de scripts/perf/commun.mjs (PLAYWRIGHT_CORE).");
    process.exit(2);
  }
  return pw.chromium.launch({ executablePath: CHROME, headless: true, args: ["--enable-precise-memory-info"] });
}

/** Jeton de développement du compte de mesure. */
export async function jetonDev() {
  const r = await fetch(`${API}/api/auth/dev-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: UTILISATEUR, role: "superadmin" }),
  }).catch(() => null);
  if (!r || !r.ok) {
    console.error(`jeton de développement refusé (${r ? r.status : "API injoignable"}) — l'API tourne-t-elle en mode dev sur ${API} ?`);
    process.exit(2);
  }
  return { ...(await r.json()), matricule: UTILISATEUR };
}

/**
 * Script d'initialisation (sérialisé dans la page : il ne doit rien capturer) —
 * la session est ouverte avant le premier script de l'application.
 */
export function ouvrirSession(t) {
  sessionStorage.setItem("argos_auth", "1");
  sessionStorage.setItem("argos_token", t.access_token);
  sessionStorage.setItem("argos_session_role", t.role);
  sessionStorage.setItem("argos_session_profile", t.profile);
  sessionStorage.setItem("argos_session_user", JSON.stringify({ matricule: t.matricule, nom: t.matricule, roles: [t.role] }));
}

/** Écriture NEUTRE qui déclenche un événement « domain » : une unité reçoit son propre effectif. */
export async function ecritureNeutre(t) {
  const h = { Authorization: `Bearer ${t.access_token}` };
  const unite = (await (await fetch(`${API}/api/units`, { headers: h })).json())[0];
  return async () => {
    const r = await fetch(`${API}/api/units/${unite.id}`, {
      method: "PATCH",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ eff: unite.eff }),
    });
    if (!r.ok) throw new Error(`écriture neutre refusée : ${r.status}`);
  };
}

/** Médiane (valeurs non numériques ignorées). */
export function mediane(xs) {
  const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
}

/** Médiane champ par champ d'une série de passages. */
export function resume(passages) {
  return Object.fromEntries(Object.keys(passages[0]).map((k) => [k, mediane(passages.map((p) => p[k]))]));
}

/**
 * Temps processeur NON inactif du fil principal pendant `ms` (profileur CDP,
 * échantillon toutes les `pas` µs), avec une action lancée au début.
 */
export async function tempsOccupe(cdp, ms, action, pas = 250) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: pas });
  await cdp.send("Profiler.start");
  if (action) await action();
  await new Promise((r) => setTimeout(r, ms));
  const { profile } = await cdp.send("Profiler.stop");
  const inactifs = new Set(profile.nodes.filter((n) => n.callFrame.functionName === "(idle)").map((n) => n.id));
  let occupe = 0;
  profile.samples.forEach((id, k) => {
    if (!inactifs.has(id)) occupe += profile.timeDeltas[k] ?? 0;
  });
  return occupe / 1000;
}
