import { describe, expect, it } from "vitest";
import { briefingHeader, briefingRoot, briefingSections, briefingText, buildBriefing, sectionsText } from "@/lib/briefing";
import { aiBriefingSections } from "@/lib/ai/llmBriefing";
import type { Hospital, Incident, IncidentPost, SubIncidentCatalog, Unit } from "@/lib/types";

// ADR 0032 — le briefing couvre l'incident principal, ses rattachés et leurs sous-incidents.

const root = {
  id: "INC-1", type: "earthquake", titre: "Séisme d'Al Haouz", region: "Marrakech-Safi", sev: "high", st: "prog", time: "06:40",
  x: 0, y: 0, ll: [-8.24, 31.22], declaredAt: "2026-09-23T06:40:00Z",
  casualties: { dead: 3, injured: 12, missing: 4, involved: 25 },
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
  actionsLog: [
    { id: "INC-2-A1", at: "2026-09-23T07:40:00Z", event: "Glissement sur la piste", action: "", by: "o.pct", createdAt: "2026-09-23T07:41:00Z" },
  ],
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
    // Les impliqués (ADR 0034) : dits à part, jamais dans le bilan des victimes.
    expect(b.situation.join("\n")).toContain("Personnes impliquées (ni blessées, ni disparues, ni décédées) : 25.");
    expect(b.situation.join("\n")).toContain("Glissement de terrain « Glissement de Talat N'Yaaqoub »");
    expect(b.situation.join("\n")).toContain("Fuite de gaz — Conduite rompue");
    expect(b.situation.join("\n")).toContain("2 unité(s), 160 personnel(s)");
    expect(b.situation.join("\n")).not.toContain("Crue hors famille");
    // Le journal a désormais sa propre rubrique : la situation ne le résume plus.
    expect(b.situation.some((l) => l.includes("actions entreprises"))).toBe(false);
  });

  it("les actions entreprises reprennent tout le journal de la famille, dans l'ordre chronologique (ADR 0034)", () => {
    const b = brief();
    expect(b.taken).toHaveLength(3);
    expect(b.taken[0]).toContain("Effondrement d'une école → Section de sauvetage-déblaiement engagée (c.pct).");
    // La ligne d'un incident rattaché le nomme ; une ligne sans action garde l'événement.
    expect(b.taken[1]).toContain("[INC-2] — Glissement sur la piste (o.pct).");
    expect(b.taken[2]).toContain("Route RP2010 coupée → Déviation par Amizmiz (l.pct).");
    // Sans journal, la rubrique le dit.
    const vide = buildBriefing({ root: { ...root, actionsLog: [] } as unknown as Incident, incidents: [], units, hospitals, fieldHosps: [], posts, subCatalog, typeLabel: (t) => t });
    expect(vide.taken).toEqual(["Aucune action consignée au journal de l'incident à ce stade."]);
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
    expect(b.objectives.join("\n")).toContain("Prendre en charge les 25 personne(s) impliquée(s)");
  });

  it("le concept d'opération dit le commandement, les corps, les affectations et la coordination", () => {
    const b = brief();
    expect(b.concept[0]).toBe("Commandement : PCT déployé(s) sur la carte.");
    expect(b.concept.join("\n")).toContain("FAR 1, Protection civile 1");
    expect(b.concept.join("\n")).toContain("PCO 1, PCT 1 ; 1 déployée(s)");
    expect(b.concept.at(-1)).toContain("« Séisme d'Al Haouz »");
  });

  it("les actions à entreprendre se déduisent de ce qui manque au dispositif, puis finissent par le journal (ADR 0034)", () => {
    const a = brief().actions;
    // Un PCT est posé et des unités sont engagées : ni « armer », ni « engager ».
    expect(a.some((x) => x.startsWith("Armer un poste de commandement"))).toBe(false);
    expect(a.some((x) => x.startsWith("Engager des unités"))).toBe(false);
    expect(a).toContain("Déployer sur le terrain 1 unité(s) affectée(s) qui ne le sont pas encore.");
    expect(a).toContain("Lancer la recherche des 4 disparu(s) ; recouper avec les hôpitaux et les abris.");
    expect(a).toContain("Anticiper la saturation hospitalière : hôpital de campagne ou report vers d'autres établissements.");
    expect(a.some((x) => x.startsWith("Affecter un site mortuaire"))).toBe(false);
    expect(a).toContain("Recenser les 25 personne(s) impliquée(s), les mettre à l'abri et organiser leur soutien.");
    expect(a).toContain("Surveiller les aléas possibles : Réplique.");
    expect(a.at(-1)).toBe("Consigner chaque action entreprise au journal de l'incident et diffuser un point de situation.");
    // Sans poste ni unité, sans morgue : les manques passent en tête.
    const nu = buildBriefing({
      root: { ...root, responders: { units: [], hospitals: [] }, assignments: [] } as unknown as Incident,
      incidents: [], units, hospitals, fieldHosps: [], posts: [], subCatalog, typeLabel: (t) => t,
    }).actions;
    expect(nu[0]).toBe("Armer un poste de commandement (PCT ou PCO) sur la carte et en désigner le chef.");
    expect(nu[1]).toBe("Engager des unités sur l'opération : aucune n'y est rattachée.");
    expect(nu).toContain("Désigner les établissements d'évacuation des 14 blessé(s).");
    expect(nu).toContain("Affecter un site mortuaire aux 3 décès et ouvrir les dossiers d'identification.");
  });

  it("le texte suit les six rubriques ; un rattaché renvoie à son incident principal", () => {
    const txt = briefingText(brief(), { situation: "Situation", taken: "Actions entreprises", anticipation: "Anticipation", objectives: "Objectifs", concept: "Concept d'opération", actions: "Actions à entreprendre" });
    expect(txt.split("\n\n").map((b) => b.split("\n")[0])).toEqual(["BRIEFING — INC-1 « Séisme d'Al Haouz »", "SITUATION", "ACTIONS ENTREPRISES", "ANTICIPATION", "OBJECTIFS", "CONCEPT D'OPÉRATION", "ACTIONS À ENTREPRENDRE"]);
    expect(txt).toContain("\n1. ");
    expect(briefingRoot([root, child], "INC-2")?.id).toBe("INC-1");
    expect(briefingRoot([root, child], "INC-1")?.id).toBe("INC-1");
  });
});

