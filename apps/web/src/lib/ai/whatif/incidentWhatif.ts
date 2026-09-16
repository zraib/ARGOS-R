import type {
  WhatIfBaseline,
  WhatIfContext,
  WhatIfDeltas,
  WhatIfHorizon,
  WhatIfImpact,
  WhatIfRegionImpact,
  WhatIfSubMetric,
} from "./types";

import {
  clamp01, clamp100, safeNum,
  classifyDelta,
} from "@/lib/ai/shared";
import type { ModulesDict } from "@/lib/i18n/modules";
import { tpl } from "@/lib/i18n/format";

export type WhatIfLabels = ModulesDict["whatif"];

export const DEFAULT_WHATIF_LABELS: WhatIfLabels = {
  region_immediate: "Région immédiate",
  delta_hint: "positif = empiré · négatif = amélioré",
  casualties_line: "Décès {d} · Blessés {b} · Disparus {m}",
  affected_suffix: " · Affectés {a}",
  type_sev: "{type} · Sévérité {sev}",
  hosp_sat_line: "Sat. {p}% · {n} hôpital(s) <60km",
  no_quake: "Aucun séisme significatif",
  dur_recent: "récent (score risque faible)",
  dur_deploying: "en cours de déploiement",
  dur_prolonged: "prolongé (risque moyen)",
  dur_critical: "prolongé critique",
  elapsed_line: "{d} écoulées · {q}",
  none_f: "Aucune",
  slider_severity: "Sévérité : atténuation (à droite) / aggravation (à gauche)",
  slider_units: "Unités mobiles supplémentaires",
  slider_beds: "Lits hôpital supplémentaires",
  slider_wind: "Multiplicateur de vent",
  slider_rain: "Pluie additionnelle (24h)",
  slider_mag: "Magnitude sismique additionnelle",
  slider_casualties: "Victimes additionnelles (blessés + disparus)",
  slider_affected: "Personnes affectées / évacuées en plus",
  unit_pts: " pts",
  unit_units: " unité(s)",
  unit_beds: " lits",
  unit_times: " ×",
  unit_mm: " mm",
  unit_mw: " Mw",
  unit_people: " pers.",
  disabled: "Module Simulation What-If désactivé — contacter l'administrateur.",
  title: "Simulation What-If · IA",
  subtitle: "Scénarios de crise · Impact sur situation globale",
  choose_incident: "Choisir un incident",
  whatif: "What If",
  submetrics: "Sous-métriques",
  horizons: "Horizons temporels",
  impact_zones: "Zones impact",
  recommended_actions: "Actions recommandées",
  config_title: "Configuration What-If",
  config_subtitle: "Scénarios prédéfinis · 8 leviers · résultat en temps réel",
  baseline: "Situation base",
  reset: "Reset",
  presets: "Scénarios prédéfinis",
  levers: "Leviers What-If",
  apply_view: "Appliquer & voir",
  select_hint: "Sélectionnez un incident dans le bouton en haut pour démarrer la simulation What-If.",
  risk_evolution: "Évolution du risque",
  horizon_h6: "Horizon H6",
  horizon_h12: "Horizon H12",
  horizon_h24: "Horizon H24",
  h6_long: "H6 · 6 heures",
  h12_long: "H12 · 12 heures",
  h24_long: "H24 · 24 heures",
  close_config: "Fermer la configuration What-If",
  close: "Fermer",
  m_risk: "Risque",
  m_duration: "Durée",
  m_units: "Unités",
  m_hosp60: "Hôp <60km",
  m_hosp_sat: "Sat hôp",
  m_wind: "Vent",
  m_rain24: "Pluie 24h",
  m_quake: "Séisme",
  m_victims: "Victimes",
  m_affected: "Affectés",
  picker_title: "Choisir un incident pour la simulation",
  all_types: "Tous types",
  no_match: "Aucun incident ne correspond à votre recherche.",
  search_ph: "Rechercher par titre / région / ID",
  metric_severity: "Sévérité initiale",
  metric_casualties: "Bilan humain",
  metric_deployed_cap: "Sous-effectif unités",
  metric_hospital_sat: "Saturation hôpitaux proches",
  metric_weather_impact: "Impact météo",
  metric_seismic_impact: "Impact sismique EMSC",
  metric_duration: "Durée incident",
  hp_aggravation: "Prob. aggravation {p}%",
  hp_residual: "Risque résiduel {p}%",
  hp_future: "Risque futur {p}%",
  default_r2: "Zone périphérique",
  default_r3: "Bassin d'influence",
  default_r4: "Zones limitrophes",
  intr_fort_amelioration: "Très nette amélioration du scénario — stratégie recommandée.",
  intr_amelioration: "Nette amélioration globale de la situation.",
  intr_neutre: "Impact global neutre : la simulation ne change pas significativement le niveau de risque.",
  intr_degradation: "Légère dégradation : vigilance accrue recommandée.",
  intr_forte_degradation: "Forte dégradation du scénario — risque critique probable à H12.",
  params_modified_tpl: " Paramètres modifiés : {list}.",
  men_add_units_tpl: "ajout de {n} unité(s)",
  men_add_beds_tpl: "+{n} lits hospitaliers",
  men_wind_up_tpl: "vent ×{x}",
  men_wind_down_tpl: "vent réduit ×{x}",
  men_rain_tpl: "+{n}mm de pluie",
  men_quake_tpl: "séisme +{x}Mw",
  men_casualties_tpl: "+{n} victimes",
  men_affected_tpl: "+{n} personnes affectées",
  men_sev_down: "réduction de sévérité",
  men_sev_up: "augmentation de sévérité",
  hint_fire_wind: " Le vent aggrave la propagation du feu : renforcer les moyens aériens prioritaires.",
  hint_flood_rain: " Les cumuls de pluie augmentent le risque de crue rapide : évacuation préventive conseillée.",
  hint_quake_mag: " Une magnitude supérieure augmente drastiquement le risque d'effondrement et de victimes.",
  hint_road_cond: " Conditions de circulation dégradées : renforcer les barrières et déviations.",
  hint_massive_units: " Le déploiement massif d'unités renforce la réponse opérationnelle.",
  hint_hosp_beds: " La capacité hospitalière étendue diminue fortement le risque de saturation.",
  act_add_units_tpl: "Déployer {n} unités mobiles supplémentaires sur zone",
  act_add_beds_tpl: "Ouvrir {n} lits additionnels dans les hôpitaux proches",
  act_fire_aerial: "Renforcer les moyens aériens (Canadairs / hélicos bombardiers)",
  act_flood_evac: "Lancer l'évacuation préventive des bassins versants exposés",
  act_quake_orsec: "Déclencher le plan ORSEC Séisme · Évacuation bâtiments sensibles",
  act_road_barriers: "Mettre en place barrières et déviations · Neutraliser zone accident",
  act_epidemic_plan: "Activer le plan sanitaire · Créer un foyer de tri et confinement",
  act_industrial_perim: "Mettre en place périmètre de sécurité · Évacuer zone 500m",
  act_landslide_evac: "Évacuer zones en aval · Fermer routes exposées aux éboulements",
  act_storm_power: "Couper réseau électrique zones sensibles · Prépositionner équipes réparation",
  gact_sitrep: "Préparer un point situation toutes les 30 minutes",
  gact_sa: "Renforcer la conscience situationnelle des unités sur le terrain",
  gact_crisis_cell: "Mettre en alerte les cellules de crise interministérielles",
  gact_logistics: "Prévoir des points de ravitaillement logistique",
  gact_pop_comm: "Communiquer consignes de sécurité à la population via canaux officiels",
  det_units_tpl: "{n} unité(s) déployée(s) · Besoin {b} (sev)",
  det_weather_tpl: "Vent {w}km/h · Pluie 24h {r}mm",
  det_quake_tpl: "Magnitude effective M{m} (EMS/72h <200km)",
  impact_est_tpl: "Impact estimé : {val} pts sur score risque",
  delta_in_progress: "Δ en cours : ",
  p_weather_storm_dbl_n: "Tempête double",
  p_weather_storm_dbl_d: "Vent ×1.80 + pluie +80mm",
  p_earthquake_plus_flood_n: "Séisme + crue",
  p_earthquake_plus_flood_d: "Magnitude +0.6Mw · Pluie +120mm",
  p_deploy_massive_n: "Déploiement massif",
  p_deploy_massive_d: "+8 unités · +120 lits hôpital",
  p_hospital_surcharge_n: "Surcharge hôpitaux simulée",
  p_hospital_surcharge_d: "+120 victimes · +400 affectés",
  p_violent_wildfire_n: "Feu de forêt hors contrôle",
  p_violent_wildfire_d: "Vent ×2.0 + aggravation -35% · +80 affectés",
  p_rapid_containment_n: "Endiguement rapide",
  p_rapid_containment_d: "+5 unités · +80 lits · aggravation +30%",
};

