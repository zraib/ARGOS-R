import { VisibilityService } from "@/modules/domain/visibility.service";
import type { Incident } from "@/modules/domain/domain.service";

// ============================================================================
// ARGOS — la doctrine de visibilité, éprouvée (lot V-1)
//
// Ce que ces tests protègent : « qui voit quoi » est une frontière de
// SÉCURITÉ, pas un confort d'affichage. Si un wali voit les opérations d'une
// autre région, ou si un OPCOM non déployé voit tout, la fuite est silencieuse
// — rien à l'écran ne signale qu'on montre trop.
//
// Le default-deny est vérifié rôle par rôle : une affectation ABSENTE ne vaut
// jamais permission.
// ============================================================================

const CASABLANCA: [number, number] = [-7.59, 33.57];
const RABAT: [number, number] = [-6.84, 34.02];        // ~87 km de Casablanca
const MOHAMMEDIA: [number, number] = [-7.38, 33.69];   // ~24 km de Casablanca

function inc(over: Partial<Incident> = {}): Incident {
  return {
    id: "INC-1", type: "wildfire", titre: "Test", region: "Casablanca-Settat",
    sev: "high", st: "open", time: "10:00", x: 0, y: 0, ll: CASABLANCA,
    ...over,
  } as Incident;
}

const noServing = () => [];

describe("Portée — global", () => {
  const v = new VisibilityService();
  it.each(["superadmin", "admin", "strategic"] as const)("%s voit tout", (role) => {
    const scope = v.scopeOf(role, undefined);
    expect(scope.kind).toBe("global");
    const all = [inc({ id: "A" }), inc({ id: "B", region: "Souss-Massa" })];
    expect(v.filterIncidents(all, scope, noServing)).toHaveLength(2);
  });
});

describe("Portée — wali : sa région, et rien d'autre", () => {
  const v = new VisibilityService();
  const all = [
    inc({ id: "A", region: "Casablanca-Settat" }),
    inc({ id: "B", region: "Souss-Massa" }),
    inc({ id: "C", region: "Casablanca-Settat" }),
  ];

  it("ne voit que les incidents de sa région", () => {
    const scope = v.scopeOf("wali", { region: "Casablanca-Settat" });
    expect(v.filterIncidents(all, scope, noServing).map((i) => i.id)).toEqual(["A", "C"]);
  });

  it("DEFAULT-DENY : un wali SANS région ne voit RIEN", () => {
    const scope = v.scopeOf("wali", {});
    expect(v.filterIncidents(all, scope, noServing)).toHaveLength(0);
  });

  it("décision produit : les unités restent visibles au national", () => {
    const scope = v.scopeOf("wali", { region: "Casablanca-Settat" });
    const units = [{ id: "U1", ll: RABAT }, { id: "U2", ll: CASABLANCA }] as never;
    expect(v.filterUnits(units, scope)).toHaveLength(2);
  });
});

describe("Portée — place d'armes : sa région, comme le wali", () => {
  const v = new VisibilityService();
  const scope = () => v.scopeOf("place_arme", { region: "Casablanca-Settat" });

  it("voit les incidents de sa région, y compris loin de son chef-lieu", () => {
    // Rabat est à 87 km de Casablanca : l'ancienne zone de 40 km l'excluait.
    // C'est la RÉGION qui décide désormais, pas la distance.
    const all = [inc({ id: "A", ll: MOHAMMEDIA }), inc({ id: "B", ll: RABAT }), inc({ id: "C", region: "Souss-Massa" })];
    expect(v.filterIncidents(all, scope(), noServing).map((i) => i.id)).toEqual(["A", "B"]);
  });

  it("un incident proche mais d'une AUTRE région lui est invisible", () => {
    const all = [inc({ id: "VOISIN", ll: MOHAMMEDIA, region: "Rabat-Salé-Kénitra" })];
    expect(v.filterIncidents(all, scope(), noServing)).toHaveLength(0);
  });

  it("décision produit : les unités restent visibles au national", () => {
    const units = [{ id: "U1", ll: MOHAMMEDIA }, { id: "U2", ll: RABAT }] as never;
    expect(v.filterUnits(units, scope())).toHaveLength(2);
  });

  it("DEFAULT-DENY : sans région, la place d'armes ne voit RIEN — pas le pays", () => {
    const sc = v.scopeOf("place_arme", {});
    expect(v.filterIncidents([inc()], sc, noServing)).toHaveLength(0);
  });
});

