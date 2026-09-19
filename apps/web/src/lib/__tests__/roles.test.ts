import { describe, expect, it } from "vitest";
import { ROLES, canDeployPosts, canReportIncident, isSuperAdmin, profileOfRoles, roleInProfile, rolesOfProfile, type Role } from "@/lib/roles";

// Miroirs côté écran de permissions serveur : on épingle la table de vérité
// pour qu'un élargissement passe par une décision, pas par un oubli.
describe("rôles — tables de vérité", () => {
  const tous = ROLES as Role[];
  it("seul superadmin est super administrateur", () => {
    expect(tous.filter(isSuperAdmin)).toEqual(["superadmin"]);
  });
  it("déclarer un incident : superadmin, tacom et ses PC, bluecell — et, sous direx, la DIREX, les chefs de PC tactiques et leurs Ops", () => {
    expect(tous.filter(canReportIncident).sort()).toEqual(
      ["bluecell", "direx_anim", "direx_chef", "pco", "pco_chef", "pco_ops", "pct", "pct_chef", "pct_ops", "superadmin", "tacom"],
    );
  });
  it("déployer un poste : superadmin, admin, opcom, tacom et ses PC — et, sous direx, la DIREX et les chefs et OPS des PC", () => {
    expect(tous.filter(canDeployPosts).sort()).toEqual(
      ["admin", "direx_anim", "direx_chef", "opcom", "pcf_chef", "pcf_ops", "pcfar_chef", "pcfar_ops", "pco", "pco_chef", "pct", "pct_chef", "superadmin", "tacom"],
    );
  });
  it("les quarante-deux rôles sont uniques : vingt classiques, vingt-deux du profil direx (ADR 0022)", () => {
    expect(new Set(tous).size).toBe(tous.length);
    expect(tous.length).toBe(42);
    expect(rolesOfProfile("classique")).toHaveLength(20);
    expect(rolesOfProfile("direx")).toHaveLength(28);
    expect(profileOfRoles(["pcf_ops", "resp_unit"])).toBe("direx");
    expect(profileOfRoles(["resp_unit"])).toBeNull();
    expect(roleInProfile("resp_equipment", "direx")).toBe(false);
  });
});
