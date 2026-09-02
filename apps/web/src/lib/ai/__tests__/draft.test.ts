import { describe, expect, it } from "vitest";
import { pickDesc, pickTitle, extractToponymsFromTokens, type DescriptionProposalInput } from "@/lib/ai/draft";

// ============================================================================
// Moteur de brouillon d'incident (lib/ai/draft)
//
// Ce moteur PROPOSE un titre et une description à partir des mots-clés de
// l'opérateur. Deux promesses, et ce sont elles que l'on verrouille ici :
//   1. il n'INVENTE aucun fait — pas de magnitude, pas de bilan, pas de ville
//      que l'opérateur n'a pas saisie ;
//   2. il est REPRODUCTIBLE — même saisie, même salt, même texte ; c'est ce qui
//      rend « régénérer » compréhensible (le salt change, la règle non).
// ============================================================================

// Sans type d'incident, le moteur ne propose RIEN (chaîne vide) : c'est voulu,
// un titre sans type serait une devinette. Le jeu d'essai en fixe donc un.
const base: DescriptionProposalInput = {
  type: "seisme",
  titre: "",
  adresse: "",
  province: "Marrakech-Safi",
  ville: "Marrakech",
  pt: null,
  lang: "fr",
  incidentTypes: [
    { id: "seisme", labels: { fr: "Séisme", ar: "زلزال", en: "Earthquake" } } as never,
    { id: "inondation", labels: { fr: "Inondation", ar: "فيضان", en: "Flood" } } as never,
  ],
  keywords: "magnitude épicentre bâtiments endommagés",
};

describe("reproductibilité", () => {
  it("sans type d'incident, aucune proposition — plutôt rien qu'une devinette", () => {
    expect(pickTitle({ ...base, type: null }, 0)).toBe("");
    expect(pickDesc({ ...base, type: null }, 0)).toBe("");
  });

  it("même saisie, même salt : même titre et même description", () => {
    expect(pickTitle(base, 3)).toBe(pickTitle(base, 3));
    expect(pickDesc(base, 3)).toBe(pickDesc(base, 3));
  });

  it("le texte proposé n'est jamais vide", () => {
    for (const salt of [0, 1, 7]) {
      expect(pickTitle(base, salt).trim().length).toBeGreaterThan(0);
      expect(pickDesc(base, salt).trim().length).toBeGreaterThan(0);
    }
  });
});

describe("aucun fait inventé", () => {
  it("sans chiffre en entrée, aucun chiffre en sortie", () => {
    // Une magnitude « 6.2 » ou « 3 victimes » sortis de nulle part seraient
    // pris pour une information par le poste de commandement.
    for (const salt of [0, 1, 2, 5]) {
      expect(pickTitle(base, salt)).not.toMatch(/\d/);
      expect(pickDesc(base, salt)).not.toMatch(/\d/);
    }
  });

  it("les mots-clés sismiques orientent le titre vers le séisme", () => {
    expect(pickTitle(base, 0).toLowerCase()).toMatch(/s[ée]ism|secousse|tremblement/);
  });
});

describe("toponymes", () => {
  it("reconnaît une ville marocaine parmi les jetons, pas un mot ordinaire", () => {
    const t = extractToponymsFromTokens(["fuite", "Marrakech", "dense"]);
    expect(t).toContain("Marrakech");
    expect(t).not.toContain("dense");
  });
});
