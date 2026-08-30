// ============================================================================
// ARGOS — Affecteur IA Hospinet
// ----------------------------------------------------------------------------
// Tri d'hôpitaux pour une évacuation sanitaire :
//   1. Couche 1 — déterministe : tri par score pondéré
//        · distance Haversine × facteur de détour (voyage)
//        · taux d'occupation global (lits disponibles = capacité résiduelle)
//        · couverture des services médicaux requis (pondérée)
//        · bonus REA disponible / Héli / Ambulances
//   2. Couche 2 — LLM local : justification en langage naturel du top 3
//        · strictement limitée aux chiffres de la Couche 1
//        · interdiction d'inventer faits techniques ou ordres opérationnels
//        · fallback textuel déterministe si Ollama injoignable
// ============================================================================

import type { FieldHospital, Hospital, HospitalServiceKey } from "@/lib/types";
import { ARGOS_WARD_REFERENCE } from "@/lib/types";
import { resolveHospitalServices } from "@/lib/derive";
import { haversineKm, etaMinutes } from "@/lib/reco";
import { AI_DEFAULT_SETTINGS, AI_ENABLED, AI_TIMEOUT_MS, resolveProvider } from "@/lib/ai/config";
import { chatComplete } from "@/lib/ai/provider";

/* ---------------- Types publics ---------------- */

export interface AffecteurNeed {
  /** Coordonnées [lng, lat] du point d'évacuation (ex : site incident) */
  ll: [number, number] | null;
  /** Nom libre du point (ex : « Épicentre Al Haouz ») — utilisé dans le texte */
  label?: string;
  /** Nombre total de victimes/patients à répartir */
  victims: number;
  /** Services médicaux requis (clés du référentiel ARGOS_WARD_REFERENCE) */
  services: HospitalServiceKey[];
  /** Poids des 3 axes — somme normalisée en interne (pas d'entrée utilisateur) */
  weights?: { travel?: number; capacity?: number; service?: number };
  /** Rayon de recherche en km (0 = pas de filtre dur) */
  radiusKm?: number;
  /** Inclure les hôpitaux de campagne dans le classement ? */
  includeFieldHosps?: boolean;
}

export interface AffecteurRow {
  /** Hôpital classé (toujours le vrai Hospital pour affichage) */
  hospital: Hospital | FieldHospital;
  /** true = hôpital de campagne */
  field: boolean;
  /** Rang 1-indexé dans le classement */
  rank: number;
  /** Score 0..100 */
  score: number;
  /** Distance route (vol oiseau × 1.3) km */
  km: number;
  /** Temps d'acheminement estimé min */
  etaMin: number;
  /** Capacité résiduelle estimée (lits libérables) */
  estimatedFreeBeds: number;
  /** Taux d'occupation global */
  pctOcc: number;
  /** Sur les services demandés : [nbre présents avec lits libres, nbre total demandés] */
  svcMatch: [number, number];
  /** Détail par service requis (statut / lits libres) — ordre identique need.services */
  svcDetail: { key: HospitalServiceKey; name: string; free: number; present: boolean }[];
  /** Décomposition 0..100 du score pour mini-barres */
  breakdown: { travel: number; capacity: number; service: number; bonus: number };
}

export interface AffecteurResult {
  rows: AffecteurRow[];
  /** true = aucun hôpital à l'intérieur du rayon */
  empty: boolean;
  /** Justification globale + top 3, null avant appel LLM */
  justification?: string;
  fallback?: boolean;
  llmError?: string;
}

/* ---------------- Paramètres Couche 1 ---------------- */

const DEFAULT_WEIGHTS = { travel: 0.35, capacity: 0.3, service: 0.35 };

const SERVICE_WEIGHT_BONUS: Record<string, number> = {
  rea: 3.0, urgences: 1.8, chirurgie: 1.4, medecine: 1.1,
  pediatrie: 1.1, cardio: 1.3, pneumo: 1.1, neuro: 1.3, orthopedie: 1.2,
};
const AMB_BONUS = 1.5;    // pts / ambulance
const HELI_BONUS = 2.2;   // pts / hélicoptère
const OCC_OPTIMAL = 60;   // taux d'occupation idéal
const OCC_HARD_MAX = 96;  // exclusion dure

