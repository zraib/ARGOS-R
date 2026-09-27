#!/usr/bin/env node
// ============================================================================
// scripts/perf/bench-carte.mjs — banc de la carte, build de production
//
//   node scripts/perf/bench-carte.mjs <origine web> <sortie.json> [passages=7] [bridage CPU=4]
//
// - tas JS retenu après ramasse-miettes, nœuds du DOM ;
// - coût processeur d'un rechargement temps réel (écriture neutre sur l'API),
//   net du bruit de fond mesuré juste avant ;
// - carte AU REPOS pendant 10 s, avec séismes (flux de démonstration) et sans
//   (flux sismique vide : une station hors ligne) : temps processeur occupé et
//   IMAGES DESSINÉES par la carte — au repos, une carte sobre n'en dessine
//   presque aucune.
//
// Réglages et prérequis : voir commun.mjs ; méthode et résultats :
// docs/07-performance.md.
// ============================================================================
import { writeFileSync } from "node:fs";
import { ecritureNeutre, jetonDev, lancerChrome, mediane, ouvrirSession, tempsOccupe } from "./commun.mjs";

const [ORIGINE, SORTIE] = process.argv.slice(2);
if (!ORIGINE || !SORTIE) {
  console.error("usage : node scripts/perf/bench-carte.mjs <origine web> <sortie.json> [passages=7] [bridage CPU=4]");
  process.exit(1);
}
const N = Number(process.argv[4] ?? 7);
const BRIDAGE = Number(process.argv[5] ?? 4);

const tok = await jetonDev();
const navigateur = await lancerChrome();

const ouvrir = async (sansSeisme) => {
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: BRIDAGE });
  if (sansSeisme) await page.route("**/api/seismic/events**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.addInitScript(ouvrirSession, tok);
  await page.goto(ORIGINE + "/map", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".maplibregl-marker").length >= 150, null, { timeout: 30000 });
  await page.waitForTimeout(5000);
  return { ctx, page, cdp };
};

// Images dessinées par la carte en `ms` : l'instance MapLibre est retrouvée par la
// fibre React de son conteneur (le ref du composant), en production comme en dev.
const images = (page, ms) =>
  page.evaluate(async (ms) => {
    const el = document.querySelector(".maplibregl-map");
    const k = Object.keys(el).find((x) => x.startsWith("__reactFiber"));
    let f = el[k];
    let map = null;
    for (let n = 0; f && n < 60 && !map; n++, f = f.return) {
      let h = f.memoizedState;
      for (let m = 0; h && m < 80; m++, h = h.next) {
        const v = h.memoizedState;
        if (v && v.current && typeof v.current.getStyle === "function") {
          map = v.current;
          break;
        }
      }
    }
    if (!map) return null;
    let c = 0;
    const compter = () => c++;
    map.on("render", compter);
    await new Promise((r) => setTimeout(r, ms));
    map.off("render", compter);
    return c;
  }, ms);

const res = { origine: ORIGINE, bridage_cpu: BRIDAGE, horodatage: new Date().toISOString() };
{
  const { ctx, page, cdp } = await ouvrir(false);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  res.tas_retenu_mo = await page.evaluate(() => performance.memory.usedJSHeapSize / 1048576);
  res.noeuds_dom = await page.evaluate(() => document.getElementsByTagName("*").length);
  const ecrire = await ecritureNeutre(tok);
  const fond = [];
  const evenement = [];
  for (let i = 0; i < N; i++) {
    fond.push(await tempsOccupe(cdp, 3000)); // 3 s sans événement : le bruit de fond
    evenement.push(await tempsOccupe(cdp, 3000, ecrire));
  }
  res.temps_reel_cpu_ms = { avec_evenement: mediane(evenement), fond_sans_evenement: mediane(fond), cout_net: mediane(evenement) - mediane(fond), passages: { evenement, fond } };
  res.repos_avec_seismes_ms_sur_10s = mediane([await tempsOccupe(cdp, 10000), await tempsOccupe(cdp, 10000), await tempsOccupe(cdp, 10000)]);
  res.images_repos_avec_seismes_10s = await images(page, 10000);
  await ctx.close();
}
{
  const { ctx, page, cdp } = await ouvrir(true);
  res.repos_sans_seisme_ms_sur_10s = mediane([await tempsOccupe(cdp, 10000), await tempsOccupe(cdp, 10000), await tempsOccupe(cdp, 10000)]);
  res.images_repos_sans_seisme_10s = await images(page, 10000);
  await ctx.close();
}
await navigateur.close();
writeFileSync(SORTIE, JSON.stringify(res, null, 2));
const r = Math.round;
console.log(
  `tas retenu ${res.tas_retenu_mo.toFixed(1)} Mo · DOM ${res.noeuds_dom} · temps réel ${r(res.temps_reel_cpu_ms.avec_evenement)} ms CPU sur 3 s ` +
    `(fond ${r(res.temps_reel_cpu_ms.fond_sans_evenement)} → coût net ${r(res.temps_reel_cpu_ms.cout_net)} ms)\n` +
    `au repos, avec séismes : ${r(res.repos_avec_seismes_ms_sur_10s)} ms CPU et ${res.images_repos_avec_seismes_10s} images sur 10 s · ` +
    `sans séisme : ${r(res.repos_sans_seisme_ms_sur_10s)} ms CPU et ${res.images_repos_sans_seisme_10s} images sur 10 s`,
);
