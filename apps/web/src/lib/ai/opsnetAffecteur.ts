import type { Shelter } from "@/lib/data/modules";
import type { City, Unit } from "@/lib/types";

// ============================================================================
// OPSnet — affecteur : classer les moyens face à un besoin
//
// TRANSPOSITION D'HOSPINET, PAS COPIE. Hospinet classe des hôpitaux par
// trajet + capacité en lits + plateau technique. Ici deux besoins distincts,
// qui ne se ramènent pas l'un à l'autre :
//
//   • ENGAGER — quelles UNITÉS envoyer sur un point : trajet, effectif
//     disponible, et niveau de préparation. Une unité déjà déployée n'est pas
//     « pleine » comme un hôpital : elle est ailleurs, et la reprendre coûte.
//
//   • HÉBERGER — quels ABRIS peuvent recevoir des sinistrés : trajet, places
//     libres, et état de l'approvisionnement. Un abri saturé se refuse comme
//     un hôpital saturé, mais un abri en rupture de vivres n'est pas
//     interchangeable avec un abri pourvu, même s'il a de la place.
//
// FONCTIONS PURES. Aucun appel réseau, aucun état : des données entrent, un
// classement sort. C'est ce qui permet de le tester, et de ne pas dépendre d'un
// modèle de langage pour produire le classement — le LLM ne sert, comme dans
// Hospinet, qu'à RÉDIGER la justification d'un classement déjà calculé.
// ============================================================================

/** Rayon de la Terre en kilomètres, valeur moyenne. */
const R_TERRE = 6371;