/* ---------------- COUCHE 1 — Tri déterministe ---------------- */

function round(n: number, p = 1) {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

function serviceName(key: HospitalServiceKey): string {
  return ARGOS_WARD_REFERENCE.find((r) => r.key === key)?.label ?? String(key);
}

export function rankHospitals(
  need: AffecteurNeed,
  hospitals: Hospital[],
  fieldHosps: FieldHospital[] = [],
): AffecteurResult {
  const radius = need.radiusKm && need.radiusKm > 0 ? need.radiusKm : Infinity;
  const raw = need.weights ?? DEFAULT_WEIGHTS;
  const sum = (raw.travel ?? 0) + (raw.capacity ?? 0) + (raw.service ?? 0) || 1;
  const w = {
    travel: (raw.travel ?? DEFAULT_WEIGHTS.travel) / sum,
    capacity: (raw.capacity ?? DEFAULT_WEIGHTS.capacity) / sum,
    service: (raw.service ?? DEFAULT_WEIGHTS.service) / sum,
  };

  const required = need.services?.length ? need.services : (["rea", "urgences"] as HospitalServiceKey[]);
  const origin = need.ll ?? [0, 0];

  // Préparation pool : hôpitaux fixes + optionnellement hôpitaux de campagne.
  type PoolItem = { h: Hospital | FieldHospital; field: boolean };
  const pool: PoolItem[] = [];
  for (const h of hospitals) pool.push({ h, field: false });
  if (need.includeFieldHosps) for (const f of fieldHosps) pool.push({ h: f, field: true });

  const rows: AffecteurRow[] = [];

  for (const item of pool) {
    const { h, field } = item;

    // Champs normalisés (hôpital fixe vs campagne)
    const hll = h.ll ?? [0, 0];
    const km = haversineKm(origin, hll);
    if (km > radius) continue;

    let litsTotal = field ? (h as FieldHospital).cap : (h as Hospital).lits;
    let litsOcc = field ? (h as FieldHospital).occ : (h as Hospital).occ;
    if (litsTotal <= 0) litsTotal = 1;
    if (litsOcc < 0) litsOcc = 0;
    if (litsOcc > litsTotal) litsOcc = litsTotal;
    const pctOcc = round((100 * litsOcc) / litsTotal, 0);
    const free = litsTotal - litsOcc;

    if (pctOcc >= OCC_HARD_MAX) continue; // exclusion dure : saturation critique

    const eta = etaMinutes(origin, hll);

    // ---- Score axis 1 : VOYAGE ----
    const travel = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.min(eta, 240) / 240))));

    // ---- Score axis 2 : CAPACITÉ ----
    // Cloche centrée sur OCC_OPTIMAL : un hôpital à 60% est le plus
    // approprié (peu de risque, reste de la marge). Trop vide = suspect
    // (petite structure), trop plein = à éviter.
    const d = Math.abs(pctOcc - OCC_OPTIMAL);
    const capacity = Math.max(0, Math.round(100 * (1 - d / 45)));

    // ---- Score axis 3 : ADÉQUATION SERVICES REQUIS ----
    // Pour chaque service demandé : bonus = min(litsLibres, 6) × poids.
    // Service absent → 0. Le score service est (somme / sum_poids) * 100
    // tronqué à 100. On garde aussi le détail pour affichage UI.
    const resolved = field ? [] : resolveHospitalServices(h as Hospital);
    let svcPts = 0;
    let denom = 0;
    const svcDetail: AffecteurRow["svcDetail"] = [];
    let svcPresentCount = 0;

    for (const key of required) {
      const sw = SERVICE_WEIGHT_BONUS[key] ?? 1;
      denom += sw;
      if (field) {
        const hasAny = true; // campagne = multi-service générique
        const estFree = Math.max(0, (h as FieldHospital).cap - (h as FieldHospital).occ);
        const freeVal = Math.min(estFree, 8);
        const pts = Math.min(sw * freeVal * 5, 100 * sw);
        svcPts += pts;
        svcPresentCount += 1;
        svcDetail.push({ key, name: serviceName(key), free: estFree, present: hasAny });
      } else {
        const entry = resolved.find((r) => r.key === key);
        const present = !!entry && entry.free > 0;
        const freeVal = entry?.free ?? 0;
        const pts = present ? Math.min(sw * Math.min(freeVal, 10) * 4.5, 100 * sw) : 0;
        svcPts += pts;
        if (present) svcPresentCount += 1;
        svcDetail.push({ key, name: serviceName(key), free: freeVal, present });
      }
    }
    const service = denom > 0 ? Math.max(0, Math.min(100, Math.round((svcPts / denom) * 1))) : 0;

    // ---- Bonus : flotte sanitaire ----
    const amb = field ? 0 : (h as Hospital).amb ?? 0;
    const heli = field ? 0 : (h as Hospital).heli ?? 0;
    const bonus = Math.min(20, Math.round(AMB_BONUS * amb + HELI_BONUS * heli));

    const score = Math.max(0, Math.min(100,
      Math.round(w.travel * travel + w.capacity * capacity + w.service * service + bonus / 5),
    ));

    const estFreeBeds = field
      ? Math.max(0, (h as FieldHospital).cap - (h as FieldHospital).occ)
      : free + (Math.max(0, OCC_HARD_MAX - pctOcc) * (h as Hospital).rea) / 200;

    rows.push({
      hospital: h,
      field,
      rank: 0,
      score,
      km: round(km, 1),
      etaMin: eta,
      estimatedFreeBeds: Math.round(estFreeBeds),
      pctOcc,
      svcMatch: [svcPresentCount, required.length],
      svcDetail,
      breakdown: { travel, capacity, service, bonus },
    });
  }

  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => (r.rank = i + 1));

  return { rows, empty: rows.length === 0 };
}

