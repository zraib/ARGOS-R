import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// ============================================================================
// ARGOS — tests unitaires de l'application web
//
// `apps/web` n'avait AUCUN test. Avant toute refactorisation, ce filet couvre
// les modules PURS (moteurs de classement, analyseurs, dictionnaires i18n,
// règles de rôles) : ce sont eux qui portent des décisions, et ce sont eux
// qu'une découpe de fichiers risque de casser sans que l'écran le montre.
//
// Environnement `node` : aucun DOM simulé, aucune dépendance supplémentaire.
// Les composants sont vérifiés dans le navigateur (voir CONTEXT.md).
// ============================================================================
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Les tests ne doivent JAMAIS dépendre du réseau ni d'un serveur lancé.
    testTimeout: 5000,
  },
});
