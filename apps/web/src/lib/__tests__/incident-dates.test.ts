import { describe, expect, it } from "vitest";
import { compareIncidentDate, filterActiveIncidents, formatIncidentHour, formatIncidentTime, getIncidentDate, isActiveIncident } from "@/lib/derive";

// ============================================================================
// Dates d'incident — ce qui doit rester vrai quel que soit le format du champ
// `time` : jamais « Invalid Date », jamais une heure inventée, un tri stable.
// ============================================================================

describe("dates d'incident", () => {
  it("une heure seule vaut aujourd'hui à cette heure, et s'affiche telle quelle", () => {
    const d = getIncidentDate({ time: "07:12" });
    expect(d?.getHours()).toBe(7);
    expect(d?.getMinutes()).toBe(12);
    expect(formatIncidentHour({ time: "07:12" })).toMatch(/07:12/);
    expect(formatIncidentTime({ time: "07:12" })).toMatch(/07:12/);
  });

  it("un jour relatif « J-n » se place n jours avant et garde son étiquette dans les listes", () => {
    const d = getIncidentDate({ time: "J-2" });
    const attendu = new Date();
    attendu.setDate(attendu.getDate() - 2);
    expect(d?.toDateString()).toBe(attendu.toDateString());
    expect(formatIncidentHour({ time: "J-2" })).toBe("J-2");
    expect(formatIncidentHour({ time: "J-1 09:30" })).toMatch(/09:30/);
  });

  it("un horodatage ISO donne date et heure ; une chaîne quelconque n'est jamais une date", () => {
    expect(formatIncidentTime({ time: "2026-09-03T10:42:00" })).toMatch(/10:42/);
    expect(getIncidentDate({ time: "n'importe quoi" })).toBeNull();
    expect(formatIncidentHour({ time: "n'importe quoi" })).toBe("n'importe quoi");
    expect(formatIncidentHour({ time: "" })).toBe("—");
    expect(formatIncidentTime(null)).toBe("—");
  });

  it("les champs de repli sont lus dans l'ordre time → datetime → createdAt → updatedAt", () => {
    // Le format d'affichage suit la locale de l'exécution : on vérifie l'heure lue, pas sa mise en forme.
    expect(getIncidentDate({ time: "", createdAt: "2026-09-01T08:00:00" })?.getHours()).toBe(8);
    expect(getIncidentDate({ time: "", datetime: "2026-09-02T09:00:00", createdAt: "2026-09-01T08:00:00" })?.getHours()).toBe(9);
  });

  it("le tri va du plus récent au plus ancien, les valeurs sans date en fin de liste", () => {
    const liste = [{ id: "x", time: "inconnu" }, { id: "b", time: "06:30" }, { id: "a", time: "14:38" }, { id: "c", time: "J-1" }];
    expect([...liste].sort(compareIncidentDate).map((i) => i.id)).toEqual(["a", "b", "c", "x"]);
  });
});

describe("incident actif", () => {
  it("actif = non fermé et non archivé", () => {
    expect(isActiveIncident({ st: "open" })).toBe(true);
    expect(isActiveIncident({ st: "closed" })).toBe(false);
    expect(isActiveIncident({ st: "open", archived: true })).toBe(false);
    expect(isActiveIncident(null)).toBe(false);
    expect(filterActiveIncidents([{ st: "open" }, { st: "closed" }, { st: "prog", archived: true }])).toHaveLength(1);
  });
});
