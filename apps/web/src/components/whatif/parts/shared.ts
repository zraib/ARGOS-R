// Aides partagées par les composants de WhatIfPageShell.tsx (extraites, exportées).
import type { ModulesDict } from "@/lib/i18n/modules";
import { FLUX_ICONS, NAV_ICONS, UI_ICONS } from "@/lib/icons";
import {
  type WhatIfDeltas,
  } from "@/lib/ai/whatif/types";

export function cn(...parts: unknown[]): string {
  return parts.filter(Boolean).join(" ");
}

export const LABEL_SEV: Record<"high" | "medium" | "low", { fr: string; en: string; ar: string }> = {
  high: { fr: "Critique", en: "Critical", ar: "حرجة" },
  medium: { fr: "Modérée", en: "Moderate", ar: "متوسطة" },
  low: { fr: "Faible", en: "Low", ar: "ضعيفة" },
};

export function sevLabel(sev: "high" | "medium" | "low", lang: "fr" | "en" | "ar"): string {
  const item = LABEL_SEV[sev];
  if (lang === "ar") return item.ar;
  if (lang === "en") return item.en;
  return item.fr;
}

export const haversineKm = (a: [number, number], b: [number, number]): number => {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const hh =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(hh)));
};

export const parseISO = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};

export interface SliderCfg {
  key: keyof WhatIfDeltas;
  icon: string;
  /** Clé du libellé dans `ModulesDict["whatif"]`. */
  labelKey: keyof ModulesDict["whatif"];
  min: number;
  max: number;
  step: number;
  /** Clé de l'unité dans `ModulesDict["whatif"]`. */
  unitKey: keyof ModulesDict["whatif"];
  /** si true, la valeur "max" = empiré, sinon max = améliore */
  higherIsWorse?: boolean;
  fmt?: (v: number) => string;
}

export const SLIDERS: SliderCfg[] = [
  {
    key: "aggravationPct",
    icon: UI_ICONS.alert,
    labelKey: "slider_severity",
    min: -50,
    max: 50,
    step: 5,
    unitKey: "unit_pts",
    higherIsWorse: false,
    fmt: (v) => (v > 0 ? `+${v}` : `${v}`),
  },
  {
    key: "addUnits",
    icon: UI_ICONS.truck,
    labelKey: "slider_units",
    min: 0,
    max: 10,
    step: 1,
    unitKey: "unit_units",
    higherIsWorse: false,
    fmt: (v) => `+${v}`,
  },
  {
    key: "addHospitalBeds",
    icon: UI_ICONS.beds,
    labelKey: "slider_beds",
    min: 0,
    max: 200,
    step: 10,
    unitKey: "unit_beds",
    higherIsWorse: false,
    fmt: (v) => `+${v}`,
  },
  {
    key: "windMult",
    icon: FLUX_ICONS.wind,
    labelKey: "slider_wind",
    min: 0.5,
    max: 2,
    step: 0.05,
    unitKey: "unit_times",
    higherIsWorse: true,
    fmt: (v) => v.toFixed(2),
  },
  {
    key: "rainAddMm",
    icon: FLUX_ICONS.rain,
    labelKey: "slider_rain",
    min: 0,
    max: 200,
    step: 10,
    unitKey: "unit_mm",
    higherIsWorse: true,
    fmt: (v) => `+${v}`,
  },
  {
    key: "seismicAddMag",
    icon: NAV_ICONS.seismic || UI_ICONS.alert,
    labelKey: "slider_mag",
    min: 0,
    max: 1,
    step: 0.1,
    unitKey: "unit_mw",
    higherIsWorse: true,
    fmt: (v) => (v > 0 ? `+${v.toFixed(1)}` : "0"),
  },
  {
    key: "addCasualties",
    icon: UI_ICONS.alert || UI_ICONS.alert,
    labelKey: "slider_casualties",
    min: 0,
    max: 200,
    step: 10,
    unitKey: "unit_people",
    higherIsWorse: true,
    fmt: (v) => `+${v}`,
  },
  {
    key: "addAffected",
    icon: UI_ICONS.users,
    labelKey: "slider_affected",
    min: 0,
    max: 1000,
    step: 50,
    unitKey: "unit_people",
    higherIsWorse: true,
    fmt: (v) => `+${v}`,
  },
];
