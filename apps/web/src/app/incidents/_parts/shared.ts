// Aides partagées par les composants de page.tsx (extraites, exportées).
import type { IncidentStatus, Severity } from "@/lib/types";

export const TH = "px-4 py-3 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";

export const TD = "px-4 py-2.5";

export const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export const SEVS: Severity[] = ["high", "medium", "low"];

export const STATUSES: IncidentStatus[] = ["open", "prog", "closed"];

/** Coordonnées lisibles depuis [lng, lat]. */
export const llTxt = (ll: [number, number]) =>
  `${ll[1].toFixed(3)}° ${ll[1] >= 0 ? "N" : "S"} · ${Math.abs(ll[0]).toFixed(3)}° ${ll[0] >= 0 ? "E" : "W"}`;

/** Descripteur d'un filtre de colonne — partagé entre l'en-tête du tableau et le bandeau mobile. */
export interface FilterSpec {
  key: "type" | "sev" | "region" | "st";
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}
