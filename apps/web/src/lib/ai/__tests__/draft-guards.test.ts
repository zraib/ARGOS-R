import { describe, expect, it } from "vitest";
import { getAllLexiconUnion, toponymsFromKeywords } from "@/lib/ai/draft";
import { keywordRecall, sanitizeDraft } from "@/lib/ai/llmIncidentDraft";

// ============================================================================
// Les gardes du brouillon LLM — ce qui décide qu'une réponse est gardée
//
// Mesuré sur ce poste avant ces règles : le modèle répondait juste et vite
// (« Crue oued Mohammedia — Maisons inondées ») et sa réponse était jetée —
// une puce-phrase comptée comme un seul mot, puis un chevauchement exigé avec
// le gabarit déterministe qu'aucune phrase naturelle n'atteint.
// ============================================================================

describe("rappel des mots-clés", () => {
  it("compte les mots de l'opérateur repris par la réponse, puce-phrase comprise", () => {
    expect(keywordRecall("Crue oued Mohammedia — Maisons inondées", ["crue oued Mohammedia maisons inondées"])).toBe(1);
    expect(keywordRecall("Inondation à Mohammedia", ["crue", "oued", "Mohammedia", "maisons inondées"])).toBeCloseTo(1 / 5);
    // Accents et casse ne comptent pas ; les mots de moins de trois lettres non plus.
    expect(keywordRecall("SEISME a AL HAOUZ", ["séisme", "Al Haouz"])).toBe(1);
  });
  it("sans mot-clé, rien à reprendre : la garde laisse passer", () => {
    expect(keywordRecall("n'importe quoi", [])).toBe(1);
  });
});

describe("lieux confirmés parmi les puces", () => {
  it("une puce courte qui ressemble à un lieu est gardée entière ; une phrase se lit mot à mot", () => {
    expect(toponymsFromKeywords(["Al Haouz", "Sidi Bennour"])).toEqual(["Al haouz", "Sidi bennour"]);
    const phrase = toponymsFromKeywords(["crue oued Mohammedia maisons inondées"]);
    expect(phrase).toContain("Mohammedia");
    expect(phrase.some((t) => t.split(" ").length > 3)).toBe(false);
  });
  it("le vocabulaire métier n'est jamais un lieu", () => {
    expect(toponymsFromKeywords(["séisme", "maisons effondrées", "routes coupées"])).toEqual([]);
  });
});

describe("lexique métier", () => {
  it("existe, est normalisé, et sert de liste blanche au nettoyeur", () => {
    const lex = getAllLexiconUnion();
    expect(lex.size).toBeGreaterThan(300);
    expect(lex.has("seisme")).toBe(true);
    expect(lex.has("inondation")).toBe(true);
  });
});

describe("nettoyage S1", () => {
  it("reconnaît ses propres mots malgré les accents : une description fidèle n'est pas un repli", () => {
    const parsed = { title: "Carambolage sur l'autoroute A7 à Berrechid", desc: "Un carambolage est signalé sur l'autoroute A7 à Berrechid. Plusieurs blessés sont constatés et présents sur les lieux." };
    const r = sanitizeDraft(parsed, ["carambolage", "autoroute A7", "Berrechid", "plusieurs blessés"], "GABARIT T", "GABARIT D", { lexiconWhiteList: getAllLexiconUnion() });
    expect(r.triggered).toBe(false);
    expect(r.desc).toBe(parsed.desc);
  });
  it("un chiffre que l'opérateur n'a pas saisi est retiré ; une action opérationnelle inventée force le gabarit", () => {
    const r = sanitizeDraft({ title: "Crue à Mohammedia", desc: "Une crue est signalée à Mohammedia. Un périmètre de sécurité est mis en place." }, ["crue", "Mohammedia"], "GABARIT T", "GABARIT D", { lexiconWhiteList: getAllLexiconUnion() });
    expect(r.triggered).toBe(true);
    expect(r.desc).toBe("GABARIT D");
  });
});

describe("dictionnaire des lieux", () => {
  it("« oued » n'est pas un lieu parce que « oued zem » en est un ; « Tanger Med » en est un", () => {
    expect(toponymsFromKeywords(["oued", "crue"])).toEqual([]);
    expect(toponymsFromKeywords(["Tanger Med"])).toEqual(["Tanger med"]);
  });
});