export function mergeWhatIfLabels(partial?: Partial<WhatIfLabels>): WhatIfLabels {
  return { ...DEFAULT_WHATIF_LABELS, ...(partial ?? {}) };
}

const clampRange = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, safeNum(n, lo)));

const SEV_WEIGHT: Record<WhatIfContext["severity"], number> = {
  high: 1,
  medium: 0.58,
  low: 0.22,
};

const WEIGHTS = {
  severity: 0.2,
  casualties: 0.16,
  deployedCap: 0.15,
  hospitalSat: 0.16,
  weatherImpact: 0.14,
  seismicImpact: 0.09,
  duration: 0.1,
};

// ============================================================================
// Calcule la baseline (référence : pas de delta)
// ============================================================================
export function buildBaseline(ctx: WhatIfContext, labels?: Partial<WhatIfLabels>): WhatIfBaseline {
  const L = mergeWhatIfLabels(labels);
  const sev = clamp01(SEV_WEIGHT[ctx.severity] ?? 0.58) * 100;

  const casualties = casualtiesScore(ctx.casualties);
  const deployedCap = deployedCapScore(ctx.deployedUnits, ctx.severity);
  const hospitalSat = clamp100(safeNum(ctx.hospitalSatPct, 45));
  const weatherImpact = weatherScore(ctx.incidentType, ctx.windKmh, ctx.rain24Mm);
  const seismicImpact = seismicScore(ctx.seismicEffectiveMag, ctx.incidentType);

  const durationPct = durationScore(ctx.durationMin);

  const score = clamp100(
    sev * WEIGHTS.severity +
      casualties * WEIGHTS.casualties +
      deployedCap * WEIGHTS.deployedCap +
      hospitalSat * WEIGHTS.hospitalSat +
      weatherImpact * WEIGHTS.weatherImpact +
      seismicImpact * WEIGHTS.seismicImpact +
      durationPct * WEIGHTS.duration,
  );

  const subMetrics: WhatIfSubMetric[] = [
    { key: "severity", label: L.metric_severity, value: sev, delta: 0 },
    { key: "casualties", label: L.metric_casualties, value: casualties, delta: 0 },
    {
      key: "deployedCap",
      label: L.metric_deployed_cap,
      value: deployedCap,
      delta: 0,
    },
    {
      key: "hospitalSat",
      label: L.metric_hospital_sat,
      value: hospitalSat,
      delta: 0,
    },
    {
      key: "weatherImpact",
      label: L.metric_weather_impact,
      value: weatherImpact,
      delta: 0,
    },
    {
      key: "seismicImpact",
      label: L.metric_seismic_impact,
      value: seismicImpact,
      delta: 0,
    },
    {
      key: "duration",
      label: L.metric_duration,
      value: durationPct,
      delta: 0,
    },
  ];

  const horizons = buildHorizons(score, 0, L);
  const regions = buildRegions(ctx, score, 0, L);

  return {
    score: clamp100(score),
    subMetrics,
    h6: horizons.h6,
    h12: horizons.h12,
    h24: horizons.h24,
    regions,
  };
}

