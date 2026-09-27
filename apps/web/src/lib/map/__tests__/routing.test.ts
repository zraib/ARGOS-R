import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutePlan } from "@/lib/types";

// ============================================================================
// Itinéraire sûr côté navigateur (ADR 0039)
//
// Ce que ces tests verrouillent : le plan de l'API est rendu tel quel ; si l'API
// ne répond pas (ou répond autre chose), la ligne droite — qui ne prétend rien
// contourner — et le dit ; le tracé distingue sortie, trajet sûr, trajet NON
// SÛR, ligne droite et référence ; un obstacle naît rouge et nommé.
// ============================================================================

const planRouteApi = vi.fn();
vi.mock("@/lib/api", () => ({ api: { planRoute: (body: unknown) => planRouteApi(body) } }));

const { DEFAULT_PLAN_OPTIONS, planRoute, straightPlan } = await import("@/lib/map/routing");
const { routeFeatures } = await import("@/components/map/layers/measure");
const { newDrawingFields, obstacleLabel, OBSTACLE_COLOR, drawingsToGeoJSON } = await import("@/lib/map/drawings");
const { warningText } = await import("@/components/map/RoutePanel");
const { FR_DICT } = await import("@/lib/i18n/translations.fr");

const A: [number, number] = [-7.66, 33.555];
const B: [number, number] = [-7.52, 33.585];

function plan(over: Partial<RoutePlan> = {}): RoutePlan {
  return {
    engine: "valhalla",
    road: true,
    safe: true,
    mode: "auto",
    legs: [{ kind: "route", coords: [A, B], km: 14.2, min: 15 }],
    km: 14.2,
    min: 15,
    reference: null,
    exit: null,
    approaches: [],
    avoided: { obstacles: 0, zones: 0, incidentIds: [], hours: [] },
    warnings: [],
    ...over,
  };
}

const roles = (f: GeoJSON.Feature[]) => f.map((x) => `${x.geometry.type}:${(x.properties as { role: string }).role}`);

describe("itinéraire sûr — navigateur", () => {
  beforeEach(() => planRouteApi.mockReset());

  it("rend le plan de l'API tel quel, avec les options demandées", async () => {
    const p = plan();
    planRouteApi.mockResolvedValue({ data: p });
    expect(await planRoute([A, B], DEFAULT_PLAN_OPTIONS)).toBe(p);
    expect(planRouteApi).toHaveBeenCalledWith({ points: [A, B], mode: "auto", avoidObstacles: true, avoidNrbc: true, nrbcVigilance: false });
  });

  it("API injoignable ou réponse inattendue : la ligne droite, marquée comme telle", async () => {
    planRouteApi.mockRejectedValue(new Error("réseau"));
    const r = await planRoute([A, B], DEFAULT_PLAN_OPTIONS);
    expect(r).toMatchObject({ engine: "direct", road: false, safe: false, min: null, warnings: ["engine_unavailable"] });
    expect(r.legs[0].coords).toEqual([A, B]);
    expect(r.km).toBeGreaterThan(13);
    planRouteApi.mockResolvedValue({ data: { erreur: "?" } });
    expect((await planRoute([A, B], DEFAULT_PLAN_OPTIONS)).engine).toBe("direct");
    expect(straightPlan([A], "pedestrian").legs).toEqual([]);
  });

  it("le tracé distingue trajet sûr, sortie de zone, NON SÛR, ligne droite et référence", () => {
    expect(roles(routeFeatures([A, B], plan()))).toEqual(["LineString:route", "Point:waypoint", "Point:waypoint"]);
    const avecSortie = plan({
      legs: [
        { kind: "exit", coords: [A, [-7.64, 33.55]], km: 2, min: 3 },
        { kind: "route", coords: [[-7.64, 33.55], B], km: 12, min: 12 },
      ],
      exit: { point: [-7.64, 33.55], insideKm: 1.8, insideMin: 3, incidentIds: ["INC-1"] },
      reference: { coords: [A, B], km: 10, min: 11 },
    });
    expect(roles(routeFeatures([A, B], avecSortie))).toEqual([
      "LineString:reference",
      "LineString:exit",
      "LineString:route",
      "Point:in_zone",
      "Point:waypoint",
      "Point:exit_point",
    ]);
    expect(roles(routeFeatures([A, B], plan({ safe: false })))[0]).toBe("LineString:unsafe");
    expect(roles(routeFeatures([A, B], plan({ road: false })))[0]).toBe("LineString:direct");
    const approche = plan({ approaches: [{ index: 1, from: B, point: [-7.55, 33.57], incidentIds: ["INC-1"] }] });
    expect(roles(routeFeatures([A, B], approche)).slice(1)).toEqual(["Point:waypoint", "Point:in_zone", "Point:approach"]);
    // Calcul en cours : la ligne droite entre les étapes, en attendant.
    expect(roles(routeFeatures([A, B], null))).toEqual(["LineString:direct", "Point:waypoint", "Point:waypoint"]);
  });

  it("chaque alerte a sa phrase", () => {
    for (const w of ["engine_unavailable", "no_safe_route", "origin_in_zone", "exit_not_found", "point_in_zone", "point_in_obstacle", "wind_unknown", "engine_limit", "not_in_zone"] as const) {
      expect(warningText(w, FR_DICT).length).toBeGreaterThan(10);
    }
  });

  it("un obstacle naît rouge et porte le nom de sa nature ; un croquis, celui de sa forme", () => {
    expect(newDrawingFields("point", "bridge", FR_DICT)).toEqual({ label: "Pont détruit", obstacle: "bridge", color: OBSTACLE_COLOR });
    expect(newDrawingFields("polygon", null, FR_DICT)).toEqual({ label: FR_DICT.dr_new_polygon });
    expect(obstacleLabel("impasse", FR_DICT)).toBe(FR_DICT.ob_impasse);
    const base = { createdBy: "x", createdAt: "", updatedBy: "x", updatedAt: "" };
    const fc = drawingsToGeoJSON(
      [
        { ...base, id: "D1", kind: "point", label: "a", coords: [A], obstacle: "bridge" },
        { ...base, id: "D2", kind: "point", label: "b", coords: [B] },
      ],
      null,
    );
    expect(fc.features.map((f) => (f.properties as { obstacle: number }).obstacle)).toEqual([1, 0]);
  });
});
