#!/usr/bin/env node
// ============================================================================
// scripts/perf/bench-web.mjs — banc des pages, build de production, Chrome réel
//
//   node scripts/perf/bench-web.mjs <origine web> <sortie.json> [passages=5] [bridage CPU=4]
//
// 1. Chargement à froid de six écrans (contexte neuf : cache et stockage vides) :
//    TTFB, FCP, LCP, « données affichées », temps de blocage (TBT : somme des
//    tâches longues au-delà de 50 ms), JavaScript transféré et décodé, nombre de
//    requêtes, tas JS, nœuds du DOM.
// 2. Rechargement temps réel, carte ouverte : une écriture neutre sur l'API fait
//    recharger le domaine — lectures provoquées, tâches longues, délai jusqu'à
//    la dernière lecture du domaine.
// 3. Réactivité de la carte : vrais clics souris sur des marqueurs — durée de
//    l'événement (INP) et tâches longues.
//
// Processeur bridé (×4 par défaut) : un poste modeste de la station. Médiane
// des passages. Réglages et prérequis : voir commun.mjs ; méthode et résultats :
// docs/07-performance.md.
// ============================================================================
import { writeFileSync } from "node:fs";
import { API_HOTE, LECTURES_DOMAINE, ecritureNeutre, jetonDev, lancerChrome, ouvrirSession, resume } from "./commun.mjs";

const [ORIGINE, SORTIE] = process.argv.slice(2);
if (!ORIGINE || !SORTIE) {
  console.error("usage : node scripts/perf/bench-web.mjs <origine web> <sortie.json> [passages=5] [bridage CPU=4]");
  process.exit(1);
}
const PASSAGES = Number(process.argv[4] ?? 5);
const BRIDAGE = Number(process.argv[5] ?? 4);

// Écran → ce qui prouve que ses données sont affichées (jeu de démonstration).
const PAGES = {
  "/dashboard": { texte: "Fuite de chlore" },
  "/map": { marqueurs: 150 },
  "/incidents": { texte: "Fuite de chlore" },
  "/hospinet": { motif: "Établissements \\(114\\)" },
  "/opsnet": { motif: "Unités du réseau\\s*12" },
  "/morgue": { texte: "Institut médico-légal" },
};

const tok = await jetonDev();

/** Observateurs de performance posés avant l'application (sérialisé : rien de capturé). */
const observer = (cible) => {
  const P = (window.__perf = { lt: [], ev: [], lcp: 0, cls: 0, ready: null });
  const obs = (type, f, extra = {}) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(f)).observe({ type, buffered: true, ...extra });
    } catch {
      /* type non pris en charge */
    }
  };
  obs("longtask", (e) => P.lt.push([e.startTime, e.duration]));
  obs("largest-contentful-paint", (e) => (P.lcp = e.startTime));
  obs("layout-shift", (e) => {
    if (!e.hadRecentInput) P.cls += e.value;
  });
  obs("event", (e) => P.ev.push({ name: e.name, start: e.startTime, duration: e.duration, processing: e.processingEnd - e.processingStart }), { durationThreshold: 16 });
  const iv = setInterval(() => {
    if (P.ready !== null) return clearInterval(iv);
    const texte = document.body ? document.body.textContent : "";
    const ok = cible.marqueurs
      ? document.querySelectorAll(".maplibregl-marker").length >= cible.marqueurs
      : cible.motif
        ? new RegExp(cible.motif).test(texte)
        : texte.includes(cible.texte);
    if (ok) {
      P.ready = performance.now();
      clearInterval(iv);
    }
  }, 50);
};

const collecte = (apiHote) => {
  const P = window.__perf;
  const nav = performance.getEntriesByType("navigation")[0];
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  const res = performance.getEntriesByType("resource");
  const somme = (a, k) => a.reduce((s, e) => s + (e[k] || 0), 0);
  const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
  const api = res.filter((r) => r.name.includes(`${apiHote}/api/`));
  const lts = P.lt.filter(([s]) => s >= (fcp ? fcp.startTime : 0));
  return {
    ttfb: nav.responseStart,
    fcp: fcp ? fcp.startTime : null,
    lcp: P.lcp,
    donnees: P.ready,
    tbt: lts.reduce((s, [, d]) => s + Math.max(0, d - 50), 0),
    taches_longues: lts.length,
    plus_longue_ms: Math.max(0, ...lts.map(([, d]) => d)),
    cls: P.cls,
    requetes: res.length,
    js_fichiers: js.length,
    js_transfere: somme(js, "transferSize"),
    js_decode: somme(js, "decodedBodySize"),
    appels_api: api.length,
    tas_mo: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
    noeuds_dom: document.getElementsByTagName("*").length,
  };
};

const navigateur = await lancerChrome();
const nouvellePage = async (cible) => {
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: BRIDAGE });
  await page.addInitScript(ouvrirSession, tok);
  await page.addInitScript(observer, cible);
  return { ctx, page };
};
const attendreDonnees = (page) =>
  page.waitForFunction(() => window.__perf && window.__perf.ready !== null, null, { timeout: 30000 }).catch(() => {});

