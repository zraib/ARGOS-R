import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// ============================================================================
// ARGOS — persistance dev (instantané JSON sur disque)
// En mode dev, les dépôts sont in-memory : l'état est perdu à chaque
// redémarrage — le compte fondateur repasse en « 1er login » (code ARGOS-2026)
// et les données de domaine sont réinitialisées. Cet utilitaire écrit/relit un
// instantané JSON pour que l'état SURVIVE aux redémarrages sur le poste du
// développeur, SANS base de données ni Docker.
//
// - Désactivable :         DEV_PERSIST=off
// - Ignoré (base réelle) : DB_DRIVER=postgres  ou  NODE_ENV=production
// - Dossier (défaut) :     <cwd>/.dev-data  (git-ignoré) — réglable via DEV_DATA_DIR
// - Réinitialiser :        supprimer le dossier .dev-data
// ============================================================================

const DATA_DIR = process.env.DEV_DATA_DIR ?? resolve(process.cwd(), ".dev-data");

/**
 * Persistance active : mode mémoire, hors production ET hors tests (isolation
 * des specs), non désactivée explicitement.
 */
const NODE_ENV = process.env.NODE_ENV ?? "development";
export const DEV_PERSIST =
  (process.env.DEV_PERSIST ?? "on").toLowerCase() !== "off" &&
  (process.env.DB_DRIVER ?? "memory") === "memory" &&
  NODE_ENV !== "production" &&
  NODE_ENV !== "test";

/** Relit un instantané ; renvoie le repli si absent / illisible / persistance off. */
export function loadDevState<T>(name: string, fallback: T): T {
  if (!DEV_PERSIST) return fallback;
  try {
    const file = join(DATA_DIR, `${name}.json`);
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const timers = new Map<string, NodeJS.Timeout>();

/** Écrit un instantané (débounce 150 ms pour coalescer les rafales d'écriture). */
export function saveDevState(name: string, data: unknown): void {
  if (!DEV_PERSIST) return;
  const prev = timers.get(name);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    try {
      const file = join(DATA_DIR, `${name}.json`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
    } catch {
      /* dev : on ignore les erreurs d'écriture disque */
    }
  }, 150);
  // Ne pas maintenir le process en vie juste pour un flush en attente.
  t.unref?.();
  timers.set(name, t);
}