/* ---------------- COUCHE 2 — LLM Justification ---------------- */

const SYSTEM_AFFECTEUR = [
  "Tu es l'assistant de justification de l'Affecteur Hospinet d'ARGOS, plateforme militaire de gestion des catastrophes.",
  "Ton unique rôle : reformuler EN FRANÇAIS CONCIS, NEUTRE ET STRICTEMENT factuel, le classement des hôpitaux calculé par le moteur déterministe de la Couche 1.",
  "",
  "RÈGLES IMPÉRATIVES (SANS EXCEPTION) :",
  "[I1] AUCUNE INVENTION. Tous les chiffres, noms d'hôpitaux, distances, ETA, scores, taux d'occupation, services, nombres de lits, flotte sanitaire viennent EXCLUSIVEMENT du jeu de données Couche 1 fourni. Tu n'ajoutes AUCUNE information, AUCUNE estimation, AUCUNE extrapolation.",
  "[I2] AUCUN ORDRE OPÉRATIONNEL. Tu ne dis PAS : « envoyer », « évacuer vers », « diriger les victimes », « activer le plan », « déployer », ni aucune consigne, procédure, recommandation d'action. Tu exprime TOUJOURS sous forme de CONSTAT NEUTRE (ex : « L'hôpital X apparaît en tête du classement, avec score Y et ETA Z minutes. »).",
  "[I3] PAS DE DIAGNOSTIC, PAS D'AVIS MÉDICAL. Tu ne juges pas la gravité, tu ne proposes pas de triage, tu ne dis pas qu'un service est « adapté » si le chiffre est faible. Tu restes sur les mots de Couche 1 : score, distance, ETA, occupation, services présents.",
  "[I4] PAS DE TERMES IMPRÉCIS. Interdits : « probablement », « semble », « peut-être », « sûrement », « idéalement », « à privilégier », « recommandé », « meilleur choix ». Au lieu de ça : « score X sur 100 », « taux d'occupation Y % », « ETA Z min ».",
  "[I5] STRUCTURE OBLIGATOIRE (rien d'autre, pas de préambule) :",
  "     1. Une phrase de synthèse sur le classement global (nom du top 1, score, ETA, km).",
  "     2. Top 3 : chaque hôpital = 2 lignes courtes, avec les CHIFFRES CLÉS de Couche 1.",
  "     3. Une remarque finale unique : capacité résiduelle réseau, saturation, ou rayon non couvert si besoin. SOIT UNE SEULE REMARQUE, PAS DE CONCLUSION.",
  "[I6] Chaque chiffre cité est IDENTIQUE à celui transmis. Si un chiffre est absent → tu ne le mentionnes pas.",
  "[I7] SORS DU JSON. Ne produit AUCUN bloc ```json, AUCUN tableau Markdown, AUCUNE liste à puces avec tirets (autorisé : sauts de ligne entre les 3 sections).",
].join("\n");

