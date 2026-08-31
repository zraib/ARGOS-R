import { VisibilityService } from "@/modules/domain/visibility.service";
import { PLACE_ARME_RADIUS_KM } from "@/shared/responsibilities";
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

const cityLookup = (c: string) => ({ Casablanca: CASABLANCA, Rabat: RABAT }[c]);
const noServing = () => [];

describe("Portée — global", () => {
  const v = new VisibilityService();
  it.each(["superadmin", "admin", "strategic"] as const)("%s voit tout", (role) => {
    const scope = v.scopeOf(role, undefined, cityLookup);
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
    const scope = v.scopeOf("wali", { region: "Casablanca-Settat" }, cityLookup);
    expect(v.filterIncidents(all, scope, noServing).map((i) => i.id)).toEqual(["A", "C"]);
  });

  it("DEFAULT-DENY : un wali SANS région ne voit RIEN", () => {
    const scope = v.scopeOf("wali", {}, cityLookup);
    expect(v.filterIncidents(all, scope, noServing)).toHaveLength(0);
  });

  it("décision produit : les unités restent visibles au national", () => {
    const scope = v.scopeOf("wali", { region: "Casablanca-Settat" }, cityLookup);
    const units = [{ id: "U1", ll: RABAT }, { id: "U2", ll: CASABLANCA }] as never;
    expect(v.filterUnits(units, scope)).toHaveLength(2);
  });
});

describe("Portée — place d'armes : ce qu'elle peut atteindre", () => {
  const v = new VisibilityService();
  const scope = () => v.scopeOf("place_arme", { city: "Casablanca" }, cityLookup);

  it(`voit un incident à 24 km, pas un à 87 km (rayon ${PLACE_ARME_RADIUS_KM} km)`, () => {
    const all = [inc({ id: "PROCHE", ll: MOHAMMEDIA }), inc({ id: "LOIN", ll: RABAT })];
    expect(v.filterIncidents(all, scope(), noServing).map((i) => i.id)).toEqual(["PROCHE"]);
  });

  it("la zone ignore la frontière administrative : un incident d'une AUTRE région mais proche est visible", () => {
    // Mohammedia est dans Casablanca-Settat ; on force une autre région pour
    // prouver que c'est la DISTANCE qui décide, pas le libellé.
    const all = [inc({ id: "PROCHE", ll: MOHAMMEDIA, region: "Rabat-Salé-Kénitra" })];
    expect(v.filterIncidents(all, scope(), noServing)).toHaveLength(1);
  });

  it("restreint aussi les unités à la zone", () => {
    const units = [{ id: "U1", ll: MOHAMMEDIA }, { id: "U2", ll: RABAT }] as never;
    expect(v.filterUnits(units, scope()).map((u: { id: string }) => u.id)).toEqual(["U1"]);
  });

  it("DEFAULT-DENY : sans ville, ou ville inconnue, la zone est VIDE — pas le pays", () => {
    for (const a of [{}, { city: "Ville-Inexistante" }]) {
      const sc = v.scopeOf("place_arme", a, cityLookup);
      expect(v.filterIncidents([inc()], sc, noServing)).toHaveLength(0);
      expect(v.filterUnits([{ id: "U1", ll: CASABLANCA }] as never, sc)).toHaveLength(0);
    }
  });
});

describe("Portée — conduite déployée : son incident, un seul", () => {
  const v = new VisibilityService();
  const all = [inc({ id: "A" }), inc({ id: "B" }), inc({ id: "C" })];

  it.each(["opcom", "tacom", "bluecell", "greencell", "orangecell", "resp_shelter", "resp_equipment"] as const)(
    "%s ne voit que l'incident de son déploiement",
    (role) => {
      const scope = v.scopeOf(role, { incident: "B" }, cityLookup);
      expect(v.filterIncidents(all, scope, noServing).map((i) => i.id)).toEqual(["B"]);
    },
  );

  it("DEFAULT-DENY : non déployé = ne voit RIEN", () => {
    const scope = v.scopeOf("opcom", {}, cityLookup);
    expect(v.filterIncidents(all, scope, noServing)).toHaveLength(0);
  });
});

describe("Portée — responsable d'entité : plusieurs incidents à la fois", () => {
  const v = new VisibilityService();
  const all = [inc({ id: "A" }), inc({ id: "B" }), inc({ id: "C" })];
  // H1 sert A et C ; U9 ne sert rien.
  const serving = (id: string) => ({ A: ["H1", "U2"], B: ["U5"], C: ["H1"] }[id] ?? []);

  it("voit TOUS les incidents où son entité sert", () => {
    const scope = v.scopeOf("resp_hospital", { hospital: "H1" }, cityLookup);
    expect(v.filterIncidents(all, scope, serving).map((i) => i.id)).toEqual(["A", "C"]);
  });

  it("un compte cumulant deux responsabilités additionne ses périmètres", () => {
    const scope = v.scopeOf("resp_unit", { hospital: "H1", unit: "U5" }, cityLookup);
    expect(v.filterIncidents(all, scope, serving).map((i) => i.id)).toEqual(["A", "B", "C"]);
  });

  it("DEFAULT-DENY : sans affectation, rien ; affecté à une entité qui ne sert rien, rien", () => {
    expect(v.filterIncidents(all, v.scopeOf("resp_hospital", {}, cityLookup), serving)).toHaveLength(0);
    expect(
      v.filterIncidents(all, v.scopeOf("resp_hospital", { hospital: "H9" }, cityLookup), serving),
    ).toHaveLength(0);
  });
});

describe("canSeeIncident — la garde du dashboard d'incident", () => {
  const v = new VisibilityService();
  it("un OPCOM ne peut pas ouvrir le dashboard d'une AUTRE opération", () => {
    const scope = v.scopeOf("opcom", { incident: "INC-A" }, cityLookup);
    expect(v.canSeeIncident(inc({ id: "INC-A" }), scope, noServing)).toBe(true);
    expect(v.canSeeIncident(inc({ id: "INC-B" }), scope, noServing)).toBe(false);
  });
});
