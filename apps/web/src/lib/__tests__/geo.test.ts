import { describe, expect, it } from "vitest";
import { citiesOf, nearestCity, provincesOf, regionsOf, resolvePoint } from "@/lib/geo";
import type { City, Province } from "@/lib/types";

// ============================================================================
// Géographie de référence — la cascade et la lecture inverse d'un point
//
// Ce que ces tests verrouillent : les villes d'une province sont celles de la
// PROVINCE (Safi n'apparaît pas sous Marrakech), et un point loin de toute
// ville n'en invente pas une.
// ============================================================================

const provinces: Province[] = [
  { v: "Marrakech", region: "Marrakech-Safi", x: 0, y: 0, ll: [-8.0, 31.63] },
  { v: "Safi", region: "Marrakech-Safi", x: 0, y: 0, ll: [-9.23, 32.3] },
  { v: "Rabat", region: "Rabat-Salé-Kénitra", x: 0, y: 0, ll: [-6.84, 34.02] },
];
const cities: City[] = [
  { v: "Marrakech", province: "Marrakech", region: "Marrakech-Safi", ll: [-8.0, 31.63] },
  { v: "Safi", province: "Safi", region: "Marrakech-Safi", ll: [-9.23, 32.3] },
  { v: "Rabat", province: "Rabat", region: "Rabat-Salé-Kénitra", ll: [-6.84, 34.02] },
];

describe("cascade région → province → ville", () => {
  it("les régions sont dédoublonnées et triées ; les provinces suivent la région", () => {
    expect(regionsOf(provinces)).toEqual(["Marrakech-Safi", "Rabat-Salé-Kénitra"]);
    expect(provincesOf(provinces, "Marrakech-Safi").map((p) => p.v)).toEqual(["Marrakech", "Safi"]);
    expect(provincesOf(provinces, undefined)).toHaveLength(3);
  });

  it("les villes d'une province sont celles de la province, pas de la région", () => {
    expect(citiesOf(cities, "Marrakech").map((c) => c.v)).toEqual(["Marrakech"]);
    expect(citiesOf(cities, undefined, "Marrakech-Safi").map((c) => c.v)).toEqual(["Marrakech", "Safi"]);
    expect(citiesOf(cities, undefined)).toHaveLength(3);
  });
});

describe("lecture inverse d'un point", () => {
  it("nomme la ville la plus proche dans le rayon, et sa province ; au-delà, la province seule", () => {
    expect(resolvePoint([-8.02, 31.6], provinces, cities)).toEqual({ region: "Marrakech-Safi", province: "Marrakech", city: "Marrakech" });
    // Le Haut Atlas, à 60 km de Marrakech : aucune ville, la province la plus proche.
    expect(resolvePoint([-7.5, 31.2], provinces, cities)).toEqual({ region: "Marrakech-Safi", province: "Marrakech", city: undefined });
    expect(nearestCity([-7.5, 31.2], cities)).toBeUndefined();
  });

  it("sans référentiel, ne dit rien", () => {
    expect(resolvePoint([-8, 31.6], [], [])).toEqual({ region: undefined, province: undefined, city: undefined });
  });
});