// ============================================================================
// Calcule la simulation (avec deltas)
// ============================================================================
export function simulateWhatIf(ctx: WhatIfContext, rawDeltas: WhatIfDeltas, labels?: Partial<WhatIfLabels>): WhatIfImpact {
  const L = mergeWhatIfLabels(labels);
  const baseline = buildBaseline(ctx, labels);

  const deltas = sanitizeDeltas(rawDeltas);

  const sevRaw = clamp01(SEV_WEIGHT[ctx.severity] ?? 0.58) * 100;
  const sevDelta = clampRange(deltas.aggravationPct, -50, 50) * 0.48;
  const severityVal = clamp100(sevRaw - sevDelta);

  const casualtiesRawVal = casualtiesScore(ctx.casualties + deltas.addCasualties * 0.55);
  const casualtiesBaselineFloor = METRIC_FLOOR.casualties ?? 0;
  const canImproveCasualties = casualtiesRawVal > casualtiesBaselineFloor;
  const casualtiesAttenuation = canImproveCasualties
    ? (Math.max(0, deltas.aggravationPct) / 420) * 100
    : 0;
  const casualtiesVal = clamp100(casualtiesRawVal - casualtiesAttenuation);

  const deployedCapSat = deployedCapScore(ctx.deployedUnits + deltas.addUnits, ctx.severity);
  const deployedCapVal = clamp100(
    deployedCapSat -
      Math.max(0, deltas.aggravationPct) * 0.16,
  );

  const hospitalSatRaw = clamp100(
    ctx.hospitalSatPct +
      deltas.addCasualties * 0.10 +
      (deltas.aggravationPct < 0 ? -deltas.aggravationPct * 0.14 : 0),
  );
  const hospitalSatVal = clamp100(
    hospitalSatRaw -
      (deltas.addHospitalBeds / 200) * 32 -
      Math.max(0, deltas.aggravationPct) * 0.16,
  );

  const weatherImpactVal = clamp100(
    weatherScore(
      ctx.incidentType,
      (ctx.windKmh * 0.85) * deltas.windMult,
      ctx.rain24Mm + deltas.rainAddMm * 0.72,
    ) +
      (deltas.aggravationPct < 0 ? -deltas.aggravationPct * 0.14 : 0),
  );

  const seismicImpactVal = clamp100(
    seismicScore(ctx.seismicEffectiveMag + deltas.seismicAddMag, ctx.incidentType),
  );

  const simScore = clamp100(
    severityVal * WEIGHTS.severity +
      casualtiesVal * WEIGHTS.casualties +
      deployedCapVal * WEIGHTS.deployedCap +
      hospitalSatVal * WEIGHTS.hospitalSat +
      weatherImpactVal * WEIGHTS.weatherImpact +
      seismicImpactVal * WEIGHTS.seismicImpact +
      durationScore(ctx.durationMin) * WEIGHTS.duration,
  );

  const durationVal = durationScore(ctx.durationMin);
  const _rawEntries: [WhatIfSubMetric["key"], number, number][] = [
    ["severity", severityVal, baseline.subMetrics[0].value],
    ["casualties", casualtiesVal, baseline.subMetrics[1].value],
    ["deployedCap", deployedCapVal, baseline.subMetrics[2].value],
    ["hospitalSat", hospitalSatVal, baseline.subMetrics[3].value],
    ["weatherImpact", weatherImpactVal, baseline.subMetrics[4].value],
    ["seismicImpact", seismicImpactVal, baseline.subMetrics[5].value],
    ["duration", durationVal, baseline.subMetrics[6].value],
  ];
  const metricKeyToLabel: Record<WhatIfSubMetric["key"], keyof WhatIfLabels> = {
    severity: "metric_severity",
    casualties: "metric_casualties",
    deployedCap: "metric_deployed_cap",
    hospitalSat: "metric_hospital_sat",
    weatherImpact: "metric_weather_impact",
    seismicImpact: "metric_seismic_impact",
    duration: "metric_duration",
  };
  const simSubMetrics: WhatIfSubMetric[] = _rawEntries.map(([key, simValue, baseValue]) => {
    const floor = METRIC_FLOOR[key] ?? -Infinity;
    const ceil = METRIC_CEIL[key] ?? 100;
    const sim = clampRange(simValue, Math.max(0, floor), 100);
    let rawDelta = sim - baseValue;
    if (baseValue <= floor + 0.01 && rawDelta < 0) rawDelta = 0;
    if (baseValue >= ceil - 0.01 && rawDelta > 0) rawDelta = 0;
    return {
      key,
      label: L[metricKeyToLabel[key]],
      value: sim,
      delta: Math.round(rawDelta),
    };
  });

  const deltaScore = Math.round(simScore - baseline.score);

  const horizons = buildHorizons(simScore, baseline.score, L);
  const regions = buildRegions(ctx, simScore, baseline.score, L);

  const impactClass = classify(deltaScore);
  const interpret = buildInterpret(impactClass, deltaScore, ctx.incidentType, deltas, L);
  const topActions = buildTopActions(ctx, deltas, deltaScore, simScore, L);

  return {
    baseline,
    simulated: {
      score: simScore,
      subMetrics: simSubMetrics,
      h6: horizons.h6,
      h12: horizons.h12,
      h24: horizons.h24,
      regions,
    },
    deltaScore,
    impactClass,
    interpret,
    topActions,
  };
}

