// ============================================================================
// ARGOS — utilitaires de présentation
// Fonctions pures partagées par les écrans : libellés de taxonomie, mappage des
// badges, couleurs d'occupation, et les transformations SVG Maroc ⇄ lng/lat
// utilisées par la mini-carte et l'assistant de signalement.
// ============================================================================

import type { Dict } from "@/lib/i18n/translations";
import type {
  IncidentStatus,
  IncidentType,
  IncidentTypeDef,
  Lang,
  Severity,
  UnitReadiness,
} from "@/lib/types";
import type { BadgeType } from "@/components/ui/Badge";

/** Icône de repli (triangle d'alerte) pour un type absent du catalogue. */
export const TYPE_FALLBACK_ICON =
  "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z";

/**
 * Libellé d'un type d'incident dans la langue active, résolu depuis le
 * catalogue paramétrable servi par l'API (/incident-types).
 */
export function typeLabel(type: IncidentType, types: IncidentTypeDef[], lang: Lang): string {
  return types.find((x) => x.id === type)?.labels[lang] ?? type;
}

/** Icône (tracé SVG) d'un type d'incident depuis le catalogue. */
export function typeIcon(type: IncidentType, types: IncidentTypeDef[]): string {
  return types.find((x) => x.id === type)?.icon ?? TYPE_FALLBACK_ICON;
}

export function sevBadge(sev: Severity, t: Dict): { type: BadgeType; label: string } {
  return {
    type: sev,
    label: sev === "high" ? t.sev_high : sev === "medium" ? t.sev_med : t.sev_low,
  };
}

export function stBadge(st: IncidentStatus, t: Dict): { type: BadgeType; label: string } {
  if (st === "prog") return { type: "active", label: t.st_prog };
  if (st === "open") return { type: "on_hold", label: t.st_open };
  return { type: "completed", label: t.st_closed };
}

export function dispoBadge(dispo: UnitReadiness, t: Dict): { type: BadgeType; label: string } {
  const map: Record<UnitReadiness, { type: BadgeType; label: string }> = {
    ready: { type: "active", label: t.u_ready },
    deployed: { type: "medium", label: t.u_deployed },
    standby: { type: "on_hold", label: t.u_standby },
  };
  return map[dispo];
}

/** Couleur de la barre d'occupation : vert < 75 %, or 75–89 %, rouge ≥ 90 %. */
export function occBarClass(pct: number): string {
  if (pct >= 90) return "bg-danger-500";
  if (pct >= 75) return "bg-or-500";
  return "bg-green-500";
}

/** Remplissage du marqueur d'incident selon gravité / état clôturé. */
export function incidentFill(sev: Severity, closed: boolean): string {
  if (closed) return "#6B7280";
  return sev === "high" ? "#EF4444" : sev === "medium" ? "#F59E0B" : "#9CA3AF";
}

// --- Silhouette du Maroc (viewport SVG) ⇄ coordonnées géographiques ------

export function svgToLL(x: number, y: number): [number, number] {
  return [-17 + (x / 430) * 16, 36 - ((y - 40) / 650) * 15];
}

/** Transformation inverse : géographique [lng, lat] → coordonnées SVG. */
export function llToSvg(ll: [number, number]): { x: number; y: number } {
  return { x: Math.round(((ll[0] + 17) * 430) / 16), y: Math.round(40 + ((36 - ll[1]) * 650) / 15) };
}

export function svgLatLon(x: number, y: number): string {
  const lat = 36 - ((y - 40) / 650) * 15;
  const lon = -17 + (x / 430) * 16;
  return `${lat.toFixed(3)}° N · ${Math.abs(lon).toFixed(3)}° W`;
}

/** Statut de service déterministe du personnel (comme `persStatut` du prototype). */
export function persStatut(j: number): { label: string; type: BadgeType } {
  const table: [string, BadgeType][] = [
    ["Déployé", "medium"],
    ["Disponible", "active"],
    ["Repos", "on_hold"],
  ];
  return { label: table[j % 3][0], type: table[j % 3][1] };
}
