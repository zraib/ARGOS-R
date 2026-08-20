// ============================================================================
// ARGOS — aides partagées des moteurs IA (PORT côté API)
// Copie conforme de apps/web/src/lib/ai/shared.ts (module pur, zéro import) :
// le moteur de risques porté (F-04) en dépend depuis la fusion de la branche
// IA. Régénérer avec lui à chaque évolution du client.
// ============================================================================

// ============================================================
// Shared helpers IA C1 (IncidentEvolution + WhatIf + Situational)
// — centralise DUPLICATIONS entre incidentEvolution.ts + incidentWhatif.ts
// — AUCUN CHANGEMENT FONCTIONNEL : mêmes sorties, mêmes paliers
// ============================================================

// ---------------- Types partagés ----------------
export type RiskLevel = "faible" | "modere" | "eleve" | "critique";
export type Trend = "amelioration" | "stabilite" | "aggravation";
export type Impact = "faible" | "moyen" | "haut";

// ---------------- Clamp helpers (zéro NaN / Infini) ----------------
export function safeNum(v: unknown, d = 0): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return d;
  return v;
}
export function clamp01(n: number): number { return Math.max(0, Math.min(1, safeNum(n, 0))); }
export function clamp100(n: number): number { return Math.max(0, Math.min(100, safeNum(n, 0))); }

export function levelOf(score: number): RiskLevel {
  if (score >= 78) return "critique";
  if (score >= 55) return "eleve";
  if (score >= 22) return "modere";
  return "faible";
}

// ---------------- Tendance ----------------
// Même formule que predictIncidentEvolution et buildHorizons
//  (prob amélioration − prob dégradation) ≥ 8% → amélioration
export function trendOf(score: number, probaAmelioration?: number): Trend {
  const pDeg = Math.max(0, (score - 30) / 110);
  const pAm = probaAmelioration ?? Math.max(0, Math.min(1, (72 - score) / 80));
  const diff = (pAm - pDeg) * 100;
  if (diff >= 8) return "amelioration";
  if (diff <= -8) return "aggravation";
  return "stabilite";
}

// ---------------- Probabilité (sigmoïde centrée en 45, largeur 22) ----------------
export function probabilityPctOf(score: number): number {
  return Math.round(50 + 50 * Math.tanh((score - 45) / 22));
}

// ---------------- Horizon (minutes avant réalisation) ----------------
export function horizonMinutes(score: number): number {
  if (score >= 80) return 30;
  if (score >= 65) return 90;
  if (score >= 50) return 180;
  if (score >= 30) return 360;
  // <30 : long (formule existante)
  return Math.max(120, Math.round(720 - score * 6));
}

