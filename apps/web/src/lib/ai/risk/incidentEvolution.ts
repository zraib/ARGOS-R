// ========================================================================
// ARGOS · Module IA — Prédiction d'Évolution d'Incident
// Moteur 100% déterministe · 9 facteurs pondérés (F1..F9)
// Inclut signaux météo (API /weather/forecast) et sismicité (EMSC).
// Pas d'inférence LLM ici : reproductibilité et auditabilité exigées.
// ========================================================================
import type { Incident, Hospital, Unit, WeatherForecast, SeismicEvent, DashStats, Severity } from "@/lib/types";
import type { RiskPrediction, RiskFactor, RiskLevel, RiskDataSource } from "./types";
import {
  levelOf, probabilityPctOf, horizonMinutes,
  haversineKm, sumCasualties, roundDuration5, parseDurationSafe,
  clamp01, clamp100,
} from "@/lib/ai/shared";

// Re-export safe util for consumers that still import clamp helpers locally
export { clamp01, clamp100 } from "@/lib/ai/shared";

export type EvolutionTrend = "aggravation" | "stable" | "amelioration";

/** Libellés localisés pour le moteur (facteurs, scénario, actions) — strict rétrocompat FR par défaut. */
export interface EvolutionLabels {
  factor_severity: string;
  factor_casualties: string;
  factor_hospitals: string;
  factor_units: string;
  factor_duration: string;
  factor_subincidents: string;
  factor_seismic: string;
  factor_weather: string;
  scenario_critique: string;
  scenario_eleve: string;
  scenario_modere: string;
  scenario_faible: string;
  drivers_prefix: string;
  act_sev_high: string;
  act_sev_low: string;
  act_cas_high: string;
  act_cas_low: string;
  act_hosp_high: string;
  act_hosp_med: string;
  act_hosp_low: string;
  act_unit_none: string;
  act_unit_high: string;
  act_unit_low: string;
  act_dur_high: string;
  act_dur_low: string;
  act_sub_high: string;
  act_sub_low: string;
  act_seis_high: string;
  act_seis_low: string;
  act_wx_fire: string;
  act_wx_flood: string;
  act_wx_wind: string;
  act_wx_default: string;
  act_fallback_1: string;
  act_fallback_2: string;
  act_fallback_3: string;
  act_critique_override: string;
  act_eleve_override: string;
}

const DEFAULT_EVOLUTION_LABELS: EvolutionLabels = {
  factor_severity: "Sévérité initiale",
  factor_casualties: "Bilan humain",
  factor_hospitals: "Saturation hôpitaux proches",
  factor_units: "Déploiement unités",
  factor_duration: "Durée écoulée",
  factor_subincidents: "Sous-incidents",
  factor_seismic: "Sismicité EMSC (72h)",
  factor_weather: "Météo pondérée type",
  scenario_critique: "Risque critique d'aggravation rapide",
  scenario_eleve: "Risque élevé, situation fragile",
  scenario_modere: "Risque modéré, surveillance renforcée",
  scenario_faible: "Risque faible, stabilisation probable",
  drivers_prefix: " · pilotes : ",
  act_sev_high: "Réévaluer la gravité par un responsable terrain et confirmer le niveau de crise.",
  act_sev_low: "Confirmer la qualification de gravité auprès du correspondant local.",
  act_cas_high: "Consolider en temps réel le bilan humain (décès, blessés, disparus) et qualifier les priorités médicales.",
  act_cas_low: "Mettre en place une cellule d'écoute et de recensement des personnes affectées.",
  act_hosp_high: "Déclencher le plan Hôpital Blanc et ouvrir les lits de reconversion pour éviter la saturation.",
  act_hosp_med: "Contrôler en temps réel la saturation des structures sanitaires et des services de réanimation proches.",
  act_hosp_low: "Vérifier la disponibilité des hôpitaux de référence et préparer les circuits d'évacuation.",
  act_unit_none: "Déclencher immédiatement un premier déploiement d'une unité de secours pour évaluer et sécuriser la zone.",
  act_unit_high: "Renforcer le dispositif par une unité supplémentaire pour couvrir le sous-effectif identifié.",
  act_unit_low: "Réaliser un point d'avancement avec les commandants d'unité et ajuster le dispositif.",
  act_dur_high: "Préparer les rotations des équipes et prévoir la relève des moyens engagés au-delà de 24 heures.",
  act_dur_low: "Maintenir une cadence de point situation adaptée à la durée de gestion.",
  act_sub_high: "Cartographier précisément l'ensemble des sous-incidents pour éviter la dispersion des moyens de secours.",
  act_sub_low: "Rechercher des sous-incidents éventuels non encore déclarés autour de la zone principale.",
  act_seis_high: "Intégrer l'activité sismique régionale dans l'évaluation du risque et renforcer la vigilance des équipes sur zone.",
  act_seis_low: "Consulter la sismicité régionale sur 72 heures avant d'engager des opérations lourdes en zone instable.",
  act_wx_fire: "Anticiper les évolutions de vent et de température pour sécuriser les équipes de lutte contre l'incendie.",
  act_wx_flood: "Surveiller en continu les précipitations et les niveaux des cours d'eau pour déclencher les évacuations préventives.",
  act_wx_wind: "Prendre en compte les rafales et le vent pour sécuriser les zones d'intervention.",
  act_wx_default: "Prendre en compte les conditions météorologiques pour planifier les rotations des équipes.",
  act_fallback_1: "Consolider la fiche incident (bilan humain, position exacte, moyens déployés) pour garantir la cohérence du commandement.",
  act_fallback_2: "Maintenir une surveillance régulière et un reporting cadencé sur l'évolution de la situation.",
  act_fallback_3: "Préparer un point situation à transmettre à la cellule de crise.",
  act_critique_override: "Déclencher immédiatement un renfort des moyens humains et matériels sur la zone d'intervention.",
  act_eleve_override: "Anticiper un pré-positionnement de renforts opérationnels à proximité immédiate de l'incident.",
};