export function haversineKm(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRE * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Durée de route estimée, en minutes.
 *
 * Vitesse moyenne DÉLIBÉRÉMENT basse (45 km/h) : convoi lourd sur routes de
 * montagne, pas véhicule léger sur autoroute. Un état-major qui planifie sur
 * une estimation optimiste découvre l'écart une fois la colonne partie.
 */
export function etaMinutes(a: [number, number], b: [number, number]): number {
  return Math.round((haversineKm(a, b) / 45) * 60);
}

// --- engagement d'unités -----------------------------------------------------

/** Poids par défaut du classement d'unités. Le trajet domine : le temps prime. */
export const UNIT_WEIGHTS = { travel: 0.45, strength: 0.3, readiness: 0.25 };

export interface UnitNeed {
  /** Point d'intervention [lng, lat]. */
  ll: [number, number];
  /** Effectif recherché, toutes unités confondues. */
  effectif: number;
  /** Rayon de recherche en kilomètres ; 0 ou absent = sans limite. */
  radiusKm?: number;
  /** Inclure les unités DÉJÀ déployées ailleurs — un désengagement se décide. */
  includeDeployed?: boolean;
  weights?: Partial<typeof UNIT_WEIGHTS>;
}

export interface UnitRow {
  unit: Unit;
  km: number;
  etaMin: number;
  /** Score global, 0–100. */
  score: number;
  /** Sous-scores, pour que le classement soit LISIBLE et non un oracle. */
  parts: { travel: number; strength: number; readiness: number };
  /** Motif d'exclusion, quand l'unité est écartée plutôt que classée. */
  ecarte?: "hors-rayon" | "déployée";
}

export interface UnitRanking {
  rows: UnitRow[];
  /** Effectif cumulé des unités retenues, dans l'ordre du classement. */
  cumul: number[];
  /** Rang à partir duquel le besoin est couvert, ou `null` s'il ne l'est jamais. */
  couvertAuRang: number | null;
  ecartes: UnitRow[];
}

/**
 * Classe les unités face à un besoin d'engagement.
 *
 * Le résultat porte le CUMUL d'effectif : on n'envoie pas « la meilleure
 * unité », on envoie autant d'unités qu'il en faut. Dire au chef à quel rang
 * son besoin est couvert vaut mieux que lui donner un vainqueur.
 */
export function rankUnits(need: UnitNeed, units: Unit[]): UnitRanking {
  const rayon = need.radiusKm && need.radiusKm > 0 ? need.radiusKm : Infinity;
  const brut = { ...UNIT_WEIGHTS, ...need.weights };
  const somme = brut.travel + brut.strength + brut.readiness || 1;
  const w = {
    travel: brut.travel / somme,
    strength: brut.strength / somme,
    readiness: brut.readiness / somme,
  };

  const rows: UnitRow[] = [];
  const ecartes: UnitRow[] = [];

  // Référence de trajet : la plus longue distance retenue. Sans elle, le score
  // de trajet dépendrait d'une échelle arbitraire et deux besoins ne seraient
  // pas comparables entre eux.
  const candidates = units.filter((u) => (need.includeDeployed ? true : u.dispo !== "deployed"));
  const distances = candidates.map((u) => haversineKm(need.ll, u.ll));
  const dMax = Math.max(1, ...distances.filter((d) => d <= rayon));

  for (const u of units) {
    const km = haversineKm(need.ll, u.ll);
    const etaMin = etaMinutes(need.ll, u.ll);
    const base = { unit: u, km: Math.round(km * 10) / 10, etaMin };

    if (u.dispo === "deployed" && !need.includeDeployed) {
      ecartes.push({ ...base, score: 0, parts: { travel: 0, strength: 0, readiness: 0 }, ecarte: "déployée" });
      continue;
    }
    if (km > rayon) {
      ecartes.push({ ...base, score: 0, parts: { travel: 0, strength: 0, readiness: 0 }, ecarte: "hors-rayon" });
      continue;
    }

    // Trajet : 100 au plus proche, décroissant jusqu'au plus lointain retenu.
    const travel = Math.max(0, 100 * (1 - Math.min(km, dMax) / dMax));
    // Effectif : plafonné au besoin. Une unité de 400 hommes pour un besoin de
    // 50 ne vaut pas huit fois mieux qu'une unité de 50 — elle vaut autant, et
    // mobiliser au-delà du besoin immobilise ailleurs.
    const strength = need.effectif > 0 ? Math.min(100, (100 * u.eff) / need.effectif) : 100;
    // Préparation : lue telle que déclarée ; « standby » coûte un tiers, le
    // délai de remise en alerte n'étant pas nul.
    const readiness = Math.max(0, Math.min(100, u.readiness)) * (u.dispo === "standby" ? 0.67 : 1);

    const parts = {
      travel: Math.round(travel),
      strength: Math.round(strength),
      readiness: Math.round(readiness),
    };
    rows.push({
      ...base,
      parts,
      score: Math.round(w.travel * travel + w.strength * strength + w.readiness * readiness),
    });
  }

  rows.sort((a, b) => b.score - a.score || a.etaMin - b.etaMin);

  const cumul: number[] = [];
  let total = 0;
  let couvertAuRang: number | null = null;
  rows.forEach((r, i) => {
    total += r.unit.eff;
    cumul.push(total);
    if (couvertAuRang === null && total >= need.effectif) couvertAuRang = i + 1;
  });

  return { rows, cumul, couvertAuRang, ecartes };
}

// --- hébergement en abris ----------------------------------------------------

/** Au-delà, l'abri est écarté : entasser au-delà de sa capacité n'est pas héberger. */
export const SHELTER_OCC_MAX = 98;

export const SHELTER_WEIGHTS = { travel: 0.35, capacity: 0.4, supplies: 0.25 };

export interface ShelterNeed {
  /** Point de départ des sinistrés [lng, lat]. */
  ll: [number, number];
  /** Nombre de personnes à héberger. */
  personnes: number;
  radiusKm?: number;
  weights?: Partial<typeof SHELTER_WEIGHTS>;
}

export interface ShelterRow {
  shelter: Shelter;
  /** Position DE LA COMMUNE, résolue depuis le référentiel — pas de l'abri. */
  ll: [number, number] | null;
  km: number | null;
  etaMin: number | null;
  libres: number;
  occPct: number;
  score: number;
  parts: { travel: number; capacity: number; supplies: number };
  ecarte?: "hors-rayon" | "saturé";
}

export interface ShelterRanking {
  rows: ShelterRow[];
  cumul: number[];
  couvertAuRang: number | null;
  ecartes: ShelterRow[];
  /** Abris dont la commune est absente du référentiel — classés sans trajet. */
  sansPosition: number;
}

/** Note d'approvisionnement : un abri en rupture n'est pas interchangeable. */
const SUPPLY_SCORE: Record<Shelter["supplies"], number> = { ok: 100, low: 55, critical: 15 };

/**
 * Résout la position d'un abri par sa COMMUNE, dans le référentiel souverain.
 *
 * Le modèle d'abri ne porte pas de coordonnées ; on ne les invente pas. La
 * commune, elle, en a de vraies. La position rendue est donc celle du
 * chef-lieu, ce que l'écran doit dire — et `null` quand la commune est
 * inconnue, plutôt qu'un point approché qui se lirait comme une adresse.
 */
export function shelterPosition(s: Shelter, cities: City[]): [number, number] | null {
  const cle = s.ville.trim().toLocaleLowerCase("fr");
  return cities.find((c) => c.v.trim().toLocaleLowerCase("fr") === cle)?.ll ?? null;
}

export function rankShelters(need: ShelterNeed, shelters: Shelter[], cities: City[]): ShelterRanking {
  const rayon = need.radiusKm && need.radiusKm > 0 ? need.radiusKm : Infinity;
  const brut = { ...SHELTER_WEIGHTS, ...need.weights };
  const somme = brut.travel + brut.capacity + brut.supplies || 1;
  const w = {
    travel: brut.travel / somme,
    capacity: brut.capacity / somme,
    supplies: brut.supplies / somme,
  };

  const positions = new Map(shelters.map((s) => [s.id, shelterPosition(s, cities)]));
  const distances = shelters
    .map((s) => {
      const ll = positions.get(s.id);
      return ll ? haversineKm(need.ll, ll) : null;
    })
    .filter((d): d is number => d !== null && d <= rayon);
  const dMax = Math.max(1, ...distances);

  const rows: ShelterRow[] = [];
  const ecartes: ShelterRow[] = [];
  let sansPosition = 0;

  for (const s of shelters) {
    const ll = positions.get(s.id) ?? null;
    if (!ll) sansPosition++;
    const km = ll ? Math.round(haversineKm(need.ll, ll) * 10) / 10 : null;
    const etaMin = ll ? etaMinutes(need.ll, ll) : null;
    const capacite = Math.max(1, s.capacity);
    const occupants = Math.max(0, Math.min(s.occupants, capacite));
    const libres = capacite - occupants;
    const occPct = Math.round((100 * occupants) / capacite);
    const base = { shelter: s, ll, km, etaMin, libres, occPct };

    if (occPct >= SHELTER_OCC_MAX) {
      ecartes.push({ ...base, score: 0, parts: { travel: 0, capacity: 0, supplies: 0 }, ecarte: "saturé" });
      continue;
    }
    if (km !== null && km > rayon) {
      ecartes.push({ ...base, score: 0, parts: { travel: 0, capacity: 0, supplies: 0 }, ecarte: "hors-rayon" });
      continue;
    }

    // Un abri sans position n'est pas pénalisé sur le trajet : il est noté sur
    // ce qu'on sait de lui. L'écran signale l'inconnue plutôt que de la
    // convertir en mauvaise note, ce qui serait un jugement déguisé.
    const travel = km === null ? 50 : Math.max(0, 100 * (1 - Math.min(km, dMax) / dMax));
    const capacity = need.personnes > 0 ? Math.min(100, (100 * libres) / need.personnes) : 100;
    const supplies = SUPPLY_SCORE[s.supplies];

    const parts = {
      travel: Math.round(travel),
      capacity: Math.round(capacity),
      supplies,
    };
    rows.push({
      ...base,
      parts,
      score: Math.round(w.travel * travel + w.capacity * capacity + w.supplies * supplies),
    });
  }

  rows.sort((a, b) => b.score - a.score || (a.etaMin ?? 1e9) - (b.etaMin ?? 1e9));

  const cumul: number[] = [];
  let total = 0;
  let couvertAuRang: number | null = null;
  rows.forEach((r, i) => {
    total += r.libres;
    cumul.push(total);
    if (couvertAuRang === null && total >= need.personnes) couvertAuRang = i + 1;
  });

  return { rows, cumul, couvertAuRang, ecartes, sansPosition };
}
