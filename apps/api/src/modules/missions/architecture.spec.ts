import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// ARGOS — test d'architecture du module « missions »
//
// L'inversion des dépendances n'est pas une intention, c'est une contrainte
// vérifiable. Ce test lit le code source et échoue si une couche interne se
// met à dépendre d'une couche externe — par exemple si quelqu'un importait
// NestJS dans le domaine « juste pour dépanner ».
//
// Règle de dépendance (de l'extérieur vers l'intérieur, jamais l'inverse) :
//   http / infrastructure  →  application  →  ports  →  domain
// ============================================================================

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

/**
 * Code d'un fichier, COMMENTAIRES RETIRÉS.
 *
 * Sans cela, une règle qui cherche `HttpException` se déclenche sur le
 * commentaire qui explique précisément qu'on n'en utilise pas — un test qui
 * accuse la documentation de ce qu'elle interdit ne prouve rien.
 */
function codeOf(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/** Spécificateurs de tous les `import` d'un fichier. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

const files = sourceFiles(MODULE_DIR);
const inLayer = (layer: string) => files.filter((f) => f.includes(`/missions/${layer}/`));

describe("Architecture du module missions — règle de dépendance", () => {
  it("le module contient bien les quatre couches", () => {
    expect(inLayer("domain").length).toBeGreaterThan(0);
    expect(inLayer("ports").length).toBeGreaterThan(0);
    expect(inLayer("application").length).toBeGreaterThan(0);
    expect(inLayer("infrastructure").length).toBeGreaterThan(0);
    expect(inLayer("http").length).toBeGreaterThan(0);
  });

  it("le DOMAINE n'importe rien d'autre que lui-même", () => {
    for (const file of inLayer("domain")) {
      for (const spec of importsOf(file)) {
        expect({ file, spec }).toMatchObject({ spec: expect.stringMatching(/^@\/modules\/missions\/domain\//) });
      }
    }
  });

  it("les PORTS ne dépendent que du domaine", () => {
    for (const file of inLayer("ports")) {
      for (const spec of importsOf(file)) {
        expect({ file, spec }).toMatchObject({
          spec: expect.stringMatching(/^@\/modules\/missions\/(domain|ports)\//),
        });
      }
    }
  });

  it("l'APPLICATION ne connaît ni HTTP, ni infrastructure, ni base de données", () => {
    for (const file of inLayer("application")) {
      for (const spec of importsOf(file)) {
        expect(spec).not.toMatch(/\/infrastructure\//);
        expect(spec).not.toMatch(/\/http\//);
        expect(spec).not.toMatch(/drizzle|pg|postgres/i);
      }
    }
  });

  it("le DOMAINE et l'APPLICATION ignorent qu'ils sont exposés en HTTP", () => {
    for (const file of [...inLayer("domain"), ...inLayer("application")]) {
      // `@nestjs/common` est toléré dans l'application pour la seule
      // injection (`@Injectable`, `@Inject`) — jamais pour des exceptions HTTP.
      expect(codeOf(file)).not.toMatch(/HttpException|NotFoundException|ForbiddenException|BadRequestException/);
    }
  });

  it("le DOMAINE ne dépend pas de NestJS du tout", () => {
    for (const file of inLayer("domain")) {
      expect(codeOf(file)).not.toMatch(/@nestjs\//);
    }
  });
});
