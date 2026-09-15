// ============================================================================
// ARGOS — socle commun des simulations qui se PROPAGENT sur le relief
//
// Une crue et un feu de forêt se ressemblent à l'écran : un point de départ,
// un calcul qui court, des INSTANTANÉS espacés régulièrement sur un horizon
// (une valeur par cellule, sur la seule boîte des cellules touchées), la
// lecture en temps simulé sur un canevas MapLibre, et la liste de ce que le
// phénomène atteint, avec l'heure. Ce module porte ce qui leur est commun :
// la forme d'une course, ses images, la peinture interpolée. Chaque aléa
// apporte son modèle, sa palette et ses chiffres. Pur.
// ============================================================================

import type { DemGrid } from "@/lib/flood/grid";

export interface PixelBox {
  x0: number;
  y0: number;
  /** Exclusifs. */
  x1: number;
  y1: number;
}

/** Un instantané : une valeur par cellule (0 = intouchée) sur la boîte des cellules touchées, daté en secondes simulées. */
export interface SpreadFrame {
  t: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
  data: Uint8Array;
  /** Surface touchée (km²). */
  area: number;
}

export type SpreadPoiKind = "hospital" | "unit" | "shelter" | "city";

export interface SpreadPoi {
  id: string;
  kind: SpreadPoiKind;
  nom: string;
  ll: [number, number];
}

/** Un point d'intérêt atteint : quand (s simulées) et avec quelle valeur alors (lame d'eau, intensité du feu…). */
export interface SpreadImpact extends SpreadPoi {
  reachedAt: number;
  value: number;
}

/** Ce que la carte et le panneau lisent d'une course, quel que soit l'aléa. Mutable, partagée par référence. */
export interface SpreadRun<F extends SpreadFrame = SpreadFrame> {
  readonly grid: DemGrid;
  readonly frames: F[];
  /** Nombre d'images une fois le calcul fini (instant 0 compris). */
  readonly nFrames: number;
  readonly horizonS: number;
  readonly frameEveryS: number;
  readonly impacts: SpreadImpact[];
  /** Indice de la dernière image calculée. */
  readonly head: number;
  done: boolean;
  aborted: boolean;
  abort(): void;
}

/** La valeur d'une image à une cellule de la grille — 0 hors de sa boîte. */
export function frameValue(f: SpreadFrame, px: number, py: number): number {
  const x = px - f.x0;
  const y = py - f.y0;
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return 0;
  return f.data[y * f.w + x];
}

export function frameBox(f: SpreadFrame | null): PixelBox | null {
  return f && f.w > 0 ? { x0: f.x0, y0: f.y0, x1: f.x0 + f.w, y1: f.y0 + f.h } : null;
}

export function unionBox(a: PixelBox | null, b: PixelBox | null): PixelBox | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** L'avancement (0..1) de la tête calculée d'une course. */
export function headProgress(run: SpreadRun): number {
  return run.nFrames > 1 ? run.head / (run.nFrames - 1) : 1;
}

/** L'image entière et la fraction vers la suivante pour un avancement — sans jamais dépasser la tête calculée. */
export function frameAt(run: SpreadRun, progress: number): { k: number; f: number } {
  const idx = Math.max(0, Math.min(run.nFrames - 1, progress * (run.nFrames - 1)));
  const k = Math.min(run.head, Math.floor(idx));
  return { k, f: k < run.head ? idx - k : 0 };
}

/** Une palette : écrit la couleur RVBA d'une valeur (> 0) à l'offset `o` de `out`. */
export type SpreadPalette = (value: number, out: Uint8ClampedArray, o: number) => void;

/**
 * Peint dans `out` (RVBA de la grille entière, `width` colonnes) la valeur
 * entre `a` et `b` — interpolée linéairement (fraction `f`) quand
 * `interpolate` est vrai, sinon celle de `a` — sur toute la zone `box`,
 * transparente là où il n'y a rien. La boîte doit couvrir ce qui était peint
 * avant : c'est elle qui efface.
 */
export function paintSpread(
  out: Uint8ClampedArray,
  width: number,
  box: PixelBox,
  a: SpreadFrame | null,
  b: SpreadFrame | null,
  f: number,
  palette: SpreadPalette,
  interpolate: boolean,
): void {
  const fb = b && interpolate ? Math.min(1, Math.max(0, f)) : 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const va = a ? frameValue(a, x, y) : 0;
      const v = fb > 0 && b ? va + (frameValue(b, x, y) - va) * fb : va;
      const o = (y * width + x) * 4;
      if (v <= 0) {
        out[o + 3] = 0;
        continue;
      }
      palette(v, out, o);
    }
  }
}

/** Les cellules de la grille qui portent un point d'intérêt, par point. */
export function poiCells(grid: DemGrid, pois: readonly SpreadPoi[], gridPixel: (g: DemGrid, lng: number, lat: number) => { px: number; py: number } | null): { poi: SpreadPoi; i: number }[] {
  const out: { poi: SpreadPoi; i: number }[] = [];
  for (const poi of pois) {
    const p = gridPixel(grid, poi.ll[0], poi.ll[1]);
    if (p) out.push({ poi, i: p.py * grid.width + p.px });
  }
  return out;
}

export const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
/** Rend la main au navigateur entre deux tranches de calcul. */
export const souffle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
