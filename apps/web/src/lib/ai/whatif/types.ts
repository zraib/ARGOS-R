export type DeltaKind =
  | "aggravationPct"
  | "addUnits"
  | "addHospitalBeds"
  | "windMult"
  | "rainAddMm"
  | "seismicAddMag"
  | "addCasualties"
  | "addAffected";

export interface WhatIfDeltas {
  /** -50..+50 — aggrave (négatif = empiré / positif = amélioration rapide) */
  aggravationPct: number;
  /** 0..10 — unités supplémentaires déployées */
  addUnits: number;
  /** 0..200 — lits d'hôpital supplémentaires */
  addHospitalBeds: number;
  /** 0.5..2.0 — multiplicateur de vent */
  windMult: number;
  /** 0..200 — millimètres de pluie en plus sur 24h */
  rainAddMm: number;
  /** 0..1.0 — magnitude sismique en plus */
  seismicAddMag: number;
  /** 0..200 — victimes supplémentaires (blessés + disparus) */
  addCasualties: number;
  /** 0..1000 — personnes affectées / évacuées en plus */
  addAffected: number;
}

export const DEFAULT_DELTAS: WhatIfDeltas = {
  aggravationPct: 0,
  addUnits: 0,
  addHospitalBeds: 0,
  windMult: 1,
  rainAddMm: 0,
  seismicAddMag: 0,
  addCasualties: 0,
  addAffected: 0,
};

export interface WhatIfSubMetric {
  key:
    | "severity"
    | "casualties"
    | "deployedCap"
    | "hospitalSat"
    | "weatherImpact"
    | "seismicImpact"
    | "duration";
  label: string;
  value: number; // 0..100
  delta: number; // ± points vs baseline
}

export interface WhatIfHorizon {
  score: number; // 0..100 (comme incidentEvolution score risque)
  probability: number; // 0..100 % valeur numérique brute (sigmoïde centrée 45)
  probabilityLabel: string; // label affiché : "Prob. aggravation" si Δ>0, "Risque résiduel" si Δ<0, "Risque futur" si 0
  deltaScore: number; // ± baseline
}

export interface WhatIfRegionImpact {
  region: string;
  score: number; // 0..100 (métrique risque pour cette région)
  delta: number;
}

export interface WhatIfAction {
  label: string;
  priority: 1 | 2 | 3;
  /** Estimation d'impact ± points (indicatif) */
  estimatedImpact: number;
}

export interface WhatIfBaseline {
  score: number; // score risque global 0..100
  subMetrics: WhatIfSubMetric[];
  h6: WhatIfHorizon;
  h12: WhatIfHorizon;
  h24: WhatIfHorizon;
  regions: WhatIfRegionImpact[];
}

export interface WhatIfImpact {
  baseline: WhatIfBaseline;
  simulated: {
    score: number;
    subMetrics: WhatIfSubMetric[];
    h6: WhatIfHorizon;
    h12: WhatIfHorizon;
    h24: WhatIfHorizon;
    regions: WhatIfRegionImpact[];
  };
  deltaScore: number; // simulated.score - baseline.score
  /** Classement interprété pour l'UI */
  impactClass: "fort_amelioration" | "amelioration" | "neutre" | "degradation" | "forte_degradation";
  interpret: string;
  topActions: WhatIfAction[];
}

export interface WhatIfPreset {
  id: string;
  name: string;
  description: string;
  deltas: Partial<WhatIfDeltas>;
}

export interface WhatIfContext {
  incidentType: string;
  region: string;
  /** Severité baseline: high/medium/low */
  severity: "high" | "medium" | "low";
  /** durée depuis déclaration en minutes */
  durationMin: number;
  /** unités déjà déployées baseline */
  deployedUnits: number;
  /** hôpitaux à proximité baseline (nombre) */
  nearbyHospitals: number;
  /** 0..100 — saturation hopitaux baseline */
  hospitalSatPct: number;
  /** victimes baseline (total dead + injured + missing) */
  casualties: number;
  /** personnes affectees baseline */
  affected: number;
  /** météo baseline : vent km/h (moyen) */
  windKmh: number;
  /** météo baseline : pluie 24h mm */
  rain24Mm: number;
  /** séismes proche (0..1 magnitude effective) */
  seismicEffectiveMag: number;
  /** Liste régions limitrophes optionnelle (défaut : 4 classes aléatoires) */
  nearbyRegions?: string[];
}