/** Construit le prompt utilisateur à partir des FAITS DÉTERMINISTES SEULEMENT. */
function buildUserPrompt(need: AffecteurNeed, res: AffecteurResult): string {
  const head: string[] = [];
  head.push("# CONTEXTE OPÉRATIONNEL");
  head.push(`- Point d'évacuation : ${need.label ?? "non nommé"} (coord ${(need.ll ?? [0, 0]).map((v) => round(v, 4)).join(", ")})`);
  head.push(`- Victimes estimées : ${need.victims}`);
  head.push(`- Services requis : ${need.services?.length ? need.services.map(serviceName).join(" · ") : "réanimation · urgences (par défaut)"}`);
  head.push(`- Inclut hôpitaux de campagne : ${need.includeFieldHosps ? "oui" : "non"}`);
  if (need.radiusKm && need.radiusKm > 0) head.push(`- Rayon : ${need.radiusKm} km`);
  head.push("");
  head.push("# CLASSIFICATION COUCHE 1 (déterministe, source de vérité)");
  head.push(`- Poids : voyage ${round(DEFAULT_WEIGHTS.travel * 100)}%, capacité ${round(DEFAULT_WEIGHTS.capacity * 100)}%, services ${round(DEFAULT_WEIGHTS.service * 100)}%`);
  head.push(`- Nombre d'hôpitaux classés : ${res.rows.length}`);
  head.push("");
  const top = res.rows.slice(0, Math.min(5, res.rows.length));
  top.forEach((r) => {
    const hName = r.hospital.nom;
    const ville = "ville" in r.hospital ? r.hospital.ville : "";
    const kind = r.field ? "hôpital de campagne" : ("type" in r.hospital && r.hospital.type ? r.hospital.type : "hôpital");
    head.push(`## HOPITAL ${r.rank} : ${hName}${ville ? " (" + ville + ")" : ""} — ${kind}`);
    head.push(`- Score : ${r.score}/100 ; décomposition : voyage ${r.breakdown.travel}, capacité ${r.breakdown.capacity}, service ${r.breakdown.service}, bonus flotte ${r.breakdown.bonus}`);
    head.push(`- Distance : ${r.km} km · ETA estimé : ${r.etaMin} min`);
    head.push(`- Taux d'occupation global : ${r.pctOcc}% · Lits libres estimés : ${r.estimatedFreeBeds}`);
    head.push(`- Couverture services requis : ${r.svcMatch[0]}/${r.svcMatch[1]}` +
      (r.svcDetail.length ? " ; détail : " + r.svcDetail.map((s) => `${s.name}${s.present ? ` (${s.free} libres)` : " (absent)"}`).join(" · ") : ""));
    if (!r.field && "amb" in r.hospital) {
      head.push(`- Flotte sanitaire : amb ${r.hospital.amb ?? 0} · hélico ${r.hospital.heli ?? 0} · personnel ${r.hospital.staff ?? 0}`);
    }
    head.push("");
  });
  head.push("# INSTRUCTION DE RÉPONSE");
  head.push("Formule ta justification STRICTEMENT dans la structure [I5] : 1 phrase synthèse, puis Top 3 (chacun 2 lignes courtes avec CHIFFRES CLÉS), puis 1 remarque finale unique.");
  head.push("RAPPEL [I2] : AUCUNE recommandation/opération/ordre, SEULEMENT des CONSTATS NEUTRES basés sur ce jeu de données.");
  return head.join("\n");
}

