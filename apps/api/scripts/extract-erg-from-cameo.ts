/* eslint-disable no-console */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { importDir, IMPORT_FORMAT, STAGING_DIR, type SubstanceImportFile } from "@/modules/nrbc/infrastructure/substance-import";
import { SUBSTANCES } from "@/modules/nrbc/infrastructure/substances.data";
import type { ErgDistances, Substance } from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — extraire les DISTANCES ERG de la base CAMEO Chemicals de bureau
//
//   npm run nrbc:extract-erg -- "/chemin/vers/CAMEO CHEMICALS"
//
// CE QUI EST EXTRAIT, ET CE QUI NE L'EST PAS. La base `cameo.sqlite` livrée avec
// l'application de bureau mélange des jeux de statuts JURIDIQUES DIFFÉRENTS :
//
//   EXTRAIT — table 1 et table 3 de l'ERG, guides orange, numéros ONU.
//     L'Emergency Response Guidebook est une publication conjointe du PHMSA
//     (US DOT), de Transports Canada et du SCT, distribuée GRATUITEMENT aux
//     services de secours. Il ne figure dans aucune des organisations que les
//     conditions de CAMEO nomment.
//
//   NON EXTRAIT — les fiches (`chemicals`), les numéros CAS (`chemical_cas`,
//     propriété de Chemical Abstracts Service), les données de protection
//     DuPont (`dupont`), les seuils AEGL (`aegls`) et ERPG (`erpgs`).
//     Les conditions sont explicites : « Data from the above organizations
//     shall not be duplicated by the recipient, without written permission from
//     those organizations. » Posséder l'application ne donne pas ce droit.
//
// Ce script ne LIT rien d'autre que les tables ERG. Ce n'est pas une précaution
// de façade : c'est ce qui rend l'extraction défendable.
//
// LE PIRE CAS EST RETENU. La table 3 ventile le grand déversement par CONTENANT
// (wagon-citerne, camion, bouteilles — un facteur 6 entre les extrêmes) et par
// force de vent. ARGOS ne porte qu'une valeur : on prend le wagon-citerne par
// vent faible, la plus grande. Un état-major planifie sur l'enveloppe, pas sur
// l'optimisme — et une distance trop courte ne se découvre qu'une fois le
// périmètre posé.
// ============================================================================

const FEET_TO_M = 0.3048;
const MILES_TO_KM = 1.609344;

/** `"7.0+"` → 7.0. Les valeurs de l'ERG portent parfois un « + » de dépassement. */
function num(v: string): number | null {
  const n = Number.parseFloat(String(v).replace("+", "").trim());
  return Number.isFinite(n) ? n : null;
}

function distances(isolateFeet: string, dayMiles: string, nightMiles: string): ErgDistances | undefined {
  const i = num(isolateFeet);
  const d = num(dayMiles);
  const n = num(nightMiles);
  if (i === null || d === null || n === null) return undefined;
  return {
    isolationM: Math.round(i * FEET_TO_M),
    protectDayKm: Math.round(d * MILES_TO_KM * 100) / 100,
    protectNightKm: Math.round(n * MILES_TO_KM * 100) / 100,
  };
}

