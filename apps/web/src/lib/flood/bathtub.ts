// ============================================================================
// ARGOS — simulateur d'inondation « baignoire » sur le relief (MNT terrarium)
//
// Ce que ce module calcule : à partir d'un point de départ (une rivière, un
// lac, un barrage) et d'une hauteur d'eau, l'emprise des cellules du relief
// que l'eau atteint de proche en proche. L'eau descend, s'étale à plat, et ne
// remonte une pente que de la hauteur qu'elle a. Pour un barrage, la hauteur
// s'atténue avec la distance parcourue — la lame décroît le long de la vallée.
//
// Ce que ce module NE calcule PAS : ni vitesse, ni durée, ni ouvrage, ni
// rugosité — aucune hydraulique. C'est un ORDRE DE GRANDEUR d'emprise, sur un
// relief à ~30 m : de quoi cadrer une évacuation, pas une prévision. Pur : il
// se teste sur des grilles de synthèse.
// ============================================================================

export const TILE = 256;

/** Une grille d'altitude assemblée à partir de tuiles Web Mercator contiguës. */
export interface DemGrid {
  z: number;
  /** Tuile du coin nord-ouest. */
  x0: number;
  y0: number;
  /** Tuiles en largeur / hauteur. */
  tx: number;
  ty: number;
  width: number;
  height: number;
  /** Altitude (m) par cellule, ligne par ligne ; NaN = inconnue (tuile absente). */
  elev: Float32Array;
}

export interface FloodFillResult {
  /** 1 = cellule inondée. */
  mask: Uint8Array;
  /** Lame d'eau (m) par cellule inondée, 0 ailleurs. */
  depth: Float32Array;
  /** Distance parcourue par l'eau (m) pour atteindre chaque cellule inondée — l'ordre dans lequel l'emprise se remplit. */
  dist: Float32Array;
  cells: number;
  maxDepth: number;
  /** La plus grande distance parcourue : la fin de l'animation. */
  maxDist: number;
  seedElev: number;
}

/** Ce qui gouverne la propagation : le plafond de surface et la lame maximale selon la distance parcourue (m). */
export interface FloodRule {
  /** Altitude que la surface de l'eau ne dépasse jamais. */
  cap: number;
  /** Lame d'eau maximale à `d` mètres du départ (Infinity = sans atténuation). */
  hmax: (dMeters: number) => number;
}

// --- géométrie Web Mercator ----------------------------------------------------

/** Coordonnées de tuile FRACTIONNAIRES d'un point à un zoom. */
export function lngLatToTileFrac(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n };
}

/** Le point [lng, lat] d'une coordonnée de tuile fractionnaire. */
export function tileFracToLngLat(x: number, y: number, z: number): [number, number] {
  const n = 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lng, lat];
}

/** La cellule d'un point, ou `null` hors de la grille. */
export function gridPixel(grid: DemGrid, lng: number, lat: number): { px: number; py: number } | null {
  const { x, y } = lngLatToTileFrac(lng, lat, grid.z);
  const px = Math.floor((x - grid.x0) * TILE);
  const py = Math.floor((y - grid.y0) * TILE);
  if (px < 0 || py < 0 || px >= grid.width || py >= grid.height) return null;
  return { px, py };
}

/** Le centre d'une cellule, en [lng, lat]. */
export function pixelLngLat(grid: DemGrid, px: number, py: number): [number, number] {
  return tileFracToLngLat(grid.x0 + (px + 0.5) / TILE, grid.y0 + (py + 0.5) / TILE, grid.z);
}

/** Les quatre coins de la grille — NO, NE, SE, SO — pour poser l'image sur la carte. */
export function gridCorners(grid: DemGrid): [[number, number], [number, number], [number, number], [number, number]] {
  const { z, x0, y0, tx, ty } = grid;
  return [tileFracToLngLat(x0, y0, z), tileFracToLngLat(x0 + tx, y0, z), tileFracToLngLat(x0 + tx, y0 + ty, z), tileFracToLngLat(x0, y0 + ty, z)];
}

