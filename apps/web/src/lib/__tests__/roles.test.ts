import { describe, expect, it } from "vitest";
import { ROLES, canDeployPosts, canReportIncident, isSuperAdmin, type Role } from "@/lib/roles";

// Miroirs côté écran de permissions serveur : on épingle la table de vérité
// pour qu'un élargissement passe par une décision, pas par un oubli.
describe("rôles — tables de vérité", () => {
  const tous = ROLES as Role[];
  it("seul superadmin est super administrateur", () => {
    expect(tous.filter(isSuperAdmin)).toEqual(["superadmin"]);
  });
  it("déclarer un incident : superadmin, tacom, bluecell", () => {
    expect(tous.filter(canReportIncident).sort()).toEqual(["bluecell", "superadmin", "tacom"]);
  });
  it("déployer un poste : superadmin, admin, opcom, tacom", () => {
    expect(tous.filter(canDeployPosts).sort()).toEqual(["admin", "opcom", "superadmin", "tacom"]);
  });
  it("les quinze rôles sont uniques", () => {
    expect(new Set(tous).size).toBe(tous.length);
    expect(tous.length).toBe(15);
  });
});
