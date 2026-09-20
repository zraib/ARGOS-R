import { describe, expect, it } from "vitest";
import { centerOf, circleRing, closedRing, distanceM, draftToGeoJSON, drawingsToGeoJSON, formatDistance, handlesOf, labelPosition } from "@/lib/map/drawings";
import type { Drawing } from "@/lib/types";

const base = { createdBy: "o.chraibi", createdAt: "2026-09-20T00:00:00Z", updatedBy: "o.chraibi", updatedAt: "2026-09-20T00:00:00Z" };
const point: Drawing = { ...base, id: "D1", kind: "point", label: "PR", coords: [[-6.84, 34.02]] };
const circle: Drawing = { ...base, id: "D2", kind: "circle", label: "Zone", coords: [[-7.6, 33.58]], radiusM: 1000, color: "#EF4444" };
const poly: Drawing = { ...base, id: "D3", kind: "polygon", label: "Secteur", coords: [[-7.6, 33.6], [-7.5, 33.6], [-7.5, 33.7]], labelLL: [-7.55, 33.62] };

describe("croquis — géométrie", () => {
  it("un cercle de 1 km est un anneau fermé dont chaque sommet est à 1 km du centre", () => {
    const ring = circleRing(circle.coords[0], 1000, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    for (const p of ring.slice(0, 32)) expect(Math.abs(distanceM(circle.coords[0], p) - 1000)).toBeLessThan(1);
  });
  it("le centre : le point, le centre du cercle, le barycentre du polygone ; l'étiquette va où on l'a posée", () => {
    expect(centerOf(point)).toEqual([-6.84, 34.02]);
    expect(centerOf(circle)).toEqual([-7.6, 33.58]);
    const c = centerOf(poly);
    expect(c[0]).toBeCloseTo(-7.5333, 3);
    expect(c[1]).toBeCloseTo(33.6333, 3);
    expect(labelPosition(poly)).toEqual([-7.55, 33.62]);
    expect(labelPosition(circle)).toEqual([-7.6, 33.58]);
    expect(closedRing(poly.coords)).toHaveLength(4);
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(2500)).toBe("2.5 km");
  });
  it("le GeoJSON porte les formes avec leur couleur et la sélection ; un polygone à deux sommets ne se dessine pas", () => {
    const fc = drawingsToGeoJSON([point, circle, { ...poly, coords: poly.coords.slice(0, 2) }], "D2");
    expect(fc.features.map((f) => [f.geometry.type, f.properties?.id, f.properties?.selected])).toEqual([["Point", "D1", 0], ["Polygon", "D2", 1]]);
    expect(fc.features[1].properties?.color).toBe("#EF4444");
  });
  it("les poignées : les sommets d'un polygone, le centre et le bord d'un cercle, le point lui-même", () => {
    expect(handlesOf(poly).features.map((f) => f.properties?.role)).toEqual(["vertex", "vertex", "vertex"]);
    const h = handlesOf(circle).features;
    expect(h.map((f) => f.properties?.role)).toEqual(["center", "radius"]);
    const bord = (h[1].geometry as GeoJSON.Point).coordinates as [number, number];
    expect(Math.abs(distanceM(circle.coords[0], bord) - 1000)).toBeLessThan(1);
    expect(handlesOf(point).features).toHaveLength(1);
    expect(handlesOf(null).features).toHaveLength(0);
  });
  it("le brouillon : la ligne jusqu'au curseur et la fermeture du polygone ; le cercle qui s'étire", () => {
    const p = draftToGeoJSON("polygon", [[-7.6, 33.6], [-7.5, 33.6]], [-7.5, 33.7]);
    expect(p.features.map((f) => f.geometry.type)).toEqual(["LineString", "LineString", "Point", "Point"]);
    const c = draftToGeoJSON("circle", [[-7.6, 33.58]], [-7.59, 33.58]);
    expect(c.features.map((f) => f.geometry.type)).toEqual(["Polygon", "Point"]);
    expect(draftToGeoJSON(null, [], null).features).toHaveLength(0);
  });
});

describe("croquis — qui modifie", () => {
  it("l'auteur (matricule, sans tenir compte de la casse) et le Super Administrateur ; personne d'autre, l'administrateur compris", async () => {
    const { canEditDrawing } = await import("@/lib/map/drawings");
    expect(canEditDrawing({ createdBy: "o.chraibi" }, "opcom", "O.Chraibi")).toBe(true);
    expect(canEditDrawing({ createdBy: "o.chraibi" }, "superadmin", "m.zraib")).toBe(true);
    expect(canEditDrawing({ createdBy: "o.chraibi" }, "admin", "h.alami")).toBe(false);
    expect(canEditDrawing({ createdBy: "o.chraibi" }, "tacom", "t.chef")).toBe(false);
    expect(canEditDrawing({ createdBy: "o.chraibi" }, "wali", undefined)).toBe(false);
  });
});
