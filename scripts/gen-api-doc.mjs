#!/usr/bin/env node
// ============================================================================
// scripts/gen-api-doc.mjs — génère docs/03-api.md depuis le CODE
//
// Deux sources, croisées route par route :
//   1. apps/api/openapi.json — le contrat (méthodes, chemins, résumés, tags) ;
//   2. les contrôleurs NestJS — la PERMISSION exigée par chaque route
//      (@RequirePermission / @SelfService / @Public), que l'OpenAPI ne porte pas.
//
// Une documentation d'API écrite à la main ment au bout d'un mois ; celle-ci
// se régénère (`npm run docs:api`, qui régénère d'abord le contrat : openapi.json
// n'est pas versionné) et un test de cohérence peut la comparer.
// Sortie en français, identifiants inchangés.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const racine = path.resolve(new URL(".", import.meta.url).pathname, "..");
const openapi = JSON.parse(fs.readFileSync(path.join(racine, "apps/api/openapi.json"), "utf8"));

// --- 1. permissions lues dans les contrôleurs (AST TypeScript) -------------------
// On lit les décorateurs par l'arbre syntaxique, pas par expression régulière :
// leur ordre varie, des commentaires s'y glissent, @ApiOperation s'étale sur
// plusieurs lignes. L'AST ne s'en soucie pas.
const require = createRequire(path.join(racine, "apps/api/package.json"));
const ts = require("typescript");

const controleurs = [];
const marcher = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) marcher(p);
    else if (e.name.endsWith(".controller.ts")) controleurs.push(p);
  }
};
marcher(path.join(racine, "apps/api/src/modules"));

/** route normalisée → { acces, fichier } */
const acces = new Map();
const normaliser = (prefixe, chemin) => {
  const brut = ["api", prefixe, chemin].filter(Boolean).join("/").replace(/\/+/g, "/").replace(/\/$/, "");
  return "/" + brut.replace(/^\/+/, "").replace(/:(\w+)/g, "{$1}");
};
const VERBES = { Get: "GET", Post: "POST", Put: "PUT", Patch: "PATCH", Delete: "DELETE", Sse: "GET" };
const nomDeco = (d) => (ts.isCallExpression(d.expression) ? d.expression.expression.getText() : d.expression.getText());
const arg0 = (d) => (ts.isCallExpression(d.expression) && d.expression.arguments[0] && ts.isStringLiteral(d.expression.arguments[0]) ? d.expression.arguments[0].text : "");
for (const f of controleurs) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.ES2022, true);
  ts.forEachChild(sf, (n) => {
    if (!ts.isClassDeclaration(n)) return;
    const decosClasse = ts.getDecorators(n) ?? [];
    const ctrl = decosClasse.find((d) => nomDeco(d) === "Controller");
    const prefixe = ctrl ? arg0(ctrl) : "";
    for (const m of n.members) {
      if (!ts.isMethodDeclaration(m)) continue;
      const decos = ts.getDecorators(m) ?? [];
      const noms = decos.map(nomDeco);
      const verbe = decos.find((d) => VERBES[nomDeco(d)]);
      if (!verbe) continue;
      let a = "**sans garde explicite**";
      const perm = decos.find((d) => nomDeco(d) === "RequirePermission");
      if (perm) a = `\`${arg0(perm)}\``;
      else if (noms.includes("SelfService")) a = "authentifié (soi-même)";
      else if (noms.includes("Public")) a = "**publique**";
      acces.set(`${VERBES[nomDeco(verbe)]} ${normaliser(prefixe, arg0(verbe))}`, { acces: a, fichier: path.relative(racine, f) });
    }
  });
}

