import { POST_KINDS } from "@/modules/domain/domain.types";
import { canEditMap, canPlacePost, canPlaceResource, placeablePostKinds, placeableResourceKinds } from "@/modules/domain/edit.rules";

describe("mode édition par rôle (ADR 0018) — règles pures", () => {
  it("chaque rôle pose ce que la doctrine lui donne, et rien d'autre", () => {
    // Toutes les natures — y compris les PC du profil « direx » (ADR 0022).
    expect(placeablePostKinds("superadmin")).toHaveLength(POST_KINDS.length);
    expect(placeablePostKinds("strategic")).toEqual(["opcom"]);
    expect(placeablePostKinds("opcom")).toEqual(["tacom", "pco", "pct", "bluecell", "greencell", "orangecell"]);
    expect(placeablePostKinds("tacom")).toEqual([]);
    expect(placeablePostKinds("admin")).toEqual([]);
    expect(placeableResourceKinds("tacom")).toEqual(["teams", "equipment", "vehicles"]);
    expect(placeableResourceKinds("pco")).toEqual(["teams", "equipment", "vehicles"]);
    expect(placeableResourceKinds("bluecell")).toEqual(["teams", "equipment", "vehicles"]);
    expect(placeableResourceKinds("greencell")).toEqual(["teams", "equipment", "vehicles"]);
    expect(placeableResourceKinds("strategic")).toEqual([]);
    expect(placeableResourceKinds("wali")).toEqual([]);
    expect(canPlacePost("strategic", "tacom")).toBe(false);
    expect(canPlacePost("opcom", "opcom")).toBe(false);
    expect(canPlacePost("opcom", "greencell")).toBe(true);
  });

  it("le mode édition existe pour qui a quelque chose à poser", () => {
    for (const r of ["superadmin", "strategic", "opcom", "tacom", "pco", "pct", "bluecell", "greencell", "orangecell"] as const) expect([r, canEditMap(r)]).toEqual([r, true]);
    for (const r of ["admin", "wali", "place_arme", "resp_unit", "resp_hospital", "gendarmerie"] as const) expect([r, canEditMap(r)]).toEqual([r, false]);
  });

  it("en exercice on pose librement ; en opérationnel, les ressources des unités affectées à SON opération", () => {
    const base = { kind: "teams" as const, ownerKind: "unit" as const };
    expect(canPlaceResource({ ...base, role: "bluecell", mode: "exercise" })).toBe(true);
    expect(canPlaceResource({ ...base, role: "bluecell", mode: "demo", ownerKind: "shelter" })).toBe(true);
    expect(canPlaceResource({ ...base, role: "bluecell", mode: "operational" })).toBe(false);
    expect(canPlaceResource({ ...base, role: "bluecell", mode: "operational", scope: { incident: "I1" }, unitIncidentId: "I2" })).toBe(false);
    expect(canPlaceResource({ ...base, role: "bluecell", mode: "operational", scope: { incident: "I1" }, unitIncidentId: "I1" })).toBe(true);
    expect(canPlaceResource({ ...base, role: "tacom", mode: "operational", scope: { incident: "I1" }, unitIncidentId: "I1", ownerKind: "hospital" })).toBe(false);
    expect(canPlaceResource({ ...base, role: "bluecell", mode: "exercise", kind: "equipment" })).toBe(true);
    expect(canPlaceResource({ ...base, role: "wali", mode: "exercise", kind: "equipment" })).toBe(false);
    expect(canPlaceResource({ ...base, role: "tacom", mode: "exercise", kind: "equipment" })).toBe(true);
    expect(canPlaceResource({ ...base, role: "superadmin", mode: "operational" })).toBe(true);
  });
});
