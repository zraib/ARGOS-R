import { describe, expect, it } from "vitest";
import { fromLocalInput, isAnonymous, missingFields, personName, toLocalInput, victimsOf, whenShort } from "@/lib/victims";
import type { IncidentVictim, MortuaryRecord } from "@/lib/types";

const v = (id: string, extra: Partial<IncidentVictim> = {}): IncidentVictim => ({
  id, incidentId: "INC-1", kind: "dead", sex: "unknown", createdAt: `2026-09-15T0${id.length}:00:00Z`, updatedAt: "", by: "x", ...extra,
});

describe("bilan des victimes — lectures d'écran", () => {
  it("nomme ce qui est connu, dit ce qui ne l'est pas", () => {
    expect(personName({ lastName: "Alaoui", firstName: "Karim" })).toBe("Alaoui Karim");
    expect(personName({ firstName: " Sara " })).toBe("Sara");
    expect(personName({})).toBeNull();
    expect(isAnonymous({ cni: "AB1" })).toBe(false);
    expect(isAnonymous({ sex: "m", age: 40 })).toBe(true);
    expect(whenShort("2026-09-15T06:30:00Z")).toMatch(/^15\/09 \d{2}:\d{2}$/);
    expect(whenShort(undefined)).toBeNull();
    expect(whenShort("n'importe quoi")).toBeNull();
  });

  it("fait l'aller-retour entre un instant ISO et un champ datetime-local", () => {
    const iso = "2026-09-15T06:30:00.000Z";
    const local = toLocalInput(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalInput(local)).toBe(iso);
    expect(fromLocalInput("")).toBeUndefined();
    expect(toLocalInput(undefined)).toBe("");
  });

  it("classe les décédés affectés en premier et liste ce que la morgue doit encore confirmer", () => {
    const liste = [v("a"), v("bb", { recordId: "DVI-9" }), v("ccc", { kind: "injured" })];
    expect(victimsOf(liste, "dead").map((x) => x.id)).toEqual(["bb", "a"]);
    expect(victimsOf(liste, "injured")).toHaveLength(1);
    const rec = { id: "r", mid: "M1", reference: "R", status: "in_progress", samples: [], admittedAt: "", updatedAt: "", lastName: "X", sex: "m" } as MortuaryRecord;
    expect(missingFields(rec)).toEqual(["cni", "age", "deathAt", "method"]);
    expect(missingFields({ ...rec, cni: "A", age: 3, deathAt: "2026-09-15T00:00:00Z", idMethod: "dna" })).toEqual([]);
  });
});
