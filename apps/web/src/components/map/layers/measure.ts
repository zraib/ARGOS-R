// ============================================================================
// components/map/layers/measure.ts — l'outil de mesure : polyligne (itinéraire
// routier quand il existe) et sommets saisis au clic.
// Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";
import type { RouteResult } from "@/lib/map/routing";

/** Pose la couche (appelée par setupStyle ; idempotente). */
export function setupMeasureLayer(map: maplibregl.Map): void {
    // Couche de mesure (polyligne + sommets).
    if (!map.getSource("measure")) {
      map.addSource("measure", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "measure-line",
        type: "line",
        source: "measure",
        filter: ["==", "$type", "LineString"],
        paint: { "line-color": "#38BDF8", "line-width": 4, "line-dasharray": [1.5, 1] },
      });
      map.addLayer({
        id: "measure-pt",
        type: "circle",
        source: "measure",
        filter: ["==", "$type", "Point"],
        paint: { "circle-radius": 6, "circle-color": "#38BDF8", "circle-stroke-color": "#0f1f14", "circle-stroke-width": 2.5 },
      });
    }
}

/** Trace l'itinéraire (ou la ligne droite) et les sommets. */
export function drawMeasure(map: maplibregl.Map, pts: [number, number][], route: RouteResult | null): void {
  const src = map.getSource("measure") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const line = route?.coords ?? pts;
  src.setData({
    type: "FeatureCollection",
    features: [
      ...(line.length > 1
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } }]
        : []),
      ...pts.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: p } })),
    ],
  });
}
