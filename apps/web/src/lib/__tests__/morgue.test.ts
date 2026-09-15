import { describe, expect, it } from "vitest";
import { distanceKm, freePlaces, lastCustody, levelOf, nearestSites, sitesOfHospital, sortRegistry, sortSites, recordPatch } from "@/lib/morgue";
import type { MorgueSite, MortuaryRecord } from "@/lib/types";

const site = (id: string, ll?: [number, number], statut: MorgueSite["statut"] = "op"): MorgueSite => ({ id, nom: id, ville: "", capacity: 10, staff: 1, statut, ll });
const rec = (id: string, mid: string, extra: Partial<MortuaryRecord> = {}): MortuaryRecord => ({
  id, mid, reference: id, status: "unidentified", samples: [], admittedAt: "2026-09-15T08:00:00Z", updatedAt: "2026-09-15T08:00:00Z", ...extra,
});

describe("service morgue — calculs d'écran", () => {
  it("compte les places libres sans les restitués, et classe les sites ouverts du plus proche au plus loin", () => {
    const rabat = site("M1", [-6.85, 33.97]);
    const marrakech = site("M2", [-8.01, 31.65]);
    const ferme = site("M3", [-8.24, 31.22], "closed");
    const sans = site("M4");
    const records = [rec("a", "M1"), rec("b", "M1", { status: "released" }), rec("c", "M2")];
    expect(freePlaces(rabat, records)).toBe(9);
    expect(distanceKm(rabat.ll!, marrakech.ll!)).toBeGreaterThan(270);
    const depuisCasa: [number, number] = [-7.59, 33.57];
    const tries = nearestSites(depuisCasa, [marrakech, sans, rabat, ferme], records);
    expect(tries.map((x) => x.site.id)).toEqual(["M1", "M2", "M4"]);
    expect(tries[0].free).toBe(9);
    expect(tries[2].km).toBeNull();
  });

  it("préfère la morgue rattachée à l'établissement, puis la régionale de la région, puis la distance", () => {
    const rattachee = { ...site("MC", [-8.01, 31.65]), level: "city" as const, region: "Marrakech-Safi", hospitalId: "H4" };
    const regionale = { ...site("MR", [-8.0, 31.64]), level: "regional" as const, region: "Marrakech-Safi" };
    const autreVille = { ...site("MV", [-8.02, 31.66]), level: "city" as const, region: "Marrakech-Safi" };
    const loin = { ...site("ML", [-6.85, 33.97]), level: "regional" as const, region: "Rabat-Salé-Kénitra" };
    const mobileRepliee = { ...site("MM", [-8.0, 31.6]), kind: "mobile" as const, deployment: null };
    const depuisH4: [number, number] = [-8.0136, 31.6465];
    const ordre = nearestSites(depuisH4, [loin, autreVille, regionale, mobileRepliee, rattachee], [], { hospitalId: "H4", region: "Marrakech-Safi" });
    expect(ordre.map((x) => x.site.id)).toEqual(["MC", "MR", "MV", "ML"]);
    expect(ordre[0].attached).toBe(true);
    expect(levelOf(rattachee)).toBe("city");
    expect(levelOf(mobileRepliee)).toBe("mobile");
    expect(sortSites([autreVille, loin, regionale]).map((s) => s.id)).toEqual(["MR", "MV", "ML"]);
    expect(sitesOfHospital("H4", [rattachee, regionale, autreVille]).map((s) => s.id)).toEqual(["MC"]);
  });

  it("montre d'abord les réceptions en attente, puis les non identifiés, les restitués en dernier", () => {
    const liste = [
      rec("r1", "M1", { status: "released", updatedAt: "2026-09-15T09:00:00Z" }),
      rec("r2", "M1", { status: "identified" }),
      rec("r3", "M1", { pendingReceipt: true, status: "identified" }),
      rec("r4", "M1", { updatedAt: "2026-09-15T10:00:00Z" }),
      rec("r5", "M1", { updatedAt: "2026-09-15T07:00:00Z" }),
    ];
    expect(sortRegistry(liste).map((r) => r.id)).toEqual(["r3", "r4", "r5", "r2", "r1"]);
    expect(lastCustody(liste[0])).toBeNull();
    expect(lastCustody(rec("x", "M1", { custody: [{ at: "a", step: "hospital", by: "h" }, { at: "b", step: "transferred", by: "h" }] }))?.step).toBe("transferred");
  });
});

// ============================================================================
// Identification progressive — le patch ne porte que ce qui change ; rien
// n'est imposé ; vide reste « non renseigné ».
// ============================================================================
describe("recordPatch — ce qui change, et rien d'autre", () => {
  const rec: MortuaryRecord = {
    id: "DVI-1", mid: "M1", reference: "RBT-2026-001", status: "unidentified", samples: [], admittedAt: "2026-09-15T08:00:00Z", updatedAt: "2026-09-15T08:00:00Z",
    lastName: "Alaoui", sex: "m", deathAt: "2026-09-15T06:10:00.000Z",
  };
  const vide = { identity: { lastName: "Alaoui", firstName: "", cni: "", sex: "m" as const, age: "" }, deathAt: "", identifiedAt: "", method: "" as const, identifiedBy: "", note: "" };

  it("un formulaire relu tel quel n'envoie rien (l'heure locale du décès comprise)", () => {
    const local = new Date(rec.deathAt!);
    const pad = (n: number) => String(n).padStart(2, "0");
    const deathAt = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    expect(recordPatch(rec, { ...vide, deathAt })).toEqual({});
  });

  it("un détail à la fois : le prénom seul part, sans nom ni sexe imposés", () => {
    expect(recordPatch(rec, { ...vide, deathAt: "", identity: { ...vide.identity, firstName: "Karim" } })).toEqual({ firstName: "Karim", deathAt: "" });
  });

  it("effacer un champ l'envoie vide ; changer de mode et de statut se voit", () => {
    const p = recordPatch(rec, { ...vide, deathAt: "", identity: { ...vide.identity, lastName: "" }, method: "dna", note: "  ADN concordant ", status: "in_progress" });
    expect(p).toEqual({ lastName: "", deathAt: "", idMethod: "dna", note: "ADN concordant", status: "in_progress" });
    // Le statut courant redemandé n'est pas un changement.
    expect(recordPatch({ ...rec, status: "in_progress", deathAt: undefined }, { ...vide, status: "in_progress" })).toEqual({});
  });
});
