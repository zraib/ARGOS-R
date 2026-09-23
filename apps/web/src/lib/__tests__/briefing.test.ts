import { describe, expect, it } from "vitest";
import { briefingRoot, briefingText, buildBriefing } from "@/lib/briefing";
import type { Hospital, Incident, IncidentPost, SubIncidentCatalog, Unit } from "@/lib/types";

// ADR 0032 — le briefing couvre l'incident principal, ses rattachés et leurs sous-incidents.

const root = {
  id: "INC-1", type: "earthquake", titre: "Séisme d'Al Haouz", region: "Marrakech-Safi", sev: "high", st: "prog", time: "06:40",
  x: 0, y: 0, ll: [-8.24, 31.22], declaredAt: "2026-09-23T06:40:00Z",
  casualties: { dead: 3, injured: 12, missing: 4 },
  responders: { units: ["U1", "U2"], hospitals: ["H4"], morgues: ["M2"] },
  subIncidents: [{ id: "INC-1-S1", type: "gas_leak", sev: "medium", time: "07:00", note: "Conduite rompue", casualties: { dead: 0, injured: 2, missing: 0 } }],
  assignments: [
    { unitId: "U1", destination: "pco", by: "o.chraibi", at: "2026-09-23T07:00:00Z", deployedAt: "2026-09-23T07:30:00Z" },
    { unitId: "U2", destination: "pct", by: "o.chraibi", at: "2026-09-23T07:05:00Z" },
  ],
  actionsLog: [
    { id: "INC-1-A1", at: "2026-09-23T07:10:00Z", event: "Effondrement d'une école", action: "Section de sauvetage-déblaiement engagée", by: "c.pct", createdAt: "2026-09-23T07:12:00Z" },
    { id: "INC-1-A2", at: "2026-09-23T08:00:00Z", event: "Route RP2010 coupée", action: "Déviation par Amizmiz", by: "l.pct", createdAt: "2026-09-23T08:02:00Z" },
  ],
} as unknown as Incident;

const child = {
  id: "INC-2", parentId: "INC-1", type: "landslide", titre: "Glissement de Talat N'Yaaqoub", region: "Marrakech-Safi", sev: "medium", st: "open", time: "07:30",
  x: 0, y: 0, ll: [-8.18, 30.98], casualties: { dead: 1, injured: 0, missing: 0 }, responders: { units: ["U2"], hospitals: [] },
} as unknown as Incident;

const other = { id: "INC-9", type: "flood", titre: "Crue hors famille", region: "Rabat", sev: "low", st: "open", time: "", x: 0, y: 0, ll: [0, 0], casualties: { dead: 50, injured: 0, missing: 0 } } as unknown as Incident;

const units = [
  { id: "U1", nom: "3e Bataillon du Génie", ville: "Marrakech", cmdt: "—", corps: "far", eff: 120, dispo: "deployed" },
  { id: "U2", nom: "Compagnie de Protection civile", ville: "Marrakech", cmdt: "—", corps: "dgpc", eff: 40, dispo: "deployed" },
] as unknown as Unit[];
const hospitals = [{ id: "H4", nom: "Hôpital Militaire Avicenne", lits: 420, occ: 388 }] as unknown as Hospital[];
const posts = [{ id: "P1", incidentId: "INC-1", kind: "pct", ll: [-8.2, 31.2], createdBy: "c.pct", createdAt: "", updatedAt: "" }] as IncidentPost[];
const subCatalog: SubIncidentCatalog = {
  types: [
    { id: "gas_leak", labels: { fr: "Fuite de gaz", ar: "", en: "" } },
    { id: "aftershock", labels: { fr: "Réplique", ar: "", en: "" } },
  ] as unknown as SubIncidentCatalog["types"],
  byParent: { earthquake: ["gas_leak", "aftershock"] },
};

function brief() {
  return buildBriefing({
    root, incidents: [root, child, other], units, hospitals, fieldHosps: [], posts, subCatalog,
    typeLabel: (t) => ({ earthquake: "Séisme", landslide: "Glissement de terrain", flood: "Inondation" })[t] ?? t,
    now: new Date("2026-09-23T09:00:00Z"),
  });
}

describe("briefing opérationnel (ADR 0032)", () => {
  it("la situation somme le bilan de l'incident, de ses rattachés et de leurs aléas — et rien d'autre", () => {
    const b = brief();
    expect(b.scope).toEqual({ children: 1, subIncidents: 1 });
    expect(b.situation.join("\n")).toContain("4 décès, 14 blessé(s), 4 disparu(s)");
    expect(b.situation.join("\n")).toContain("Glissement de terrain « Glissement de Talat N'Yaaqoub »");
    expect(b.situation.join("\n")).toContain("Fuite de gaz — Conduite rompue");
    expect(b.situation.join("\n")).toContain("2 unité(s), 160 personnel(s)");
    expect(b.situation.join("\n")).not.toContain("Crue hors famille");
    // Les dernières actions entreprises, de la plus récente à la plus ancienne.
    const derniere = b.situation.find((l) => l.startsWith("Dernières actions entreprises"))!;
    expect(derniere.indexOf("Déviation par Amizmiz")).toBeLessThan(derniere.indexOf("Section de sauvetage-déblaiement engagée"));
  });

  it("l'anticipation nomme les aléas possibles non déclarés, les disparus et la capacité hospitalière", () => {
    const b = brief();
    expect(b.anticipation.join("\n")).toContain("Aléas secondaires possibles, non déclarés : Réplique");
    expect(b.anticipation.join("\n")).not.toContain("possibles, non déclarés : Fuite de gaz");
    expect(b.anticipation.join("\n")).toContain("4 disparu(s)");
    expect(b.anticipation.join("\n")).toContain("32 lit(s) libre(s) sur 420 (92 % occupés) — saturation proche");
  });

  it("les objectifs partent des vies, puis de la nature du séisme et du glissement rattaché", () => {
    const b = brief();
    expect(b.objectives[0]).toBe("Sauver les vies : 14 blessé(s) à prendre en charge, 4 disparu(s) à rechercher.");
    expect(b.objectives.join("\n")).toContain("sauvetage-déblaiement");
    expect(b.objectives.join("\n")).toContain("Évacuer et interdire la zone instable.");
    expect(b.objectives.join("\n")).toContain("défunts");
  });

  it("le concept d'opération dit le commandement, les corps, les affectations et la coordination", () => {
    const b = brief();
    expect(b.concept[0]).toBe("Commandement : PCT déployé(s) sur la carte.");
    expect(b.concept.join("\n")).toContain("FAR 1, Protection civile 1");
    expect(b.concept.join("\n")).toContain("PCO 1, PCT 1 ; 1 déployée(s)");
    expect(b.concept.at(-1)).toContain("« Séisme d'Al Haouz »");
  });

  it("le texte suit les quatre rubriques ; un rattaché renvoie à son incident principal", () => {
    const txt = briefingText(brief(), { situation: "Situation", anticipation: "Anticipation", objectives: "Objectifs", concept: "Concept d'opération" });
    expect(txt.split("\n\n").map((b) => b.split("\n")[0])).toEqual(["BRIEFING — INC-1 « Séisme d'Al Haouz »", "SITUATION", "ANTICIPATION", "OBJECTIFS", "CONCEPT D'OPÉRATION"]);
    expect(briefingRoot([root, child], "INC-2")?.id).toBe("INC-1");
    expect(briefingRoot([root, child], "INC-1")?.id).toBe("INC-1");
  });
});
