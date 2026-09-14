// ============================================================================
// ARGOS — assistant IA · Libellés, tables de correspondance et COORDONNÉES
// DES VILLES.
//
// 🔴 RÈGLE 2026-09-12 : ZÉRO HARDCODÉ COMME SEULE SOURCE DE VÉRITÉ.
//   - `CITY_COORDS` / `UNIT_CODE` / `INCIDENT_PLACE` sont désormais des
//     FALLBACKS MINIMA (seed) SI LE CONTEXTE (ctx) EST VIDE (tests, dev).
//   - Dès que le magasin est chargé, `resolveCityCoords` utilise :
//       1. les unités (ville + ll)  2. les hôpitaux (ville + ll)
//       3. les incidents (region + ll)
//     AVANT de tomber sur CITY_COORDS.
// ============================================================================

import type { AiContext } from "./types";

export const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// --- Seed minimal (fallback) — plus utilisé si ctx contient des données ----
const CITY_COORDS_SEED: Record<string, [number, number]> = {
  casa: [-7.5898, 33.5731], casablanca: [-7.5898, 33.5731],
  rabat: [-6.8498, 34.0209], temara: [-6.9159, 33.9259], skhirate: [-6.7844, 33.8462], sale: [-6.8189, 34.0349], "salé": [-6.8189, 34.0349],
  marrakech: [-8.0029, 31.6295], safi: [-9.2387, 32.2994],
  fes: [-4.9808, 34.0181], "fès": [-4.9808, 34.0181], meknes: [-5.5547, 33.8935], "meknès": [-5.5547, 33.8935],
  tanger: [-5.8038, 35.7595], tangier: [-5.8038, 35.7595], tetouan: [-5.3696, 35.5814], "tétouan": [-5.3696, 35.5814], hoceima: [-3.9326, 35.2470], "al hoceima": [-3.9326, 35.2470],
  agadir: [-9.6013, 30.4278], taroudant: [-8.8676, 30.4779], tiznit: [-9.7307, 29.7124],
  oujda: [-1.9124, 34.6803], nador: [-2.9282, 35.1721], berkane: [-2.3194, 34.9189], guercif: [-3.3608, 34.2316],
  kenitra: [-6.5800, 34.2517], mohammedia: [-7.3855, 33.6933], bouskoura: [-7.4416, 33.4536],
  taza: [-4.0119, 34.2140], settat: [-7.6216, 32.9927],
  "beni mellal": [-6.3626, 32.3398], errachidia: [-4.4265, 31.9291], ouarzazate: [-6.9000, 30.9177],
};

// ---------------------------------------------------------------------------
// 🔧 RÉSOLUTION DYNAMIQUE : ville → coordonnées. PRIORITÉ : PLATEFORME > seed.
// ---------------------------------------------------------------------------

export type ResolvedCity = { ville: string; center: [number, number]; source: "unit" | "hosp" | "inc" | "seed" };
export type RegionGroup = { name: string; members: string[] };

// ============================================================================
// 🔧 CACHE DERIVÉS (PERFORMANCE) · WeakMap<ctx, payload>
// ============================================================================
type LabelsCache = {
  platformCities?: Map<number, Array<{ ville: string; villeNorm: string; ll?: [number, number] }>>;
  buildCityRegex?: Map<number, string>;
  platformRegionGroups?: RegionGroup[];
};
const LABELS_CACHE = new WeakMap<object, LabelsCache>();
function getCache(ctx: object): LabelsCache {
  let c = LABELS_CACHE.get(ctx);
  if (!c) { c = {}; LABELS_CACHE.set(ctx, c); }
  return c;
}

