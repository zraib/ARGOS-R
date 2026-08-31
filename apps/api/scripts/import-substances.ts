/* eslint-disable no-console */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  IMPORT_DIR,
  IMPORT_FILE,
  SubstanceImportError,
  validateImport,
} from "@/modules/nrbc/infrastructure/substance-import";
import { SUBSTANCES } from "@/modules/nrbc/infrastructure/substances.data";

// ============================================================================
// ARGOS — verser un référentiel de substances sous licence (lot N-3b)
//
//   npm run nrbc:import -- chemin/vers/erg2024.json
//
// Le fichier est VALIDÉ avant d'être installé : un tableur converti à la main
// se décale d'une colonne sans prévenir, et l'isolement du chlore devient celui
// de l'ammoniac. Rien n'est installé si quoi que ce soit cloche.
//
// Le fichier installé va dans `apps/api/data/` — ignoré par git. La donnée
// concédée reste sur la machine à laquelle elle a été concédée : un dépôt cloné
// ailleurs ne doit pas devenir le vecteur d'une redistribution non autorisée.
// ============================================================================

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage : npm run nrbc:import -- <fichier.json>");
    console.error(`Format attendu : voir docs/08-workflow-operationnel.md, § « verser un référentiel ».`);
    process.exit(2);
  }

  const path = resolve(process.cwd(), input);
  if (!existsSync(path)) {
    console.error(`Fichier introuvable : ${path}`);
    process.exit(2);
  }

  let file;
  try {
    file = validateImport(JSON.parse(readFileSync(path, "utf8")));
  } catch (e) {
    const msg = e instanceof SubstanceImportError ? e.message : (e as Error).message;
    console.error(`\n  REFUSÉ — ${msg}\n`);
    console.error("  Rien n'a été installé. Corrigez le fichier et relancez.\n");
    process.exit(1);
  }

  // Ce que l'import va CHANGER, dit avant de l'écrire : un référentiel de
  // sécurité ne se remplace pas en silence.
  const builtinIds = new Set(SUBSTANCES.map((s) => s.id));
  const remplacees = file.substances.filter((s) => builtinIds.has(s.id));
  const ajoutees = file.substances.length - remplacees.length;
  const avecDistances = file.substances.filter((s) => s.small && s.large).length;
  const ergVerifiees = file.substances.filter((s) => s.ergVerified).length;

  mkdirSync(IMPORT_DIR, { recursive: true });
  copyFileSync(path, resolve(IMPORT_DIR, IMPORT_FILE));

  console.log(`\n  ${basename(path)} → ${resolve(IMPORT_DIR, IMPORT_FILE)}\n`);
  console.log(`  source          ${file.source}`);
  console.log(`  relevé le       ${file.retrievedAt}`);
  console.log(`  détenu au titre ${file.authorization}\n`);
  console.log(`  ${file.substances.length} substances — ${ajoutees} ajoutée(s), ${remplacees.length} remplacée(s)`);
  console.log(`  ${avecDistances} avec distances, dont ${ergVerifiees} marquée(s) relevée(s) sur l'ERG\n`);
  if (remplacees.length > 0) {
    console.log(`  Remplacées : ${remplacees.map((s) => s.id).join(", ")}\n`);
  }
  console.log("  Redémarrez l'API pour charger le jeu.\n");
}

main();