// ============================================================================
// Helpers
// ============================================================================
export function sanitizeDeltas(d: WhatIfDeltas): WhatIfDeltas {
  return {
    aggravationPct: clampRange(d.aggravationPct, -50, 50),
    addUnits: clampRange(d.addUnits, 0, 10),
    addHospitalBeds: clampRange(d.addHospitalBeds, 0, 200),
    windMult: clampRange(d.windMult, 0.5, 2),
    rainAddMm: clampRange(d.rainAddMm, 0, 200),
    seismicAddMag: clampRange(d.seismicAddMag, 0, 1),
    addCasualties: clampRange(d.addCasualties, 0, 200),
    addAffected: clampRange(d.addAffected, 0, 1000),
  };
}

function casualtiesScore(total: number): number {
  // Alias whatif (historique 0→0 / 200→100) + réutilise helper sumCasualties-equivalents / 2 (équivalents 200 → 100 score)
  const v = safeNum(total, 0);
  if (v <= 0) return 0;
  if (v >= 200) return 100;
  return clamp100((v / 200) * 100);
}

// Planchers connus des sous-métriques : en dessous, "améliorer" est impossible (logique)
// → pas de crédit amélioration fantôme. Plafond 100 : empirer impossible (déjà max).
const METRIC_FLOOR: Partial<Record<WhatIfSubMetric["key"], number>> = {
  casualties: 0,      // casualtiesScore(0) = 0 (plus de plancher 5 absurde)
  weatherImpact: 0,   // météo calme possible
  seismicImpact: 0,   // pas de séisme = 0
  hospitalSat: 2,     // 2% plancher bas pour hôpital vide
  deployedCap: 0,     // surplus unités → score 0 atteignable
  severity: 22,       // low severity (SEV_WEIGHT low = 0.22 → ×100)
  duration: 0,        // 0 min → score 0
};
const METRIC_CEIL: Record<WhatIfSubMetric["key"], number> = {
  severity: 100,
  casualties: 100,
  deployedCap: 100,
  hospitalSat: 100,
  weatherImpact: 100,
  seismicImpact: 100,
  duration: 100,
};