const mergeEvolutionLabels = (partial?: Partial<EvolutionLabels>): EvolutionLabels => ({
  ...DEFAULT_EVOLUTION_LABELS,
  ...(partial ?? {}),
});

/** Facteur d'évolution calculé (toujours 0..1). */
export interface EvolutionFactor extends RiskFactor {
  /** Score brut 0..1 du facteur. */
  rawScore: number;
  /** Score pondéré 0..100 (rawScore * weight * 100). */
  weightedScore: number;
}

/** Résultat complet d'une prédiction d'évolution. */
export interface IncidentEvolution {
  /** Identifiant déterministe (incidentId + timestamp de calcul). */
  id: string;
  /** ID incident lié. */
  incidentId: string;
  /** Score ARGOS final 0..100 · plus élevé = plus grand risque d'aggravation. */
  score: number;
  /** Niveau dérivé du score. */
  level: RiskLevel;
  /** Tendance de l'évolution (prochaines 2h). */
  trend: EvolutionTrend;
  /** Probabilité d'aggravation calculée (0..100 %). */
  probabilityPct: number;
  /** Horizon temporel estimé en minutes — délai avant aggravation probable. */
  horizonMin: number;
  /** Scénario prédit en une phrase courte. */
  scenario: string;
  /** Trois actions recommandées. */
  actions: [string, string, string];
  /** Facteurs qui ont construit le score (transparence / audit). */
  factors: EvolutionFactor[];
  /** Sources utilisées (traçabilité). */
  sources: RiskDataSource[];
  /** Durée écoulée depuis la déclaration (minutes). */
  durationMinutes: number;
  /** Nombre d'unités déployées sur l'incident. */
  deployedUnits: number;
  /** Nombre d'hôpitaux à moins de 60km. */
  nearbyHospitalsCount: number;
  /** Type d'incident. */
  incidentType: string;
  /** Timestamp calcul. */
  computedAt: number;
}

