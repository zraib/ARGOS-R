import { describe, expect, it } from "vitest";
import { findCity, locationLL } from "@/components/org/LocationCascade";
import type { City, Province } from "@/lib/types";

// Le référentiel des communes est complet : des homonymes existent d'une
// province à l'autre, et la cascade doit prendre celle de la province choisie.
const provinces: Province[] = [
  { v: "Taroudant", region: "Souss-Massa", x: 0, y: 0, ll: [-8.88, 30.47] },
  { v: "El Jadida", region: "Casablanca-Settat", x: 0, y: 0, ll: [-8.51, 33.25] },
];
const cities: City[] = [
  { v: "Oulad Aissa", province: "Taroudant", region: "Souss-Massa", ll: [-8.614, 30.558], kind: "rural" },
  { v: "Oulad Aissa", province: "El Jadida", region: "Casablanca-Settat", ll: [-8.682, 32.931], kind: "rural" },
  { v: "Taroudant", province: "Taroudant", region: "Souss-Massa", ll: [-8.88, 30.47] },
];

describe("cascade région → province → commune", () => {
  it("une commune homonyme se cherche d'abord dans la province choisie", () => {
    expect(findCity(cities, "Oulad Aissa", "El Jadida")?.ll).toEqual([-8.682, 32.931]);
    expect(findCity(cities, "Oulad Aissa", "Taroudant")?.ll).toEqual([-8.614, 30.558]);
    // Sans province : la première du nom ; nom inconnu ou vide : rien.
    expect(findCity(cities, "Oulad Aissa")?.province).toBe("Taroudant");
    expect(findCity(cities, "Nulle part", "Taroudant")).toBeUndefined();
    expect(findCity(cities, "")).toBeUndefined();
  });
  it("la position du lieu : la commune de la province, sinon le chef-lieu", () => {
    expect(locationLL({ region: "Casablanca-Settat", province: "El Jadida", city: "Oulad Aissa" }, provinces, cities)).toEqual([-8.682, 32.931]);
    expect(locationLL({ region: "Souss-Massa", province: "Taroudant", city: "" }, provinces, cities)).toEqual([-8.88, 30.47]);
    expect(locationLL({ region: "Souss-Massa", province: "", city: "" }, provinces, cities)).toBeUndefined();
  });
});
