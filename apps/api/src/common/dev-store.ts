import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// ============================================================================
// ARGOS — instantané JSON sur disque : la persistance de tout ce qui n'est pas
// encore en base
//
// Les dépôts du domaine (incidents, unités, hôpitaux, abris, comptes IAM,
// missions, comptes rendus, types d'incident, alertes sismiques, météo) sont
// in-memory en Phase 1 ; seuls l'audit, les drapeaux de fonctionnalité et les
// bons de travail ont un dépôt Drizzle (DB_DRIVER=postgres). Cet utilitaire
// écrit et relit un instantané JSON par module pour que l'état SURVIVE aux
// redémarrages — sur le poste du développeur comme sur la station déployée.
//
// QUI DÉCIDE. `STATE_SNAPSHOT` tranche explicitement :
//   - `on`  : persistance active, quels que soient NODE_ENV et DB_DRIVER — c'est
//             le réglage du DÉPLOIEMENT (deploy/), où le dossier est un volume
//             Docker. Avec DB_DRIVER=postgres, les modules qui ont un dépôt
//             Drizzle n'appellent pas cet utilitaire : pas de double écriture.
//   - `off` : jamais (tests, ou base complète le jour où tout y sera).
//   - absent : le réglage historique — actif en mémoire, hors production et
//             hors tests. `DEV_PERSIST` reste lu, pour compatibilité.
// Sans `STATE_SNAPSHOT=on`, un déploiement en NODE_ENV=production perdrait
// TOUT le domaine à chaque redémarrage sans qu'aucun message ne le dise :
// c'est exactement le cas que ce réglage rend impossible à ignorer.
//
// - Dossier (défaut) : <cwd>/.dev-data (git-ignoré) — réglable via DEV_DATA_DIR
//   (le déploiement monte un volume sur /data).
// - Réinitialiser : supprimer le dossier.
// ============================================================================

const DATA_DIR = process.env.DEV_DATA_DIR ?? resolve(process.cwd(), ".dev-data");

const NODE_ENV = process.env.NODE_ENV ?? "development";

/** Lecture du réglage explicite : `on`, `off`, ou rien. */
function explicitSetting(): "on" | "off" | undefined {
  const raw = (process.env.STATE_SNAPSHOT ?? process.env.DEV_PERSIST ?? "").trim().toLowerCase();
  return raw === "on" || raw === "off" ? raw : undefined;
}

/**
 * Persistance active : explicitement demandée, sinon le réglage historique —
 * mode mémoire, hors production ET hors tests (isolation des specs).
 */
export const DEV_PERSIST = (() => {
  const explicit = explicitSetting();
  if (explicit) return explicit === "on";
  return (process.env.DB_DRIVER ?? "memory") === "memory" && NODE_ENV !== "production" && NODE_ENV !== "test";
})();

/** Où l'instantané est écrit — pour le dire au démarrage et dans la santé. */
export const STATE_SNAPSHOT_DIR = DATA_DIR;

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