// ========================================================================
// Utilitaires numériques (zéro tolérance NaN / ±Infini)
// ========================================================================
const safeNum = (v: unknown, d = 0): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) return d;
  return v;
};
const SEV_WEIGHT: Record<Severity, number> = { high: 1, medium: 0.55, low: 0.2 };
// Pondérations F1..F8 (F8 RiskPanel RETIRÉ car redondance circulaire F1..F7)
// Σ pré-retrait = 0.92 → × 1/0.92 = ×1.0869565 pour Σ=1
const F_WEIGHTS = [0.1630, 0.1957, 0.1413, 0.1087, 0.0870, 0.0978, 0.1304, 0.0761];
const F_LABELS = [
  "Sévérité initiale",
  "Bilan humain",
  "Saturation hôpitaux proches",
  "Déploiement unités",
  "Durée écoulée",
  "Sous-incidents",
  "Sismicité EMSC (72h)",
  "Météo pondérée type",
];
const F_SOURCES: RiskDataSource[][] = [
  ["dashstats.severity"],
  ["dashstats.casualties"],
  ["hospitals.saturation", "hospitals.rea"],
  ["units.deploiement", "units.readiness"],
  ["dashstats.evolution"],
  ["incidents.actifs"],
  ["seismic.events"],
  ["weather.current", "weather.forecast"],
];

// ========================================================================
// Géométrie (haversine simplifiée)
// ========================================================================

// ========================================================================
// Durée ISO → minutes écoulées
// ========================================================================
const parseISO = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};

// ========================================================================
// CONTEXTE D'INJECTION (toutes données ARGOS + météo / sismicité)
// ========================================================================
export interface IncidentEvolutionCtx {
  incident: Incident;
  allIncidents: Incident[];
  hospitals: Hospital[];
  units: Unit[];
  dashStats: DashStats | null;
  quakes?: SeismicEvent[] | null;
  riskPredictions?: RiskPrediction[] | null;
  weather?: WeatherForecast | null;
  /** Timestamp "maintenant" pour tests. */
  now?: number;
}

// ========================================================================
// F1 · Sévérité intrinsèque (poids 0.15)
// ========================================================================
const f1Sev = (inc: Incident): EvolutionFactor => {
  const raw = SEV_WEIGHT[inc.sev] ?? 0.3;
  const w = F_WEIGHTS[0];
  return {
    label: F_LABELS[0],
    weight: w,
    sources: F_SOURCES[0],
    rawValue: inc.sev,
    rawScore: clamp01(raw),
    weightedScore: clamp100(raw * w * 100),
  };
};

// ========================================================================
// F2 · Bilan humain (poids 0.18) · deaths ×10, injured ×3, missing ×2
// ========================================================================
const F2 = (inc: Incident): EvolutionFactor => {
  // Utilise helper sumCasualties (parent + sous-incidents, déjà avec plafond / 200 équivalents)
  const w = F_WEIGHTS[1];
  const sum = sumCasualties(inc.casualties, inc.subIncidents as unknown as Array<{ casualties?: import("@/lib/types").Incident["casualties"] }>);
  // Plafond historique moteur évolution : 50 équivalents = 1.0 (gardé pour rétrocompatibilité, sumCasualties a / 200)
  const raw = clamp01(sum.equivalents / 50);
  return {
    label: F_LABELS[1],
    weight: w,
    sources: F_SOURCES[1],
    rawValue: `dead:${sum.dead} · inj:${sum.injured} · mis:${sum.missing}`,
    rawScore: raw,
    weightedScore: clamp100(raw * w * 100),
  };
};

// ========================================================================
// F3 · Saturation hôpitaux proches <60km (poids 0.13)
// ========================================================================
const f3Hospitals = (inc: Incident, hospitals: Hospital[]): EvolutionFactor => {
  let nearScore = 0;
  let nearCount = 0;
  for (const h of hospitals) {
    const km = haversineKm(inc.ll, h.ll);
    if (km > 60) continue;
    nearCount++;
    const occPct = h.lits > 0 ? safeNum(h.occ) / h.lits : 0;
    const reaPct = h.rea > 0 ? safeNum(h.reaOcc) / h.rea : occPct;
    const distFactor = 1 - clamp01(km / 60);
    const local = clamp01((0.7 * occPct + 0.3 * reaPct) * (0.4 + 0.6 * distFactor));
    if (local > nearScore) nearScore = local;
  }
  const raw = clamp01(nearScore);
  const w = F_WEIGHTS[2];
  return {
    label: F_LABELS[2],
    weight: w,
    sources: F_SOURCES[2],
    rawValue: nearCount > 0 ? `${nearCount} hôp. <60km` : "hôp. >60km",
    rawScore: raw,
    weightedScore: clamp100(raw * w * 100),
  };
};