export function formatHorizon(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${h}h${mStr}`;
}

// ---------------- Durée safe parse (J-n / HH:MM / ISO / nullish) ----------------
//   partagé incidentEvolution et WhatIf
export function parseDurationSafe(input: unknown): { minutes: number; label: string } {
  const FALLBACK = { minutes: 120, label: "2h00" };
  if (!input) return FALLBACK;
  const s = typeof input === "number" ? String(input) : String(input).trim();
  if (!s) return FALLBACK;
  // Format "J-n" (jours relatifs)
  const mJ = s.match(/^J-?\s*(\d+)$/i);
  if (mJ) {
    const d = parseInt(mJ[1]!, 10) || 0;
    const mins = Math.max(0, d * 1440);
    const mm = mins % 60;
    const hh = Math.floor(mins / 60);
    return { minutes: mins, label: `${hh}h${mm ? (mm < 10 ? "0" + mm : String(mm)) : "00"}` };
  }
  // Format "HH:MM"
  const mHM = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mHM) {
    const h = parseInt(mHM[1]!, 10) || 0;
    const m = parseInt(mHM[2]!, 10) || 0;
    const mins = h * 60 + m;
    const mm = mins % 60;
    const hh = Math.floor(mins / 60);
    return { minutes: mins, label: `${hh}h${mm < 10 ? "0" + mm : mm}` };
  }
  // ISO date
  const d = new Date(s as unknown as string);
  const ts = d.getTime();
  if (Number.isFinite(ts) && ts > 0) {
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    const mm = mins % 60;
    const hh = Math.floor(mins / 60);
    return {
      minutes: mins,
      label: hh > 48 ? `J-${Math.floor(hh / 24)}` : `${hh}h${mm < 10 ? "0" + mm : mm}`,
    };
  }
  // Nombre (minutes brutes)
  if (/^\d+$/.test(s)) {
    const mins = parseInt(s, 10) || 0;
    const mm = mins % 60;
    const hh = Math.floor(mins / 60);
    return { minutes: mins, label: `${hh}h${mm < 10 ? "0" + mm : mm}` };
  }
  return FALLBACK;
}

export function roundDuration5(mins: number): number {
  return Math.floor(mins / 5) * 5;
}

// ---------------- Bilan humain (somme casualties parent+sous) ----------------
export interface CasualtiesCount { dead: number; injured: number; missing: number; }
export function sumCasualties(
  base: Partial<CasualtiesCount> | undefined | null,
  subs?: Array<{ casualties?: Partial<CasualtiesCount> | null } | null | undefined> | null,
): { dead: number; injured: number; missing: number; equivalents: number } {
  const b: CasualtiesCount = {
    dead: Math.max(0, base?.dead ?? 0),
    injured: Math.max(0, base?.injured ?? 0),
    missing: Math.max(0, base?.missing ?? 0),
  };
  if (subs) {
    for (const s of subs) {
      if (!s || !s.casualties) continue;
      b.dead += Math.max(0, s.casualties.dead ?? 0);
      b.injured += Math.max(0, s.casualties.injured ?? 0);
      b.missing += Math.max(0, s.casualties.missing ?? 0);
    }
  }
  const equivalents = b.dead * 10 + b.injured * 3 + b.missing * 2;
  return { ...b, equivalents };
}

// ---------------- Saturation hôpital (MAX occ/lits < 60km) ----------------
export type HospitalLite = { ville?: string | null; lits: number; occ: number; ll?: [number, number] | null };
export function maxHospitalSat(hospitals: HospitalLite[], incidentLL: [number, number] | null | undefined, radiusKm = 60) {
  if (!hospitals?.length) return { occPct: 0, count: 0, worst: null as HospitalLite | null };
  let count = 0;
  let worst: HospitalLite | null = null;
  let worstPct = -1;
  for (const h of hospitals) {
    if (!h.lits) continue;
    // Si on a coords incident -> rayon < radiusKm
    const include = !incidentLL || !h.ll || haversineKm(incidentLL, h.ll) <= radiusKm;
    if (!include) continue;
    count++;
    const p = Math.max(0, Math.min(1, h.occ / Math.max(1, h.lits)));
    const pct = Math.round(p * 100);
    if (pct > worstPct) { worstPct = pct; worst = h; }
  }
  return { occPct: Math.max(0, worstPct), count, worst };
}

// ---------------- Distance haversine km ----------------
export function haversineKm(a: [number, number], b: [number, number] | null | undefined): number {
  if (!b) return 0;
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------- Classification Δ What If (convention harmonisée) ----------------
export type DeltaDirection = "empire" | "stable" | "ameliore";
export function classifyDelta(delta: number): DeltaDirection {
  if (delta >= 0.5) return "empire";
  if (delta <= -0.5) return "ameliore";
  return "stable";
}

export function deltaLabel(d: DeltaDirection): { icon: string; word: string; color: string } {
  switch (d) {
    case "empire": return { icon: "⬆", word: "empiré", color: "text-danger-600 dark:text-danger-400" };
    case "ameliore": return { icon: "⬇", word: "amélioré", color: "text-green-700 dark:text-green-400" };
    default: return { icon: "±", word: "stable", color: "text-gray-600 dark:text-rdia-300" };
  }
}

// ---------------- Palette Impact (facteurs) ----------------
export const IMPACT_FILL: Record<Impact, string> = {
  haut: "bg-danger-400",
  moyen: "bg-or-400",
  faible: "bg-rdia-400",
};

export const IMPACT_TEXT: Record<Impact, string> = {
  haut: "bg-danger-500/[0.07] text-danger-700 dark:text-danger-400",
  moyen: "bg-or-500/[0.07] text-or-700 dark:text-or-400",
  faible: "bg-rdia-500/[0.08] text-rdia-600 dark:text-rdia-300",
};

// ---------------- Level Metadata (UI style) ----------------
export interface LevelMeta {
  label: string;               // "Alerte rouge" …
  tint: string;                // couleur texte chiffre / MAJUSCULE
  bg: string;                  // bg header
  border: string;              // border header
  dot: string;                 // point voyant
  scoreFill: string;           // fill barre score
}

export const LEVEL_META: Record<"alerte_rouge" | "vigilance" | "surveillance" | "calme", LevelMeta> = {
  alerte_rouge: {
    label: "Alerte rouge",
    tint: "text-danger-700 dark:text-danger-300",
    bg: "bg-danger-500/[0.08] dark:bg-danger-500/10",
    border: "border-danger-500/30 dark:border-danger-400/30",
    dot: "bg-danger-500",
    scoreFill: "bg-danger-400",
  },
  vigilance: {
    label: "Vigilance renforcée",
    tint: "text-or-700 dark:text-or-300",
    bg: "bg-or-500/[0.07] dark:bg-or-500/10",
    border: "border-or-500/30 dark:border-or-400/30",
    dot: "bg-or-500",
    scoreFill: "bg-or-400",
  },
  surveillance: {
    label: "Surveillance",
    tint: "text-rdia-600 dark:text-rdia-300",
    bg: "bg-rdia-500/[0.06] dark:bg-rdia-500/10",
    border: "border-rdia-500/25 dark:border-rdia-400/25",
    dot: "bg-rdia-400",
    scoreFill: "bg-rdia-400",
  },
  calme: {
    label: "Situation calme",
    tint: "text-green-700 dark:text-green-400",
    bg: "bg-green-500/[0.06] dark:bg-green-500/10",
    border: "border-green-500/25 dark:border-green-400/25",
    dot: "bg-green-400",
    scoreFill: "bg-green-400",
  },
};

// ---------------- Niveaux risque couleur (Risques imminents) ----------------
export const NIV_COLORS: Record<RiskLevel, string> = {
  critique: "bg-danger-400",
  eleve: "bg-or-400",
  modere: "bg-rdia-400",
  faible: "bg-green-400",
};

export const NIV_TXT: Record<RiskLevel, string> = {
  critique: "CRITIQUE",
  eleve: "ÉLEVÉ",
  modere: "MODÉRÉ",
  faible: "FAIBLE",
};
