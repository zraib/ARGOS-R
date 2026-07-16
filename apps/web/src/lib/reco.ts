// ============================================================================
// ARGOS — moteur de recommandation, Couche 1 (déterministe et explicable)
// MASTER_PLAN §6.17 : note les unités candidates pour un besoin via une somme
// pondérée de temps de trajet, adéquation des capacités, disponibilité
// opérationnelle et disponibilité, après application des filtres durs. Chaque
// sous-score est exposé pour que l'UI affiche la décomposition. Le moteur est
// consultatif — il n'assigne jamais rien de lui-même.
//
// Le temps de trajet approxime ici la matrice Valhalla par une distance de
// haversine et un profil routier d'urgence ; remplacer `etaMinutes` par un
// vrai appel de matrice plus tard.
// ============================================================================

import type { Incident, IncidentType, Unit } from "@/lib/types";

export type Capability =
  | "sar"
  | "genie"
  | "hydraulique"
  | "medical"
  | "logistique"
  | "nrbc"
  | "aeroporte"
  | "eau"
  | "transmissions";

/** Capacités requises par type d'incident (dures + souples). */
export const REQUIRED_CAPS: Record<IncidentType, Capability[]> = {
  earthquake: ["sar", "genie", "medical"],
  flood: ["hydraulique", "sar", "genie"],
  wildfire: ["sar", "logistique", "eau"],
  landslide: ["genie", "sar"],
  epidemic: ["medical", "logistique"],
  industrial: ["nrbc", "medical"],
};

/** Capacités apportées par chaque unité (indexées par id d'unité). */
export const UNIT_CAPS: Record<string, Capability[]> = {
  U1: ["sar", "medical", "transmissions"],
  U2: ["genie", "hydraulique"],
  U3: ["sar", "medical", "aeroporte"],
  U4: ["logistique", "eau"],
  U5: ["logistique", "eau"],
  U6: ["nrbc"],
};

export const CAP_LABELS: Record<Capability, string> = {
  sar: "Recherche & sauvetage",
  genie: "Génie",
  hydraulique: "Hydraulique",
  medical: "Médical",
  logistique: "Logistique",
  nrbc: "NRBC",
  aeroporte: "Aéroporté",
  eau: "Eau / potabilisation",
  transmissions: "Transmissions",
};

/** Capacités qui, si requises, écartent d'office les unités qui en manquent. */
const HARD_CAPS: Capability[] = ["nrbc"];

/** Poids par défaut (configurables par le Super Admin par type d'incident en prod). */
export const DEFAULT_WEIGHTS = { travel: 0.35, capability: 0.3, readiness: 0.15, availability: 0.2 };
export type Weights = typeof DEFAULT_WEIGHTS;

const ETA_MAX = 360; // minutes; ETAs beyond this score ~0 on travel

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Profil routier d'urgence : distance à vol d'oiseau × facteur de détour à ~55 km/h. */
export function etaMinutes(from: [number, number], to: [number, number]): number {
  const km = haversineKm(from, to) * 1.3;
  return Math.round((km / 55) * 60);
}

const AVAIL_SCORE: Record<Unit["dispo"], number> = { ready: 100, standby: 65, deployed: 35 };

export interface Suggestion {
  unit: Unit;
  score: number;
  etaMin: number;
  capMatched: number;
  capRequired: number;
  matchedCaps: Capability[];
  missingCaps: Capability[];
  breakdown: { travel: number; capability: number; readiness: number; availability: number };
  excluded: boolean;
  exclusionReason?: string;
}

export interface Need {
  target: [number, number];
  type: IncidentType;
  label: string;
}

export function needFromIncident(inc: Incident): Need {
  return { target: inc.ll, type: inc.type, label: `${inc.id} — ${inc.titre}` };
}

/**
 * Classe les unités pour un besoin. Les unités écartées (filtre dur) sont en
 * dernier avec un motif ; les autres sont triées par score total décroissant.
 */
export function recommend(
  need: Need,
  units: Unit[],
  opts: { weights?: Weights; engagedUnitIds?: Set<string> } = {},
): Suggestion[] {
  const raw = opts.weights ?? DEFAULT_WEIGHTS;
  // Normalisation des poids (somme = 1) : le score reste sur 0–100 quelles que
  // soient les valeurs des curseurs du mode simulation.
  const sum = raw.travel + raw.capability + raw.readiness + raw.availability || 1;
  const w: Weights = { travel: raw.travel / sum, capability: raw.capability / sum, readiness: raw.readiness / sum, availability: raw.availability / sum };
  const engaged = opts.engagedUnitIds ?? new Set<string>();
  const required = REQUIRED_CAPS[need.type];
  const hardNeeded = required.filter((c) => HARD_CAPS.includes(c));

  const suggestions: Suggestion[] = units.map((u) => {
    const caps = UNIT_CAPS[u.id] ?? [];
    const matchedCaps = required.filter((c) => caps.includes(c));
    const missingCaps = required.filter((c) => !caps.includes(c));

    const etaMin = etaMinutes(u.ll, need.target);
    const travel = Math.round(Math.max(0, Math.min(1, 1 - etaMin / ETA_MAX)) * 100);
    const capability = Math.round((matchedCaps.length / required.length) * 100);
    const readiness = u.readiness;
    let availability = AVAIL_SCORE[u.dispo];
    if (engaged.has(u.id)) availability = Math.round(availability * 0.4); // pénalité de charge courante

    const breakdown = { travel, capability, readiness, availability };
    const score = Math.round(w.travel * travel + w.capability * capability + w.readiness * readiness + w.availability * availability);

    // Filtre dur : une capacité dure requise que l'unité n'a pas la disqualifie.
    const missingHard = hardNeeded.filter((c) => !caps.includes(c));
    const excluded = missingHard.length > 0;

    return {
      unit: u,
      score: excluded ? 0 : score,
      etaMin,
      capMatched: matchedCaps.length,
      capRequired: required.length,
      matchedCaps,
      missingCaps,
      breakdown,
      excluded,
      exclusionReason: excluded ? `${CAP_LABELS[missingHard[0]]} requis` : undefined,
    };
  });

  return suggestions.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return b.score - a.score;
  });
}
