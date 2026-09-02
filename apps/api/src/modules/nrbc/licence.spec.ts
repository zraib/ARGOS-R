import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ============================================================================
// LICENCE CAMEO (registre R-13) — la règle, outillée.
//
// La bibliothèque de substances est extraite de CAMEO Chemicals sous une
// condition : ne JAMAIS reprendre les données de tiers redistribuées sous leur
// propre licence — numéros et synonymes CAS (`chemical_cas`), tenues de
// protection (`dupont`), seuils AEGL (`aegls`), ERPG (`erpgs`), et toute
// propriété sourcée NFPA (`nfpa_*`). Le script d'extraction les écarte ; ce
// test vérifie que rien de tout cela n'est entré dans le dépôt par une autre
// porte — jeu versionné, types, import, contrôleur.
// ============================================================================

const RACINE = resolve(__dirname);
const FICHIERS_SURVEILLES = [
  "infrastructure/substances.data.ts",
  "infrastructure/substance-import.ts",
  "infrastructure/in-memory-substances.repository.ts",
  "nrbc.types.ts",
  "nrbc.service.ts",
  "http/nrbc.controller.ts",
];
/** Motifs interdits : tables, colonnes et sources sous licence tierce. */
const INTERDITS: [string, RegExp][] = [
  ["table chemical_cas", /\bchemical_cas\b/i],
  ["table dupont", /\bdupont\b/i],
  ["seuils AEGL", /\baegls?\b/i],
  ["seuils ERPG", /\berpgs?\b/i],
  ["colonnes ou source NFPA", /\bnfpa(_\w+)?\b/i],
];

describe("Licence CAMEO — rien de sous licence tierce dans le dépôt", () => {
  it.each(FICHIERS_SURVEILLES)("%s ne contient aucun champ ou source interdit", (fichier) => {
    const texte = readFileSync(resolve(RACINE, fichier), "utf8")
      // Les commentaires qui NOMMENT l'interdit pour l'expliquer restent permis.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const trouves = INTERDITS.filter(([, re]) => re.test(texte)).map(([nom]) => nom);
    expect(trouves).toEqual([]);
  });

  it("les numéros CAS existants sont conservés — ni ajoutés, ni retirés (31)", () => {
    // Le champ `cas` du jeu versionné vient de la fiche publique de la substance,
    // pas de la table `chemical_cas` : il reste, et il ne grossit pas par elle.
    const texte = readFileSync(resolve(RACINE, "infrastructure/substances.data.ts"), "utf8");
    const cas = new Set([...texte.matchAll(/\bcas:\s*"(\d{2,7}-\d{2}-\d)"/g)].map((m) => m[1]));
    expect(cas.size).toBe(31);
  });
});