function deployedCapScore(deployedUnits: number, sev: WhatIfContext["severity"]): number {
  // Plus on déploie pour un incident GRAVE → MOINS on est saturé (moins de risque)
  // On inverse : capacité disponible = (besoin - deployé) / besoin → risque
  const need = sev === "high" ? 8 : sev === "medium" ? 4 : 2;
  const v = safeNum(deployedUnits, 0);
  const missing = Math.max(0, need - v);
  const satPct = (missing / need) * 100; // 100 = pire
  // Plus on a des surplus → risque bas
  const surplus = Math.max(0, v - need);
  const surplusBonus = Math.min(25, surplus * 5);
  return clamp100(satPct - surplusBonus);
}

function weatherScore(type: string, windKmh: number, rain24Mm: number): number {
  const t = (type || "").toLowerCase();
  const w = Math.max(0, safeNum(windKmh, 0));
  const r = Math.max(0, safeNum(rain24Mm, 0));
  let windPct = clamp100((w / 80) * 100);
  let rainPct = clamp100((r / 120) * 100);

  if (t.includes("fire") || t.includes("wild") || t.includes("incendie") || t.includes("feu")) {
    return clamp100(windPct * 0.7 + Math.max(0, 80 - rainPct) * 0.3);
  }
  if (t.includes("flood") || t.includes("inond") || t.includes("tsunami") || t.includes("crue")) {
    return clamp100(rainPct * 0.8 + windPct * 0.2);
  }
  if (t.includes("storm") || t.includes("orage") || t.includes("tempe")) {
    return clamp100(windPct * 0.55 + rainPct * 0.45);
  }
  if (t.includes("road") || t.includes("routier") || t.includes("accident")) {
    return clamp100(rainPct * 0.5 + windPct * 0.3);
  }
  if (t.includes("earthquake") || t.includes("sismo") || t.includes("seisme") || t.includes("tremblement")) {
    return clamp100(rainPct * 0.15 + windPct * 0.05);
  }
  if (t.includes("landslide") || t.includes("glissement")) {
    return clamp100(rainPct * 0.7 + windPct * 0.1);
  }
  if (t.includes("industrial") || t.includes("industriel") || t.includes("explosion") || t.includes("explosion")) {
    return clamp100(windPct * 0.5);
  }
  if (t.includes("epidemic") || t.includes("epidem") || t.includes("sanitaire") || t.includes("cluster")) {
    return 0;
  }
  return clamp100(windPct * 0.4 + rainPct * 0.3);
}

