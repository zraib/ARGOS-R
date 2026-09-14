// ============================================================================
// components/map/layers/floods.ts — les crues sur la carte (ADR 0010)
//
// Quatre choses, quatre sources : les jauges Flood Hub (un point coloré par
// gravité, plus gros quand sa fiche est ouverte), les cartes d'inondation de
// la jauge choisie (polygones de Flood Hub), le point de départ du simulateur,
// et l'emprise simulée — une image posée entre ses quatre coins, sous les
// points pour que rien ne la cache. Idempotent : `setupStyle` rejoue tout
// après un changement de fond.
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import type { FloodGauge, FloodInundationMap, FloodPolygon } from "@/lib/types";
import type { FloodSimResult } from "@/lib/store/slices/flood";

/** Une couleur par gravité — la même dans le panneau ; le libellé la double toujours. */
export const FLOOD_SEVERITY_COLOR: Record<FloodGauge["severity"], string> = {
  extreme: "#dc2626",
  severe: "#f97316",
  above_normal: "#eab308",
  no_flooding: "#2563eb",
  unknown: "#9ca3af",
};

const VIDE: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function setupFloodLayers(map: maplibregl.Map): void {
  if (map.getSource("flood-maps")) return;
  map.addSource("flood-maps", { type: "geojson", data: VIDE });
  map.addLayer({
    id: "flood-maps-fill",
    type: "fill",
    source: "flood-maps",
    paint: { "fill-color": ["match", ["get", "level"], "high", "#1d4ed8", "medium", "#3b82f6", "#93c5fd"], "fill-opacity": 0.35 },
  });
  map.addLayer({ id: "flood-maps-line", type: "line", source: "flood-maps", paint: { "line-color": "#1d4ed8", "line-width": 1, "line-opacity": 0.7 } });

  map.addSource("flood-gauges", { type: "geojson", data: VIDE });
  map.addLayer({
    id: "flood-gauges-halo",
    type: "circle",
    source: "flood-gauges",
    paint: {
      "circle-radius": ["case", ["boolean", ["get", "selected"], false], 16, 11],
      "circle-color": ["get", "color"],
      "circle-opacity": 0.25,
    },
  });
  map.addLayer({
    id: "flood-gauges-circle",
    type: "circle",
    source: "flood-gauges",
    paint: {
      "circle-radius": ["case", ["boolean", ["get", "selected"], false], 8, 6],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });

  map.addSource("flood-seed", { type: "geojson", data: VIDE });
  map.addLayer({
    id: "flood-seed-circle",
    type: "circle",
    source: "flood-seed",
    paint: { "circle-radius": 7, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });

  // Une jauge se clique : le curseur le dit — sauf quand la carte attend un
  // point de départ, où la croix reste.
  map.on("mouseenter", "flood-gauges-circle", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "flood-gauges-circle", () => {
    map.getCanvas().style.cursor = useArgos.getState().floodArming ? "crosshair" : "";
  });
}

export function applyFloodGauges(map: maplibregl.Map | null, gauges: readonly FloodGauge[], on: boolean, selected: string | null): void {
  const src = map?.getSource("flood-gauges") as maplibregl.GeoJSONSource | undefined;
  if (!map || !src) return;
  src.setData({
    type: "FeatureCollection",
    features: on
      ? gauges.map((g) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: g.ll },
          properties: { gaugeId: g.gaugeId, color: FLOOD_SEVERITY_COLOR[g.severity], selected: g.gaugeId === selected },
        }))
      : [],
  });
}

export function applyFloodMaps(
  map: maplibregl.Map | null,
  polygons: readonly { level: FloodInundationMap["level"]; polygon: FloodPolygon }[],
  on: boolean,
): void {
  const src = map?.getSource("flood-maps") as maplibregl.GeoJSONSource | undefined;
  if (!map || !src) return;
  src.setData({
    type: "FeatureCollection",
    features: on ? polygons.map((p) => ({ type: "Feature", geometry: p.polygon.geometry, properties: { level: p.level } })) : [],
  });
}

export function applyFloodSeed(map: maplibregl.Map | null, seed: [number, number] | null): void {
  const src = map?.getSource("flood-seed") as maplibregl.GeoJSONSource | undefined;
  if (!map || !src) return;
  src.setData(seed ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: seed }, properties: {} }] } : VIDE);
}

/** L'emprise simulée : une image entre ses coins, retirée quand il n'y a plus de simulation. */
export function applyFloodSim(map: maplibregl.Map | null, sim: FloodSimResult | null): void {
  if (!map || !map.getSource("flood-maps")) return;
  const existante = map.getSource("flood-sim") as maplibregl.ImageSource | undefined;
  if (!sim || !sim.image) {
    if (map.getLayer("flood-sim-raster")) map.removeLayer("flood-sim-raster");
    if (existante) map.removeSource("flood-sim");
    return;
  }
  if (existante) {
    existante.updateImage({ url: sim.image, coordinates: sim.corners });
    return;
  }
  map.addSource("flood-sim", { type: "image", url: sim.image, coordinates: sim.corners });
  map.addLayer(
    { id: "flood-sim-raster", type: "raster", source: "flood-sim", paint: { "raster-opacity": 0.8, "raster-resampling": "nearest" } },
    "flood-maps-fill",
  );
}