// ========================================================================
// F4 · Déploiement unités (poids 0.1087)
// RÈGLE MÉTIER CONTRAIGNANTE (UX) — RESPECT OBLIGATOIRE :
//   1. AUCUNE unité explicitement affectée (responders.units vide) → F4 = 100 %
//      (on ne suppose JAMAIS de moyens locaux non déclarés — pire cas.)
//   2. À chaque unité ajoutée → F4 DIMINUE strictement (fonction monotone ↓)
//   3. Besoin = f(gravité) : LOW=2 / MEDIUM=4 / HIGH=6
//   4. Suréquipement (>besoin) → F4 tend vers plancher 5 % (jamais 0 — marge de sécurité)
// ========================================================================
const UNIT_NEED: Record<Severity, number> = { high: 6, medium: 4, low: 2 };
const PLANNER_FLOOR = 0.05;

const f4Units = (inc: Incident, units: Unit[]): EvolutionFactor => {
  const selIds = inc.responders?.units ?? [];
  const sel = selIds.map((id) => units.find((u) => u.id === id)).filter(Boolean) as Unit[];
  const count = sel.length;
  const need = UNIT_NEED[inc.sev] ?? 4;
  let raw = 1; // = 100 % par défaut (pire cas : aucune unité)
  const w = F_WEIGHTS[3];

  if (count === 0) {
    // Règle n°1 : aucune unité déclarée → 100%
    return {
      label: F_LABELS[3],
      weight: w,
      sources: F_SOURCES[3],
      rawValue: "aucune unité déclarée",
      rawScore: 1,
      weightedScore: clamp100(1 * w * 100),
    };
  }

  // Règle n°2 : pondération qualité (readiness + distance + effectif)
  //   meilleure unité = readiness 100% + distance<30km + eff>=120 → score QUALITÉ max = 1.0
  //   F4 = (1 − qualité × coverage) amorti avec PLANNER_FLOOR
  //   coverage = min(1, count / need)
  //   Plus count est haut, plus coverage → plus F4 ↓ (monotone)
  const coverage = Math.min(1, count / need);
  let bestQuality = 0;
  let totalEff = 0;
  for (const u of sel) {
    totalEff += safeNum(u.eff);
    const readiness = clamp01(safeNum(u.readiness) / 100);
    const km = haversineKm(inc.ll, u.ll);
    const distFactor = 1 - clamp01(km / 120); // 0km=1, 120km+=0
    const effNorm = clamp01(safeNum(u.eff) / 120);
    // Qualité locale : 50% readiness + 30% proximité + 20% effectif
    const localQ = 0.5 * readiness + 0.3 * distFactor + 0.2 * effNorm;
    bestQuality = Math.max(bestQuality, localQ);
  }
  // Si surplus d'unités (count > need) → bonus de réduction proportionnel
  const surplusBonus = count > need ? Math.min(0.35, (count - need) * 0.1) : 0;
  const coverageFinal = Math.min(1, coverage + surplusBonus);
  const reduction = bestQuality * coverageFinal;
  raw = clamp01(1 - reduction);
  // Règle n°4 : plancher 5 % (jamais 0)
  raw = Math.max(PLANNER_FLOOR, raw);

  return {
    label: F_LABELS[3],
    weight: w,
    sources: F_SOURCES[3],
    rawValue: `${count}/${need} unités · ~${totalEff} pers.`,
    rawScore: clamp01(raw),
    weightedScore: clamp100(clamp01(raw) * w * 100),
  };
};

// ========================================================================
// F5 · Durée écoulée (poids 0.08) · >24h = plateau haut
// Parse safe J-n / HH:MM / ISO / numeric minutes
// ========================================================================
const F5_DURATION = (inc: Incident, nowMs: number): EvolutionFactor => {
  const { minutes: parsedMin, label } = parseDurationSafe(inc.time);
  // Fallback ISO si minutes parsées 0 (le parse a renvoyé J-0 / 0) mais l'ISO est valide
  const startISO = parseISO(inc.time);
  const min = Number.isFinite(startISO) && parsedMin === 0 ? Math.max(0, Math.round((nowMs - startISO) / 60000)) : parsedMin;
  const minRounded = roundDuration5(min);
  let raw = 0;
  if (minRounded < 30) raw = (minRounded / 30) * 0.4;
  else if (minRounded < 120) raw = 0.4 + ((minRounded - 30) / 90) * 0.3;
  else if (minRounded < 1440) raw = 0.7 + ((minRounded - 120) / 1320) * 0.2;
  else raw = 0.9;
  const w = F_WEIGHTS[4];
  return {
    label: F_LABELS[4],
    weight: w,
    sources: F_SOURCES[4],
    rawValue: label,
    rawScore: clamp01(raw),
    weightedScore: clamp100(clamp01(raw) * w * 100),
  };
};