export function resolveCityCoords(nameRaw: string, ctx: AiContext): ResolvedCity | null {
  const name = norm(nameRaw);
  if (!name) return null;

  // 1) Unités : villes, plus grand nombre de cas (FAR + RM + pompiers)
  const compact = name.replace(/[\s-]/g, "");
  for (const u of ctx.units ?? []) {
    const vRaw = (u.ville || "").trim();
    if (!vRaw) continue;
    const v = norm(vRaw);
    const vC = v.replace(/[\s-]/g, "");
    if (v === name || vC === compact || v.includes(name) || name.includes(v)) {
      if (Array.isArray(u.ll) && u.ll.length === 2) return { ville: vRaw, center: [u.ll[0], u.ll[1]], source: "unit" };
    }
  }

  // 2) Hôpitaux : CHU, CHR, CHP militaires et civils
  for (const h of ctx.hospitals ?? []) {
    const vRaw = (h.ville || "").trim();
    if (!vRaw) continue;
    const v = norm(vRaw);
    const vC = v.replace(/[\s-]/g, "");
    if (v === name || vC === compact || v.includes(name) || name.includes(v)) {
      if (Array.isArray((h as unknown as { ll?: [number, number] }).ll)) {
        const ll = (h as unknown as { ll: [number, number] }).ll;
        return { ville: vRaw, center: [ll[0], ll[1]], source: "hosp" };
      }
    }
  }

  // 3) Incidents ouverts : région (la plus fréquente pour « Casablanca »)
  for (const inc of ctx.incidents ?? []) {
    const rRaw = (inc.region || "").trim();
    if (rRaw) {
      const r = norm(rRaw);
      if (r === name || r.includes(name) || name.includes(r)) {
        if (Array.isArray(inc.ll) && inc.ll.length === 2) return { ville: rRaw, center: [inc.ll[0], inc.ll[1]], source: "inc" };
      }
    }
    const tRaw = (inc.titre || "").trim();
    if (tRaw && norm(tRaw).includes(name) && Array.isArray(inc.ll) && inc.ll.length === 2) {
      return { ville: rRaw || nameRaw, center: [inc.ll[0], inc.ll[1]], source: "inc" };
    }
  }

  // 4) Fallback seed (seulement si catalogue vide)
  const keys = Object.keys(CITY_COORDS_SEED).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (k === name || name.includes(k) || k.includes(name)) {
      return { ville: k, center: CITY_COORDS_SEED[k], source: "seed" };
    }
  }
  return null;
}

// Getteur historique de compatibilité : copie CITY_COORDS_SEED sous l'ancien
// nom — les intentions qui n'ont pas encore accès à `ctx` peuvent l'utiliser.
export const CITY_COORDS = CITY_COORDS_SEED;

/* Utilitaires : liste de villes dynamiquement (pour regex router). */
export function platformCities(ctx: AiContext, limit = 60): { ville: string; villeNorm: string; ll?: [number, number] }[] {
  const cache = getCache(ctx);
  if (!cache.platformCities) cache.platformCities = new Map();
  const cached = cache.platformCities.get(limit);
  if (cached) return cached;
  const vu = new Map<string, { ville: string; villeNorm: string; ll?: [number, number] }>();
  const push = (raw: string, ll?: [number, number]) => {
    const v = raw.trim();
    if (!v) return;
    const key = norm(v);
    if (vu.has(key)) return;
    vu.set(key, { ville: v, villeNorm: key, ll });
  };
  for (const u of ctx.units ?? []) push(u.ville, u.ll);
  for (const h of ctx.hospitals ?? []) push(h.ville, (h as unknown as { ll?: [number, number] }).ll);
  for (const inc of ctx.incidents ?? []) push(inc.region, inc.ll);
  for (const k of Object.keys(CITY_COORDS_SEED)) push(k, CITY_COORDS_SEED[k]);
  const result = [...vu.values()].slice(0, limit);
  cache.platformCities.set(limit, result);
  return result;
}

/* Utilitaire : construit une regex large "casa|casablanca|rabat|..." depuis les
   villes de la plateforme. Limité à ~80 tokens pour éviter regex trop lourdes. */
