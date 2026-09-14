import { describe, expect, it } from "vitest";
import {
  cellSizeMeters,
  damBreakRule,
  floodContains,
  floodFill,
  floodImage,
  floodedAmong,
  floodedAreaKm2,
  gridCorners,
  gridPixel,
  lngLatToTileFrac,
  pixelLngLat,
  riseRule,
  tileFracToLngLat,
  type DemGrid,
} from "@/lib/flood/bathtub";

/** Une grille de synthèse `w × h` dont l'altitude est donnée par `f(x, y)`. */
function grille(w: number, h: number, f: (x: number, y: number) => number): DemGrid {
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elev[y * w + x] = f(x, y);
  return { z: 12, x0: 2000, y0: 1650, tx: 1, ty: 1, width: w, height: h, elev };
}

describe("simulateur d'inondation « baignoire »", () => {
  it("la géométrie Web Mercator fait l'aller-retour", () => {
    const [lng, lat] = [-7.6, 33.58];
    const { x, y } = lngLatToTileFrac(lng, lat, 12);
    const back = tileFracToLngLat(x, y, 12);
    expect(back[0]).toBeCloseTo(lng, 6);
    expect(back[1]).toBeCloseTo(lat, 6);
    // ~38 m par cellule à z12 sous cette latitude ; ~19 m à z13.
    expect(cellSizeMeters(12, 33.58)).toBeCloseTo(31.8, 0);
    expect(cellSizeMeters(13, 0)).toBeCloseTo(19.1, 0);
  });

  it("une cellule se retrouve par son point, et son centre retombe dedans", () => {
    const g = grille(4, 4, () => 100);
    const centre = pixelLngLat(g, 2, 1);
    expect(gridPixel(g, centre[0], centre[1])).toEqual({ px: 2, py: 1 });
    const [no, ne, se, so] = gridCorners(g);
    expect(no[0]).toBeLessThan(ne[0]);
    expect(no[1]).toBeGreaterThan(so[1]);
    expect(se[0]).toBeCloseTo(ne[0], 9);
    // Hors de la grille : rien.
    expect(gridPixel(g, 50, 50)).toBeNull();
  });

  it("une rivière en fond de vallée inonde le plat jusqu'à la hauteur de montée, jamais le coteau", () => {
    // Vallée en V : altitude = |x − 5| × 2 m, 11 colonnes ; rivière en x = 5 (0 m).
    const g = grille(11, 5, (x) => Math.abs(x - 5) * 2);
    const r = floodFill(g, 5, 2, riseRule(0, 3), 30);
    // Sous 3 m : x ∈ {4, 5, 6} (0 et 2 m) ; x = 3 vaut 4 m, hors d'eau.
    expect(r.cells).toBe(3 * 5);
    expect(r.maxDepth).toBe(3);
    expect(floodContains(g, r, ...pixelLngLat(g, 4, 0))).toBe(true);
    expect(floodContains(g, r, ...pixelLngLat(g, 3, 0))).toBe(false);
    expect(floodedAreaKm2(r, 30)).toBeCloseTo((15 * 900) / 1e6, 9);
  });

  it("l'eau ne franchit pas une digue plus haute que sa surface, même si le terrain retombe derrière", () => {
    // Plaine à 0 m, digue à 10 m en x = 5, plaine à −5 m derrière.
    const g = grille(11, 3, (x) => (x === 5 ? 10 : x > 5 ? -5 : 0));
    const r = floodFill(g, 1, 1, riseRule(0, 4), 30);
    expect(floodContains(g, r, ...pixelLngLat(g, 4, 1))).toBe(true);
    expect(floodContains(g, r, ...pixelLngLat(g, 8, 1))).toBe(false);
  });

  it("une rupture de barrage s'éteint avec la distance : la lame décroît, puis s'arrête", () => {
    // Vallée plate descendante : altitude = −x (pente vers l'est), départ en x = 0.
    const g = grille(40, 1, (x) => -x);
    const cellule = 100; // m
    const r = floodFill(g, 0, 0, damBreakRule(0, 10, 2000), cellule);
    // 2 000 m d'atténuation = 20 cellules : la lame vaut 10 m au départ, 5 m à 1 000 m, 0 à 2 000 m.
    expect(r.depth[0]).toBeCloseTo(10, 6);
    expect(r.depth[10]).toBeCloseTo(5, 6);
    expect(r.mask[25]).toBe(0);
    expect(r.cells).toBeGreaterThanOrEqual(19);
    expect(r.cells).toBeLessThanOrEqual(21);
  });

  it("sans altitude au départ, ou sans lame, rien n'est inondé ; une tuile absente ne se traverse pas", () => {
    const g = grille(5, 5, (x) => (x === 2 ? NaN : 0));
    expect(floodFill(g, 2, 2, riseRule(0, 2), 30).cells).toBe(0);
    expect(floodFill(g, 0, 0, riseRule(0, 0), 30).cells).toBe(0);
    const r = floodFill(g, 0, 0, riseRule(0, 2), 30);
    // La colonne inconnue bloque : l'est n'est pas atteint.
    expect(floodContains(g, r, ...pixelLngLat(g, 4, 0))).toBe(false);
    expect(r.cells).toBe(10);
  });

  it("liste les éléments dans l'emprise et dessine une image transparente hors d'eau", () => {
    const g = grille(4, 4, (x) => (x < 2 ? 0 : 50));
    const r = floodFill(g, 0, 0, riseRule(0, 1), 30);
    const dedans = { id: "in", ll: pixelLngLat(g, 1, 3) };
    const dehors = { id: "out", ll: pixelLngLat(g, 3, 3) };
    expect(floodedAmong(g, r, [dedans, dehors]).map((x) => x.id)).toEqual(["in"]);
    const img = floodImage(g, r);
    expect(img[3]).toBeGreaterThan(0);
    expect(img[(3 * 4 + 3) * 4 + 3]).toBe(0);
  });
});
