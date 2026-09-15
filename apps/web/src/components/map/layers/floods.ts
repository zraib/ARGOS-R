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
import { frameBox, paintFrames, unionBox } from "@/lib/flood/frames";
import { gridCorners, pixelLngLat } from "@/lib/flood/grid";
import type { PixelBox } from "@/lib/flood/hydro";
import type { FloodRun } from "@/lib/flood/run";

/** Une couleur par gravité — la même dans le panneau ; le libellé la double toujours. */
export const FLOOD_SEVERITY_COLOR: Record<FloodGauge["severity"], string> = {
  extreme: "#dc2626",
  severe: "#f97316",
  above_normal: "#eab308",
  no_flooding: "#2563eb",
  unknown: "#9ca3af",
};

/** Durée de lecture de tout l'horizon (s) : six heures simulées défilent en une demi-minute. */
export const FLOOD_PLAY_SECONDS = 30;
/** Cadence de repeinte et de publication de l'avancement ; le navigateur, lui, tourne à sa fréquence. */
const FLOOD_PAINT_HZ = 20;

const VIDE: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Ce que la lecture garde entre deux images : le canevas hors écran et son
 * tampon RVBA, ce qui y est peint (course, avancement, tête calculée alors),
 * la zone peinte à effacer au prochain passage, la boucle en cours.
 */
export class FloodRuntime {
  canvas: HTMLCanvasElement | null = null;
  img: ImageData | null = null;
  painted: { run: FloodRun; progress: number; head: number } | null = null;
  box: PixelBox | null = null;
  /** Le canevas avec lequel la source MapLibre a été créée — s'il change, la source se recrée. */
  sourceCanvas: HTMLCanvasElement | null = null;
  raf = 0;
}

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

// --- l'eau simulée ------------------------------------------------------------------

/** L'avancement (0..1) de la tête calculée d'une course. */
export function headProgress(run: FloodRun): number {
  return run.nFrames > 1 ? run.head / (run.nFrames - 1) : 1;
}

/** L'image entière et la fraction vers la suivante pour un avancement — sans jamais dépasser la tête calculée. */
export function frameAt(run: FloodRun, progress: number): { k: number; f: number } {
  const idx = Math.max(0, Math.min(run.nFrames - 1, progress * (run.nFrames - 1)));
  const k = Math.min(run.head, Math.floor(idx));
  return { k, f: k < run.head ? idx - k : 0 };
}

/** Peint dans le canevas l'eau à l'avancement donné (rien à refaire si c'est déjà l'image affichée). */
export function paintFlood(rt: FloodRuntime, run: FloodRun, progress: number): void {
  const { width, height } = run.sim;
  if (!rt.canvas || rt.canvas.width !== width || rt.canvas.height !== height) {
    rt.canvas = document.createElement("canvas");
    rt.canvas.width = width;
    rt.canvas.height = height;
    rt.img = null;
    rt.painted = null;
    rt.box = null;
  }
  const ctx = rt.canvas.getContext("2d");
  if (!ctx) return;
  if (!rt.img) rt.img = ctx.createImageData(width, height);
  if (rt.painted && rt.painted.run === run && rt.painted.progress === progress && rt.painted.head === run.head) return;
  const { k, f } = frameAt(run, progress);
  const a = run.frames[k] ?? null;
  const b = f > 0 ? (run.frames[k + 1] ?? null) : null;
  const cible = unionBox(frameBox(a), frameBox(b));
  // La zone repeinte couvre l'ancienne : c'est elle qui efface.
  const zone = unionBox(rt.box, cible);
  if (zone) {
    paintFrames(rt.img.data, width, zone, a, b, f);
    ctx.putImageData(rt.img, 0, 0, zone.x0, zone.y0, zone.x1 - zone.x0, zone.y1 - zone.y0);
  }
  rt.box = cible;
  rt.painted = { run, progress, head: run.head };
}

function retirerSource(rt: FloodRuntime, map: maplibregl.Map): void {
  if (map.getLayer("flood-sim-raster")) map.removeLayer("flood-sim-raster");
  if (map.getSource("flood-sim")) map.removeSource("flood-sim");
  rt.sourceCanvas = null;
  rt.canvas?.getContext("2d")?.clearRect(0, 0, rt.canvas.width, rt.canvas.height);
  rt.painted = null;
  rt.box = null;
}

/**
 * L'eau simulée : un canevas entre les coins du relief, retiré quand il n'y a
 * plus de course. La source est déclarée `animate` : MapLibre relit le canevas
 * à chaque image tant qu'elle joue ; en pause, `pause()` fige l'image.
 */
