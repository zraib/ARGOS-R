import { describe, expect, it } from "vitest";
import { canEditMap, placeablePostKinds } from "@/lib/edit";
import { canCreateUnit, canDeleteUnit, canEditShelter } from "@/lib/mode";
import { PROFILE_POST_KINDS, postKindInProfile } from "@/lib/posts";

// Le mode édition suit le mode de l'application, et les boutons suivent les
// permissions servies (ADR 0022, lot 6) — miroirs des règles de l'API.
describe("mode édition par mode de l'application", () => {
  it("chaque mode a ses natures de poste ; les entités sont communes", () => {
    expect(postKindInProfile("opcom", "classique")).toBe(true);
    expect(postKindInProfile("opcom", "direx")).toBe(false);
    expect(postKindInProfile("pcfar", "classique")).toBe(false);
    expect(postKindInProfile("pcfar", "direx")).toBe(true);
    for (const p of ["classique", "direx"] as const) expect(PROFILE_POST_KINDS[p]).toEqual(expect.arrayContaining(["shelter", "equipment", "pct", "pco"]));
  });
  it("le Super Administrateur ne pose, sous un mode, que les natures du mode ; le Chef / DIREX ne pose rien en classique", () => {
    expect(placeablePostKinds("superadmin", "classique")).toEqual(["opcom", "tacom", "pco", "pct", "bluecell", "greencell", "orangecell", "shelter", "equipment"]);
    expect(placeablePostKinds("superadmin", "direx")).toEqual(["pco", "pct", "shelter", "equipment", "pcfar", "pcf"]);
    expect(placeablePostKinds("direx_chef", "direx")).toEqual(["pcfar", "pcf"]);
    expect(placeablePostKinds("direx_chef", "classique")).toEqual([]);
    // Un rôle de l'autre profil ne se connecte pas sous ce mode ; s'il y passait, il ne poserait que les natures communes.
    expect(placeablePostKinds("opcom", "direx")).toEqual(["pco", "pct"]);
    expect(canEditMap("strategic", "direx")).toBe(false);
    expect(canEditMap("strategic", "classique")).toBe(true);
    expect(canEditMap("pcfar_log", "direx")).toBe(true);
  });
});

describe("les boutons suivent les permissions servies", () => {
  const oui = () => true;
  const non = () => false;
  it("LOG / OPS des PC créent et retirent des unités hors opérationnel, sur la permission servie", () => {
    for (const r of ["pcfar_log", "pcfar_ops", "pcf_log", "pcf_ops", "pct_log", "pct_ops", "pco_log", "pco_ops", "direx_anim"] as const) {
      expect(canCreateUnit(r, "exercise", oui)).toBe(true);
      expect(canDeleteUnit(r, "demo", oui)).toBe(true);
      expect(canCreateUnit(r, "operational", oui)).toBe(false);
      expect(canDeleteUnit(r, "exercise", non)).toBe(false);
    }
    expect(canCreateUnit("pcfar_synth", "exercise", oui)).toBe(false);
    expect(canDeleteUnit("admin", "exercise", oui)).toBe(false);
    expect(canCreateUnit("superadmin", "operational", non)).toBe(true);
  });
  it("un abri se modifie sur la permission servie, son responsable sur le sien", () => {
    expect(canEditShelter("pcf_log", false, oui)).toBe(true);
    expect(canEditShelter("pcf_log", false, non)).toBe(false);
    expect(canEditShelter("resp_shelter", true, non)).toBe(true);
    expect(canEditShelter("resp_shelter", false, oui)).toBe(false);
    expect(canEditShelter("pcfar_synth", false)).toBe(false);
  });
});