export function buildCityRegex(ctx: AiContext, max = 80): string {
  const cache = getCache(ctx);
  if (!cache.buildCityRegex) cache.buildCityRegex = new Map();
  const cached = cache.buildCityRegex.get(max);
  if (cached !== undefined) return cached;
  const items = platformCities(ctx, max).sort((a, b) => b.ville.length - a.ville.length);
  const result = items.map((c) => c.villeNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  cache.buildCityRegex.set(max, result);
  return result;
}

/* Utilitaire : correspondance REGION (ex rabat-salé). Retourne groupe + centre. */
export function platformRegionGroups(ctx: AiContext): RegionGroup[] {
  const cache = getCache(ctx);
  if (cache.platformRegionGroups) return cache.platformRegionGroups;
  // 1. Groupement dynamique : par région des incidents / unités
  const byRegion = new Map<string, Set<string>>();
  const add = (r: string, v: string) => {
    const rN = norm(r);
    if (!rN) return;
    const vN = (v || "").trim();
    if (!vN) return;
    let set = byRegion.get(rN);
    if (!set) { set = new Set(); byRegion.set(rN, set); }
    if (vN) set.add(vN);
  };
  for (const inc of ctx.incidents ?? []) add(inc.region, inc.region);
  for (const u of ctx.units ?? []) add(u.ville, u.ville);
  for (const h of ctx.hospitals ?? []) add(h.ville, h.ville);

  const dyn: RegionGroup[] = [...byRegion.entries()]
    .filter(([, m]) => m.size >= 1)
    .map(([name, members]) => ({ name, members: [...members] }));

  // 2. Fallback : régions administratives marocaines (seed) — SI le catalogue
  //    est vide (tests / dev). NE SERA PAS UTILISÉ SI catalogue contient data.
  const SEED: RegionGroup[] = [
    { name: "rabat-sale", members: ["rabat", "sale", "temara", "skhirate"] },
    { name: "casablanca-settat", members: ["casa", "casablanca", "settat", "mohammedia", "bouskoura"] },
    { name: "marrakech-safi", members: ["marrakech", "safi"] },
    { name: "fes-meknes", members: ["fes", "meknes"] },
    { name: "tanger-tetouan-al hoceima", members: ["tanger", "tetouan", "hoceima", "al hoceima"] },
    { name: "souss-massa", members: ["agadir", "taroudant", "tiznit"] },
    { name: "oriental", members: ["oujda", "nador", "berkane", "guercif"] },
  ];

  if (dyn.length >= 2) {
    cache.platformRegionGroups = dyn;
    return dyn;
  }
  // Catalogue très petit → fusionner seed + dyn (la fusion est sans doublon via norm)
  const seen = new Set(dyn.map((d) => d.name));
  const result = [...dyn, ...SEED.filter((s) => !seen.has(norm(s.name)))];
  cache.platformRegionGroups = result;
  return result;
}

// --- Tables de correspondance (seed fallback) ------------------------------
// UNIT_CODE : mappages "1er GI" → "U1" etc. Utilisés par équipements (UNIT_CODE[e.unit]).
// Désormais DYNAMIQUE via resolveUnitId (nom court vers ID). Fallback seed.
const UNIT_CODE_SEED: Record<string, string> = {
  "1er GI": "U1", "3e BG": "U2", "7e RA": "U3", "2e GL": "U4", "5e BS": "U5", "4e NRBC": "U6",
};
export function resolveUnitId(unitLabel: string, ctx: AiContext): string | null {
  const lab = (unitLabel || "").trim();
  if (!lab) return null;
  const labN = norm(lab);

  // 1. Catalogue : match nom exact ou nom court → id
  for (const u of ctx.units ?? []) {
    if (u.id === lab) return u.id;
    const nomN = norm(u.nom || "");
    if (nomN === labN || (nomN && (nomN.includes(labN) || labN.includes(nomN)))) return u.id;
  }
  // 2. Match direct UNIT_CODE seed ("1er GI" → "U1")
  if (UNIT_CODE_SEED[lab]) return UNIT_CODE_SEED[lab];
  // 3. Match inverse : "U1" → check seed
  for (const k of Object.keys(UNIT_CODE_SEED)) {
    if (UNIT_CODE_SEED[k] === lab) return lab;
    if (norm(k) === labN) return UNIT_CODE_SEED[k];
  }
  return null;
}
export const UNIT_CODE = UNIT_CODE_SEED;

// INCIDENT_PLACE : IDs anciens → région. Fallback, remplacé par inc.region + inc.ll en priorité.
const INCIDENT_PLACE_SEED: Record<string, string> = {
  "INC-2607": "Al Haouz", "INC-2606": "Ourika", "INC-2604": "Chefchaouen",
  "INC-2601": "Al Hoceïma", "INC-2598": "Mohammedia", "INC-2595": "Zagora",
};
export function resolveIncidentRegion(incId: string, inc?: { region?: string; titre?: string; ll?: [number, number] } | null): string {
  if (inc?.region) return inc.region;
  if (INCIDENT_PLACE_SEED[incId]) return INCIDENT_PLACE_SEED[incId];
  if (inc?.titre) return inc.titre.slice(0, 40);
  return incId;
}
export const INCIDENT_PLACE = INCIDENT_PLACE_SEED;

export const SEV_LABEL: Record<string, string> = { high: "élevée", medium: "moyenne", low: "faible" };
export const ST_LABEL: Record<string, string> = { open: "ouverte", prog: "en cours", closed: "fermée" };
export const DISPO_LABEL: Record<string, string> = { ready: "opérationnelle", deployed: "déployée", standby: "en attente" };
export const COND_LABEL: Record<string, string> = { ok: "OK", repair: "en réparation", oos: "HS" };

// --- TEMPORAL ---------------------------------------------------------------
export const sevRank: Record<string, number> = { critique: 3, high: 3, elevé: 2, moyen: 1, medium: 1, faible: 0, low: 0 };
export const sevLabel = (s: string): "critique" | "élevé" | "moyen" | "faible" => {
  const n = norm(s);
  if (n === "critique" || n === "high") return "critique";
  if (n === "eleve" || n === "med" || n === "sever") return "élevé";
  if (n === "moyen" || n === "medium") return "moyen";
  return "faible";
};
