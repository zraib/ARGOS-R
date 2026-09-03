import { describe, expect, it } from "vitest";
import { interpret } from "@/lib/ai/assistant";
import type { AiContext } from "@/lib/ai/assistant";
import type { Hospital, Incident, Unit } from "@/lib/types";

// ============================================================================
// Routeur de l'assistant — ce que les questions doivent atteindre
//
// Deux règles verrouillées ici : une question « hôpitaux de <ville> » ne
// répond QUE sur cette ville (elle partait sur le réseau national, ou sur les
// hôpitaux proches d'un incident que personne n'avait cité, parce que la
// ville est aussi une région d'incident) ; et un identifiant d'incident absent
// du catalogue reçoit une réponse négative explicite au lieu d'un repli qui
// laisse croire qu'il existe.
// ============================================================================

const hopital = (id: string, nom: string, ville: string, lits: number, occ: number): Hospital =>
  ({ id, nom, ville, kind: "civ_univ", lits, occ, rea: 20, reaOcc: 10, staff: 100, amb: 4, heli: 0, x: 0, y: 0, ll: [-8, 31.6] }) as Hospital;

const hospitals: Hospital[] = [
  hopital("H1", "CHU Mohammed VI", "Marrakech", 700, 560),
  hopital("H2", "Hôpital Militaire Avicenne", "Marrakech", 420, 386),
  hopital("H3", "CHU Ibn Rochd", "Casablanca", 716, 637),
  hopital("H4", "CHU Ibn Sina", "Rabat", 857, 797),
];

const incidents: Incident[] = [
  { id: "INC-2616", type: "earthquake", titre: "Séisme M5.9", region: "Marrakech-Safi", sev: "high", st: "prog", time: "06:42", ll: [-8.0, 31.2], x: 0, y: 0 } as Incident,
];

const units: Unit[] = [
  { id: "U1", nom: "1re unité", ville: "Marrakech", cmdt: "—", eff: 120, dispo: "ready", readiness: 90, x: 0, y: 0, ll: [-8.0, 31.63] } as Unit,
];

const ctx: AiContext = {
  incidents,
  movements: [],
  units,
  hospitals,
  equipment: [],
  orsec: {
    planLevel: 3, activatedAt: "—",
    casualties: { dead: 0, injured: 0, missing: 0, rescued: 0 },
    units: { engaged: 0, available: 1 }, personnel: { engaged: 0, available: 0 }, vehicles: { engaged: 0, available: 0 },
    hospitalLoad: 0, sheltersActive: 0, org: [], decisions: [], duty: [],
  },
};

describe("hôpitaux d'une ville", () => {
  it("« hôpitaux de Marrakech » ne répond que sur Marrakech, même si la ville est aussi une région d'incident", () => {
    const r = interpret("hôpitaux de Marrakech", ctx);
    expect(r.intent).toBe("hospitals_by_city");
    expect(r.hospitals?.map((h) => h.ville)).toEqual(["Marrakech", "Marrakech"]);
    expect(r.text).toContain("HÔPITAUX DE **Marrakech**");
    // Le total affiché est celui de la ville, pas celui du réseau national.
    expect(r.stats?.totalHospitals).toBe(2);
  });

  it("les autres formulations de ville passent par le même chemin", () => {
    expect(interpret("CHU de Casablanca", ctx).intent).toBe("hospitals_by_city");
    expect(interpret("liste des hôpitaux Rabat", ctx).hospitals?.map((h) => h.ville)).toEqual(["Rabat"]);
  });

  it("sans ville, la question reste sur le réseau national", () => {
    const r = interpret("état du réseau hospitalier", ctx);
    expect(r.intent).toBe("hospitals_status");
    expect(r.hospitals).toHaveLength(4);
  });

  it("avec un incident nommé, la question porte sur les hôpitaux les plus proches", () => {
    expect(interpret("hôpitaux les plus proches de INC-2616", ctx).intent).toBe("hospitals_nearest");
  });
});

describe("identifiant d'incident absent du catalogue", () => {
  it("est signalé comme introuvable au lieu d'un repli qui le laisserait croire existant", () => {
    for (const q of ["Détail de INC-9999", "Bilan humain INC-9999", "Analyse croisée INC-9999", "hôpitaux les plus proches de INC-9999"]) {
      const r = interpret(q, ctx);
      expect(r.text).toContain("INC-9999");
      expect(r.text).toContain("absent du catalogue");
      expect(r.incidents ?? []).toHaveLength(0);
    }
  });

  it("un identifiant existant répond normalement", () => {
    const r = interpret("Détail de INC-2616", ctx);
    expect(r.text).not.toContain("absent du catalogue");
    expect(r.incidents?.[0]?.id).toBe("INC-2616");
  });

  it("les suggestions ne citent que des identifiants du catalogue", () => {
    const r = interpret("Détail de INC-2616", ctx);
    const ids = JSON.stringify(r.suggestions ?? []).match(/INC-\d+/g) ?? [];
    expect(ids.every((id) => id === "INC-2616")).toBe(true);
  });
});
