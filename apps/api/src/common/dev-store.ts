import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Logger } from "@nestjs/common";

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

// ---------------------------------------------------------------------------
// Ne rien perdre, ne rien écraser (ADR 0033)
//
// Une station ne doit JAMAIS voir ses données remplacées par un démarrage :
//   - l'ÉCRITURE est atomique : le JSON va dans `<nom>.json.tmp`, l'instantané
//     courant devient `<nom>.json.bak`, puis le temporaire prend sa place — une
//     coupure pendant l'écriture laisse toujours un fichier complet ;
//   - la LECTURE essaie l'instantané, puis sa copie de secours ; un fichier
//     illisible est MIS DE CÔTÉ (`<nom>.json.illisible-<horodatage>`), jamais
//     réécrit : même dans le pire des cas, les données restent sur le disque,
//     récupérables à la main ;
//   - à l'ARRÊT (docker stop, mise à jour), les écritures encore différées sont
//     vidées (`flushDevState`, appelé par le crochet d'arrêt de l'application).
// ---------------------------------------------------------------------------

const logger = new Logger("Instantanés");

function fileOf(name: string): string {
  return join(DATA_DIR, `${name}.json`);
}

/** Met de côté un fichier illisible, sans jamais l'écraser. */
function quarantine(file: string): void {
  const aside = `${file}.illisible-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    renameSync(file, aside);
    logger.error(`${basename(file)} illisible : mis de côté sous ${basename(aside)} (données conservées, à examiner)`);
  } catch {
    logger.error(`${basename(file)} illisible et impossible à déplacer — laissé en place`);
  }
}

/**
 * Relit un instantané ; sinon sa copie de secours ; sinon le repli (premier
 * démarrage, ou persistance off). Un fichier illisible n'est jamais écrasé.
 */
export function loadDevState<T>(name: string, fallback: T): T {
  if (!DEV_PERSIST) return fallback;
  const file = fileOf(name);
  for (const candidate of [file, `${file}.bak`]) {
    if (!existsSync(candidate)) continue;
    try {
      const data = JSON.parse(readFileSync(candidate, "utf8")) as T;
      if (candidate !== file) logger.warn(`${name} : instantané principal absent ou illisible — reprise de la copie de secours (${basename(candidate)})`);
      return data;
    } catch {
      quarantine(candidate);
    }
  }
  return fallback;
}

/** Écriture atomique : temporaire, l'ancien en copie de secours, puis renommage. */
function writeNow(name: string, data: unknown): void {
  const file = fileOf(name);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  if (existsSync(file)) renameSync(file, `${file}.bak`);
  renameSync(tmp, file);
}

const timers = new Map<string, NodeJS.Timeout>();
/** Ce qui attend d'être écrit, par instantané — vidé par `flushDevState` à l'arrêt. */
const pending = new Map<string, unknown>();

function flushOne(name: string): void {
  const t = timers.get(name);
  if (t) clearTimeout(t);
  timers.delete(name);
  if (!pending.has(name)) return;
  const data = pending.get(name);
  pending.delete(name);
  try {
    writeNow(name, data);
  } catch (e) {
    logger.error(`écriture de ${name}.json impossible : ${(e as Error).message}`);
  }
}

/** Écrit un instantané (débounce 150 ms pour coalescer les rafales d'écriture). */
export function saveDevState(name: string, data: unknown): void {
  if (!DEV_PERSIST) return;
  pending.set(name, data);
  const prev = timers.get(name);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => flushOne(name), 150);
  // Ne pas maintenir le process en vie juste pour un flush en attente.
  t.unref?.();
  timers.set(name, t);
}

/** Écrit tout de suite ce qui attend encore (arrêt de l'application). */
export function flushDevState(): void {
  for (const name of [...pending.keys()]) flushOne(name);
}
