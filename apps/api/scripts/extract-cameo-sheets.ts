/* eslint-disable no-console */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { importDir, IMPORT_FORMAT, STAGING_DIR, type SubstanceImportFile } from "@/modules/nrbc/infrastructure/substance-import";
import { SUBSTANCES } from "@/modules/nrbc/infrastructure/substances.data";
import type { Substance, SubstanceSheet } from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — extraire les FICHES de la base CAMEO Chemicals de bureau (lot N-3d)
//
//   npm run nrbc:extract-sheets -- "/chemin/vers/CAMEO CHEMICALS"
//
// CE QUI EST REPRIS. Le contenu rédactionnel des fiches : description,
// dangers pour la santé, premiers secours, incendie, lutte, intervention hors
// incendie, réactivité à l'air et à l'eau, profil chimique, dangers
// particuliers, consignes d'isolement, protection individuelle. Plus les
// propriétés physiques dont la SOURCE DÉCLARÉE est une agence publique :
// NTP, USCG, EPA, NIOSH, ICSC.
//
// CE QUI EST ÉCARTÉ, ET POURQUOI. Les conditions de CAMEO nomment les
// propriétaires de quatre jeux ; ils ne sont pas repris :
//
//   • `chemical_cas`  — numéros et synonymes CAS : Chemical Abstracts Service.
//   • `dupont`        — tenues de protection : DuPont.
//   • `aegls`         — seuils AEGL : National Advisory Committee for AEGLs.
//   • `erpgs`         — seuils ERPG : American Industrial Hygiene Association.
//   • toute propriété dont `*_source` vaut NFPA, et les colonnes `nfpa_*` :
//     National Fire Protection Association.
//
// Ce script ne SÉLECTIONNE jamais ces tables ni ces colonnes. Garder trente et
// un numéros CAS comme identifiants isolés est une chose ; recopier un registre
// de cinq mille en est une autre.
//
// Le champ `prot_clothing` EST repris : vérifié sur la base, aucune de ses
// 4 951 valeurs ne mentionne DuPont — ces données vivent dans la table séparée.
// ============================================================================

/** Sources écartées : leur propriétaire est nommé dans les conditions. */
const RESTRICTED_SOURCE = /NFPA/i;

const F_TO_C = (f: number) => Math.round(((f - 32) * 5) / 9);

function query<T>(db: string, sql: string): T[] {
  const out = execFileSync("sqlite3", ["-json", "-readonly", db, sql], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  return out.trim() ? (JSON.parse(out) as T[]) : [];
}

/** Nettoie l'indentation que la base conserve dans ses champs texte. */
function clean(v: string | null): string | undefined {
  if (!v) return undefined;
  const t = v
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t || undefined;
}

interface Row {
  id: number;
  name: string;
  description: string | null;
  health_haz: string | null;
  first_aid: string | null;
  fire_haz: string | null;
  fire_fight: string | null;
  non_fire_resp: string | null;
  prot_clothing: string | null;
  air_water_reactions: string | null;
  chemical_profile: string | null;
  special_hazards: string | null;
  isolation: string | null;
  synonyms: string;
  formulas: string;
  bp_value: number | null;
  bp_source: string | null;
  vd_value: number | null;
  vd_source: string | null;
  fp_value: number | null;
  fp_source: string | null;
  idlh_value: number | null;
  idlh_unit: string | null;
  idlh_source: string | null;
  uns: string | null;
  guide: string | null;
}

/** Identifiant stable, lisible, sans collision avec les nôtres. */
function slug(name: string, id: number): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base ? `cameo-${base}` : `cameo-${id}`;
}

