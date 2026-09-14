// ============================================================================
// components/map/layers/floods.ts — les crues sur la carte (ADR 0010)
//
// Quatre choses, quatre sources : les jauges de crue (un point coloré par
// gravité, plus gros quand sa fiche est ouverte), les cartes d'inondation de
// la jauge choisie (polygones de Flood Hub), le point de départ du simulateur,
// et l'emprise simulée — un CANEVAS posé entre ses quatre coins, sous les
// points pour que rien ne la cache, repeint à chaque pas de la lecture : l'eau
// gagne les cellules dans l'ordre où la propagation les a atteintes.
// Idempotent : `setupStyle` rejoue tout après un changement de fond.
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import type { FloodGauge, FloodInundationMap, FloodPolygon } from "@/lib/types";
import type { FloodSimResult } from "@/lib/store/slices/flood";
import { floodImageAt } from "@/lib/flood/bathtub";

/** Durée de la lecture complète (s) — le temps de voir l'eau gagner la vallée, pas de s'ennuyer. */
const FLOOD_PLAY_SECONDS = 6;
/** Cadence de repeinte du canevas et de l'avancement affiché ; le navigateur, lui, tourne à sa fréquence. */
const FLOOD_PAINT_HZ = 20;

/**
 * Ce que la lecture garde entre deux images : le canevas hors écran, le tampon
 * RVBA réutilisé, la dernière simulation peinte, la boucle en cours.
 */
export class FloodRuntime {
  canvas: HTMLCanvasElement | null = null;
  buffer: Uint8ClampedArray | null = null;
  painted: { sim: FloodSimResult; progress: number } | null = null;
  raf = 0;
}

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

/** Le front d'eau (m parcourus) à cet avancement — l'avancement est linéaire en distance, pas en cellules. */
function frontAt(sim: FloodSimResult, progress: number): number {
  return progress >= 1 ? Infinity : sim.fill.maxDist * progress;
}

/** Peint dans le canevas l'emprise jusqu'à l'avancement donné (rien à refaire si c'est déjà l'image affichée). */
export function paintFlood(rt: FloodRuntime, sim: FloodSimResult, progress: number): void {
  const { grid } = sim;
  if (!rt.canvas || rt.canvas.width !== grid.width || rt.canvas.height !== grid.height) {
    rt.canvas = document.createElement("canvas");
    rt.canvas.width = grid.width;
    rt.canvas.height = grid.height;
    rt.buffer = null;
    rt.painted = null;
  }
  if (rt.painted && rt.painted.sim === sim && rt.painted.progress === progress) return;
  const ctx = rt.canvas.getContext("2d");
  if (!ctx) return;
  rt.buffer = floodImageAt(grid, sim.fill, frontAt(sim, progress), rt.buffer ?? undefined);
  const img = ctx.createImageData(grid.width, grid.height);
  img.data.set(rt.buffer);
  ctx.putImageData(img, 0, 0);
  rt.painted = { sim, progress };
}

/**
 * L'emprise simulée : un canevas entre ses coins, retiré quand il n'y a plus
 * de simulation. La source est déclarée `animate` : MapLibre relit le canevas
 * à chaque image tant qu'il joue ; en pause, `pause()` fige l'image et arrête
 * de relire.
 */
export function applyFloodSim(rt: FloodRuntime, map: maplibregl.Map | null, sim: FloodSimResult | null, progress: number, playing: boolean): void {
  if (!map || !map.getSource("flood-maps")) return;
  const existante = map.getSource("flood-sim") as maplibregl.CanvasSource | undefined;
  if (!sim) {
    if (map.getLayer("flood-sim-raster")) map.removeLayer("flood-sim-raster");
    if (existante) map.removeSource("flood-sim");
    rt.painted = null;
    return;
  }
  paintFlood(rt, sim, progress);
  if (!rt.canvas) return;
  if (existante) {
    existante.setCoordinates(sim.corners);
    if (playing) existante.play();
    else {
      existante.pause();
      // Un dernier rendu pour que l'image en pause soit celle de l'avancement demandé.
      map.triggerRepaint();
    }
    return;
  }
  map.addSource("flood-sim", { type: "canvas", canvas: rt.canvas, coordinates: sim.corners, animate: true });
  map.addLayer(
    { id: "flood-sim-raster", type: "raster", source: "flood-sim", paint: { "raster-opacity": 0.8, "raster-resampling": "nearest" } },
    "flood-maps-fill",
  );
  if (!playing) (map.getSource("flood-sim") as maplibregl.CanvasSource).pause();
}

/**
 * La lecture : de l'avancement courant à 1 en `FLOOD_PLAY_SECONDS` (au prorata
 * du chemin restant), en repeignant le canevas et en publiant l'avancement au
 * magasin vingt fois par seconde — le curseur du panneau le suit. S'arrête
 * seule à la fin et se déclare arrêtée. Sous « réduire les animations », pas
 * de lecture : l'emprise entière, tout de suite. Rend la fonction d'arrêt.
 */
export function playFlood(rt: FloodRuntime, map: maplibregl.Map | null, sim: FloodSimResult | null, playing: boolean): (() => void) | undefined {
  cancelAnimationFrame(rt.raf);
  if (!playing || !sim || !map) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const depart = useArgos.getState().floodProgress;
  if (reduced || sim.fill.maxDist <= 0) {
    useArgos.setState({ floodProgress: 1, floodPlaying: false });
    return;
  }
  const duree = FLOOD_PLAY_SECONDS * 1000 * (1 - depart);
  let t0 = 0;
  let dernierPas = -1;
  const tick = (t: number) => {
    if (t0 === 0) t0 = t;
    const avancement = duree > 0 ? Math.min(1, depart + ((t - t0) / duree) * (1 - depart)) : 1;
    const pas = Math.floor(avancement * FLOOD_PAINT_HZ * FLOOD_PLAY_SECONDS);
    if (pas !== dernierPas || avancement >= 1) {
      dernierPas = pas;
      paintFlood(rt, sim, avancement);
      useArgos.setState({ floodProgress: avancement });
    }
    if (avancement >= 1) {
      useArgos.getState().setFloodPlaying(false);
      return;
    }
    rt.raf = requestAnimationFrame(tick);
  };
  rt.raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rt.raf);
}
