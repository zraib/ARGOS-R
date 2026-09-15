// ============================================================================
// components/map/layers/fire.ts — le feu de forêt simulé sur la carte
//
// Le point d'allumage (un point orange) et le front — un canevas peint depuis
// les instantanés de la course par le socle commun (`layers/spread.ts`), avec
// la palette du feu : flammes vives au front, rouge sombre quand elles durent,
// braises grises derrière. Idempotent : `setupStyle` rejoue tout après un
// changement de fond.
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import { FIRE_BURNT, FIRE_FLAME_MAX, type FireRun } from "@/lib/fire/run";
import type { SpreadPalette } from "@/lib/sim/spread";
import {
  SpreadRuntime,
  applySpreadSim,
  fitSpreadExtent,
  focusSpreadStart,
  playSpread,
  type SpreadLayerIds,
  type SpreadPlayback,
} from "@/components/map/layers/spread";

export const FIRE_IDS: SpreadLayerIds = { source: "fire-sim", layer: "fire-sim-raster", before: "flood-maps-fill" };

/** Couleurs de la légende : le front qui vient de s'allumer, les flammes installées, les braises. */
export const FIRE_NEW_RGB: readonly [number, number, number] = [255, 214, 64];
export const FIRE_OLD_RGB: readonly [number, number, number] = [196, 32, 18];
export const FIRE_EMBER_RGB: readonly [number, number, number] = [72, 52, 44];

/** La couleur d'un état : 1..200 flammes (du jaune vif au rouge sombre selon leur âge), 255 braises. */
export const firePalette: SpreadPalette = (v, out, o) => {
  if (v >= FIRE_BURNT) {
    out[o] = FIRE_EMBER_RGB[0];
    out[o + 1] = FIRE_EMBER_RGB[1];
    out[o + 2] = FIRE_EMBER_RGB[2];
    out[o + 3] = 175;
    return;
  }
  const t = Math.min(1, (v - 1) / (FIRE_FLAME_MAX - 1));
  out[o] = Math.round(FIRE_NEW_RGB[0] + (FIRE_OLD_RGB[0] - FIRE_NEW_RGB[0]) * t);
  out[o + 1] = Math.round(FIRE_NEW_RGB[1] + (FIRE_OLD_RGB[1] - FIRE_NEW_RGB[1]) * t);
  out[o + 2] = Math.round(FIRE_NEW_RGB[2] + (FIRE_OLD_RGB[2] - FIRE_NEW_RGB[2]) * t);
  out[o + 3] = 230;
};

const VIDE: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function setupFireLayers(map: maplibregl.Map): void {
  if (map.getSource("fire-seed")) return;
  map.addSource("fire-seed", { type: "geojson", data: VIDE });
  map.addLayer({
    id: "fire-seed-circle",
    type: "circle",
    source: "fire-seed",
    paint: { "circle-radius": 7, "circle-color": "#f97316", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });
}

export function applyFireSeed(map: maplibregl.Map | null, seed: [number, number] | null): void {
  const src = map?.getSource("fire-seed") as maplibregl.GeoJSONSource | undefined;
  if (!map || !src) return;
  src.setData(seed ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: seed }, properties: {} }] } : VIDE);
}

export class FireRuntime extends SpreadRuntime {}

export function applyFireSim(rt: FireRuntime, map: maplibregl.Map | null, run: FireRun | null, progress: number, playing: boolean): void {
  applySpreadSim(rt, map, run, progress, playing, FIRE_IDS, firePalette, false);
}

const LECTURE: SpreadPlayback = {
  get: () => useArgos.getState().fireProgress,
  set: (p) => useArgos.setState({ fireProgress: p }),
  stop: () => useArgos.getState().setFirePlaying(false),
};

export function playFire(rt: FireRuntime, map: maplibregl.Map | null, run: FireRun | null, playing: boolean): (() => void) | undefined {
  return playSpread(rt, map, run, playing, LECTURE, firePalette, false);
}

export { focusSpreadStart as focusFireStart, fitSpreadExtent as fitFireExtent };
