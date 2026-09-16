import type { WhatIfPreset } from "./types";
import type { WhatIfLabels } from "./incidentWhatif";

export function buildWhatIfPresets(L: WhatIfLabels): WhatIfPreset[] {
  return [
    {
      id: "weather_storm_dbl",
      name: L.p_weather_storm_dbl_n,
      description: L.p_weather_storm_dbl_d,
      deltas: { windMult: 1.8, rainAddMm: 80 },
    },
    {
      id: "earthquake_plus_flood",
      name: L.p_earthquake_plus_flood_n,
      description: L.p_earthquake_plus_flood_d,
      deltas: { seismicAddMag: 0.6, rainAddMm: 120 },
    },
    {
      id: "deploy_massive",
      name: L.p_deploy_massive_n,
      description: L.p_deploy_massive_d,
      deltas: { addUnits: 8, addHospitalBeds: 120, aggravationPct: 20 },
    },
    {
      id: "hospital_surcharge",
      name: L.p_hospital_surcharge_n,
      description: L.p_hospital_surcharge_d,
      deltas: { addCasualties: 120, addAffected: 400 },
    },
    {
      id: "violent_wildfire",
      name: L.p_violent_wildfire_n,
      description: L.p_violent_wildfire_d,
      deltas: { windMult: 2, aggravationPct: -35, addAffected: 80 },
    },
    {
      id: "rapid_containment",
      name: L.p_rapid_containment_n,
      description: L.p_rapid_containment_d,
      deltas: { addUnits: 5, addHospitalBeds: 80, aggravationPct: 30 },
    },
  ];
}
