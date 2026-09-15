// ============================================================================
// components/map/layers/spread.ts — une propagation simulée sur la carte
//
// Ce que crues et feux partagent à l'écran : un CANEVAS posé entre les quatre
// coins du relief, sous les points pour que rien ne le cache, repeint à
// chaque pas de la lecture depuis les instantanés de la course ; la lecture
// en temps simulé qui n'avance jamais au-delà de ce que le calcul a produit ;
// la caméra qui vient sur le point de départ puis encadre l'emprise. Chaque
// aléa apporte ses identifiants de couche, sa palette et ses réglages du
// magasin.
// ============================================================================

import maplibregl from "maplibre-gl";
import { gridCorners, pixelLngLat } from "@/lib/flood/grid";
import { frameAt, frameBox, headProgress, paintSpread, unionBox, type PixelBox, type SpreadPalette, type SpreadRun } from "@/lib/sim/spread";

/** Durée de lecture de tout l'horizon (s) : six heures simulées défilent en une demi-minute. */
export const SPREAD_PLAY_SECONDS = 30;
/** Cadence de repeinte et de publication de l'avancement ; le navigateur, lui, tourne à sa fréquence. */
const SPREAD_PAINT_HZ = 20;

export interface SpreadLayerIds {
  source: string;
  layer: string;
  /** La couche sous laquelle se glisser. */
  before: string;
}

/** Comment la lecture parle au magasin : lire l'avancement, le publier, se déclarer arrêtée. */
export interface SpreadPlayback {
  get: () => number;
  set: (p: number) => void;
  stop: () => void;
}

/**
 * Ce que la lecture garde entre deux images : le canevas hors écran et son
 * tampon RVBA, ce qui y est peint (course, avancement, tête calculée alors),
 * la zone peinte à effacer au prochain passage, la boucle en cours.
 */
export class SpreadRuntime {
  canvas: HTMLCanvasElement | null = null;
  img: ImageData | null = null;
  painted: { run: SpreadRun; progress: number; head: number } | null = null;
  box: PixelBox | null = null;
  /** Le canevas avec lequel la source MapLibre a été créée — s'il change, la source se recrée. */
  sourceCanvas: HTMLCanvasElement | null = null;
  raf = 0;
}

/** Peint dans le canevas l'état à l'avancement donné (rien à refaire si c'est déjà l'image affichée). */
export function paintSpreadCanvas(rt: SpreadRuntime, run: SpreadRun, progress: number, palette: SpreadPalette, interpolate: boolean): void {
  const { width, height } = run.grid;
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
    paintSpread(rt.img.data, width, zone, a, b, f, palette, interpolate);
    ctx.putImageData(rt.img, 0, 0, zone.x0, zone.y0, zone.x1 - zone.x0, zone.y1 - zone.y0);
  }
  rt.box = cible;
  rt.painted = { run, progress, head: run.head };
}

function retirerSource(rt: SpreadRuntime, map: maplibregl.Map, ids: SpreadLayerIds): void {
  if (map.getLayer(ids.layer)) map.removeLayer(ids.layer);
  if (map.getSource(ids.source)) map.removeSource(ids.source);
  rt.sourceCanvas = null;
  rt.canvas?.getContext("2d")?.clearRect(0, 0, rt.canvas.width, rt.canvas.height);
  rt.painted = null;
  rt.box = null;
}

/**
 * L'emprise simulée : un canevas entre les coins du relief, retiré quand il
 * n'y a plus de course. La source est déclarée `animate` : MapLibre relit le
 * canevas à chaque image tant qu'elle joue ; en pause, `pause()` fige l'image.
 */
export function applySpreadSim(
  rt: SpreadRuntime,
  map: maplibregl.Map | null,
  run: SpreadRun | null,
  progress: number,
  playing: boolean,
  ids: SpreadLayerIds,
  palette: SpreadPalette,
  interpolate: boolean,
): void {
  if (!map || !map.getLayer(ids.before)) return;
  if (!run) {
    retirerSource(rt, map, ids);
    return;
  }
  paintSpreadCanvas(rt, run, progress, palette, interpolate);
  if (!rt.canvas) return;
  // Un autre relief (autre taille de canevas) : la source repart de zéro.
  if (rt.sourceCanvas && rt.sourceCanvas !== rt.canvas) retirerSource(rt, map, ids);
  const existante = map.getSource(ids.source) as maplibregl.CanvasSource | undefined;
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
  map.addSource(ids.source, { type: "canvas", canvas: rt.canvas, coordinates: coins, animate: true });
  rt.sourceCanvas = rt.canvas;
  map.addLayer({ id: ids.layer, type: "raster", source: ids.source, paint: { "raster-opacity": 0.85, "raster-resampling": "nearest" } }, ids.before);
  if (!playing) (map.getSource(ids.source) as maplibregl.CanvasSource).pause();
}

/**
 * La lecture : de l'avancement courant à l'horizon en `SPREAD_PLAY_SECONDS`,
 * sans jamais dépasser ce que le calcul a produit — quand il est en retard,
 * l'image attend la suivante au lieu de sauter. Repeint le canevas et publie
 * l'avancement vingt fois par seconde ; s'arrête seule à la fin (ou à l'arrêt
 * du calcul) et se déclare arrêtée. Sous « réduire les animations » : pas de
 * défilé, l'état le plus avancé tout de suite. Rend la fonction d'arrêt.
 */
export function playSpread(
  rt: SpreadRuntime,
  map: maplibregl.Map | null,
  run: SpreadRun | null,
  playing: boolean,
  playback: SpreadPlayback,
  palette: SpreadPalette,
  interpolate: boolean,
): (() => void) | undefined {
  cancelAnimationFrame(rt.raf);
  if (!playing || !run || !map) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const depart = playback.get();
  const duree = SPREAD_PLAY_SECONDS * 1000;
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
    const pas = Math.floor(p * SPREAD_PAINT_HZ * SPREAD_PLAY_SECONDS);
    if (pas !== dernierPas || p >= 1 || rt.painted?.head !== run.head) {
      dernierPas = pas;
      paintSpreadCanvas(rt, run, p, palette, interpolate);
      if (playback.get() !== p) playback.set(p);
    }
    if (p >= 1 || ((run.done || run.aborted) && p >= tete)) {
      playback.stop();
      return;
    }
    rt.raf = requestAnimationFrame(tick);
  };
  rt.raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rt.raf);
}

/** Au départ d'une course : si la carte est loin, elle vient se poser sur le point de départ — sinon on ne voit rien. */
export function focusSpreadStart(map: maplibregl.Map | null, seed: [number, number] | null): void {
  if (!map || !seed || map.getZoom() >= 10.5) return;
  map.easeTo({ center: seed, zoom: 11, duration: 900 });
}

/** À la fin : si l'emprise est sortie du champ, la carte l'encadre — le panneau, à gauche, ne la cache pas. */
export function fitSpreadExtent(map: maplibregl.Map | null, run: SpreadRun | null): void {
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
