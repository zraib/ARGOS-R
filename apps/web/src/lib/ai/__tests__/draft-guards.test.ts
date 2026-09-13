import { describe, expect, it } from "vitest";
import { getAllLexiconUnion, toponymsFromKeywords } from "@/lib/ai/draft";
import { keywordRecall } from "@/lib/ai/llmIncidentDraft";

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
