// ============================================================================
// components/map/layers/trackers.ts — traceurs GPS et positions partagées
//
// Une position partagée par l'application, ou un boîtier FMC920 qui émet,
// doit apparaître sur la carte de quiconque la voit (ADR 0015). Un point par
// traceur qui a un fix : bleu pour un boîtier, or pour un compte qui partage
// depuis son téléphone, gris quand le dernier contact date de plus de quinze
// minutes (`STALE_MS`), rouge en cas d'alerte (bouton panique du boîtier).
// ============================================================================

import type maplibregl from "maplibre-gl";
import { isStale, type Tracker } from "@/lib/tracking/tracker";
import { applyPoints, setupPointLayers } from "./points";

export function setupTrackerLayers(map: maplibregl.Map): void {
  setupPointLayers(map, "trackers", "trk", { radius: 6, halo: 14 });
}

/** Couleur d'un traceur selon sa source et sa fraîcheur. */
export function trackerColor(t: Tracker): string {
  if (t.last?.priority === "panic") return "#dc2626";
  if (isStale(t)) return "#6b7280";
  return t.source === "app" ? "#C9A84C" : "#2563eb";
}

/** Le libellé au survol : le nom, puis qui partage ou quel boîtier. */
export function trackerLabel(t: Tracker): string {
  return t.source === "app" ? `${t.label} · ${t.account ?? ""}`.trim() : `${t.label} · ${t.imei}`;
}

export function applyTrackers(map: maplibregl.Map | null, trackers: readonly Tracker[], on: boolean): void {
  applyPoints(
    map,
    "trackers",
    trackers
      .filter((t): t is Tracker & { last: NonNullable<Tracker["last"]> } => !t.archived && t.last !== null)
      .map((t) => ({ id: t.id, label: trackerLabel(t), ll: t.last.ll, color: trackerColor(t) })),
    on,
  );
}