function seismicScore(effectiveMag: number, type: string): number {
  const m = Math.max(0, safeNum(effectiveMag, 0));
  const base = clamp100((m / 6) * 100);
  const t = (type || "").toLowerCase();
  if (t.includes("earthquake") || t.includes("sismo") || t.includes("seisme")) {
    return base;
  }
  if (t.includes("landslide") || t.includes("tsunami")) {
    return clamp100(base * 0.75);
  }
  return clamp100(base * 0.3);
}

function durationScore(min: number): number {
  const m = Math.max(0, safeNum(min, 0));
  if (m <= 30) return 15;
  if (m <= 120) return 30;
  if (m <= 360) return 50;
  if (m <= 720) return 68;
  return 82;
}

function buildHorizons(score: number, baseline: number, L: WhatIfLabels): { h6: WhatIfHorizon; h12: WhatIfHorizon; h24: WhatIfHorizon } {
  const mk = (hrs: number): WhatIfHorizon => {
    const drift = hrs === 6 ? 0.92 : hrs === 12 ? 0.84 : 0.76;
    const prob = clamp100(probabilityFromScore(score * drift));
    const sc = clamp100(score * drift);
    const baseSc = clamp100(baseline * drift);
    const deltaScore = baseline ? Math.round(sc - baseSc) : 0;
    const p = Math.round(prob);
    let probabilityLabel: string;
    if (deltaScore > 0) probabilityLabel = tpl(L.hp_aggravation, { p });
    else if (deltaScore < 0) probabilityLabel = tpl(L.hp_residual, { p });
    else probabilityLabel = tpl(L.hp_future, { p });
    return {
      score: Math.round(sc),
      probability: Math.round(prob),
      probabilityLabel,
      deltaScore,
    };
  };
  return { h6: mk(6), h12: mk(12), h24: mk(24) };
}