// ========================================================================
// F6 · Sous-incidents (poids 0.09) — nombre et sévérité cumulée
// ========================================================================
const f6Subs = (inc: Incident): EvolutionFactor => {
  const subs = inc.subIncidents ?? [];
  let sevSum = 0;
  for (const s of subs) sevSum += SEV_WEIGHT[s.sev] ?? 0.2;
  const count = subs.length;
  // Plafond à 5 sous-incidents haute sévérité.
  const raw = count === 0 ? 0 : clamp01((count * 0.15 + sevSum * 0.7) / 4);
  const w = F_WEIGHTS[5];
  return {
    label: F_LABELS[5],
    weight: w,
    sources: F_SOURCES[5],
    rawValue: count === 0 ? "aucun" : `${count} sous-incident(s)`,
    rawScore: raw,
    weightedScore: clamp100(raw * w * 100),
  };
};

// ========================================================================
// F7 · Sismicité EMSC 72h (poids 0.12) · <150km & mag>4.5
// ========================================================================
const f7Seismic = (inc: Incident, quakes: SeismicEvent[] | null | undefined, nowMs: number): EvolutionFactor => {
  if (!quakes || quakes.length === 0) {
    const w = F_WEIGHTS[6];
    return {
      label: F_LABELS[6],
      weight: w,
      sources: F_SOURCES[6],
      rawValue: "0 événement",
      rawScore: 0,
      weightedScore: 0,
    };
  }
  const t72h = nowMs - 72 * 3600 * 1000;
  let best = 0;
  let nearestEvent = "";
  for (const q of quakes) {
    if (q.evtype && q.evtype !== "earthquake") continue;
    const qt = parseISO(q.time);
    if (!Number.isFinite(qt) || qt < t72h) continue;
    const km = haversineKm(inc.ll, q.ll);
    if (km > 200) continue;
    const mag = safeNum(q.mag);
    if (mag < 3.5) continue;
    const distF = 1 - clamp01(km / 150);
    const depthF = 1 - clamp01(safeNum(q.depth) / 150);
    const magF = clamp01((mag - 3.5) / 4); // mag 7.5 = 1.0
    const local = clamp01(0.5 * magF + 0.35 * distF + 0.15 * depthF);
    if (local > best) {
      best = local;
      nearestEvent = `M${mag.toFixed(1)} · ${Math.round(km)}km`;
    }
  }
  const w = F_WEIGHTS[6];
  return {
    label: F_LABELS[6],
    weight: w,
    sources: F_SOURCES[6],
    rawValue: nearestEvent || `${quakes.length} évént.`,
    rawScore: clamp01(best),
    weightedScore: clamp100(best * w * 100),
  };
};

// ========================================================================
// F8 · Risques liés (RiskPredictions proximaux) (poids 0.08)
// ========================================================================

// ========================================================================
// F9 · Météo pondérée type (poids 0.07)
// ========================================================================
// Catégories d'incident qui s'aggravent avec une météo particulière.
const WEATHER_PROFILE: Record<string, (w: WeatherForecast) => number> = {
  // Incendie : chaleur + vent fort + humidité basse
  fire: (w) => {
    const temp = clamp01((safeNum(w.current.temp) - 20) / 20); // >40°C = 1
    const wind = clamp01(safeNum(w.current.wind) / 40);
    const hum = 1 - clamp01(safeNum(w.current.humidity) / 100);
    const precip = 1 - clamp01(safeNum(w.current.precip) / 20);
    return clamp01(0.4 * temp + 0.3 * wind + 0.2 * hum + 0.1 * precip);
  },
  // Inondation : précipitations fortes
  flood: (w) => {
    const p0 = clamp01(safeNum(w.current.precip) / 30);
    const pNext = w.daily?.slice(0, 2).reduce((m, d) => Math.max(m, clamp01(safeNum(d.precip) / 50) + 0.5 * clamp01(safeNum(d.precipProb) / 100)), 0) ?? 0;
    return clamp01(0.55 * p0 + 0.45 * pNext);
  },
  // Tempête : vent + rafales
  storm: (w) => {
    const wind = clamp01(safeNum(w.current.wind) / 60);
    const gust = clamp01(safeNum(w.current.gust) / 100);
    const windMax = w.daily?.length ? w.daily[0] && clamp01(safeNum(w.daily[0].windMax) / 70) : 0;
    return clamp01(0.5 * wind + 0.35 * gust + 0.15 * windMax);
  },
  // Routier : précip + vent
  road: (w) => {
    const rain = clamp01(safeNum(w.current.precip) / 10);
    const wind = clamp01(safeNum(w.current.wind) / 40);
    const vis = 1 - clamp01(safeNum(w.current.cloud) / 100);
    return clamp01(0.5 * rain + 0.25 * wind + 0.25 * (1 - vis));
  },
};

