// Reprise des bascules par rôle depuis un instantané : écarts seulement (v2),
// table entière d'avant (v1) reprise à ses défauts — une ouverture décidée par
// une mise à jour n'est jamais masquée par un « non » hérité.
import { DEFAULT_ROLE_FEATURES, DEFAULT_ROLE_GRANTS, defaultRoleFeatures, defaultRoleGrants, isFeatureKey, isModuleKey } from "@/shared/permissions";
import { DEVIATIONS_VERSION, deviationsOf, restoreDeviations } from "./snapshot.rules";

describe("Instantané des bascules par rôle", () => {
  it("un instantané v1 (table entière) est repris à ses défauts : le « non » d'avant ne masque pas le module qu'une mise à jour ouvre", () => {
    const table = defaultRoleFeatures();
    expect(DEFAULT_ROLE_FEATURES.resp_equipment.incidents).toBe(true);
    expect(DEFAULT_ROLE_FEATURES.pcfar_log.dispatch).toBe(true);
    restoreDeviations(table, { resp_equipment: { incidents: false }, pcfar_log: { dispatch: false } }, undefined, isModuleKey);
    expect(table.resp_equipment.incidents).toBe(true);
    expect(table.pcfar_log.dispatch).toBe(true);
    restoreDeviations(table, { resp_equipment: { incidents: false } }, 1, isModuleKey);
    expect(table.resp_equipment.incidents).toBe(true);
  });

  it("un instantané v2 ne porte que les écarts : une coupure décidée est reprise, les clés inconnues et les rôles inconnus sont ignorés", () => {
    const table = defaultRoleFeatures();
    restoreDeviations(table, { tacom: { incidents: false, fantome: false }, disparu: { incidents: false } }, DEVIATIONS_VERSION, isModuleKey);
    expect(table.tacom.incidents).toBe(false);
    expect(Object.keys(table.tacom)).not.toContain("fantome");
    expect(Object.keys(table)).not.toContain("disparu");
  });

  it("les fonctionnalités ne se coupent que là où la matrice les ouvre", () => {
    const grants = defaultRoleGrants();
    expect(DEFAULT_ROLE_GRANTS.resp_unit.dispatch).toBe(false);
    restoreDeviations(grants, { resp_unit: { dispatch: true }, tacom: { subincidents: false } }, DEVIATIONS_VERSION, isFeatureKey, (role, k) => DEFAULT_ROLE_GRANTS[role][k]);
    expect(grants.resp_unit.dispatch).toBe(false);
    expect(grants.tacom.subincidents).toBe(false);
  });

  it("ce qui s'écrit : les écarts aux défauts, rien d'autre", () => {
    const table = defaultRoleFeatures();
    expect(deviationsOf(table, DEFAULT_ROLE_FEATURES, isModuleKey)).toEqual({});
    table.tacom.incidents = false;
    table.opcom.workorders = !DEFAULT_ROLE_FEATURES.opcom.workorders;
    expect(deviationsOf(table, DEFAULT_ROLE_FEATURES, isModuleKey)).toEqual({ tacom: { incidents: false }, opcom: { workorders: table.opcom.workorders } });
  });
});
