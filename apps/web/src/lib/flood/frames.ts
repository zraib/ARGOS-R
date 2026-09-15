// ============================================================================
// ARGOS — les images d'une simulation d'inondation : instantanés et peinture
//
// Une simulation qui court sur des heures se garde par INSTANTANÉS espacés
// régulièrement : la lame d'eau, quantifiée au décimètre, sur la seule boîte
// des cellules mouillées — de quoi rejouer, revenir en arrière, et peindre
// entre deux instantanés par interpolation pour que l'eau coule sans à-coups.
// Pur : la couche de la carte n'y ajoute que le canevas.
// ============================================================================

import type { FloodSimulation, PixelBox } from "@/lib/flood/hydro";

/** Unité de quantification de la lame (m) ; au-delà de 255 unités, la couleur sature — les chiffres, eux, restent exacts. */
export const FRAME_QUANTUM = 0.1;
/** Lame (m) en dessous de laquelle une cellule n'est pas comptée mouillée. */
export const WET_THRESHOLD = 0.05;

export interface FloodFrame {
  /** Instant simulé (s). */
  t: number;
  /** Boîte des cellules mouillées (px) ; `w = h = 0` pour une image vide. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Lame par cellule de la boîte, en unités de `FRAME_QUANTUM` ; 0 = sec. */
  depth: Uint8Array;
  /** Surface mouillée (km²), lame maximale (m), volume au sol, entré et sorti du domaine (m³). */
  area: number;
  maxDepth: number;
  volume: number;
  volumeIn: number;
  volumeOut: number;
}

/** L'instantané de l'état courant, daté `t` (l'instant programmé, pas celui du dernier pas). */
export function snapshotFrame(sim: FloodSimulation, t: number): FloodFrame {
  const box = sim.wetBox(WET_THRESHOLD);
  const base = { t, volume: sim.volumeOnGround(), volumeIn: sim.volumeIn, volumeOut: sim.volumeOut };
  if (!box) return { ...base, x0: 0, y0: 0, w: 0, h: 0, depth: new Uint8Array(0), area: 0, maxDepth: 0 };
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const depth = new Uint8Array(w * h);
  let mouillees = 0;
  let maxDepth = 0;
  for (let y = 0; y < h; y++) {
    const ligne = (box.y0 + y) * sim.width + box.x0;
    for (let x = 0; x < w; x++) {
      const v = sim.h[ligne + x];
      if (v <= WET_THRESHOLD) continue;
      mouillees++;
      if (v > maxDepth) maxDepth = v;
      depth[y * w + x] = Math.min(255, Math.max(1, Math.round(v / FRAME_QUANTUM)));
    }
  }
  return { ...base, x0: box.x0, y0: box.y0, w, h, depth, area: (mouillees * sim.dx * sim.dx) / 1e6, maxDepth };
}

/** La lame (m) d'une image à une cellule de la grille — 0 hors de sa boîte. */
export function frameDepth(f: FloodFrame, px: number, py: number): number {
  const x = px - f.x0;
  const y = py - f.y0;
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return 0;
  return f.depth[y * f.w + x] * FRAME_QUANTUM;
}

export function frameBox(f: FloodFrame | null): PixelBox | null {
  return f && f.w > 0 ? { x0: f.x0, y0: f.y0, x1: f.x0 + f.w, y1: f.y0 + f.h } : null;
}

export function unionBox(a: PixelBox | null, b: PixelBox | null): PixelBox | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** La couleur d'une lame — de bleu clair (faible) à bleu profond (forte) ; la légende du panneau reprend les deux bouts. */
export const FLOOD_SHALLOW_RGB: readonly [number, number, number] = [96, 165, 250];
export const FLOOD_DEEP_RGB: readonly [number, number, number] = [30, 78, 184];
/** Lame (m) à partir de laquelle le bleu est le plus profond. */
export const FLOOD_COLOR_REF_M = 5;

/**
 * Peint dans `out` (RVBA de la grille entière, `width` colonnes) la lame
 * interpolée entre `a` et `b` (fraction `f` de `a` vers `b`) sur toute la
 * zone `box` — transparente là où il n'y a pas d'eau. La boîte doit couvrir
 * ce qui était peint avant : c'est elle qui efface.
 */
export function paintFrames(out: Uint8ClampedArray, width: number, box: PixelBox, a: FloodFrame | null, b: FloodFrame | null, f: number): void {
  const [sr, sg, sb] = FLOOD_SHALLOW_RGB;
  const [dr, dg, db] = FLOOD_DEEP_RGB;
  const fb = b ? Math.min(1, Math.max(0, f)) : 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const da = a ? frameDepth(a, x, y) : 0;
      const d = b ? da + (frameDepth(b, x, y) - da) * fb : da;
      const o = (y * width + x) * 4;
      if (d <= WET_THRESHOLD) {
        out[o + 3] = 0;
        continue;
      }
      const t = Math.min(1, d / FLOOD_COLOR_REF_M);
      out[o] = Math.round(sr + (dr - sr) * t);
      out[o + 1] = Math.round(sg + (dg - sg) * t);
      out[o + 2] = Math.round(sb + (db - sb) * t);
      out[o + 3] = Math.round(120 + 110 * t);
    }
  }
}