describe("briefing corrigé à la main (ADR 0037)", () => {
  const labels = { situation: "Situation", taken: "Actions entreprises", anticipation: "Anticipation", objectives: "Objectifs", concept: "Concept d'opération", actions: "Actions à entreprendre" };

  it("le calcul se reprend rubrique par rubrique : une puce par point, les actions à entreprendre numérotées", () => {
    const b = brief();
    const r = briefingSections(b);
    expect(r.situation.split("\n")[0]).toBe(`- ${b.situation[0]}`);
    expect(r.actions.split("\n")[1]).toBe(`2. ${b.actions[1]}`);
    // Le texte d'une version corrigée a la même forme que celui du calcul : copier, rédiger par l'IA, tout suit.
    expect(sectionsText(briefingHeader(b), r, labels)).toBe(briefingText(b, labels));
  });

  it("une version corrigée garde son texte tel quel sous les six titres", () => {
    const corrige = { ...briefingSections(brief()), concept: "PCT au stade.\nRelève à 20 h." };
    const txt = sectionsText("BRIEFING — INC-1 « Séisme d'Al Haouz »", corrige, labels);
    expect(txt).toContain("CONCEPT D'OPÉRATION\nPCT au stade.\nRelève à 20 h.");
    expect(txt.split("\n\n").map((bloc) => bloc.split("\n")[0]).slice(1)).toEqual(["SITUATION", "ACTIONS ENTREPRISES", "ANTICIPATION", "OBJECTIFS", "CONCEPT D'OPÉRATION", "ACTIONS À ENTREPRENDRE"]);
  });

  it("la rédaction de l'IA se range par TITRE, même dans le désordre ; une forme non tenue ne se range pas", () => {
    const redige = [
      "SITUATION", "Deux quartiers inondés.",
      "ANTICIPATION", "Montée des eaux cette nuit.",
      "ACTIONS ENTREPRISES", "14:05 — digue rompue, génie engagé.",
      "OBJECTIFS", "Mettre à l'abri.",
      "**Concept d’opération**", "PCT au stade.",
      "ACTIONS À ENTREPRENDRE", "1. Évacuer le quartier nord.",
    ].join("\n");
    const r = aiBriefingSections(redige);
    expect(r?.taken).toBe("14:05 — digue rompue, génie engagé.");
    expect(r?.anticipation).toBe("Montée des eaux cette nuit.");
    expect(r?.concept).toBe("PCT au stade.");
    expect(r?.actions).toBe("1. Évacuer le quartier nord.");
    expect(aiBriefingSections("SITUATION\nSeule rubrique.")).toBeNull();
  });
});