describe("Portée — conduite déployée : son incident, un seul", () => {
  const v = new VisibilityService();
  const all = [inc({ id: "A" }), inc({ id: "B" }), inc({ id: "C" })];

  it.each(["opcom", "tacom", "bluecell", "greencell", "orangecell", "resp_shelter", "resp_equipment"] as const)(
    "%s ne voit que l'incident de son déploiement",
    (role) => {
      const scope = v.scopeOf(role, { incident: "B" });
      expect(v.filterIncidents(all, scope, noServing).map((i) => i.id)).toEqual(["B"]);
    },
  );

  it("DEFAULT-DENY : non déployé = ne voit RIEN", () => {
    const scope = v.scopeOf("opcom", {});
    expect(v.filterIncidents(all, scope, noServing)).toHaveLength(0);
  });
});

describe("Portée — responsable d'entité : plusieurs incidents à la fois", () => {
  const v = new VisibilityService();
  const all = [inc({ id: "A" }), inc({ id: "B" }), inc({ id: "C" })];
  // H1 sert A et C ; U9 ne sert rien.
  const serving = (id: string) => ({ A: ["H1", "U2"], B: ["U5"], C: ["H1"] }[id] ?? []);

  it("voit TOUS les incidents où son entité sert", () => {
    const scope = v.scopeOf("resp_hospital", { hospital: "H1" });
    expect(v.filterIncidents(all, scope, serving).map((i) => i.id)).toEqual(["A", "C"]);
  });

  it("un compte cumulant deux responsabilités additionne ses périmètres", () => {
    const scope = v.scopeOf("resp_unit", { hospital: "H1", unit: "U5" });
    expect(v.filterIncidents(all, scope, serving).map((i) => i.id)).toEqual(["A", "B", "C"]);
  });

  it("DEFAULT-DENY : sans affectation, rien ; affecté à une entité qui ne sert rien, rien", () => {
    expect(v.filterIncidents(all, v.scopeOf("resp_hospital", {}), serving)).toHaveLength(0);
    expect(
      v.filterIncidents(all, v.scopeOf("resp_hospital", { hospital: "H9" }), serving),
    ).toHaveLength(0);
  });

  it("voit AUSSI les incidents de la RÉGION de son entité — ce qui s'y déclare le concerne", () => {
    const regionOf = (kind: string, id: string) => (kind === "hospital" && id === "H9" ? "Rabat-Salé-Kénitra" : undefined);
    const incs = [inc({ id: "A" }), inc({ id: "R", region: "Rabat-Salé-Kénitra", ll: RABAT }), inc({ id: "C" })];
    // H9 ne sert nulle part : seule la région de son établissement lui ouvre une opération.
    const scope = v.scopeOf("resp_hospital", { hospital: "H9" }, regionOf);
    expect(v.filterIncidents(incs, scope, serving).map((i) => i.id)).toEqual(["R"]);
    // H1 sert A et C, et son établissement est à Rabat : les trois.
    const scopeH1 = v.scopeOf("resp_hospital", { hospital: "H1" }, () => "Rabat-Salé-Kénitra");
    expect(v.filterIncidents(incs, scopeH1, serving).map((i) => i.id)).toEqual(["A", "R", "C"]);
    // Sans résolveur de région, la doctrine d'avant : les opérations servies seulement.
    expect(v.filterIncidents(incs, v.scopeOf("resp_hospital", { hospital: "H1" }), serving).map((i) => i.id)).toEqual(["A", "C"]);
  });

  it("le responsable d'abri voit la région de son abri et l'opération où il est déployé — pas le pays", () => {
    const regionOf = (kind: string, id: string) => (kind === "shelter" && id === "AB-1" ? "Casablanca-Settat" : undefined);
    const incs = [inc({ id: "A" }), inc({ id: "R", region: "Rabat-Salé-Kénitra", ll: RABAT }), inc({ id: "T", region: "Tanger-Tétouan-Al Hoceïma" })];
    expect(v.filterIncidents(incs, v.scopeOf("resp_shelter", { shelter: "AB-1" }, regionOf), noServing).map((i) => i.id)).toEqual(["A"]);
    expect(v.filterIncidents(incs, v.scopeOf("resp_shelter", { shelter: "AB-1", incident: "T" }, regionOf), noServing).map((i) => i.id)).toEqual(["A", "T"]);
    // DEFAULT-DENY : sans abri ni déploiement, rien.
    expect(v.filterIncidents(incs, v.scopeOf("resp_shelter", {}, regionOf), noServing)).toHaveLength(0);
  });
});

describe("canSeeIncident — la garde du dashboard d'incident", () => {
  const v = new VisibilityService();
  it("un OPCOM ne peut pas ouvrir le dashboard d'une AUTRE opération", () => {
    const scope = v.scopeOf("opcom", { incident: "INC-A" });
    expect(v.canSeeIncident(inc({ id: "INC-A" }), scope, noServing)).toBe(true);
    expect(v.canSeeIncident(inc({ id: "INC-B" }), scope, noServing)).toBe(false);
  });
});
