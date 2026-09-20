import { describe, expect, it } from "vitest";
import { deployedOn, incidentChannelId, isOnline, isOnlineAs, responsibleOf, responsiblesOf } from "@/lib/responsibles";
import type { PresenceUser, Responsible } from "@/lib/types";

const list: Responsible[] = [
  { kind: "unit", entityId: "U2", role: "resp_unit", matricule: "s.bennani", nom: "Cdt. S. Bennani", grade: "Commandant" },
  { kind: "incident", entityId: "INC-2616", role: "tacom", matricule: "s.bennani", nom: "Cdt. S. Bennani", grade: "Commandant" },
  { kind: "hospital", entityId: "H2", role: "resp_hospital", matricule: "s.moutaouakil", nom: "Salma Moutaouakil" },
];
const online: PresenceUser[] = [{ matricule: "S.Bennani", role: "tacom", sessions: 2, since: "2026-09-10T08:00:00Z" }];

describe("qui tient quoi", () => {
  it("retrouve le titulaire d'une entité par nature et identifiant, sinon rien", () => {
    expect(responsibleOf(list, "unit", "U2")?.matricule).toBe("s.bennani");
    expect(responsibleOf(list, "hospital", "U2")).toBeUndefined();
    expect(responsibleOf(list, "shelter", "A1")).toBeUndefined();
  });
  it("ADR 0026 : TOUS les titulaires d'une entité, chacun une fois par rôle, dans l'ordre servi", () => {
    const deux: Responsible[] = [
      ...list,
      { kind: "unit", entityId: "U2", role: "resp_unit", matricule: "n.fassi", nom: "N. Fassi", grade: "Capitaine" },
      // Le même compte servi deux fois (deux rattachements du même rôle) ne fait qu'une ligne.
      { kind: "unit", entityId: "U2", role: "resp_unit", matricule: "S.BENNANI", nom: "Cdt. S. Bennani", grade: "Commandant" },
    ];
    expect(responsiblesOf(deux, "unit", "U2").map((r) => r.matricule)).toEqual(["s.bennani", "n.fassi"]);
    expect(responsiblesOf(deux, "unit", "U9")).toEqual([]);
    // Le premier titulaire reste celui de la légende.
    expect(responsibleOf(deux, "unit", "U2")?.matricule).toBe("s.bennani");
  });
  it("liste les postes déployés sur un incident", () => {
    expect(deployedOn(list, "INC-2616").map((r) => r.role)).toEqual(["tacom"]);
    expect(deployedOn(list, "INC-0000")).toEqual([]);
  });
  it("la présence se lit sur le matricule, sans égard à la casse", () => {
    expect(isOnline(online, "s.bennani")).toBe(true);
    expect(isOnline(online, "s.moutaouakil")).toBe(false);
  });
  it("connecté comme TACOM, un compte n'est pas en ligne comme cellule bleue", () => {
    expect(isOnlineAs(online, "s.bennani", "tacom")).toBe(true);
    expect(isOnlineAs(online, "s.bennani", "bluecell")).toBe(false);
    expect(isOnlineAs(online, "s.bennani", "resp_unit")).toBe(false);
  });
  it("le canal d'un incident suit la convention du serveur", () => {
    expect(incidentChannelId("INC-2616")).toBe("c-inc-2616");
  });
});