// --- 2. le contrat, tag par tag -------------------------------------------------
const TITRES = {
  health: "Santé — `/api/health`",
  auth: "Authentification — `/api/auth`",
  iam: "Identité et habilitations — `/api/iam`",
  flags: "Feature flags — `/api/flags`",
  audit: "Audit — `/api/audit`",
  domain: "Domaine opérationnel — incidents, unités, hôpitaux, abris, morgue, équipement, référence",
  "incident-dashboard": "Tableau de bord d'incident — `/api/incidents/{id}/dashboard`",
  missions: "Missions — la boucle fermée (ADR 0007)",
  orders: "Bons de travail — `/api/orders`",
  nrbc: "Capacité NRBC — substances et panache (ADR 0005)",
  aviation: "Suivi aérien — ADS-B (ADR 0004)",
  tracking: "Traceurs GPS — FMC920 (ADR 0008)",
  comms: "Communications — canaux, messages, temps réel, pièces jointes",
};
const ORDRE = Object.keys(TITRES);
const parTag = new Map();
for (const [chemin, ops] of Object.entries(openapi.paths)) {
  for (const [verbe, op] of Object.entries(ops)) {
    if (!["get", "post", "put", "patch", "delete"].includes(verbe)) continue;
    const tag = op.tags?.[0] ?? "autres";
    (parTag.get(tag) ?? parTag.set(tag, []).get(tag)).push({ verbe: verbe.toUpperCase(), chemin, op });
  }
}
const tags = [...ORDRE.filter((t) => parTag.has(t)), ...[...parTag.keys()].filter((t) => !ORDRE.includes(t))];

let total = 0, sansGarde = [];
const lignes = [];
lignes.push(`# Référence API

> **Document généré** par \`npm run docs:api\` à partir de \`apps/api/openapi.json\`
> et des décorateurs des contrôleurs. Ne pas éditer à la main : modifier le
> code, puis régénérer.

Monolithe modulaire NestJS. Base : \`http://localhost:3005/api\` ·
documentation interactive (Swagger) : \`http://localhost:3005/api/docs\`.

## Règles d'accès

- Toute route exige un jeton porteur (\`Authorization: Bearer <jwt>\`) sauf
  celles marquées **publique**.
- La colonne **Accès** est la permission \`ressource:action\` exigée par la
  garde \`PermissionsGuard\` (défaut-refus). Sans cette permission : **403** ;
  sans jeton : **401**. « authentifié (soi-même) » (\`@SelfService()\`) désigne
  les routes qui n'agissent que sur la session appelante.
- Les permissions sont résolues côté serveur à partir de la matrice
  \`shared/permissions.ts\` (voir [Sécurité](04-securite.md)). Le test
  \`authz-coverage.spec.ts\` refuse toute route sans l'un de ces trois marqueurs.
`);
for (const tag of tags) {
  const ops = parTag.get(tag).sort((a, b) => a.chemin.localeCompare(b.chemin) || a.verbe.localeCompare(b.verbe));
  lignes.push(`\n## ${TITRES[tag] ?? tag}\n`);
  lignes.push("| Méthode | Route | Accès | Rôle |");
  lignes.push("| --- | --- | --- | --- |");
  for (const { verbe, chemin, op } of ops) {
    total++;
    const cle = `${verbe} ${chemin}`;
    const a = acces.get(cle);
    const accesTexte = a?.acces ?? "**non retrouvé dans les contrôleurs**";
    if (!a || a.acces.startsWith("**sans")) sansGarde.push(cle);
    const resume = (op.summary ?? op.description ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
    lignes.push(`| \`${verbe}\` | \`${chemin}\` | ${accesTexte} | ${resume} |`);
  }
}
lignes.push(`
## Exemple de bout en bout

\`\`\`bash
TOK=$(curl -s -X POST http://localhost:3005/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"matricule":"m.zraib","password":"<mot de passe du compte de démonstration>"}' \\
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s http://localhost:3005/api/orders/summary -H "Authorization: Bearer $TOK"
\`\`\`

## Chiffres

${Object.keys(openapi.paths).length} chemins · ${total} opérations · ${tags.length} groupes.

## Modifier le contrat

1. Modifier le contrôleur (décorateurs \`@ApiOperation\`, \`@RequirePermission\`).
2. \`npm run openapi --prefix apps/api\` — régénère \`apps/api/openapi.json\`.
3. \`npm run generate --prefix packages/api-client\` — régénère le client TypeScript
   consommé par \`apps/web\` (contrat d'abord : jamais de \`fetch\` écrit à la main).
4. \`npm run docs:api\` — régénère ce document.
`);
fs.writeFileSync(path.join(racine, "docs/03-api.md"), lignes.join("\n"));
console.log(`docs/03-api.md : ${total} opérations, ${tags.length} groupes`);
if (sansGarde.length) {
  console.error("Routes sans garde retrouvée :\n  " + sansGarde.join("\n  "));
  process.exitCode = 1;
}
