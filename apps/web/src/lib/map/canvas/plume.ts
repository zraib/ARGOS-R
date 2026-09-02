// ============================================================================
// lib/map/canvas/plume.ts — panache NRBC : interpolation sommet à sommet entre échéances
// Fonctions PURES extraites de MapCanvas.tsx : aucun état React, aucune
// référence à la carte vivante. Testables seules (vitest).
// ============================================================================

import maplibregl from "maplibre-gl";
import type { NrbcPlume, NrbcPlumeZoneProps } from "@/lib/types";

/**
 * Interpole la géométrie du panache entre deux échéances horaires (lot V1).
 *
 * POURQUOI C'EST POSSIBLE SANS RUSE : les anneaux produits par le moteur ont
 * un nombre de sommets CONSTANT par type de zone (64 pour un cercle, 4 pour un
 * triangle, 5 pour un carré) — l'interpolation se fait donc sommet à sommet.
 * Le triangle sous le vent pivote continûment au lieu de sauter d'heure en
 * heure.
 *
 * Les zones sont appariées par `model` + `level` : si une échéance perd une
 * zone (vent tombé sous le seuil ATP-45, par exemple), on garde la géométrie
 * de l'échéance de départ plutôt que d'inventer une transition.
 */
export function interpolatePlume(
  steps: (NrbcPlume | null)[],
  frame: number,
): GeoJSON.FeatureCollection | null {
  const i = Math.floor(frame);
  const a = steps[i];
  if (!a) return null;
  const b = steps[Math.min(i + 1, steps.length - 1)] ?? a;
  const k = frame - i;

  const key = (f: { properties: NrbcPlumeZoneProps }) => `${f.properties.model}|${f.properties.level}`;
  const bByKey = new Map(b.fc.features.map((f) => [key(f), f]));

  return {
    type: "FeatureCollection",
    features: a.fc.features.map((fa) => {
      const fb = bByKey.get(key(fa));
      const ra = fa.geometry.coordinates[0];
      const rb = fb?.geometry.coordinates[0];
      // Sans correspondance, ou nombre de sommets différent : on garde la
      // géométrie de départ. Mieux vaut un pas figé qu'une forme inventée.
      if (!rb || rb.length !== ra.length) return fa;
      return {
        ...fa,
        geometry: {
          type: "Polygon" as const,
          coordinates: [ra.map(([x, y], n) => [x + (rb[n][0] - x) * k, y + (rb[n][1] - y) * k] as [number, number])],
        },
      };
    }),
  };
}

// Couleur des zones du panache NRBC par sévérité (partagée setupStyle / applyPlume).
export const PLUME_LEVEL_COLOR: maplibregl.ExpressionSpecification = [
  "match", ["get", "level"],
  "danger", "#EF4444",
  "protection", "#F97316",
  "#FACC15",
];
