import { describe, expect, it } from "vitest";
import { distanceKm, freePlaces, lastCustody, nearestSites, sortRegistry } from "@/lib/morgue";
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