const detectProfile = (incType: string): keyof typeof WEATHER_PROFILE | null => {
  const t = incType.toLowerCase();
  if (/incen|feu|fire|brul|flamme/.test(t)) return "fire";
  if (/inond|cru|flood|eau|pluv|hydro/.test(t)) return "flood";
  if (/temp[eê]t|orage|vent|cyclon|ouragan|storm/.test(t)) return "storm";
  if (/routier|accident|voiture|automobile|collis/.test(t)) return "road";
  return null;
};

const f9Weather = (inc: Incident, wf: WeatherForecast | null | undefined): EvolutionFactor => {
  const w = F_WEIGHTS[7];
  if (!wf) {
    return {
      label: F_LABELS[7],
      weight: w,
      sources: F_SOURCES[7],
      rawValue: "pas de météo",
      rawScore: 0.3,
      weightedScore: clamp100(0.3 * w * 100),
    };
  }
  const profile = detectProfile(inc.type);
  // Défaut : météo générique (températures extrêmes + précip + vent)
  const generic = () => {
    const tempExt = clamp01((Math.abs(safeNum(wf.current.temp) - 22) - 10) / 18);
    const wind = clamp01(safeNum(wf.current.wind) / 50);
    const precip = clamp01(safeNum(wf.current.precip) / 25);
    return clamp01(0.4 * tempExt + 0.3 * wind + 0.3 * precip);
  };
  const raw = profile ? clamp01(WEATHER_PROFILE[profile](wf)) : generic();
  const codes: Record<number, string> = {
    0: "clair", 1: "clair", 2: "partiel", 3: "nuage", 45: "brume", 48: "givre",
    51: "bruine", 53: "bruine", 55: "bruine", 61: "pluie", 63: "pluie", 65: "pluie",
    71: "neige", 73: "neige", 75: "neige", 80: "averse", 81: "averse", 82: "averse",
    95: "orage", 96: "orage-grêle", 99: "orage-violent",
  };
  return {
    label: F_LABELS[7],
    weight: w,
    sources: F_SOURCES[7],
    rawValue: `${codes[wf.current.code] ?? "code " + wf.current.code} · ${Math.round(wf.current.temp)}°C`,
    rawScore: raw,
    weightedScore: clamp100(raw * w * 100),
  };
};

// Renommage Fx local cohérent (même style que F2 / F5_DURATION)
const F1_SEV = f1Sev;
const F3_HOSP = f3Hospitals;
const F4_UNITS = f4Units;
const F6_SUBS = f6Subs;
const F7_SEISMIC = f7Seismic;
const F8_METEO = f9Weather;

// Trend local — respecte signature existante EvolutionTrend (aggravation/stable/amelioration)
//   (shared.ts renvoie "aggravation" etc. sous Trend)
function toEvolutionTrend(score: number, durationMin: number, st: Incident["st"]): EvolutionTrend {
  if (st === "closed") return score > 40 ? "stable" : "amelioration";
  if (score >= 55 && durationMin >= 60) return "aggravation";
  if (score <= 30) return "amelioration";
  return "stable";
}

