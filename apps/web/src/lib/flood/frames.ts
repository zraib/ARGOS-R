// ============================================================================
// ARGOS — les images d'une simulation d'inondation : instantanés et peinture
//
// Une simulation qui court sur des heures se garde par INSTANTANÉS espacés
// régulièrement : la lame d'eau, quantifiée au décimètre, sur la seule boîte
// des cellules mouillées — de quoi rejouer, revenir en arrière, et peindre
// entre deux instantanés par interpolation pour que l'eau coule sans à-coups.
// Pur : la couche de la carte n'y ajoute que le canevas.
// ============================================================================

import type { FloodSimulation } from "@/lib/flood/hydro";
import { frameValue, paintSpread, type PixelBox, type SpreadFrame, type SpreadPalette } from "@/lib/sim/spread";

export { frameBox, unionBox } from "@/lib/sim/spread";

/** Unité de quantification de la lame (m) ; au-delà de 255 unités, la couleur sature — les chiffres, eux, restent exacts. */
export const FRAME_QUANTUM = 0.1;
/** Lame (m) en dessous de laquelle une cellule n'est pas comptée mouillée. */
export const WET_THRESHOLD = 0.05;

/** Un instantané de crue : `data` porte la lame par cellule en unités de `FRAME_QUANTUM` (0 = sec). */
export interface FloodFrame extends SpreadFrame {
  /** Lame maximale (m), volume au sol, entré et sorti du domaine (m³). */
  maxDepth: number;
  volume: number;
  volumeIn: number;
  volumeOut: number;
}

/** L'instantané de l'état courant, daté `t` (l'instant programmé, pas celui du dernier pas). */
export function snapshotFrame(sim: FloodSimulation, t: number): FloodFrame {
  const box = sim.wetBox(WET_THRESHOLD);
  const base = { t, volume: sim.volumeOnGround(), volumeIn: sim.volumeIn, volumeOut: sim.volumeOut };
  if (!box) return { ...base, x0: 0, y0: 0, w: 0, h: 0, data: new Uint8Array(0), area: 0, maxDepth: 0 };
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const data = new Uint8Array(w * h);
  let mouillees = 0;
  let maxDepth = 0;
  for (let y = 0; y < h; y++) {
    const ligne = (box.y0 + y) * sim.width + box.x0;
    for (let x = 0; x < w; x++) {
      const v = sim.h[ligne + x];
      if (v <= WET_THRESHOLD) continue;
      mouillees++;
      if (v > maxDepth) maxDepth = v;
      data[y * w + x] = Math.min(255, Math.max(1, Math.round(v / FRAME_QUANTUM)));
    }
  }
  return { ...base, x0: box.x0, y0: box.y0, w, h, data, area: (mouillees * sim.dx * sim.dx) / 1e6, maxDepth };
}

/** La lame (m) d'une image à une cellule de la grille — 0 hors de sa boîte. */
export function frameDepth(f: FloodFrame, px: number, py: number): number {
  return frameValue(f, px, py) * FRAME_QUANTUM;
}

/** La couleur d'une lame — de bleu clair (faible) à bleu profond (forte) ; la légende du panneau reprend les deux bouts. */
export const FLOOD_SHALLOW_RGB: readonly [number, number, number] = [96, 165, 250];
export const FLOOD_DEEP_RGB: readonly [number, number, number] = [30, 78, 184];
/** Lame (m) à partir de laquelle le bleu est le plus profond. */
export const FLOOD_COLOR_REF_M = 5;

/** La couleur d'une lame (valeur en unités de `FRAME_QUANTUM`) : de bleu clair à bleu profond, d'autant plus opaque. */
export const floodPalette: SpreadPalette = (v, out, o) => {
  const d = v * FRAME_QUANTUM;
  if (d <= WET_THRESHOLD) {
    out[o + 3] = 0;
    return;
  }
  const t = Math.min(1, d / FLOOD_COLOR_REF_M);
  out[o] = Math.round(FLOOD_SHALLOW_RGB[0] + (FLOOD_DEEP_RGB[0] - FLOOD_SHALLOW_RGB[0]) * t);
  out[o + 1] = Math.round(FLOOD_SHALLOW_RGB[1] + (FLOOD_DEEP_RGB[1] - FLOOD_SHALLOW_RGB[1]) * t);
  out[o + 2] = Math.round(FLOOD_SHALLOW_RGB[2] + (FLOOD_DEEP_RGB[2] - FLOOD_SHALLOW_RGB[2]) * t);
  out[o + 3] = Math.round(120 + 110 * t);
};

/** Peint la lame interpolée entre deux images sur la zone `box` (voir `paintSpread`). */
export function paintFrames(out: Uint8ClampedArray, width: number, box: PixelBox, a: FloodFrame | null, b: FloodFrame | null, f: number): void {
  paintSpread(out, width, box, a, b, f, floodPalette, true);
}