function probabilityFromScore(score: number): number {
  const x = clamp100(score);
  const p = 1 / (1 + Math.exp(-0.055 * (x - 45)));
  return Math.round(p * 100);
}

function buildRegions(ctx: WhatIfContext, score: number, baseline: number, L: WhatIfLabels): WhatIfRegionImpact[] {
  const defaults = [L.region_immediate, L.default_r2, L.default_r3, L.default_r4];
  const list = (ctx.nearbyRegions && ctx.nearbyRegions.length > 0 ? ctx.nearbyRegions : defaults).slice(0, 4);
  return list.map((region, i) => {
    const decay = [0.92, 0.8, 0.66, 0.54][i] ?? 0.5;
    const sc = clamp100(score * decay);
    const blScore = baseline ? baseline * decay : 0;
    return {
      region,
      score: Math.round(sc),
      delta: baseline ? Math.round(sc - blScore) : 0,
    };
  });
}

function classify(deltaScore: number): WhatIfImpact["impactClass"] {
  // Δ = sim - baseline :
  // ≥  +15 ++  => empiré fort
  // ≥ 6..14 empiré
  // -5..+5 neutre
  // -14..-6 amélioration
  // ≤ -15 amélioration forte
  // (même logique que classifyDelta shared.ts, seuils 0.5/6/15 pour UI)
  const shared = classifyDelta(deltaScore);
  if (Math.abs(deltaScore) >= 15) return shared === "empire" ? "forte_degradation" : "fort_amelioration";
  if (Math.abs(deltaScore) >= 6) return shared === "empire" ? "degradation" : "amelioration";
  return "neutre";
}

function buildInterpret(
  cls: WhatIfImpact["impactClass"],
  _delta: number,
  type: string,
  d: WhatIfDeltas,
  L: WhatIfLabels,
): string {
  const t = (type || "").toLowerCase();
  const mentions: string[] = [];
  if (d.addUnits > 0) mentions.push(tpl(L.men_add_units_tpl, { n: d.addUnits }));
  if (d.addHospitalBeds > 0) mentions.push(tpl(L.men_add_beds_tpl, { n: d.addHospitalBeds }));
  if (d.windMult > 1) mentions.push(tpl(L.men_wind_up_tpl, { x: d.windMult.toFixed(2) }));
  if (d.windMult < 1) mentions.push(tpl(L.men_wind_down_tpl, { x: d.windMult.toFixed(2) }));
  if (d.rainAddMm > 0) mentions.push(tpl(L.men_rain_tpl, { n: d.rainAddMm }));
  if (d.seismicAddMag > 0) mentions.push(tpl(L.men_quake_tpl, { x: d.seismicAddMag.toFixed(1) }));
  if (d.addCasualties > 0) mentions.push(tpl(L.men_casualties_tpl, { n: d.addCasualties }));
  if (d.addAffected > 0) mentions.push(tpl(L.men_affected_tpl, { n: d.addAffected }));
  if (d.aggravationPct > 0) mentions.push(L.men_sev_down);
  if (d.aggravationPct < 0) mentions.push(L.men_sev_up);

  const intro =
    cls === "fort_amelioration"
      ? L.intr_fort_amelioration
      : cls === "amelioration"
      ? L.intr_amelioration
      : cls === "neutre"
      ? L.intr_neutre
      : cls === "degradation"
      ? L.intr_degradation
      : L.intr_forte_degradation;

  const suffix = mentions.length ? tpl(L.params_modified_tpl, { list: mentions.join(", ") }) : "";
  const typed = addTypedHint(t, d, L);
  return `${intro}${typed}${suffix}`;
}

