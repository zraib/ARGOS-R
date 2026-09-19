import {
  ALL_ROLES,
  CLASSIC_ROLES,
  DIREX_ONLY_ROLES,
  ROLE_TRAITS,
  accountFitsProfile,
  describeProfiles,
  profileOfRoles,
  roleInProfile,
  rolesHoldingPost,
  rolesOfProfile,
  rolesShareProfile,
} from "@/shared/profiles";
import { ROLES, ROLE_LABELS, ROLE_PERMISSIONS, roleHasPermission } from "@/shared/permissions";
import { assignableCorps, canDeploy } from "@/modules/domain/assignment.rules";
import { canCreateUnit, canDeleteUnit, canEditUnit } from "@/modules/domain/mode.rules";
import { canPlacePost, placeablePostKinds, placeableResourceKinds } from "@/modules/domain/edit.rules";
import { canManageResource } from "@/modules/domain/resources.rules";
import { DEPLOYABLE_ROLES, REGIONAL_AUTHORITY_ROLES, CIVIL_ROLES, ROLE_RESPONSIBILITY } from "@/shared/responsibilities";

// ============================================================================
// Profils de rôles (ADR 0022)
//
// Deux promesses : le profil « classique » reproduit EXACTEMENT les listes de
// rôles que les traits remplacent (rien ne change pour la version actuelle),
// et le profil « direx » obtient sa conduite par les mêmes règles — PC FAR
// sur les FAR, PCF sur les autres intervenants, cellules qui déploient.
// ============================================================================

describe("profils de rôles — catalogue", () => {
  it("chaque rôle a ses traits, un libellé et une dotation", () => {
    for (const r of ALL_ROLES) {
      expect(ROLE_TRAITS[r]).toBeDefined();
      expect(ROLE_LABELS[r]).toBeTruthy();
      expect(ROLE_PERMISSIONS[r]).toBeDefined();
    }
    expect(ROLES).toEqual(ALL_ROLES);
    expect(CLASSIC_ROLES).toHaveLength(20);
    expect(DIREX_ONLY_ROLES).toHaveLength(22);
  });

  it("le mode « direx » compte ses 26 rôles plus les deux rôles techniques ; le classique ses 20", () => {
    expect(rolesOfProfile("direx")).toHaveLength(28);
    expect(rolesOfProfile("classique")).toEqual([...CLASSIC_ROLES]);
    // Les chefs d'entité sont des deux côtés ; le responsable de parc reste classique.
    for (const r of ["resp_unit", "resp_hospital", "resp_shelter", "resp_morgue"] as const) {
      expect(roleInProfile(r, "direx")).toBe(true);
      expect(roleInProfile(r, "classique")).toBe(true);
    }
    expect(roleInProfile("resp_equipment", "direx")).toBe(false);
    expect(roleInProfile("opcom", "direx")).toBe(false);
    expect(roleInProfile("pcfar_chef", "classique")).toBe(false);
  });

  it("un compte entre dans le mode de ses rôles ; l'administration et les chefs d'entité dans les deux", () => {
    expect(profileOfRoles(["opcom"])).toBe("classique");
    expect(profileOfRoles(["pcf_ops"])).toBe("direx");
    expect(profileOfRoles(["superadmin"])).toBeNull();
    expect(profileOfRoles(["resp_unit"])).toBeNull();
    expect(accountFitsProfile(["tacom", "bluecell"], "direx")).toBe(false);
    expect(accountFitsProfile(["tacom", "bluecell"], "classique")).toBe(true);
    expect(accountFitsProfile(["admin"], "direx")).toBe(true);
    expect(accountFitsProfile(["resp_hospital"], "direx")).toBe(true);
    // Deux organisations ne se mêlent pas sur un compte.
    expect(rolesShareProfile(["pcfar_chef", "resp_unit"])).toBe(true);
    expect(rolesShareProfile(["pcfar_chef", "opcom"])).toBe(false);
  });

  it("le catalogue servi au web décrit les deux modes", () => {
    const cat = describeProfiles();
    expect(cat.map((p) => p.id)).toEqual(["classique", "direx"]);
    const direx = cat[1].roles;
    expect(direx.find((r) => r.id === "pcf_chef")).toMatchObject({ label: "Chef / PCF", echelon: "pcf", fonction: "chef", profile: "direx" });
    expect(direx.some((r) => r.id === "superadmin")).toBe(true);
  });
});