/** Taille au sol d'une cellule (m) à cette latitude — la résolution du calcul. */
export function cellSizeMeters(z: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

// --- règles ---------------------------------------------------------------------

/** Rivière ou lac : la surface monte de `riseM` au-dessus du point de départ et s'étale à plat. */
export function riseRule(seedElev: number, riseM: number): FloodRule {
  return { cap: seedElev + riseM, hmax: () => Infinity };
}

/** Barrage : une lame de `heightM` au pied, qui s'éteint linéairement à `attenuationM` du départ. */
export function damBreakRule(seedElev: number, heightM: number, attenuationM: number): FloodRule {
  return { cap: seedElev + heightM, hmax: (d) => heightM * Math.max(0, 1 - d / Math.max(1, attenuationM)) };
}

// --- propagation ------------------------------------------------------------------

/**
 * Propage l'eau de proche en proche (4 voisins) depuis la cellule de départ.
 *
 * Pour un voisin `n` atteint depuis `c` : la surface ne dépasse ni celle de
 * `c` ni le plafond ; la lame est ce que cette surface laisse au-dessus du
 * sol de `n`, bornée par `hmax` à cette distance ; s'il ne reste rien, l'eau
 * n'y va pas. Une cellule atteinte plus haut par un autre chemin est reprise
 * — la lame retenue est la plus forte. `maxCells` borne le calcul.
 */
export function floodFill(grid: DemGrid, seedPx: number, seedPy: number, rule: FloodRule, cellMeters: number, maxCells = 4_000_000): FloodFillResult {
  const { width, height, elev } = grid;
  const n = width * height;
  const mask = new Uint8Array(n);
  const depth = new Float32Array(n);
  const surface = new Float32Array(n);
  const dist = new Float32Array(n);
  const seed = seedPy * width + seedPx;
  const seedElev = elev[seed];
  const result: FloodFillResult = { mask, depth, dist, cells: 0, maxDepth: 0, maxDist: 0, seedElev };
  if (!Number.isFinite(seedElev)) return result;
  const lame0 = Math.min(rule.cap - seedElev, rule.hmax(0));
  if (lame0 <= 0) return result;
  mask[seed] = 1;
  depth[seed] = lame0;
  surface[seed] = seedElev + lame0;
  result.cells = 1;
  result.maxDepth = lame0;
  const queue: number[] = [seed];
  let tete = 0;
  let iterations = 0;
  const limite = maxCells * 8;
  while (tete < queue.length && iterations++ < limite) {
    const c = queue[tete++];
    const cx = c % width;
    const cy = (c - cx) / width;
    const ws = surface[c];
    const dc = dist[c] + cellMeters;
    // Quatre voisins ; les bords de la grille ne se franchissent pas.
    const voisins = [cx > 0 ? c - 1 : -1, cx < width - 1 ? c + 1 : -1, cy > 0 ? c - width : -1, cy < height - 1 ? c + width : -1];
    for (const v of voisins) {
      if (v < 0) continue;
      const sol = elev[v];
      if (!Number.isFinite(sol)) continue;
      const lame = Math.min(Math.min(ws, rule.cap) - sol, rule.hmax(dc));
      if (lame <= 0.01) continue;
      // Déjà atteint avec autant d'eau : rien à reprendre.
      if (mask[v] && depth[v] >= lame - 1e-3) continue;
      if (!mask[v]) {
        mask[v] = 1;
        result.cells++;
        if (result.cells >= maxCells) return result;
      }
      depth[v] = lame;
      surface[v] = sol + lame;
      dist[v] = dc;
      if (lame > result.maxDepth) result.maxDepth = lame;
      if (dc > result.maxDist) result.maxDist = dc;
      queue.push(v);
    }
  }
  return result;
}

// --- lecture du résultat -----------------------------------------------------------

/** Surface inondée (km²) : autant de cellules que de carrés de `cellMeters` de côté. */
export function floodedAreaKm2(fill: FloodFillResult, cellMeters: number): number {
  return (fill.cells * cellMeters * cellMeters) / 1e6;
}

/** Le point est-il dans l'emprise ? */
export function floodContains(grid: DemGrid, fill: FloodFillResult, lng: number, lat: number): boolean {
  const p = gridPixel(grid, lng, lat);
  return !!p && fill.mask[p.py * grid.width + p.px] === 1;
}

/** Parmi des éléments géolocalisés, ceux que l'emprise atteint. */
export function floodedAmong<T extends { ll: [number, number] }>(grid: DemGrid, fill: FloodFillResult, items: readonly T[]): T[] {
  return items.filter((it) => floodContains(grid, fill, it.ll[0], it.ll[1]));
}

/** La couleur d'une lame — de bleu clair (faible) à bleu profond (forte) ; la légende du panneau reprend les deux bouts. */
export const FLOOD_SHALLOW_RGB: readonly [number, number, number] = [96, 165, 250];
export const FLOOD_DEEP_RGB: readonly [number, number, number] = [30, 78, 184];

/**
 * L'image de l'emprise (RVBA, ligne par ligne) jusqu'au FRONT donné : seules
 * les cellules que l'eau a atteintes en moins de `front` mètres de parcours
 * sont peintes — bleu d'autant plus soutenu et opaque que la lame est forte,
 * transparent ailleurs. `front = Infinity` peint tout. `out` se réutilise
 * d'une image à l'autre (l'animation en dessine vingt par seconde).
 */
export function floodImageAt(grid: DemGrid, fill: FloodFillResult, front: number, out?: Uint8ClampedArray): Uint8ClampedArray {
  const n = grid.width * grid.height * 4;
  const img = out && out.length === n ? out : new Uint8ClampedArray(n);
  const ref = Math.max(1, fill.maxDepth);
  for (let i = 0; i < fill.mask.length; i++) {
    const o = i * 4;
    if (!fill.mask[i] || fill.dist[i] > front) {
      img[o + 3] = 0;
      continue;
    }
    const t = Math.min(1, fill.depth[i] / ref);
    img[o] = Math.round(FLOOD_SHALLOW_RGB[0] + (FLOOD_DEEP_RGB[0] - FLOOD_SHALLOW_RGB[0]) * t);
    img[o + 1] = Math.round(FLOOD_SHALLOW_RGB[1] + (FLOOD_DEEP_RGB[1] - FLOOD_SHALLOW_RGB[1]) * t);
    img[o + 2] = Math.round(FLOOD_SHALLOW_RGB[2] + (FLOOD_DEEP_RGB[2] - FLOOD_SHALLOW_RGB[2]) * t);
    img[o + 3] = Math.round(110 + 110 * t);
  }
  return img;
}

/** L'image de l'emprise entière. */
export function floodImage(grid: DemGrid, fill: FloodFillResult): Uint8ClampedArray {
  return floodImageAt(grid, fill, Infinity);
}
