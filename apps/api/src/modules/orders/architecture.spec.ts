// ============================================================================
// ARGOS — test d'architecture du module « bons de travail »
//
// L'inversion des dépendances n'est pas une intention, c'est une contrainte
// vérifiable. Ce test lit le code source et échoue si une couche interne se
// met à dépendre d'une couche externe — par exemple si quelqu'un importait
// `drizzle-orm` dans le service « juste pour dépanner ».
//
// Règle de dépendance (de l'extérieur vers l'intérieur, jamais l'inverse) :
//   http / infrastructure  →  application  →  ports  →  domain
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MODULE_DIR = join(__dirname);

/** Liste récursivement les fichiers `.ts` d'un dossier (hors specs). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) out.push(full);
  }
  return out;
}

/** Spécificateurs de tous les `import` d'un fichier. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

const files = sourceFiles(MODULE_DIR);
const inLayer = (layer: string) => files.filter((f) => f.includes(`/orders/${layer}/`));

describe("Architecture du module orders — règle de dépendance", () => {
  it("le module contient bien les quatre couches", () => {
    expect(inLayer("domain").length).toBeGreaterThan(0);
    expect(inLayer("ports").length).toBeGreaterThan(0);
    expect(inLayer("application").length).toBeGreaterThan(0);
    expect(inLayer("infrastructure").length).toBeGreaterThan(0);
  });

  it("le DOMAINE ne dépend de rien (ni framework, ni ports, ni infra)", () => {
    for (const file of inLayer("domain")) {
      for (const spec of importsOf(file)) {
        // Seuls les imports internes au domaine sont tolérés.
        expect(spec).toMatch(/^@\/modules\/orders\/domain\//);
      }
    }
  });

  it("les PORTS ne dépendent que du domaine", () => {
    for (const file of inLayer("ports")) {
      for (const spec of importsOf(file)) {
        expect(spec).toMatch(/^@\/modules\/orders\/(domain|ports)\//);
      }
    }
  });

  it("APPLICATION (OrderService) ne dépend d'aucune infrastructure", () => {
    const forbidden = [
      /^drizzle-orm/, /^pg$/, /^node:/, /\/db\//, /\/infrastructure\//, /\/http\//,
      /^@nestjs\/(?!common$)/, /class-validator/, /class-transformer/, /^@nestjs\/swagger/,
    ];
    for (const file of inLayer("application")) {
      for (const spec of importsOf(file)) {
        for (const bad of forbidden) {
          expect(spec).not.toMatch(bad);
        }
      }
    }
  });

  it("APPLICATION n'importe QUE le domaine, les ports et @nestjs/common", () => {
    for (const file of inLayer("application")) {
      for (const spec of importsOf(file)) {
        expect(spec === "@nestjs/common" || /^@\/modules\/orders\/(domain|ports|application)\//.test(spec)).toBe(true);
      }
    }
  });

  it("seule la racine de composition connaît les adaptateurs concrets", () => {
    const wiring = files.filter((f) => f.endsWith("orders.module.ts"));
    expect(wiring).toHaveLength(1);
    const others = files.filter((f) => !f.endsWith("orders.module.ts") && !f.includes("/infrastructure/"));
    for (const file of others) {
      for (const spec of importsOf(file)) {
        expect(spec).not.toMatch(/\/orders\/infrastructure\//);
      }
    }
  });
});