describe("profil classique — les traits reproduisent les listes d'avant", () => {
  const CLASSIC = [...CLASSIC_ROLES];

  it("qui déploie", () => {
    expect(CLASSIC.filter(canDeploy).sort()).toEqual(["admin", "bluecell", "greencell", "orangecell", "pco", "pct", "superadmin", "tacom"]);
  });

  it("qui affecte quel corps", () => {
    expect(assignableCorps("opcom")).toBe("*");
    expect(assignableCorps("admin")).toBe("*");
    expect(assignableCorps("wali")).toEqual(["dgsn", "dgpc", "fa"]);
    expect(assignableCorps("interieur")).toEqual(["dgsn", "dgpc", "fa"]);
    expect(assignableCorps("gendarmerie")).toEqual(["gendarmerie"]);
    expect(assignableCorps("etat_major")).toEqual(["far"]);
    expect(assignableCorps("place_arme")).toEqual(["far"]);
    for (const r of ["tacom", "pco", "pct", "bluecell", "strategic", "resp_unit"] as const) expect(assignableCorps(r)).toEqual([]);
  });

  it("qui crée, modifie et retire des unités selon le mode", () => {
    expect(CLASSIC.filter((r) => canCreateUnit(r, "exercise")).sort()).toEqual(["admin", "bluecell", "greencell", "opcom", "orangecell", "superadmin"]);
    expect(CLASSIC.filter((r) => canCreateUnit(r, "operational"))).toEqual(["superadmin"]);
    expect(CLASSIC.filter((r) => canDeleteUnit(r, "demo")).sort()).toEqual(["bluecell", "greencell", "opcom", "orangecell", "superadmin"]);
    expect(canEditUnit("resp_unit", "operational", true)).toBe(true);
    expect(canEditUnit("resp_unit", "operational", false)).toBe(false);
    expect(canEditUnit("admin", "operational", false)).toBe(true);
  });

  it("qui pose quoi sur la carte", () => {
    expect(placeablePostKinds("strategic")).toEqual(["opcom"]);
    expect(placeablePostKinds("opcom")).toEqual(["tacom", "pco", "pct", "bluecell", "greencell", "orangecell"]);
    expect(placeablePostKinds("tacom")).toEqual([]);
    expect(placeableResourceKinds("tacom")).toEqual(["teams", "equipment", "vehicles"]);
    expect(placeableResourceKinds("bluecell")).toEqual(["teams", "equipment", "vehicles"]);
    expect(placeableResourceKinds("opcom")).toEqual([]);
    expect(placeableResourceKinds("wali")).toEqual([]);
  });

  it("qui tient quelles ressources", () => {
    const unit = { kind: "unit" as const, id: "U1" };
    expect(canManageResource({ role: "greencell", mode: "operational", owner: unit, kind: "supplies" })).toBe(true);
    expect(canManageResource({ role: "greencell", mode: "operational", owner: unit, kind: "teams" })).toBe(false);
    expect(canManageResource({ role: "bluecell", mode: "exercise", owner: unit, kind: "teams" })).toBe(true);
    expect(canManageResource({ role: "bluecell", mode: "exercise", owner: unit, kind: "supplies" })).toBe(false);
    expect(canManageResource({ role: "orangecell", mode: "exercise", owner: unit, ownerCorps: "dgpc", kind: "teams" })).toBe(false);
    expect(canManageResource({ role: "orangecell", mode: "exercise", owner: unit, ownerCorps: "far", kind: "teams" })).toBe(true);
    expect(canManageResource({ role: "resp_unit", mode: "operational", scope: { unit: "U1" }, owner: unit, kind: "teams" })).toBe(true);
    expect(canManageResource({ role: "resp_unit", mode: "operational", scope: { unit: "U2" }, owner: unit, kind: "teams" })).toBe(false);
    expect(canManageResource({ role: "tacom", mode: "exercise", owner: unit, kind: "teams" })).toBe(false);
  });

  it("les tables de rattachement ne bougent pas", () => {
    expect([...REGIONAL_AUTHORITY_ROLES].sort()).toEqual(["place_arme", "wali"]);
    expect([...CIVIL_ROLES]).toEqual(["wali"]);
    expect(ROLE_RESPONSIBILITY).toEqual({ resp_hospital: "hospital", resp_shelter: "shelter", resp_morgue: "morgue", resp_unit: "unit", resp_equipment: "equipment" });
    expect(DEPLOYABLE_ROLES.filter((r) => (CLASSIC_ROLES as readonly string[]).includes(r)).sort()).toEqual(
      ["bluecell", "etat_major", "gendarmerie", "greencell", "interieur", "opcom", "orangecell", "pco", "pct", "resp_equipment", "resp_shelter", "tacom"],
    );
  });
});