function addTypedHint(t: string, d: WhatIfDeltas, L: WhatIfLabels): string {
  if ((t.includes("fire") || t.includes("feu") || t.includes("incendie")) && d.windMult > 1.15) {
    return L.hint_fire_wind;
  }
  if ((t.includes("flood") || t.includes("inond") || t.includes("crue")) && d.rainAddMm > 40) {
    return L.hint_flood_rain;
  }
  if ((t.includes("earthquake") || t.includes("seisme") || t.includes("sismo")) && d.seismicAddMag > 0.3) {
    return L.hint_quake_mag;
  }
  if ((t.includes("road") || t.includes("routier") || t.includes("accident")) && (d.rainAddMm > 30 || d.windMult > 1.15)) {
    return L.hint_road_cond;
  }
  if (d.addUnits >= 3) return L.hint_massive_units;
  if (d.addHospitalBeds >= 60) return L.hint_hosp_beds;
  return "";
}

function buildTopActions(
  ctx: WhatIfContext,
  d: WhatIfDeltas,
  _delta: number,
  simScore: number,
  L: WhatIfLabels,
): WhatIfImpact["topActions"] {
  const pool: { label: string; priority: 1 | 2 | 3; impact: number }[] = [];
  const t = (ctx.incidentType || "").toLowerCase();

  if (d.addUnits < 3 && simScore > 45) {
    pool.push({ label: tpl(L.act_add_units_tpl, { n: 2 }), priority: 1, impact: 10 });
  }
  if (d.addHospitalBeds < 40 && simScore > 45) {
    pool.push({ label: tpl(L.act_add_beds_tpl, { n: 40 }), priority: 2, impact: 7 });
  }
  if (d.windMult > 1.15 && (t.includes("fire") || t.includes("feu"))) {
    pool.push({ label: L.act_fire_aerial, priority: 1, impact: 12 });
  }
  if (d.rainAddMm > 40 && (t.includes("flood") || t.includes("inond") || t.includes("crue"))) {
    pool.push({ label: L.act_flood_evac, priority: 1, impact: 13 });
  }
  if (d.seismicAddMag > 0.3 && (t.includes("earthquake") || t.includes("seisme"))) {
    pool.push({ label: L.act_quake_orsec, priority: 1, impact: 14 });
  }
  if (t.includes("road") || t.includes("routier") || t.includes("accident")) {
    pool.push({ label: L.act_road_barriers, priority: 2, impact: 8 });
  }
  if (t.includes("epidemic") || t.includes("sanitaire") || t.includes("cluster")) {
    pool.push({ label: L.act_epidemic_plan, priority: 1, impact: 11 });
  }
  if (t.includes("industrial") || t.includes("industriel") || t.includes("explosion")) {
    pool.push({ label: L.act_industrial_perim, priority: 1, impact: 10 });
  }
  if (t.includes("landslide") || t.includes("glissement")) {
    pool.push({ label: L.act_landslide_evac, priority: 2, impact: 9 });
  }
  if (t.includes("storm") || t.includes("orage") || t.includes("tempete")) {
    pool.push({ label: L.act_storm_power, priority: 2, impact: 8 });
  }

  const generic: { label: string; priority: 2 | 3; impact: number }[] = [
    { label: L.gact_sitrep, priority: 3, impact: 5 },
    { label: L.gact_sa, priority: 3, impact: 3 },
    { label: L.gact_crisis_cell, priority: 3, impact: 3 },
    { label: L.gact_logistics, priority: 3, impact: 4 },
    { label: L.gact_pop_comm, priority: 2, impact: 5 },
  ];

  for (const g of generic) if (pool.length < 3) pool.push(g);

  pool.sort((a, b) => a.priority - b.priority || b.impact - a.impact);

  return pool.slice(0, 3).map((p) => ({
    label: p.label,
    priority: p.priority,
    estimatedImpact: p.impact,
  }));
}
