#!/usr/bin/env node
// ============================================================================
// scripts/contract-check.mjs — le contrat versionné suit-il le code ?
//
// Deux copies du contrat OpenAPI existent : l'EXPORT (`apps/api/openapi.json`,
// produit par le code, non versionné) et la copie VERSIONNÉE que consomment le
// client généré et la référence API (`packages/api-client/openapi.json`). Ce
// script exporte, compare, et échoue si elles divergent — c'est la vérification
// que le contrat commité est bien celui que l'API sert.
//
//   npm run contract:check   — vérifie (code de sortie 1 en cas de dérive)
//   npm run contract:sync    — exporte, copie, régénère les types du client
// ============================================================================
import { execSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";

const racine = path.resolve(new URL(".", import.meta.url).pathname, "..");
const exporte = path.join(racine, "apps/api/openapi.json");
const versionne = path.join(racine, "packages/api-client/openapi.json");
const sync = process.argv.includes("--sync");

execSync("npm run -s openapi --prefix apps/api", { cwd: racine, stdio: "inherit" });

const a = JSON.parse(readFileSync(exporte, "utf8"));
const b = JSON.parse(readFileSync(versionne, "utf8"));
const cheminsA = new Set(Object.keys(a.paths ?? {}));
const cheminsB = new Set(Object.keys(b.paths ?? {}));
const manquants = [...cheminsA].filter((p) => !cheminsB.has(p)).sort();
const enTrop = [...cheminsB].filter((p) => !cheminsA.has(p)).sort();
const identiques = JSON.stringify(a) === JSON.stringify(b);

if (identiques) {
  console.log(`contrat : ${cheminsA.size} chemins — la copie versionnée est à jour`);
} else {
  console.log(`contrat : DÉRIVE — export ${cheminsA.size} chemins, copie versionnée ${cheminsB.size}`);
  if (manquants.length) console.log("  absents de la copie versionnée :\n    " + manquants.join("\n    "));
  if (enTrop.length) console.log("  en trop dans la copie versionnée :\n    " + enTrop.join("\n    "));
  if (!manquants.length && !enTrop.length) console.log("  mêmes chemins, détails d'opérations ou de schémas différents");
}

if (sync) {
  copyFileSync(exporte, versionne);
  execSync("npm run -s generate", { cwd: path.join(racine, "packages/api-client"), stdio: "inherit" });
  copyFileSync(path.join(racine, "packages/api-client/src/openapi.d.ts"), path.join(racine, "apps/web/src/lib/api-client/openapi.d.ts"));
  console.log("contrat synchronisé : copie versionnée, types du client, copie du client web");
} else if (!identiques) {
  console.error("Le contrat versionné ne suit pas le code : lancer `npm run contract:sync` puis commiter.");
  process.exitCode = 1;
}
