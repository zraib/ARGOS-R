// ============================================================================
// components/map/layers/morgues.ts — les sites mortuaires sur la carte
//
// Un point par site : ardoise pour un site fixe, ambre pour une morgue mobile
// déployée (un site replié ne se montre pas), rouge sombre quand il est
// plein ; son nom au survol, sa fiche au clic. Habillage de la couche de
// points générique (`points.ts`).
// ============================================================================

import type maplibregl from "maplibre-gl";
import type { MorgueSite } from "@/lib/types";
import { applyPoints, hasLL, setupPointLayers } from "./points";

export function setupMorgueLayers(map: maplibregl.Map): void {
  setupPointLayers(map, "morgues", "morgue");
}

/** Les sites à montrer : ceux de la couche, mobiles repliées exclues. */
export function applyMorgues(map: maplibregl.Map | null, morgues: readonly MorgueSite[], on: boolean): void {
  applyPoints(
    map,
    "morgues",
    morgues
      .filter(hasLL)
      .filter((m) => !(m.kind === "mobile" && !m.deployment))
      .map((m) => ({
        id: m.id,
        label: m.nom,
        ll: m.ll,
        // Ambre : mobile ; ardoise foncée : régionale ; ardoise claire : de ville ; rouge sombre : plein.
        color: m.statut === "full" ? "#991b1b" : m.kind === "mobile" ? "#d97706" : m.level === "regional" ? "#334155" : "#64748b",
      })),
    on,
  );
}
