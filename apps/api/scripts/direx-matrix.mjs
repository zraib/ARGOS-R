#!/usr/bin/env node
// Régénère `src/shared/direx.matrix.ts` depuis la grille `docs/matrice-roles-direx.csv`
// (ADR 0022). La grille se corrige dans le tableur ; ce script la reporte dans le code.
//   node scripts/direx-matrix.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = resolve(here, "../../../docs/matrice-roles-direx.csv");
const outPath = resolve(here, "../src/shared/direx.matrix.ts");
// Les rôles techniques et les chefs d'entité ont déjà leurs cellules dans la matrice classique.
const SKIP = new Set(["superadmin", "admin", "resp_unit", "resp_hospital", "resp_shelter", "resp_morgue"]);

const raw = readFileSync(csvPath, "utf8").replace(/^﻿/, "");
const rows = raw.split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.split(";"));
const ids = rows[2];
const out = [];
for (const r of rows.slice(3)) {
  const feature = r[0];
  const cells = [];
  ids.forEach((id, i) => {
    if (i < 2 || SKIP.has(id)) return;
    const v = r[i];
    if (!v) return;
    const code = { ALL: "ALL", AMV: "AMV", VM: "VM", V: "V" }[v];
    if (!code) throw new Error(`cellule inconnue « ${v} » (${feature} / ${id})`);
    cells.push(`${id}: ${code}`);
  });
  out.push(`  ${feature}: { ${cells.join(", ")} },`);
}
const ts = `// ============================================================================
// ARGOS — matrice du profil « direx » (ADR 0022) — FICHIER GÉNÉRÉ
//
// Source : docs/matrice-roles-direx.csv (la grille se corrige dans le tableur,
// puis :  node apps/api/scripts/direx-matrix.mjs). Ne pas éditer à la main.
// Un rôle absent d'une ligne n'a aucun droit sur la fonctionnalité.
// ============================================================================
import type { Feature } from "@/shared/permissions";
import type { Role } from "@/shared/profiles";

const V = "V", VM = "VM", AMV = "AMV", ALL = "AMRV";

export const DIREX_MATRIX: Record<Feature, Partial<Record<Role, string>>> = {
${out.join("\n")}
};
`;
writeFileSync(outPath, ts);
console.log(`direx.matrix.ts : ${out.length} lignes, source ${csvPath}`);
