import type { WhatIfPreset } from "./types";

export const WHAT_IF_PRESETS: WhatIfPreset[] = [
  {
    id: "weather_storm_dbl",
    name: "Tempête double",
    description: "Vent ×1.80 + pluie +80mm",
    deltas: { windMult: 1.8, rainAddMm: 80 },
  },
  {
    id: "earthquake_plus_flood",
    name: "Séisme + crue",
    description: "Magnitude +0.6Mw · Pluie +120mm",
    deltas: { seismicAddMag: 0.6, rainAddMm: 120 },
  },
  {
    id: "deploy_massive",
    name: "Déploiement massif",
    description: "+8 unités · +120 lits hôpital",
    deltas: { addUnits: 8, addHospitalBeds: 120, aggravationPct: 20 },
  },
  {
    id: "hospital_surcharge",
    name: "Surcharge hôpitaux simulée",
    description: "+120 victimes · +400 affectés",
    deltas: { addCasualties: 120, addAffected: 400 },
  },
  {
    id: "violent_wildfire",
    name: "Feu de forêt hors contrôle",
    description: "Vent ×2.0 + aggravation -35% · +80 affectés",
    deltas: { windMult: 2, aggravationPct: -35, addAffected: 80 },
  },
  {
    id: "rapid_containment",
    name: "Endiguement rapide",
    description: "+5 unités · +80 lits · aggravation +30%",
    deltas: { addUnits: 5, addHospitalBeds: 80, aggravationPct: 30 },
  },
];
