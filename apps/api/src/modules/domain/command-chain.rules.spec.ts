import { assignableCorps, canAssignCorps, canDeploy, destinationFor } from "@/modules/domain/assignment.rules";
import { canCreateUnit, canDeleteUnit, canEditUnit } from "@/modules/domain/mode.rules";
import { canManageResource } from "@/modules/domain/resources.rules";
import { CLASSIC_ROLES } from "@/shared/profiles";

// Les attentes ci-dessous décrivent le profil « classique » ; le profil « direx » a les siennes (profiles.spec.ts).
const ROLES = CLASSIC_ROLES;

// ============================================================================
// Chaîne de commandement (ADR 0016) — les règles pures, épinglées.
// ============================================================================

describe("affectation des unités — qui affecte quel corps, vers où", () => {
  it("chaque membre de l'OPCOM affecte les unités de SON corps ; le chef de l'OPCOM, tout", () => {
    expect(assignableCorps("opcom")).toBe("*");
    expect(assignableCorps("admin")).toBe("*");
    expect(assignableCorps("wali")).toEqual(["dgsn", "dgpc", "fa"]);
    expect(assignableCorps("interieur")).toEqual(["dgsn", "dgpc", "fa"]);
    expect(assignableCorps("gendarmerie")).toEqual(["gendarmerie"]);
    expect(assignableCorps("etat_major")).toEqual(["far"]);
    expect(assignableCorps("place_arme")).toEqual(["far"]);
    expect(canAssignCorps("wali", "far")).toBe(false);
    expect(canAssignCorps("gendarmerie", "dgsn")).toBe(false);
    // Le TACOM, ses PC et les cellules n'affectent pas : ils reçoivent.
    for (const r of ["tacom", "pco", "pct", "bluecell", "greencell", "orangecell", "resp_unit", "strategic"] as const) {
      expect(assignableCorps(r)).toEqual([]);
    }
  });

  it("la gendarmerie et les unités civiles rejoignent le PCO ; une unité des FAR va au PCO ou au PCT au choix", () => {
    expect(destinationFor("gendarmerie", "pct")).toBe("pco");
    expect(destinationFor("dgsn")).toBe("pco");
    expect(destinationFor("fa", "pct")).toBe("pco");
    expect(destinationFor("far", "pco")).toBe("pco");
    expect(destinationFor("far", "pct")).toBe("pct");
    expect(destinationFor("far")).toBe("pct");
  });

  it("déploient et retirent : le TACOM, ses PC et les cellules", () => {
    expect(ROLES.filter(canDeploy).sort()).toEqual(["admin", "bluecell", "greencell", "orangecell", "pco", "pct", "superadmin", "tacom"]);
  });
});

describe("modes de la station — création, modification, retrait des unités", () => {
  it("en démonstration et en exercice, l'OPCOM et les cellules créent des unités ; en opérationnel, le superadmin seul", () => {
    for (const mode of ["demo", "exercise"] as const) {
      expect(ROLES.filter((r) => canCreateUnit(r, mode)).sort()).toEqual(["admin", "bluecell", "greencell", "opcom", "orangecell", "superadmin"]);
    }
    expect(ROLES.filter((r) => canCreateUnit(r, "operational"))).toEqual(["superadmin"]);
  });

  it("un responsable modifie SA seule unité, en tout mode", () => {
    expect(canEditUnit("resp_unit", "operational", true)).toBe(true);
    expect(canEditUnit("resp_unit", "operational", false)).toBe(false);
    expect(canEditUnit("opcom", "exercise", false)).toBe(true);
    expect(canEditUnit("opcom", "operational", false)).toBe(false);
  });

  it("retirer une unité : superadmin toujours ; OPCOM et cellules hors opérationnel ; jamais l'administrateur", () => {
    expect(canDeleteUnit("superadmin", "operational")).toBe(true);
    expect(canDeleteUnit("admin", "demo")).toBe(false);
    expect(canDeleteUnit("opcom", "exercise")).toBe(true);
    expect(canDeleteUnit("bluecell", "operational")).toBe(false);
  });
});

describe("ressources — qui tient quoi, sur quelle entité, dans quel mode", () => {
  const unit = { kind: "unit" as const, id: "U3" };
  const hospital = { kind: "hospital" as const, id: "H2" };

  it("un chef tient sa propre entité, et elle seule", () => {
    expect(canManageResource({ role: "resp_unit", mode: "operational", scope: { unit: "U3" }, owner: unit, ownerCorps: "far", kind: "persons" })).toBe(true);
    expect(canManageResource({ role: "resp_unit", mode: "operational", scope: { unit: "U9" }, owner: unit, ownerCorps: "far", kind: "persons" })).toBe(false);
    expect(canManageResource({ role: "resp_hospital", mode: "operational", scope: { hospital: "H2" }, owner: hospital, kind: "vehicles" })).toBe(true);
    expect(canManageResource({ role: "resp_hospital", mode: "operational", scope: { hospital: "H2" }, owner: unit, ownerCorps: "far", kind: "vehicles" })).toBe(false);
    // Le responsable de parc : le matériel, pas les personnes.
    expect(canManageResource({ role: "resp_equipment", mode: "operational", scope: { equipment: "U3" }, owner: unit, ownerCorps: "far", kind: "equipment" })).toBe(true);
    expect(canManageResource({ role: "resp_equipment", mode: "operational", scope: { equipment: "U3" }, owner: unit, ownerCorps: "far", kind: "persons" })).toBe(false);
  });

  it("les cellules tiennent selon leur fonction, hors mode opérationnel ; la logistique reste à la cellule verte", () => {
    expect(canManageResource({ role: "bluecell", mode: "exercise", owner: unit, ownerCorps: "dgpc", kind: "persons" })).toBe(true);
    expect(canManageResource({ role: "bluecell", mode: "exercise", owner: unit, ownerCorps: "dgpc", kind: "supplies" })).toBe(false);
    expect(canManageResource({ role: "bluecell", mode: "operational", owner: unit, ownerCorps: "dgpc", kind: "persons" })).toBe(false);
    expect(canManageResource({ role: "greencell", mode: "operational", owner: unit, ownerCorps: "dgpc", kind: "supplies" })).toBe(true);
    expect(canManageResource({ role: "greencell", mode: "operational", owner: unit, ownerCorps: "dgpc", kind: "persons" })).toBe(false);
    expect(canManageResource({ role: "greencell", mode: "demo", owner: unit, ownerCorps: "dgpc", kind: "vehicles" })).toBe(true);
  });

  it("la cellule orange tient les forces de l'ordre seulement", () => {
    expect(canManageResource({ role: "orangecell", mode: "exercise", owner: unit, ownerCorps: "gendarmerie", kind: "teams" })).toBe(true);
    expect(canManageResource({ role: "orangecell", mode: "exercise", owner: unit, ownerCorps: "dgpc", kind: "teams" })).toBe(false);
    expect(canManageResource({ role: "orangecell", mode: "exercise", owner: hospital, kind: "teams" })).toBe(false);
  });

  it("la conduite et les autorités lisent, ne tiennent pas", () => {
    for (const r of ["opcom", "tacom", "pco", "pct", "wali", "place_arme", "gendarmerie", "etat_major", "interieur", "strategic"] as const) {
      expect(canManageResource({ role: r, mode: "exercise", owner: unit, ownerCorps: "far", kind: "persons" })).toBe(false);
    }
  });
});
