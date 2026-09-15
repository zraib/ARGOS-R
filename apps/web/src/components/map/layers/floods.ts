// ============================================================================
// components/map/layers/floods.ts — les crues sur la carte (ADR 0010)
//
// Quatre choses, quatre sources : les jauges de crue (un point coloré par
// gravité, plus gros quand sa fiche est ouverte), les cartes d'inondation de
// la jauge choisie (polygones de Flood Hub), le point de départ du simulateur,
// et l'eau simulée — un CANEVAS posé entre les quatre coins du relief, sous
// les points pour que rien ne la cache, repeint à chaque pas de la lecture
// depuis les instantanés de la course (interpolés entre deux pour que l'eau
// coule sans à-coups). Idempotent : `setupStyle` rejoue tout après un
// changement de fond.
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import type { FloodGauge, FloodInundationMap, FloodPolygon } from "@/lib/types";
import { floodPalette } from "@/lib/flood/frames";
import type { FloodRun } from "@/lib/flood/run";
import {
  SpreadRuntime,
  applySpreadSim,
  fitSpreadExtent,
  focusSpreadStart,
  playSpread,
  type SpreadLayerIds,
  type SpreadPlayback,
} from "@/components/map/layers/spread";

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

// --- l'eau simulée : le socle commun des propagations, avec la palette des lames -----

export const FLOOD_IDS: SpreadLayerIds = { source: "flood-sim", layer: "flood-sim-raster", before: "flood-maps-fill" };

export class FloodRuntime extends SpreadRuntime {}

export function applyFloodSim(rt: FloodRuntime, map: maplibregl.Map | null, run: FloodRun | null, progress: number, playing: boolean): void {
  applySpreadSim(rt, map, run, progress, playing, FLOOD_IDS, floodPalette, true);
}

const LECTURE: SpreadPlayback = {
  get: () => useArgos.getState().floodProgress,
  set: (p) => useArgos.setState({ floodProgress: p }),
  stop: () => useArgos.getState().setFloodPlaying(false),
};

export function playFlood(rt: FloodRuntime, map: maplibregl.Map | null, run: FloodRun | null, playing: boolean): (() => void) | undefined {
  return playSpread(rt, map, run, playing, LECTURE, floodPalette, true);
}

export { focusSpreadStart as focusFloodStart, fitSpreadExtent as fitFloodExtent };
