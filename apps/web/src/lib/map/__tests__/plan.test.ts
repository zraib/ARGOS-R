import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { loadPlanStyle, patchPlanStyle, planGroupOf } from "@/lib/map/plan";

// ============================================================================
// Fond « plan » vectoriel (ADR 0014) — ce que le style corrigé garantit :
// aucune frontière contestée n'est tracée, la frontière ordinaire l'est ; les
// couches sont réparties entre le fond (Plan) et les repères (aussi sur le
// satellite) ; polices et sprites du style distant sont conservés.
// ============================================================================

const distant: StyleSpecification = {
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
    { id: "landuse", type: "fill", source: "openmaptiles", "source-layer": "landuse" },
    { id: "boundary_2", type: "line", source: "openmaptiles", "source-layer": "boundary", filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!", ["has", "claimed_by"]]] },
    { id: "boundary_disputed", type: "line", source: "openmaptiles", "source-layer": "boundary", filter: ["==", ["get", "disputed"], 1] },
    { id: "boundary_legacy", type: "line", source: "openmaptiles", "source-layer": "boundary", filter: ["all", ["==", "admin_level", 4]] },
    { id: "highway-name", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", layout: { "text-field": "{name}" } },
    { id: "label_country_1", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": "{name}" } },
    { id: "water_name", type: "symbol", source: "openmaptiles", "source-layer": "water_name", layout: { "text-field": "{name}" } },
  ],
};

describe("fond plan vectoriel — style corrigé", () => {
  const plan = patchPlanStyle(distant);
  const byId = (id: string) => plan.layers.find((l) => l.id === id);

  it("la couche des frontières contestées disparaît, les autres frontières excluent `disputed`", () => {
    expect(byId("boundary_disputed")).toBeUndefined();
    const b2 = byId("boundary_2");
    // `["!", ["has", …]]` est une expression : la condition ajoutée en est une aussi (sinon MapLibre lirait tout à l'ancienne et rejetterait la couche).
    expect(b2 && "filter" in b2 ? b2.filter : undefined).toEqual(["all", ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!", ["has", "claimed_by"]]], ["!=", ["get", "disputed"], 1]]);
    // Un filtre de l'ancienne syntaxe reçoit la condition dans la même syntaxe.
    const legacy = byId("boundary_legacy");
    expect(legacy && "filter" in legacy ? legacy.filter : undefined).toEqual(["all", ["all", ["==", "admin_level", 4]], ["!=", "disputed", 1]]);
  });

  it("frontières, lieux et eaux sont des repères ; le reste est le fond", () => {
    expect(plan.layers.map((l) => [l.id, planGroupOf(l)])).toEqual([
      ["background", "plan"],
      ["landuse", "plan"],
      ["boundary_2", "labels"],
      ["boundary_legacy", "labels"],
      ["highway-name", "plan"],
      ["label_country_1", "labels"],
      ["water_name", "labels"],
    ]);
    expect(planGroupOf({ metadata: undefined })).toBeNull();
    expect(planGroupOf({ metadata: { autre: 1 } })).toBeNull();
  });

  it("sources, glyphes et sprites suivent, sans toucher au style d'origine", () => {
    expect(plan.glyphs).toBe(distant.glyphs);
    expect(plan.sprite).toBe(distant.sprite);
    expect(Object.keys(plan.sources)).toEqual(["openmaptiles"]);
    expect(distant.layers.some((l) => l.id === "boundary_disputed")).toBe(true);
    expect(distant.layers.find((l) => l.id === "boundary_2")?.metadata).toBeUndefined();
  });

  it("un style distant injoignable ou invalide donne `null`, jamais une exception", async () => {
    const panne: typeof fetch = async () => new Response("nope", { status: 503 });
    expect(await loadPlanStyle(panne)).toBeNull();
    const invalide: typeof fetch = async () => new Response(JSON.stringify({ version: 7 }), { status: 200, headers: { "content-type": "application/json" } });
    expect(await loadPlanStyle(invalide)).toBeNull();
    const ok: typeof fetch = async () => new Response(JSON.stringify(distant), { status: 200, headers: { "content-type": "application/json" } });
    expect((await loadPlanStyle(ok))?.layers.length).toBe(distant.layers.length - 1);
  });
});

describe("mode souverain (RIF) — le style « plan » de la station, rebasé", () => {
  it("la source vectorielle est adressée tuile par tuile sur la station, polices et sprites suivent", async () => {
    const { rebasePlanStyle } = await import("@/lib/map/plan");
    const servi: StyleSpecification = {
      version: 8,
      sources: { openmaptiles: { type: "vector", url: "http://station-declaree/tiles/data/plan-vector.json" } },
      glyphs: "http://station-declaree/tiles/fonts/{fontstack}/{range}.pbf",
      sprite: "http://station-declaree/tiles/styles/plan/sprite",
      layers: [],
    };
    const r = rebasePlanStyle(servi, "http://10.0.0.5:8088/tiles");
    expect(r.sources.openmaptiles).toEqual({ type: "vector", tiles: ["http://10.0.0.5:8088/tiles/data/plan-vector/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 });
    expect(r.glyphs).toBe("http://10.0.0.5:8088/tiles/fonts/{fontstack}/{range}.pbf");
    expect(r.sprite).toBe("http://10.0.0.5:8088/tiles/styles/plan/sprite");
    // Le style d'origine n'est pas touché ; sans base, rien ne change.
    expect(servi.sources.openmaptiles).toEqual({ type: "vector", url: "http://station-declaree/tiles/data/plan-vector.json" });
    expect(rebasePlanStyle(servi, null)).toBe(servi);
  });
  it("une source raster ou un style sans polices passent tels quels", async () => {
    const { rebasePlanStyle } = await import("@/lib/map/plan");
    const r = rebasePlanStyle({ version: 8, sources: { sat: { type: "raster", tiles: ["x/{z}/{x}/{y}"] } }, layers: [] }, "http://s/tiles");
    expect(r.sources.sat).toEqual({ type: "raster", tiles: ["x/{z}/{x}/{y}"] });
    expect(r.glyphs).toBeUndefined();
  });
});