const resultats = { origine: ORIGINE, passages: PASSAGES, bridage_cpu: BRIDAGE, horodatage: new Date().toISOString(), pages: {}, temps_reel: null, clic_carte: null };

// --- 1. chargement à froid ----------------------------------------------------
for (const [chemin, cible] of Object.entries(PAGES)) {
  const passages = [];
  for (let i = 0; i < PASSAGES; i++) {
    const { ctx, page } = await nouvellePage(cible);
    await page.goto(ORIGINE + chemin, { waitUntil: "load", timeout: 60000 });
    await attendreDonnees(page);
    await page.waitForTimeout(2500); // les tâches qui suivent l'affichage comptent aussi
    passages.push(await page.evaluate(collecte, API_HOTE));
    await ctx.close();
  }
  const m = resume(passages);
  resultats.pages[chemin] = { mediane: m, passages };
  console.log(
    `${chemin.padEnd(11)} FCP ${Math.round(m.fcp)} · LCP ${Math.round(m.lcp)} · données ${Math.round(m.donnees ?? -1)} · TBT ${Math.round(m.tbt)} · ` +
      `JS ${Math.round(m.js_transfere / 1024)} Ko (${Math.round(m.js_decode / 1024)} Ko décodés) · ${m.requetes} req · tas ${m.tas_mo?.toFixed(1)} Mo · DOM ${m.noeuds_dom}`,
  );
}

// --- 2 et 3. carte ouverte : rechargement temps réel, puis clics -----------------
{
  const { ctx, page } = await nouvellePage(PAGES["/map"]);
  await page.goto(ORIGINE + "/map", { waitUntil: "load", timeout: 60000 });
  await attendreDonnees(page);
  await page.waitForTimeout(4000);
  const ecrire = await ecritureNeutre(tok);
  const passages = [];
  for (let i = 0; i < PASSAGES; i++) {
    const t0 = await page.evaluate(() => performance.now());
    await ecrire();
    await page.waitForTimeout(3500);
    passages.push(
      await page.evaluate(
        ({ t0, apiHote, lectures }) => {
          const lts = window.__perf.lt.filter(([s]) => s >= t0);
          // Seules les lectures du domaine : les sondages périodiques (missions, aéronefs…) ne comptent pas.
          const domaine = performance
            .getEntriesByType("resource")
            .filter((e) => e.startTime >= t0 && e.name.includes(`${apiHote}/api/`) && lectures.includes(new URL(e.name).pathname));
          return {
            lectures_domaine: domaine.length,
            delai_derniere_lecture_ms: domaine.length ? Math.max(...domaine.map((e) => e.responseEnd)) - t0 : null,
            taches_longues: lts.length,
            taches_longues_ms: lts.reduce((s, [, d]) => s + d, 0),
            tbt: lts.reduce((s, [, d]) => s + Math.max(0, d - 50), 0),
          };
        },
        { t0, apiHote: API_HOTE, lectures: LECTURES_DOMAINE },
      ),
    );
  }
  const m = resume(passages);
  resultats.temps_reel = { mediane: m, passages };
  console.log(
    `temps réel : ${m.lectures_domaine} lectures du domaine en ${Math.round(m.delai_derniere_lecture_ms ?? -1)} ms · ` +
      `${m.taches_longues} tâches longues (${Math.round(m.taches_longues_ms)} ms) · TBT ${Math.round(m.tbt)}`,
  );

  const clics = [];
  for (let i = 0; i < PASSAGES; i++) {
    const pos = await page.evaluate((i) => {
      const vus = [...document.querySelectorAll(".maplibregl-marker")]
        .map((m) => m.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.left > 320 && r.top > 80 && r.right < innerWidth - 60 && r.bottom < innerHeight - 60);
      const r = vus[(i * 7) % Math.max(1, vus.length)];
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    }, i);
    if (!pos) break;
    const t0 = await page.evaluate(() => performance.now());
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(2500);
    clics.push(
      await page.evaluate((t0) => {
        const lts = window.__perf.lt.filter(([s]) => s >= t0);
        const ev = window.__perf.ev.filter((e) => e.start >= t0 && /pointer|click|mouse/.test(e.name));
        return {
          inp_ms: Math.max(0, ...ev.map((e) => e.duration)),
          traitement_ms: Math.max(0, ...ev.map((e) => e.processing)),
          taches_longues_ms: lts.reduce((s, [, d]) => s + d, 0),
          tbt: lts.reduce((s, [, d]) => s + Math.max(0, d - 50), 0),
        };
      }, t0),
    );
  }
  if (clics.length) {
    const c = resume(clics);
    resultats.clic_carte = { mediane: c, passages: clics };
    console.log(`clic carte : INP ${Math.round(c.inp_ms)} ms (traitement ${Math.round(c.traitement_ms)}) · tâches longues ${Math.round(c.taches_longues_ms)} ms · TBT ${Math.round(c.tbt)}`);
  }
  await ctx.close();
}

await navigateur.close();
writeFileSync(SORTIE, JSON.stringify(resultats, null, 2));
console.log(`→ ${SORTIE}`);