describe("profil direx — la conduite par les mêmes règles", () => {
  it("le PC FAR affecte les FAR, le PCF les autres intervenants ; les chefs et les OPS seulement", () => {
    expect(assignableCorps("pcfar_chef")).toEqual(["far"]);
    expect(assignableCorps("pcfar_ops")).toEqual(["far"]);
    expect(assignableCorps("pcf_chef")).toEqual(["dgsn", "dgpc", "fa", "gendarmerie"]);
    expect(assignableCorps("pcf_ops")).toEqual(["dgsn", "dgpc", "fa", "gendarmerie"]);
    for (const r of ["pcfar_log", "pcf_synth", "direx_chef", "direx_anim", "pct_chef", "pco_ops"] as const) expect(assignableCorps(r)).toEqual([]);
  });

  it("les PC opératifs (chef, OPS, LOG) et les PC tactiques déploient ; la DIREX ne déploie pas", () => {
    expect(DIREX_ONLY_ROLES.filter(canDeploy).sort()).toEqual(
      ["pcf_chef", "pcf_log", "pcf_ops", "pcfar_chef", "pcfar_log", "pcfar_ops", "pco_chef", "pco_log", "pco_ops", "pco_rens_com", "pct_chef", "pct_log", "pct_ops", "pct_rens"],
    );
    for (const r of DIREX_ONLY_ROLES) expect(DEPLOYABLE_ROLES.includes(r)).toBe(!r.startsWith("direx_"));
  });

  it("le Chef Direx pose les PC opératifs, ceux-ci posent les PC tactiques, les cellules posent leurs moyens", () => {
    expect(placeablePostKinds("direx_chef")).toEqual(["pcfar", "pcf"]);
    expect(placeablePostKinds("pcfar_chef")).toEqual(["pct", "pco"]);
    expect(placeablePostKinds("pcf_ops")).toEqual(["pct", "pco"]);
    expect(placeablePostKinds("pct_chef")).toEqual([]);
    expect(placeableResourceKinds("pct_ops")).toEqual(["teams", "equipment", "vehicles"]);
    expect(placeableResourceKinds("pcfar_synth")).toEqual([]);
    // Un poste PCT se tient par le chef de PCT de l'un ou l'autre profil.
    expect(rolesHoldingPost("pct")).toEqual(["pct", "pct_chef"]);
    expect(rolesHoldingPost("pcfar")).toEqual(["pcfar_chef"]);
    expect(rolesHoldingPost("pcf")).toEqual(["pcf_chef"]);
  });

  it("la DIREX anime en tout mode : unités ; ressources hors opérationnel — et la matrice lui donne l'incident", () => {
    expect(canCreateUnit("direx_anim", "exercise")).toBe(true);
    // Direction d'exercice : en tout mode, même opérationnel (lot 6).
    expect(canCreateUnit("direx_anim", "operational")).toBe(true);
    expect(canDeleteUnit("direx_chef", "demo")).toBe(true);
    const unit = { kind: "unit" as const, id: "U1" };
    expect(canManageResource({ role: "direx_anim", mode: "exercise", owner: unit, kind: "teams" })).toBe(true);
    expect(canManageResource({ role: "direx_anim", mode: "operational", owner: unit, kind: "teams" })).toBe(false);
    expect(canManageResource({ role: "pct_log", mode: "operational", owner: unit, kind: "supplies" })).toBe(true);
    expect(roleHasPermission("direx_chef", "incidents:create")).toBe(true);
    expect(roleHasPermission("direx_anim", "incidents:create")).toBe(true);
    expect(roleHasPermission("direx_eval", "incidents:create")).toBe(false);
    expect(roleHasPermission("direx_eval", "audit:view")).toBe(true);
    expect(roleHasPermission("pcfar_chef", "assign:create")).toBe(true);
    expect(roleHasPermission("pcfar_log", "assign:create")).toBe(false);
    expect(roleHasPermission("pcf_ops", "deploy:create")).toBe(true);
  });

  it("les LOG / OPS des quatre PC et l'Anim répartissent et créent, modifient, suppriment unités, abris et morgues (19 septembre 2026)", () => {
    for (const r of ["pcfar_log", "pcfar_ops", "pcf_log", "pcf_ops", "pct_log", "pct_ops", "pco_log", "pco_ops", "direx_anim"] as const) {
      expect(roleHasPermission(r, "dispatch:create")).toBe(true);
      expect(roleHasPermission(r, "missions:create")).toBe(true);
      expect(roleHasPermission(r, "teams:create")).toBe(true);
      expect(roleHasPermission(r, "shelters:delete")).toBe(true);
      expect(roleHasPermission(r, "morgue:delete")).toBe(true);
      expect(canCreateUnit(r, "exercise")).toBe(true);
      expect(canDeleteUnit(r, "demo")).toBe(true);
    }
    // La suppression reste hors de portée des autres postes et de toute cellule classique.
    expect(roleHasPermission("pcfar_synth", "shelters:delete")).toBe(false);
    expect(roleHasPermission("greencell", "shelters:delete")).toBe(false);
    expect(roleHasPermission("opcom", "morgue:delete")).toBe(false);
  });

  it("chaque mode ne pose que ses natures de poste : le Super Administrateur suit le mode en service", () => {
    expect(placeablePostKinds("superadmin", "classique")).toEqual(["opcom", "tacom", "pco", "pct", "bluecell", "greencell", "orangecell", "shelter", "equipment"]);
    expect(placeablePostKinds("superadmin", "direx")).toEqual(["pco", "pct", "shelter", "equipment", "pcfar", "pcf"]);
    expect(placeablePostKinds("direx_chef", "direx")).toEqual(["pcfar", "pcf"]);
    expect(placeablePostKinds("opcom", "classique")).toEqual(["tacom", "pco", "pct", "bluecell", "greencell", "orangecell"]);
    expect(canPlacePost("opcom", "tacom", "direx")).toBe(false);
  });

  it("le profil direx tient ses unités en tout mode : LOG / OPS des PC et Anim créent et retirent aussi en opérationnel ; l'OPCOM classique non", () => {
    for (const r of ["pcfar_log", "pcfar_ops", "pcf_log", "pcf_ops", "pct_log", "pct_ops", "pco_log", "pco_ops", "direx_anim", "direx_chef"] as const) {
      expect(canCreateUnit(r, "operational")).toBe(true);
      expect(canEditUnit(r, "operational", false)).toBe(true);
      expect(canDeleteUnit(r, "operational")).toBe(true);
    }
    expect(canCreateUnit("pcfar_synth", "operational")).toBe(false);
    expect(canCreateUnit("opcom", "operational")).toBe(false);
    expect(canDeleteUnit("bluecell", "operational")).toBe(false);
  });
});
