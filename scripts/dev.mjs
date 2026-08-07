#!/usr/bin/env node
// ============================================================================
// ARGOS — lancement de la plateforme complète en développement
// Démarre l'API (NestJS, port 3005) ET l'application web (Next.js, port 3004)
// dans un seul terminal, avec les journaux préfixés. Installe les dépendances
// manquantes au premier lancement. AUCUNE dépendance externe (souveraineté) :
// uniquement les modules natifs de Node.
//
// Usage : npm run dev            (les deux)
//         npm run dev:api        (API seule)
//         npm run dev:web        (web seule)
// ============================================================================

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

// Couleurs ANSI (désactivées si la sortie n'est pas un terminal).
const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `[${code}m${s}[0m` : s);
const CYAN = (s) => c("36", s);
const GREEN = (s) => c("32", s);
const GRAY = (s) => c("90", s);
const BOLD = (s) => c("1", s);

/** Services lançables (nom, dossier, couleur du préfixe, URL affichée). */
const SERVICES = {
  api: { label: "api", dir: "apps/api", color: GREEN, url: "http://localhost:3005/api (docs : /api/docs)" },
  web: { label: "web", dir: "apps/web", color: CYAN, url: "http://localhost:3004" },
};

/** Dossiers dont les dépendances doivent être installées avant de démarrer. */
const WORKSPACES = ["packages/api-client", "apps/api", "apps/web"];

/** Installe les dépendances des espaces de travail qui n'en ont pas encore. */
function ensureDependencies() {
  const missing = WORKSPACES.filter((w) => !existsSync(join(ROOT, w, "node_modules")));
  if (missing.length === 0) return true;
  console.log(BOLD("\nPremier lancement — installation des dépendances :"));
  for (const w of missing) {
    console.log(GRAY(`  → npm install (${w})`));
    const r = spawnSync(NPM, ["install"], { cwd: join(ROOT, w), stdio: "inherit" });
    if (r.status !== 0) {
      console.error(`\nÉchec de l'installation dans ${w}. Corrigez l'erreur ci-dessus puis relancez.`);
      return false;
    }
  }
  console.log(GREEN("Dépendances installées.\n"));
  return true;
}

/** Démarre un service et préfixe chacune de ses lignes de journal. */
function start({ label, dir, color }) {
  const child = spawn(NPM, ["run", "dev"], {
    cwd: join(ROOT, dir),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = color(`[${label}]`);
  const pipe = (stream) => {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) console.log(`${prefix} ${line}`);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  return child;
}

const requested = process.argv.slice(2).filter((a) => a in SERVICES);
const names = requested.length > 0 ? requested : Object.keys(SERVICES);

if (!ensureDependencies()) process.exit(1);

console.log(BOLD("\nARGOS — poste de commandement (développement)"));
for (const n of names) console.log(`  ${SERVICES[n].color("●")} ${SERVICES[n].label.padEnd(3)} ${SERVICES[n].url}`);
console.log(GRAY("  Ctrl+C pour tout arrêter.\n"));

const children = names.map((n) => start(SERVICES[n]));

// Arrêt propre : Ctrl+C (ou fin d'un service) coupe l'ensemble.
let stopping = false;
const stopAll = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const ch of children) if (!ch.killed) ch.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
};

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

children.forEach((ch, i) => {
  ch.on("exit", (code) => {
    if (stopping) return;
    console.log(GRAY(`\n[${names[i]}] arrêté (code ${code ?? 0}) — arrêt de l'ensemble.`));
    stopAll(code ?? 0);
  });
});
