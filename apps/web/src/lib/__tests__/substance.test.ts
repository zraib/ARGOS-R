import { describe, expect, it } from "vitest";
import { ALPHABET, indexLetter, pictogramFor } from "@/lib/nrbc/substance";

describe("bibliothèque des substances — helpers", () => {
  it("la lettre d'index ignore les accents et range le reste sous #", () => {
    expect(indexLetter("Éthylène")).toBe("E");
    expect(indexLetter("  chlore")).toBe("C");
    expect(indexLetter("1,1-dichloroéthane")).toBe("#");
    expect(indexLetter("")).toBe("#");
  });
  it("l'alphabet compte 26 lettres puis #", () => {
    expect(ALPHABET).toHaveLength(27);
    expect(ALPHABET[26]).toBe("#");
  });
  it("le pictogramme suit la classe ADR", () => {
    expect(pictogramFor({ hazardClass: "7" })).toBe("radioactive");
    expect(pictogramFor({ hazardClass: "6.2" })).toBe("biohazard");
    expect(pictogramFor({ hazardClass: "2.3" })).toBe("toxic");
    expect(pictogramFor({})).toBe("toxic");
  });
});