/* ---- Fallback textuel déterministe (si LLM down) ---- */

export function fallbackJustification(need: AffecteurNeed, res: AffecteurResult): string {
  if (res.empty) {
    return `Aucun établissement classé à l'intérieur du périmètre${need.radiusKm ? ` de ${need.radiusKm} km` : ""}. ` +
      `Étendez le rayon, activez les hôpitaux de campagne, ou réduisez les services requis.`;
  }
  const top = res.rows.slice(0, Math.min(3, res.rows.length));
  const name = (r: AffecteurRow) => `${r.hospital.nom}${"ville" in r.hospital && r.hospital.ville ? ` (${r.hospital.ville})` : ""}`;
  const parts: string[] = [];
  parts.push(`Classement déterministe — ${top[0] ? name(top[0]) + " en tête (score " + top[0].score + "/100, ETA " + top[0].etaMin + " min, " + top[0].km + " km)." : ""}`);
  top.forEach((r) => {
    parts.push(`· ${name(r)} — score ${r.score} · ETA ${r.etaMin} min · ${r.km} km · occ ${r.pctOcc}% · services ${r.svcMatch[0]}/${r.svcMatch[1]} · lits libres estimés ${r.estimatedFreeBeds}.`);
  });
  const occs = res.rows.map((r) => r.pctOcc);
  const avgOcc = Math.round(occs.reduce((a, b) => a + b, 0) / Math.max(1, occs.length));
  const saturated = res.rows.filter((r) => r.pctOcc >= 90).length;
  parts.push(`Remarque : occupation moyenne des établissements classés = ${avgOcc}%${saturated ? ` — ${saturated} établissement(s) tendus (≥ 90%)` : ""}.`);
  return parts.join("\n");
}

/* ---- Nettoyage post-LLM : garde-fous anti-dérive ---- */

const AFF_FORBIDDEN: [RegExp, string][] = [
  [/il faut[\s,:]/gi, ""],
  [/vous devriez[\s,:]/gi, ""],
  [/je recommande[\s,:]/gi, ""],
  [/(envoyez|envoyer|dirigez|diriger|evacuez|evacuer|devermine|déterminer|activez|activer|déployer|deployer)[^\n]{0,60}/gi, ""],
  [/(tri|triage|trier|diagnostic|diagnostique|gravité|severite|blessé|blesse|deces|décès)[^\n]{0,50}/gi, ""],
  [/(probablement|peut.?être|peut etre|surement|sûrement|idéalement|idealement|privilégier|privilegier|meilleur choix|à recommander|a recommander)/gi, ""],
];

const AFF_REQUIRED_NUMBERS_MIN = 3;

function sanitizeJustification(text: string, res: AffecteurResult): string {
  let t = text ?? "";
  for (const [re, sub] of AFF_FORBIDDEN) t = t.replace(re, sub);
  // Nettoyage lignes vides excessives
  t = t.replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");

  // Vérification : minimum de chiffres présents dans le texte (garantie anti-creux)
  const nums = t.match(/\d+/g) ?? [];
  if (nums.length < AFF_REQUIRED_NUMBERS_MIN) {
    return fallbackJustification({ victims: 0, services: [], ll: null }, res);
  }
  return t;
}

/* ---- API publique : justification LLM avec fallback synchrone ---- */

export async function justifyTop3(need: AffecteurNeed, res: AffecteurResult): Promise<{ text: string; fallback: boolean; llmError?: string }> {
  if (!AI_ENABLED) {
    return { text: fallbackJustification(need, res), fallback: true };
  }
  const cfg = resolveProvider(AI_DEFAULT_SETTINGS);
  try {
    const user = buildUserPrompt(need, res);
    const result = await chatComplete(cfg, [
      { role: "system", content: SYSTEM_AFFECTEUR },
      { role: "user", content: user },
    ]);
    if (!result.ok) {
      return { text: fallbackJustification(need, res), fallback: true, llmError: result.error };
    }
    const clean = sanitizeJustification(result.text, res);
    return { text: clean, fallback: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: fallbackJustification(need, res), fallback: true, llmError: msg };
  }
}
