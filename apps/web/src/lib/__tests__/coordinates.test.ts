import { describe, expect, it } from "vitest";
import { parseCoordinate, parseCoordinatePair } from "@/lib/geo";

// Ce que le terrain écrit réellement (ADR 0030) : degrés décimaux, virgule
// française, degrés-minutes-secondes, paire collée. Rien d'inventé : ce qui ne
// se lit pas vaut null.
describe("saisie de coordonnées", () => {
  it("lit les degrés décimaux, avec point ou virgule", () => {
    expect(parseCoordinate("31.22", "lat")).toBeCloseTo(31.22);
    expect(parseCoordinate("31,22", "lat")).toBeCloseTo(31.22);
    expect(parseCoordinate("-8.24", "lng")).toBeCloseTo(-8.24);
    expect(parseCoordinate("  -8,24 ", "lng")).toBeCloseTo(-8.24);
  });

  it("lit les degrés-minutes-secondes, hémisphère devant ou derrière, ouest en français", () => {
    expect(parseCoordinate(`31°13'12"N`, "lat")).toBeCloseTo(31.22, 4);
    expect(parseCoordinate("N 31 13 12", "lat")).toBeCloseTo(31.22, 4);
    expect(parseCoordinate(`8°14'24"W`, "lng")).toBeCloseTo(-8.24, 4);
    expect(parseCoordinate(`8°14'24"O`, "lng")).toBeCloseTo(-8.24, 4);
    expect(parseCoordinate(`31°13.2'`, "lat")).toBeCloseTo(31.22, 4);
  });

  it("refuse ce qui sort du globe, une mauvaise hémisphère ou un texte illisible", () => {
    expect(parseCoordinate("91", "lat")).toBeNull();
    expect(parseCoordinate("181", "lng")).toBeNull();
    expect(parseCoordinate("31 N", "lng")).toBeNull();
    expect(parseCoordinate("8 W", "lat")).toBeNull();
    expect(parseCoordinate("31°75'", "lat")).toBeNull();
    expect(parseCoordinate("Amizmiz", "lat")).toBeNull();
    expect(parseCoordinate("", "lat")).toBeNull();
  });

  it("lit une paire collée — latitude d'abord — et rend [lng, lat]", () => {
    expect(parseCoordinatePair("31.22, -8.24")).toEqual([-8.24, 31.22]);
    expect(parseCoordinatePair("31.22 -8.24")).toEqual([-8.24, 31.22]);
    expect(parseCoordinatePair("31,22; -8,24")).toEqual([-8.24, 31.22]);
    const dms = parseCoordinatePair(`31°13'12"N 8°14'24"W`);
    expect(dms?.[0]).toBeCloseTo(-8.24, 4);
    expect(dms?.[1]).toBeCloseTo(31.22, 4);
    expect(parseCoordinatePair("31.22")).toBeNull();
    expect(parseCoordinatePair("95, -8")).toBeNull();
  });
});
