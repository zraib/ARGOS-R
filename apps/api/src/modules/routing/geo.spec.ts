import {
  circleRing,
  closeRing,
  corridorBox,
  decodePolyline,
  haversineM,
  isLngLat,
  lengthInsideM,
  pathCrossesRings,
  pointInAny,
  pointInRing,
  pushOutward,
  ringCentroid,
  ringPerimeterM,
  sampleRing,
  segmentsIntersect,
  thinPoints,
  type LngLat,
} from "@/modules/routing/geo";

// ============================================================================
// Géométrie du routage sûr (ADR 0039)
//
// Ce que ces tests verrouillent : dire juste si un point ou un tracé entre dans
// une zone (un coin rogné compte), trouver des points AU-DELÀ du bord, et
// mesurer ce qu'un tracé parcourt dans une zone.
// ============================================================================

// Un carré d'environ 2,2 × 1,9 km autour du port de Casablanca.
const C: LngLat = [-7.6, 33.57];
const carre: LngLat[] = [
  [-7.61, 33.56],
  [-7.59, 33.56],
  [-7.59, 33.58],
  [-7.61, 33.58],
];

describe("géométrie du routage sûr", () => {
  it("valide les coordonnées et mesure les distances", () => {
    expect(isLngLat([-7.6, 33.5])).toBe(true);
    expect(isLngLat([-7.6])).toBe(false);
    expect(isLngLat([200, 33])).toBe(false);
    expect(isLngLat([Number.NaN, 33])).toBe(false);
    // Marrakech → Casablanca : ~ 219 km à vol d'oiseau.
    expect(haversineM([-7.9811, 31.6295], [-7.5898, 33.5731]) / 1000).toBeCloseTo(219.2, 0);
  });

  it("dit si un point est dans une zone, anneau fermé ou non", () => {
    expect(pointInRing(C, carre)).toBe(true);
    expect(pointInRing(C, closeRing(carre))).toBe(true);
    expect(pointInRing([-7.62, 33.57], carre)).toBe(false);
    expect(pointInAny([-7.62, 33.57], [carre, circleRing([-7.62, 33.57], 300)])).toBe(true);
  });

  it("approche un cercle par un polygone fermé de bon périmètre", () => {
    const r = circleRing(C, 2000, 64);
    expect(r[0]).toEqual(r[r.length - 1]);
    expect(ringPerimeterM(r)).toBeGreaterThan(2 * Math.PI * 2000 * 0.99);
    expect(ringPerimeterM(r)).toBeLessThan(2 * Math.PI * 2000 * 1.01);
    const [cx, cy] = ringCentroid(r);
    expect(haversineM([cx, cy], C)).toBeLessThan(5);
  });

  it("échantillonne le bord et pousse les points au-delà", () => {
    const pts = sampleRing(carre, 400, 36);
    expect(pts.length).toBeGreaterThan(15);
    expect(pts.length).toBeLessThanOrEqual(36);
    const centre = ringCentroid(carre);
    for (const p of pts) {
      const dehors = pushOutward(p, centre, 250);
      expect(haversineM(dehors, centre)).toBeGreaterThan(haversineM(p, centre));
      expect(pointInRing(dehors, carre)).toBe(false);
    }
    // Pas de 400 m sur ~8 km de tour, mais 5 points au plus : le pas s'allonge.
    expect(sampleRing(carre, 400, 5).length).toBe(5);
  });

  it("élague les points trop proches", () => {
    expect(thinPoints([[0, 0], [0, 0.0001], [0, 0.01]], 100)).toEqual([[0, 0], [0, 0.01]]);
  });

  it("détecte un tracé qui entre dans une zone — un coin rogné compte", () => {
    // Traverse de part en part.
    expect(pathCrossesRings([[-7.62, 33.57], [-7.58, 33.57]], [carre])).toBe(true);
    // Rogne le coin sud-est (entre par le bas, sort par la droite) sans qu'aucun sommet ne tombe dedans.
    expect(pointInRing([-7.594, 33.558], carre) || pointInRing([-7.586, 33.563], carre)).toBe(false);
    expect(pathCrossesRings([[-7.594, 33.558], [-7.586, 33.563]], [carre])).toBe(true);
    // Passe à côté.
    expect(pathCrossesRings([[-7.62, 33.555], [-7.58, 33.555]], [carre])).toBe(false);
    expect(pathCrossesRings([[-7.62, 33.555], [-7.58, 33.555]], [])).toBe(false);
    expect(segmentsIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [1, 1], [2, 2], [3, 3])).toBe(false);
  });

  it("mesure ce qu'un tracé parcourt dans une zone", () => {
    const traversee: LngLat[] = [[-7.63, 33.57], [-7.57, 33.57]];
    const total = haversineM(traversee[0], traversee[1]);
    const dedans = lengthInsideM(traversee, [carre]);
    // Le carré fait 0,02° de large : un tiers de la traversée.
    expect(dedans / total).toBeCloseTo(1 / 3, 1);
    expect(lengthInsideM(traversee, [])).toBe(0);
  });

  it("élargit le couloir d'au moins 20 km", () => {
    const b = corridorBox([C, [-7.59, 33.58]]);
    expect(haversineM([b[0], C[1]], C)).toBeGreaterThan(19_000);
    expect(haversineM([C[0], b[3]], C)).toBeGreaterThan(19_000);
  });

  it("décode une polyligne Valhalla (précision 6)", () => {
    // Deux points : (38.5, -120.2) puis (40.7, -120.95), encodés en précision 6.
    const pts = decodePolyline("_izlhA~rlgdF_{geC~ywl@");
    expect(pts[0][0]).toBeCloseTo(-120.2, 5);
    expect(pts[0][1]).toBeCloseTo(38.5, 5);
    expect(pts[1][0]).toBeCloseTo(-120.95, 5);
    expect(pts[1][1]).toBeCloseTo(40.7, 5);
  });
});
