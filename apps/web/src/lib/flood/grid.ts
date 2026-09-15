// ============================================================================
// ARGOS — géométrie d'une grille d'altitude (tuiles Web Mercator « terrarium »)
//
// Ce que le simulateur d'inondation et l'altitude sous le curseur partagent :
// une grille de tuiles contiguës, la cellule d'un point, le point d'une
// cellule, les quatre coins pour poser une image sur la carte, la taille au
// sol d'une cellule. Pur : rien ici ne touche au réseau ni au DOM.
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

/** Les quatre coins de la grille — NO, NE, SE, SO — pour poser une image sur la carte. */
export function gridCorners(grid: DemGrid): [[number, number], [number, number], [number, number], [number, number]] {
  const { z, x0, y0, tx, ty } = grid;
  return [tileFracToLngLat(x0, y0, z), tileFracToLngLat(x0 + tx, y0, z), tileFracToLngLat(x0 + tx, y0 + ty, z), tileFracToLngLat(x0, y0 + ty, z)];
}

/** Taille au sol d'une cellule (m) à cette latitude — la résolution du calcul. */
export function cellSizeMeters(z: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}
