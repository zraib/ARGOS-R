import {
  ATP45_DANGER_KM,
  ATP45_HAZARD_KM,
  ATP45_LOW_WIND_KMH,
  atp45Zones,
  circleRing,
  destination,
  ergZones,
} from "@/modules/nrbc/plume/plume.engine";
import type { ErgDistances } from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — tests du moteur de panache (ADR 0005)
//
// Ces gabarits guident des décisions d'évacuation : les tests verrouillent le
// seuil de vent ATP-45, le choix jour/nuit ERG, l'orientation SOUS LE VENT
// (direction météo = d'où vient le vent), la fermeture des anneaux et le
// déterminisme (mêmes entrées → mêmes polygones, au chiffre près).
// ============================================================================

/** Point d'essai : Casablanca (port industriel — scénario chlore plausible). */
const CASA: [number, number] = [-7.59, 33.57];

/** Distances du chlore, grand déversement (CAMEO/NOAA, ERG 2024). */
const CHLORINE_LARGE: ErgDistances = { isolationM: 914, protectDayKm: 9.65, protectNightKm: 11.27 };

/** Distance géodésique approchée entre deux [lon, lat], en km (contrôle). */
function distKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

describe("géométrie sphérique", () => {
  it("destination : 10 km plein nord ≈ +0,09° de latitude, même longitude", () => {
    const [lon, lat] = destination(CASA, 0, 10);
    expect(lat).toBeCloseTo(CASA[1] + 10 / 111.195, 3);
    expect(lon).toBeCloseTo(CASA[0], 4);
  });

  it("circleRing : anneau fermé dont chaque sommet est au rayon demandé", () => {
    const ring = circleRing(CASA, 2);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBe(65); // 64 sommets + fermeture
    for (const p of ring) expect(distKm(CASA, p)).toBeCloseTo(2, 2);
  });
});

describe("gabarit ATP-45", () => {
  it("vent faible (≤ 10 km/h) : cercle de danger 2 km + cercle de VIGILANCE 10 km", () => {
    const zones = atp45Zones(CASA, ATP45_LOW_WIND_KMH, 270);
    expect(zones.map((z) => z.level)).toEqual(["danger", "vigilance"]);
    expect(zones[0].radiusKm).toBe(ATP45_DANGER_KM);
    expect(zones[1].radiusKm).toBe(ATP45_HAZARD_KM);
    expect(zones.every((z) => z.kind === "circle")).toBe(true);
  });

  it("vent établi (> 10 km/h) : cercle de danger + triangle de PROTECTION sous le vent", () => {
    // Vent D'OUEST (fromDeg = 270) : le panache part vers l'EST (+lon).
    const zones = atp45Zones(CASA, 25, 270);
    expect(zones.map((z) => z.level)).toEqual(["danger", "protection"]);
    const triangle = zones[1];
    expect(triangle.kind).toBe("triangle");
    expect(triangle.ring[0]).toEqual(triangle.ring[triangle.ring.length - 1]); // fermé
    // Les deux sommets aval sont à 10 km du point, À L'EST de la source.
    for (const p of [triangle.ring[1], triangle.ring[2]]) {
      expect(distKm(CASA, p)).toBeCloseTo(ATP45_HAZARD_KM, 1);
      expect(p[0]).toBeGreaterThan(CASA[0]);
    }
  });

  it("sans prévision de vent : le seul cercle de danger, aucune zone inventée", () => {
    const zones = atp45Zones(CASA, null, null);
    expect(zones).toHaveLength(1);
    expect(zones[0].level).toBe("danger");
  });

  it("est déterministe : deux appels aux mêmes entrées rendent les mêmes polygones", () => {
    const a = atp45Zones(CASA, 25, 45);
    const b = atp45Zones(CASA, 25, 45);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("gabarit ERG 2024", () => {
  it("cercle d'isolement au rayon de la table + carré de protection sous le vent", () => {
    const zones = ergZones(CASA, CHLORINE_LARGE, true, 270);
    expect(zones.map((z) => z.level)).toEqual(["danger", "protection"]);
    expect(zones[0].radiusKm).toBeCloseTo(0.914, 3);
    const square = zones[1];
    expect(square.kind).toBe("square");
    expect(square.reachKm).toBe(CHLORINE_LARGE.protectDayKm);
    // Coins aval du carré à ~sqrt(D² + (D/2)²) du point, côté EST (vent d'ouest).
    const diag = Math.hypot(CHLORINE_LARGE.protectDayKm, CHLORINE_LARGE.protectDayKm / 2);
    for (const p of [square.ring[1], square.ring[2]]) {
      expect(distKm(CASA, p)).toBeCloseTo(diag, 1);
      expect(p[0]).toBeGreaterThan(CASA[0]);
    }
  });

  it("nuit : la distance de protection passe à la colonne nocturne (plus longue)", () => {
    const day = ergZones(CASA, CHLORINE_LARGE, true, 0);
    const night = ergZones(CASA, CHLORINE_LARGE, false, 0);
    expect(day[1].reachKm).toBe(9.65);
    expect(night[1].reachKm).toBe(11.27);
  });

  it("sans direction de vent : le seul isolement (pas de carré arbitraire)", () => {
    const zones = ergZones(CASA, CHLORINE_LARGE, true, null);
    expect(zones).toHaveLength(1);
    expect(zones[0].level).toBe("danger");
  });

  it("tous les anneaux rendus sont fermés et bornés (± 0,25° autour du point)", () => {
    for (const z of [...ergZones(CASA, CHLORINE_LARGE, false, 135), ...atp45Zones(CASA, 30, 135)]) {
      expect(z.ring[0]).toEqual(z.ring[z.ring.length - 1]);
      for (const [lon, lat] of z.ring) {
        expect(Math.abs(lon - CASA[0])).toBeLessThan(0.25);
        expect(Math.abs(lat - CASA[1])).toBeLessThan(0.25);
      }
    }
  });
});