function main() {
  const bundle = process.argv[2];
  if (!bundle) {
    console.error('Usage : npm run nrbc:extract-sheets -- "/chemin/vers/CAMEO CHEMICALS"');
    process.exit(2);
  }
  const db = resolve(bundle, "Resources/server/CAMEOChemicalsServer/_internal/cameo.sqlite");
  if (!existsSync(db)) {
    console.error(`Base introuvable : ${db}`);
    process.exit(2);
  }

  // AUCUNE jointure vers chemical_cas, dupont, aegls, erpgs. Les colonnes
  // nfpa_* ne sont pas sélectionnées non plus.
  const rows = query<Row>(
    db,
    `SELECT c.id, c.name, c.description, c.health_haz, c.first_aid, c.fire_haz, c.fire_fight,
            c.non_fire_resp, c.prot_clothing, c.air_water_reactions, c.chemical_profile,
            c.special_hazards, c.isolation, c.synonyms, c.formulas,
            c.bp_value, c.bp_source, c.vd_value, c.vd_source, c.fp_value, c.fp_source,
            c.idlh_value, c.idlh_unit, c.idlh_source,
            (SELECT group_concat(u.unna_id) FROM chemical_unna u WHERE u.chem_id = c.id) AS uns,
            (SELECT g.id FROM chemical_unna u
                JOIN mm_unna_erg_guide m ON m.unna_id = u.unna_id
                JOIN erg_guides g ON g.id = m.erg_guide_id
               WHERE u.chem_id = c.id LIMIT 1) AS guide
       FROM chemicals c ORDER BY c.name`,
  );

  // Nos identifiants priment quand le numéro ONU est déjà connu : la fusion
  // étant champ par champ, la fiche française rédigée survit et se voit
  // seulement complétée.
  const idByUn = new Map(SUBSTANCES.map((s) => [s.un, s.id]));
  const labelByUn = new Map(SUBSTANCES.map((s) => [s.un, s.labels]));

  const usedIds = new Set<string>();
  const usedUns = new Set<string>();
  const substances: Substance[] = [];
  let ecartesNfpa = 0;

  for (const r of rows) {
    const uns = (r.uns ?? "").split(",").filter(Boolean);
    const un = uns.find((u) => !usedUns.has(u));
    if (un) usedUns.add(un);

    const known = un ? idByUn.get(un) : undefined;
    let id = known ?? slug(r.name, r.id);
    if (!known && usedIds.has(id)) id = `${id}-${r.id}`;
    if (usedIds.has(id)) continue;
    usedIds.add(id);

    const keep = (v: number | null, src: string | null) => {
      if (v === null) return undefined;
      if (src && RESTRICTED_SOURCE.test(src)) {
        ecartesNfpa++;
        return undefined;
      }
      return v;
    };
    const bpF = keep(r.bp_value, r.bp_source);
    const fpF = keep(r.fp_value, r.fp_source);

    const sheet: SubstanceSheet = {
      appearance: clean(r.description) ?? r.name,
      behaviour: clean(r.air_water_reactions) ?? clean(r.chemical_profile) ?? "—",
      health: clean(r.health_haz) ?? "—",
      fire: clean(r.fire_haz) ?? "—",
      reactivity: clean(r.air_water_reactions) ?? clean(r.chemical_profile) ?? "—",
      ppe: clean(r.prot_clothing) ?? "—",
      vaporDensity: keep(r.vd_value, r.vd_source) ?? undefined,
      boilingPointC: bpF !== undefined ? F_TO_C(bpF) : undefined,
      flashPointC: fpF !== undefined ? F_TO_C(fpF) : undefined,
      firstAid: clean(r.first_aid),
      fireFighting: clean(r.fire_fight),
      nonFireResponse: clean(r.non_fire_resp),
      profile: clean(r.chemical_profile),
      specialHazards: clean(r.special_hazards),
      isolationAdvice: clean(r.isolation),
      // IDLH : NIOSH, agence fédérale. Repris seulement s'il est en ppm.
      idlhPpm: r.idlh_value !== null && r.idlh_unit === "ppm" ? r.idlh_value : undefined,
    };

    const label = (un && labelByUn.get(un)) ?? { fr: r.name, ar: r.name, en: r.name };
    substances.push({
      id,
      ...(un ? { un } : {}),
      ergGuide: r.guide ? String(r.guide) : "111",
      labels: label,
      synonyms: (r.synonyms || "").split("|").filter(Boolean).slice(0, 12),
      state: "liquid",
      sheet,
      // La fiche vient de la base, pas d'une saisie : elle EST confrontée à
      // CAMEO Chemicals, par construction.
      sheetVerified: true,
      ergVerified: false,
    });
  }

  const file: SubstanceImportFile = {
    format: IMPORT_FORMAT,
    source: "Fiches CAMEO Chemicals 3.1.0 (NOAA) — contenu NOAA/NTP/USCG/EPA/NIOSH/ICSC",
    retrievedAt: new Date().toISOString().slice(0, 10),
    authorization:
      "Contenu rédactionnel d'agences publiques. ÉCARTÉS, leurs propriétaires étant nommés dans les " +
      "conditions d'utilisation : numéros et synonymes CAS (Chemical Abstracts Service), tenues DuPont, " +
      "seuils AEGL (NACA), seuils ERPG (AIHA), cotations et propriétés de source NFPA.",
    substances,
  };

  const staging = resolve(importDir(), STAGING_DIR);
  mkdirSync(staging, { recursive: true });
  const out = resolve(staging, "cameo-fiches.json");
  writeFileSync(out, JSON.stringify(file) + "\n");

  const mo = (JSON.stringify(file).length / 1048576).toFixed(1);
  console.log(`\n  ${out}  (${mo} Mo)\n`);
  console.log(`  ${substances.length} fiches extraites sur ${rows.length} produits`);
  console.log(`  ${substances.filter((s) => s.un).length} rattachées à un numéro ONU`);
  console.log(`  ${ecartesNfpa} propriétés écartées (source NFPA)\n`);
  console.log(`  Écartés en bloc : chemical_cas, dupont, aegls, erpgs\n`);
  console.log(`  Vérifier, puis :  npm run nrbc:import -- ${out}\n`);
}

main();