function query<T>(db: string, sql: string): T[] {
  const out = execFileSync("sqlite3", ["-json", "-readonly", db, sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.trim() ? (JSON.parse(out) as T[]) : [];
}

interface Table1Row {
  unna_id: number;
  name: string;
  small_isolate_feet: string;
  small_protect_day_miles: string;
  small_protect_night_miles: string;
  large_isolate_feet: string;
  large_protect_day_miles: string;
  large_protect_night_miles: string;
  guide: string | null;
}

interface Table3Row {
  unna_id: number;
  isolate_feet: string;
  night_low_miles: string;
  day_low_miles: string;
}

function main() {
  const bundle = process.argv[2];
  if (!bundle) {
    console.error('Usage : npm run nrbc:extract-erg -- "/chemin/vers/CAMEO CHEMICALS"');
    process.exit(2);
  }
  const db = resolve(bundle, "Resources/server/CAMEOChemicalsServer/_internal/cameo.sqlite");
  if (!existsSync(db)) {
    console.error(`Base introuvable : ${db}`);
    console.error("Attendu : le dossier Contents d'une application CAMEO Chemicals de bureau.");
    process.exit(2);
  }

  // Table 1 — un enregistrement par matière, avec son guide orange.
  const t1 = query<Table1Row>(
    db,
    `SELECT a.unna_id, a.name,
            a.small_isolate_feet, a.small_protect_day_miles, a.small_protect_night_miles,
            a.large_isolate_feet, a.large_protect_day_miles, a.large_protect_night_miles,
            (SELECT g.id FROM mm_unna_erg_guide m JOIN erg_guides g ON g.id = m.erg_guide_id
              WHERE m.unna_id = a.unna_id LIMIT 1) AS guide
       FROM unna_actiondistances a ORDER BY a.unna_id`,
  );

  // Table 3 — grand déversement des gaz TIH courants, PIRE CAS retenu :
  // wagon-citerne (le plus grand `isolate_feet`) par vent faible.
  const t3 = query<Table3Row>(
    db,
    `SELECT unna_id, isolate_feet, night_low_miles, day_low_miles
       FROM unna_table3 ORDER BY unna_id, CAST(REPLACE(isolate_feet,'+','') AS REAL) DESC`,
  );
  const worst = new Map<number, Table3Row>();
  for (const r of t3) if (!worst.has(r.unna_id)) worst.set(r.unna_id, r);

  // Réutiliser NOS identifiants quand le numéro ONU est déjà connu : la fusion
  // est champ par champ, donc la fiche opérationnelle française déjà rédigée
  // survit et se voit seulement compléter de ses distances.
  const idByUn = new Map(SUBSTANCES.map((s) => [s.un, s.id]));
  const labelByUn = new Map(SUBSTANCES.map((s) => [s.un, s.labels]));

  const seenUn = new Set<string>();
  const substances: Substance[] = [];

  for (const r of t1) {
    const un = String(r.unna_id);
    // La table 1 porte plusieurs orthographes d'une même matière (« Sulfur » /
    // « Sulphur ») sous le même numéro ONU. Une seule entrée par numéro : un
    // doublon ferait remonter la mauvaise fiche à la recherche par étiquette.
    if (seenUn.has(un)) continue;
    seenUn.add(un);

    const small = distances(r.small_isolate_feet, r.small_protect_day_miles, r.small_protect_night_miles);
    let large = distances(r.large_isolate_feet, r.large_protect_day_miles, r.large_protect_night_miles);
    const t3row = worst.get(r.unna_id);
    if (!large && t3row) large = distances(t3row.isolate_feet, t3row.day_low_miles, t3row.night_low_miles);
    // Les distances vont par paire : sans les deux, on n'en émet aucune.
    if (!small || !large) continue;

    const id = idByUn.get(un) ?? `un-${un}`;
    const known = labelByUn.get(un);
    substances.push({
      id,
      un,
      ergGuide: r.guide ? String(r.guide) : "111",
      // Les noms de la base sont en anglais. Pour les matières déjà décrites
      // dans ARGOS on garde NOS libellés ; pour les nouvelles, l'anglais dans
      // les trois langues — une traduction automatique de nom chimique serait
      // une invention, et le français reste à faire par l'état-major.
      labels: known ?? { fr: r.name, ar: r.name, en: r.name },
      state: "liquid",
      small,
      large,
      // Relevées sur l'ERG 2024 par extraction, pas saisies à la main.
      ergVerified: true,
    });
  }

  const file: SubstanceImportFile = {
    format: IMPORT_FORMAT,
    source: "ERG 2024, tables 1 et 3 — PHMSA / Transports Canada / SCT (extraites de CAMEO Chemicals 3.1.0)",
    retrievedAt: new Date().toISOString().slice(0, 10),
    authorization:
      "Emergency Response Guidebook — publication gouvernementale conjointe, diffusion libre aux services de secours. " +
      "AUCUNE donnée sous licence tierce n'est extraite : ni fiches CAMEO, ni numéros CAS, ni données DuPont, ni seuils AEGL/ERPG.",
    substances,
  };

  // Dans `data/`, ignoré par git : un extrait d'un jeu tiers ne doit pas
  // pouvoir être commité par inadvertance, même quand il est défendable.
  const staging = resolve(importDir(), STAGING_DIR);
  mkdirSync(staging, { recursive: true });
  const out = resolve(staging, "erg2024-extrait.json");
  writeFileSync(out, JSON.stringify(file, null, 2) + "\n");

  const nouvelles = substances.filter((s) => s.id.startsWith("un-")).length;
  console.log(`\n  ${out}\n`);
  console.log(`  ${substances.length} matières avec distances complètes`);
  console.log(`  ${substances.length - nouvelles} complètent une fiche existante, ${nouvelles} sont nouvelles`);
  console.log(`  ${worst.size} matières dont le grand déversement vient de la table 3 (pire cas retenu)\n`);
  console.log(`  Vérifier le fichier, puis :  npm run nrbc:import -- ${out}\n`);
}

main();