// ========================================================================
// POINT D'ENTRÉE PRINCIPAL
// ========================================================================
export function predictIncidentEvolution(ctx: IncidentEvolutionCtx, labels?: Partial<EvolutionLabels>): IncidentEvolution {
  const L = mergeEvolutionLabels(labels);
  const nowMs = safeNum(ctx.now, Date.now());
  const inc = ctx.incident;

  const f1 = F1_SEV(inc);
  const f2 = F2(inc);
  const f3 = F3_HOSP(inc, ctx.hospitals);
  const f4 = F4_UNITS(inc, ctx.units);
  const f5 = F5_DURATION(inc, nowMs);
  const f6 = F6_SUBS(inc);
  const f7 = F7_SEISMIC(inc, ctx.quakes, nowMs);
  const f8 = F8_METEO(inc, ctx.weather);

  const F_LABEL: Record<string, string> = {
    [DEFAULT_EVOLUTION_LABELS.factor_severity]: L.factor_severity,
    [DEFAULT_EVOLUTION_LABELS.factor_casualties]: L.factor_casualties,
    [DEFAULT_EVOLUTION_LABELS.factor_hospitals]: L.factor_hospitals,
    [DEFAULT_EVOLUTION_LABELS.factor_units]: L.factor_units,
    [DEFAULT_EVOLUTION_LABELS.factor_duration]: L.factor_duration,
    [DEFAULT_EVOLUTION_LABELS.factor_subincidents]: L.factor_subincidents,
    [DEFAULT_EVOLUTION_LABELS.factor_seismic]: L.factor_seismic,
    [DEFAULT_EVOLUTION_LABELS.factor_weather]: L.factor_weather,
  };
  const localizeFactorLabel = (fr: string): string => F_LABEL[fr] ?? fr;

  const factorsRaw: EvolutionFactor[] = [f1, f2, f3, f4, f5, f6, f7, f8];
  const factors: EvolutionFactor[] = factorsRaw.map((f) => ({ ...f, label: localizeFactorLabel(f.label) }));
  const score = clamp100(factors.reduce((s, f) => s + f.weightedScore, 0));
  const level = levelOf(score);
  const start = parseISO(inc.time);
  const durationMinutes = roundDuration5(Math.max(0, Math.round(Number.isFinite(start) ? (nowMs - start) / 60000 : 0)));
  const trend = toEvolutionTrend(score, durationMinutes, inc.st);
  const deployedUnits = inc.responders?.units?.length ?? 0;
  const nearbyHospitalsCount = ctx.hospitals.filter((h) => haversineKm(inc.ll, h.ll) <= 60).length;

  const sources = Array.from(new Set<RiskDataSource>(factors.flatMap((f) => f.sources)));

  // --- Probabilité d'aggravation (sigmoïde douce sur score) ---
  const probabilityPct = probabilityPctOf(score);

  // --- Horizon temporel (minutes avant aggravation probable) ---
  const horizonMin = horizonMinutes(score);

  // --- Scénario court (1 phrase, type + drivers dominants) ---
  const sorted = [...factors].sort((a, b) => b.weightedScore - a.weightedScore);
  const topDrivers = sorted.slice(0, 3).map((f) => f.label);
  const baseScenario =
    level === "critique"
      ? L.scenario_critique
      : level === "eleve"
        ? L.scenario_eleve
        : level === "modere"
          ? L.scenario_modere
          : L.scenario_faible;
  const scenario = `${baseScenario}${L.drivers_prefix}${topDrivers.join(" · ")}`;

  // --- 3 actions recommandées ADAPTÉES aux 3 pilotes (triées par impact estimé). ---
  // Règle : CHAQUE pilote → une action DISTINCTE, jamais le même catalogue pour tous.
  // Chaque action porte un « impact » = gain théorique max sur le score si l'action est menée (0..100).
  type ActionCandidate = { impact: number; text: string };
  // Pour matcher les facteurs localisés → clé FR (inverse F_LABEL).
  const FR_BY_LOCAL: Record<string, string> = {};
  for (const [fr, local] of Object.entries(F_LABEL)) FR_BY_LOCAL[local] = fr;
  const actionFor = (driverLabel: string, weightedScore: number, sev: Severity, incType: string): ActionCandidate | null => {
    const hasDeployedUnits = deployedUnits > 0;
    const frKey = FR_BY_LOCAL[driverLabel] ?? driverLabel;
    switch (frKey) {
      case DEFAULT_EVOLUTION_LABELS.factor_severity: {
        if (sev === "high" || weightedScore >= 15) return { impact: 14, text: L.act_sev_high };
        return { impact: 6, text: L.act_sev_low };
      }
      case DEFAULT_EVOLUTION_LABELS.factor_casualties: {
        if (weightedScore >= 10) return { impact: 22, text: L.act_cas_high };
        return { impact: 8, text: L.act_cas_low };
      }
      case DEFAULT_EVOLUTION_LABELS.factor_hospitals: {
        if (weightedScore >= 14) return { impact: 20, text: L.act_hosp_high };
        if (weightedScore >= 7) return { impact: 12, text: L.act_hosp_med };
        return { impact: 5, text: L.act_hosp_low };
      }
      case DEFAULT_EVOLUTION_LABELS.factor_units: {
        if (!hasDeployedUnits) return { impact: 25, text: L.act_unit_none };
        if (weightedScore >= 12) return { impact: 18, text: L.act_unit_high };
        return { impact: 7, text: L.act_unit_low };
      }
      case DEFAULT_EVOLUTION_LABELS.factor_duration: {
        if (weightedScore >= 8) return { impact: 9, text: L.act_dur_high };
        return { impact: 4, text: L.act_dur_low };
      }
      case DEFAULT_EVOLUTION_LABELS.factor_subincidents: {
        if (weightedScore >= 5) return { impact: 16, text: L.act_sub_high };
        return { impact: 4, text: L.act_sub_low };
      }
      case DEFAULT_EVOLUTION_LABELS.factor_seismic: {
        if (weightedScore >= 5) return { impact: 11, text: L.act_seis_high };
        return { impact: 3, text: L.act_seis_low };
      }
      case DEFAULT_EVOLUTION_LABELS.factor_weather: {
        const t = incType.toLowerCase();
        if (/feu|incendie|wildfire|flammes/.test(t)) return { impact: weightedScore >= 5 ? 15 : 6, text: L.act_wx_fire };
        if (/inond|cru|flood|eau|hydro/.test(t)) return { impact: weightedScore >= 5 ? 17 : 7, text: L.act_wx_flood };
        if (/temp[eê]t|orage|vent|cyclon|ouragan|storm/.test(t)) return { impact: weightedScore >= 5 ? 14 : 6, text: L.act_wx_wind };
        return { impact: 5, text: L.act_wx_default };
      }
      default:
        return null;
    }
  };
  const usedLabels = new Set<string>();
  const candidates: ActionCandidate[] = [];
  for (const f of sorted.slice(0, 5)) {
    if (usedLabels.has(f.label)) continue;
    const a = actionFor(f.label, f.weightedScore, inc.sev, inc.type);
    if (a) {
      candidates.push(a);
      usedLabels.add(f.label);
      if (candidates.length >= 4) break;
    }
  }
  const genericFallback: ActionCandidate[] = [
    { impact: 3, text: L.act_fallback_1 },
    { impact: 2, text: L.act_fallback_2 },
    { impact: 1, text: L.act_fallback_3 },
  ];
  for (const g of genericFallback) if (candidates.length < 3) candidates.push(g);
  candidates.sort((a, b) => b.impact - a.impact);
  if (level === "critique") candidates.unshift({ impact: 99, text: L.act_critique_override });
  if (level === "eleve" && candidates[0].impact < 20) candidates.unshift({ impact: 30, text: L.act_eleve_override });
  const seenText = new Set<string>();
  const actions: [string, string, string] = ["", "", ""] as unknown as [string, string, string];
  let k = 0;
  for (const c of candidates) {
    if (seenText.has(c.text)) continue;
    seenText.add(c.text);
    actions[k] = c.text;
    k++;
    if (k >= 3) break;
  }
  if (!actions[0]) actions[0] = genericFallback[1].text;
  if (!actions[1]) actions[1] = genericFallback[0].text;
  if (!actions[2]) actions[2] = genericFallback[2].text;

  return {
    id: `evo:${inc.id}:${Math.floor(nowMs / 60000)}`,
    incidentId: inc.id,
    score,
    level,
    trend,
    probabilityPct,
    horizonMin,
    scenario,
    actions,
    factors,
    sources,
    durationMinutes,
    deployedUnits,
    nearbyHospitalsCount,
    incidentType: inc.type,
    computedAt: nowMs,
  };
}
