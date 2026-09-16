import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { globSync } from "node:fs";

// ============================================================================
// COUVERTURE DES GARDES — chaque route déclare ce qu'elle exige, ou dit
// explicitement qu'elle n'exige rien.
//
// La garde RBAC laisse passer toute route sans `@RequirePermission`. Ce test
// transforme un audit fait une fois à la main en une exigence permanente : une
// route ajoutée sans permission ET sans `@SelfService()` casse la suite.
// C'est ainsi que les quatre routes ouvertes du centre de communication auraient
// été vues le jour même, et non des mois plus tard.
// ============================================================================

const RACINE = join(__dirname, "..");
const ROUTE = /@(Get|Post|Patch|Put|Delete|Sse)\(/;

function blocsDeRoute(source: string): { route: string; bloc: string }[] {
  // Un bloc = la suite de décorateurs qui précède un nom de méthode.
  const out: { route: string; bloc: string }[] = [];
  const re = /((?:^\s*@\w+\([^\n]*\)\s*\n)+)\s*(?:async\s+)?(\w+)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const bloc = m[1];
    const r = bloc.match(/@(Get|Post|Patch|Put|Delete|Sse)\((?:"([^"]*)")?\)/);
    if (r) out.push({ route: `${r[1].toUpperCase()} ${r[2] ?? ""} → ${m[2]}`, bloc });
  }
  return out;
}

describe("couverture des gardes", () => {
  const fichiers = globSync("**/*.controller.ts", { cwd: RACINE }).map((f) => join(RACINE, f));

  it("trouve les contrôleurs", () => {
    expect(fichiers.length).toBeGreaterThan(5);
  });

  it("chaque route porte @RequirePermission ou @SelfService — jamais le silence", () => {
    const manquantes: string[] = [];
    for (const f of fichiers) {
      for (const { route, bloc } of blocsDeRoute(readFileSync(f, "utf8"))) {
        if (!ROUTE.test(bloc)) continue;
        const ok = bloc.includes("@RequirePermission(") || bloc.includes("@SelfService()") || bloc.includes("@Public(");
        if (!ok) manquantes.push(`${relative(RACINE, f)} : ${route}`);
      }
    }
    expect(manquantes).toEqual([]);
  });

  it("@SelfService ne recouvre QUE le compte de l'appelant ou une référence publique", () => {
    // Liste blanche NOMMÉE : ajouter une route ici est une décision relue, pas un réflexe.
    const admises = new Set([
      "iam/iam.controller.ts : GET me → me",
      "iam/auth.controller.ts : GET profile → profile",
      "iam/auth.controller.ts : PATCH profile → updateProfile",
      "iam/auth.controller.ts : POST select-role → selectRole",
      "iam/auth.controller.ts : POST change-password → changePassword",
      "domain/http/dashboard.controller.ts : GET reference → reference",
      // Bascules d'administration (ADR 0015) : tout compte lit les drapeaux et la
      // matrice rôle → modules pour MASQUER ce que l'API refuse déjà. Rien de
      // sensible : quels modules sont ouverts, à qui.
      "flags/flags.controller.ts : GET  → all",
      "iam/users.controller.ts : GET role-features → roleFeatures",
      "iam/users.controller.ts : GET role-features/defaults → defaultRoleFeatures",
      // Partage de position par l'application (ADR 0008, révision) : un compte ne
      // lit et ne verse que SON partage — la propriété est vérifiée par le service.
      "tracking/http/tracking.controller.ts : GET trackers/mine → mine",
      "tracking/http/tracking.controller.ts : POST trackers/:id/position → share",
    ]);
    const vues: string[] = [];
    for (const f of fichiers) {
      for (const { route, bloc } of blocsDeRoute(readFileSync(f, "utf8"))) {
        if (bloc.includes("@SelfService()")) vues.push(`${relative(RACINE, f)} : ${route}`);
      }
    }
    // Jest n'a pas de second argument « message » : on rend la liste des écarts.
    expect(vues.filter((v) => !admises.has(v))).toEqual([]);
    expect(vues.length).toBe(admises.size);
  });
});