export function applyFloodSim(rt: FloodRuntime, map: maplibregl.Map | null, run: FloodRun | null, progress: number, playing: boolean): void {
  if (!map || !map.getSource("flood-maps")) return;
  if (!run) {
    retirerSource(rt, map);
    return;
  }
  paintFlood(rt, run, progress);
  if (!rt.canvas) return;
  // Un autre relief (autre taille de canevas) : la source repart de zéro.
  if (rt.sourceCanvas && rt.sourceCanvas !== rt.canvas) retirerSource(rt, map);
  const existante = map.getSource("flood-sim") as maplibregl.CanvasSource | undefined;
  const coins = gridCorners(run.grid);
  if (existante) {
    existante.setCoordinates(coins);
    if (playing) existante.play();
    else {
      existante.pause();
      // Un dernier rendu pour que l'image en pause soit celle de l'avancement demandé.
      map.triggerRepaint();
    }
    return;
  }
  map.addSource("flood-sim", { type: "canvas", canvas: rt.canvas, coordinates: coins, animate: true });
  rt.sourceCanvas = rt.canvas;
  map.addLayer(
    { id: "flood-sim-raster", type: "raster", source: "flood-sim", paint: { "raster-opacity": 0.85, "raster-resampling": "nearest" } },
    "flood-maps-fill",
  );
  if (!playing) (map.getSource("flood-sim") as maplibregl.CanvasSource).pause();
}

/**
 * La lecture : de l'avancement courant à l'horizon en `FLOOD_PLAY_SECONDS`,
 * sans jamais dépasser ce que le calcul a produit — quand il est en retard,
 * l'image attend la suivante au lieu de sauter. Repeint le canevas et publie
 * l'avancement au magasin vingt fois par seconde ; s'arrête seule à la fin
 * (ou à l'arrêt du calcul) et se déclare arrêtée. Sous « réduire les
 * animations » : pas de défilé, l'état le plus avancé tout de suite. Rend la
 * fonction d'arrêt.
 */
export function playFlood(rt: FloodRuntime, map: maplibregl.Map | null, run: FloodRun | null, playing: boolean): (() => void) | undefined {
  cancelAnimationFrame(rt.raf);
  if (!playing || !run || !map) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const depart = useArgos.getState().floodProgress;
  const duree = FLOOD_PLAY_SECONDS * 1000;
  let t0 = 0;
  let tPrec = 0;
  let dernierPas = -1;
  const tick = (t: number) => {
    if (t0 === 0) {
      t0 = t;
      tPrec = t;
    }
    const tete = headProgress(run);
    let cible = reduced ? 1 : depart + (t - t0) / duree;
    // Le calcul est en retard sur la lecture : le temps qui passe n'avance pas le curseur.
    if (cible > tete && !run.done && !run.aborted) {
      t0 += t - tPrec;
      cible = reduced ? 1 : depart + (t - t0) / duree;
    }
    tPrec = t;
    const p = Math.min(1, cible, tete);
    const pas = Math.floor(p * FLOOD_PAINT_HZ * FLOOD_PLAY_SECONDS);
    if (pas !== dernierPas || p >= 1 || rt.painted?.head !== run.head) {
      dernierPas = pas;
      paintFlood(rt, run, p);
      if (useArgos.getState().floodProgress !== p) useArgos.setState({ floodProgress: p });
    }
    if (p >= 1 || ((run.done || run.aborted) && p >= tete)) {
      useArgos.getState().setFloodPlaying(false);
      return;
    }
    rt.raf = requestAnimationFrame(tick);
  };
  rt.raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rt.raf);
}

/** Au départ d'une course : si la carte est loin, elle vient se poser sur le point de départ — sinon on ne voit rien. */
export function focusFloodStart(map: maplibregl.Map | null, seed: [number, number] | null): void {
  if (!map || !seed || map.getZoom() >= 10.5) return;
  map.easeTo({ center: seed, zoom: 11, duration: 900 });
}

/** À la fin : si l'eau est sortie du champ, la carte l'encadre — le panneau, à gauche, ne la cache pas. */
export function fitFloodExtent(map: maplibregl.Map | null, run: FloodRun | null): void {
  if (!map || !run) return;
  const box = frameBox(run.frames[run.head] ?? null);
  if (!box) return;
  const a = pixelLngLat(run.grid, box.x0, box.y0);
  const b = pixelLngLat(run.grid, box.x1 - 1, box.y1 - 1);
  const bounds = new maplibregl.LngLatBounds([Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
  const vue = map.getBounds();
  if (vue.contains(bounds.getNorthEast()) && vue.contains(bounds.getSouthWest())) return;
  const large = map.getContainer().clientWidth >= 1100;
  map.fitBounds(bounds, { padding: { top: 96, bottom: 120, left: large ? 620 : 24, right: 48 }, maxZoom: 13, duration: 1200 });
}
