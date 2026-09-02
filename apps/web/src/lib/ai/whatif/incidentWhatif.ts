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

// clampRange reste local (spécifique What If sanitize)
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

// Labels des SOUS-MÉTRIQUES — TOUTES sont des SCORES DE RISQUE (0=bon, 100=empiré)
const METRIC_LABELS: Record<WhatIfSubMetric["key"], string> = {
  severity: "Sévérité initiale",
  casualties: "Bilan humain",
  deployedCap: "Sous-effectif unités", // IMPORTANT : 0 = bon (assez d'unités) / 100 = saturé
  hospitalSat: "Saturation hôpitaux proches",
  weatherImpact: "Impact météo",
  seismicImpact: "Impact sismique EMSC",
  duration: "Durée incident",
};

// ============================================================================
// Calcule la baseline (référence : pas de delta)
// ============================================================================
export function buildBaseline(ctx: WhatIfContext): WhatIfBaseline {
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
    { key: "severity", label: METRIC_LABELS.severity, value: sev, delta: 0 },
    { key: "casualties", label: METRIC_LABELS.casualties, value: casualties, delta: 0 },
    {
      key: "deployedCap",
      label: METRIC_LABELS.deployedCap,
      value: deployedCap,
      delta: 0,
    },
    {
      key: "hospitalSat",
      label: METRIC_LABELS.hospitalSat,
      value: hospitalSat,
      delta: 0,
    },
    {
      key: "weatherImpact",
      label: METRIC_LABELS.weatherImpact,
      value: weatherImpact,
      delta: 0,
    },
    {
      key: "seismicImpact",
      label: METRIC_LABELS.seismicImpact,
      value: seismicImpact,
      delta: 0,
    },
    {
      key: "duration",
      label: METRIC_LABELS.duration,
      value: durationPct,
      delta: 0,
    },
  ];

  const horizons = buildHorizons(score, 0);
  const regions = buildRegions(ctx, score, 0);

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
export function simulateWhatIf(ctx: WhatIfContext, rawDeltas: WhatIfDeltas): WhatIfImpact {
  const baseline = buildBaseline(ctx);

  const deltas = sanitizeDeltas(rawDeltas);

  // === Sous-métriques ajustées ===
  // =========================================================================
  // CONVENTION WhatIfDeltas.aggravationPct :
  //   NÉGATIF (-50..-1) = empirer la sévérité  → augmente le score risque
  //   POSITIF (+1..+50) = améliorer / atténuer  → diminue le score risque
  // ZÉRO = pas d'action
  //
  // ATTENUATION (minimaliste) : les sliders sont volontairement amortis par des ratios
  // pour que les deltas finaux restent dans des variations raisonnables
  // (cas extrêmes : ±12..15 pts sur score global max).
  // =========================================================================
  const sevRaw = clamp01(SEV_WEIGHT[ctx.severity] ?? 0.58) * 100;
  // Sévérité est la métrique la plus lourde → atténuation 0.48
  const sevDelta = clampRange(deltas.aggravationPct, -50, 50) * 0.48;
  const severityVal = clamp100(sevRaw - sevDelta);

  // Victimes : amortisseur 0.35 sur effet direct atténuation
  // RÈGLE : on ne peut pas AMÉLIORER un bilan humain qui est déjà au plancher (casualties=0)
  //         → pas de crédit fantôme quand casualties déjà zéro.
  const casualtiesRawVal = casualtiesScore(ctx.casualties + deltas.addCasualties * 0.55);
  const casualtiesBaselineFloor = METRIC_FLOOR.casualties ?? 0;
  const canImproveCasualties = casualtiesRawVal > casualtiesBaselineFloor;
  const casualtiesAttenuation = canImproveCasualties
    ? (Math.max(0, deltas.aggravationPct) / 420) * 100
    : 0;
  const casualtiesVal = clamp100(casualtiesRawVal - casualtiesAttenuation);

  // Capacité unités : +1 unité → impact direct sur saturation, atténué 0.38
  const deployedCapSat = deployedCapScore(ctx.deployedUnits + deltas.addUnits, ctx.severity);
  const deployedCapVal = clamp100(
    deployedCapSat -
      // aggravationPositif (améliore) → réduit le score de saturation
      Math.max(0, deltas.aggravationPct) * 0.16,
  );

  // Saturation hôpitaux : amortissement addCasualties × 0.10 (au lieu de 0.18),
  // + lits → 32 pts / 200 lits (sous-estimation intentionnelle pour l'équilibre)
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

  // Météo : impact atténué : windMult (0.85 au lieu de 1, rainAddMm 0.72
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

  // Score global (pondéré)
  const simScore = clamp100(
    severityVal * WEIGHTS.severity +
      casualtiesVal * WEIGHTS.casualties +
      deployedCapVal * WEIGHTS.deployedCap +
      hospitalSatVal * WEIGHTS.hospitalSat +
      weatherImpactVal * WEIGHTS.weatherImpact +
      seismicImpactVal * WEIGHTS.seismicImpact +
      durationScore(ctx.durationMin) * WEIGHTS.duration,
  );

  // Sous-métriques finales avec deltas (vs baseline)
  // GARDE ANTI-HALLUCINATION : pas d'amélioration Δ<0 si baseline plancher,
  //                            pas d'empirement Δ>0 si baseline plafond (100).
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
  const simSubMetrics: WhatIfSubMetric[] = _rawEntries.map(([key, simValue, baseValue]) => {
    const floor = METRIC_FLOOR[key] ?? -Infinity;
    const ceil = METRIC_CEIL[key] ?? 100;
    const sim = clampRange(simValue, Math.max(0, floor), 100);
    let rawDelta = sim - baseValue;
    if (baseValue <= floor + 0.01 && rawDelta < 0) rawDelta = 0;
    if (baseValue >= ceil - 0.01 && rawDelta > 0) rawDelta = 0;
    return {
      key,
      label: METRIC_LABELS[key],
      value: sim,
      delta: Math.round(rawDelta),
    };
  });

  // =========================================================================
  // SCORE RISQUE : PLUS HAUT = PLUS DE RISQUE (toujours).
  // Δ = simScore - baselineScore :
  //   Δ > 0 : empiré (score monte)  → ROUGE
  //   Δ < 0 : amélioration (score diminue) → VERT
  // =========================================================================
  const deltaScore = Math.round(simScore - baseline.score);

  const horizons = buildHorizons(simScore, baseline.score);
  const regions = buildRegions(ctx, simScore, baseline.score);

  const impactClass = classify(deltaScore);
  const interpret = buildInterpret(impactClass, deltaScore, ctx.incidentType, deltas);
  const topActions = buildTopActions(ctx, deltas, deltaScore, simScore);

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

function buildHorizons(score: number, baseline: number): { h6: WhatIfHorizon; h12: WhatIfHorizon; h24: WhatIfHorizon } {
  const mk = (hrs: number): WhatIfHorizon => {
    const drift = hrs === 6 ? 0.92 : hrs === 12 ? 0.84 : 0.76;
    const prob = clamp100(probabilityFromScore(score * drift));
    const sc = clamp100(score * drift);
    const baseSc = clamp100(baseline * drift);
    const deltaScore = baseline ? Math.round(sc - baseSc) : 0;
    // Label dynamique : si Δ>0 empiré → aggravation ; Δ<0 amélioré → risque résiduel ; 0 → futur
    let probabilityLabel: string;
    if (deltaScore > 0) probabilityLabel = `Prob. aggravation ${Math.round(prob)}%`;
    else if (deltaScore < 0) probabilityLabel = `Risque résiduel ${Math.round(prob)}%`;
    else probabilityLabel = `Risque futur ${Math.round(prob)}%`;
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
  // sigmoïde centrée en 45
  const p = 1 / (1 + Math.exp(-0.055 * (x - 45)));
  return Math.round(p * 100);
}

const DEFAULT_REGIONS = [
  "Région immédiate",
  "Zone périphérique",
  "Bassin d'influence",
  "Zones limitrophes",
];

function buildRegions(ctx: WhatIfContext, score: number, baseline: number): WhatIfRegionImpact[] {
  const list = (ctx.nearbyRegions && ctx.nearbyRegions.length > 0 ? ctx.nearbyRegions : DEFAULT_REGIONS).slice(0, 4);
  return list.map((region, i) => {
    const decay = [0.92, 0.8, 0.66, 0.54][i] ?? 0.5;
    const sc = clamp100(score * decay);
    const blScore = baseline ? baseline * decay : 0;
    return {
      region,
      score: Math.round(sc),
      // Δ = sim - base : > 0 empiré
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
): string {
  const t = (type || "").toLowerCase();
  const mentions: string[] = [];
  if (d.addUnits > 0) mentions.push(`ajout de ${d.addUnits} unité(s)`);
  if (d.addHospitalBeds > 0) mentions.push(`+${d.addHospitalBeds} lits hospitaliers`);
  if (d.windMult > 1) mentions.push(`vent ×${d.windMult.toFixed(2)}`);
  if (d.windMult < 1) mentions.push(`vent réduit ×${d.windMult.toFixed(2)}`);
  if (d.rainAddMm > 0) mentions.push(`+${d.rainAddMm}mm de pluie`);
  if (d.seismicAddMag > 0) mentions.push(`séisme +${d.seismicAddMag.toFixed(1)}Mw`);
  if (d.addCasualties > 0) mentions.push(`+${d.addCasualties} victimes`);
  if (d.addAffected > 0) mentions.push(`+${d.addAffected} personnes affectées`);
  if (d.aggravationPct > 0) mentions.push(`réduction de sévérité`);
  if (d.aggravationPct < 0) mentions.push(`augmentation de sévérité`);

  const intro =
    cls === "fort_amelioration"
      ? "Très nette amélioration du scénario — stratégie recommandée."
      : cls === "amelioration"
      ? "Nette amélioration globale de la situation."
      : cls === "neutre"
      ? "Impact global neutre : la simulation ne change pas significativement le niveau de risque."
      : cls === "degradation"
      ? "Légère dégradation : vigilance accrue recommandée."
      : "Forte dégradation du scénario — risque critique probable à H12.";

  const suffix = mentions.length ? ` Paramètres modifiés : ${mentions.join(", ")}.` : "";
  const typed = addTypedHint(t, d);
  return `${intro}${typed}${suffix}`;
}

function addTypedHint(t: string, d: WhatIfDeltas): string {
  if ((t.includes("fire") || t.includes("feu") || t.includes("incendie")) && d.windMult > 1.15) {
    return " Le vent aggrave la propagation du feu : renforcer les moyens aériens prioritaires.";
  }
  if ((t.includes("flood") || t.includes("inond") || t.includes("crue")) && d.rainAddMm > 40) {
    return " Les cumuls de pluie augmentent le risque de crue rapide : évacuation préventive conseillée.";
  }
  if ((t.includes("earthquake") || t.includes("seisme") || t.includes("sismo")) && d.seismicAddMag > 0.3) {
    return " Une magnitude supérieure augmente drastiquement le risque d'effondrement et de victimes.";
  }
  if ((t.includes("road") || t.includes("routier") || t.includes("accident")) && (d.rainAddMm > 30 || d.windMult > 1.15)) {
    return " Conditions de circulation dégradées : renforcer les barrières et déviations.";
  }
  if (d.addUnits >= 3) return " Le déploiement massif d'unités renforce la réponse opérationnelle.";
  if (d.addHospitalBeds >= 60) return " La capacité hospitalière étendue diminue fortement le risque de saturation.";
  return "";
}

function buildTopActions(
  ctx: WhatIfContext,
  d: WhatIfDeltas,
  _delta: number,
  simScore: number,
): WhatIfImpact["topActions"] {
  const pool: { label: string; priority: 1 | 2 | 3; impact: number }[] = [];
  const t = (ctx.incidentType || "").toLowerCase();

  if (d.addUnits < 3 && simScore > 45) {
    pool.push({ label: "Déployer 2 unités mobiles supplémentaires sur zone", priority: 1, impact: 10 });
  }
  if (d.addHospitalBeds < 40 && simScore > 45) {
    pool.push({ label: "Ouvrir 40 lits additionnels dans les hôpitaux proches", priority: 2, impact: 7 });
  }
  if (d.windMult > 1.15 && (t.includes("fire") || t.includes("feu"))) {
    pool.push({ label: "Renforcer les moyens aériens (Canadairs / hélicos bombardiers)", priority: 1, impact: 12 });
  }
  if (d.rainAddMm > 40 && (t.includes("flood") || t.includes("inond") || t.includes("crue"))) {
    pool.push({ label: "Lancer l'évacuation préventive des bassins versants exposés", priority: 1, impact: 13 });
  }
  if (d.seismicAddMag > 0.3 && (t.includes("earthquake") || t.includes("seisme"))) {
    pool.push({ label: "Déclencher le plan ORSEC Séisme · Évacuation bâtiments sensibles", priority: 1, impact: 14 });
  }
  if (t.includes("road") || t.includes("routier") || t.includes("accident")) {
    pool.push({ label: "Mettre en place barrières et déviations · Neutraliser zone accident", priority: 2, impact: 8 });
  }
  if (t.includes("epidemic") || t.includes("sanitaire") || t.includes("cluster")) {
    pool.push({ label: "Activer le plan sanitaire · Créer un foyer de tri et confinement", priority: 1, impact: 11 });
  }
  if (t.includes("industrial") || t.includes("industriel") || t.includes("explosion")) {
    pool.push({ label: "Mettre en place périmètre de sécurité · Évacuer zone 500m", priority: 1, impact: 10 });
  }
  if (t.includes("landslide") || t.includes("glissement")) {
    pool.push({ label: "Évacuer zones en aval · Fermer routes exposées aux éboulements", priority: 2, impact: 9 });
  }
  if (t.includes("storm") || t.includes("orage") || t.includes("tempete")) {
    pool.push({ label: "Couper réseau électrique zones sensibles · Prépositionner équipes réparation", priority: 2, impact: 8 });
  }

  // Toujours 3 actions : compléter par des actions génériques
  const generic: { label: string; priority: 2 | 3; impact: number }[] = [
    { label: "Préparer un point situation toutes les 30 minutes", priority: 3, impact: 5 },
    { label: "Renforcer la conscience situationnelle des unités sur le terrain", priority: 3, impact: 3 },
    { label: "Mettre en alerte les cellules de crise interministérielles", priority: 3, impact: 3 },
    { label: "Prévoir des points de ravitaillement logistique", priority: 3, impact: 4 },
    { label: "Communiquer consignes de sécurité à la population via canaux officiels", priority: 2, impact: 5 },
  ];

  for (const g of generic) if (pool.length < 3) pool.push(g);

  // Tri par priorité puis impact décroissant
  pool.sort((a, b) => a.priority - b.priority || b.impact - a.impact);

  return pool.slice(0, 3).map((p) => ({
    label: p.label,
    priority: p.priority,
    estimatedImpact: p.impact,
  }));
}
