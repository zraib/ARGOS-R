import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, type Db } from "@/db/client";
import type { DbDriver } from "@/config/configuration";
import { DEV_PERSIST, STATE_SNAPSHOT_DIR } from "@/common/dev-store";

/**
 * Dossier des migrations Drizzle (`apps/api/drizzle`). Cherché à côté du code
 * compilé (`dist/db` → `../../drizzle`) puis dans le répertoire courant : le
 * même binaire sert en développement (`nest start`) et dans l'image Docker,
 * où le dossier est copié à la racine de l'application.
 */
function migrationsFolder(): string | null {
  for (const candidate of [resolve(__dirname, "..", "..", "drizzle"), resolve(process.cwd(), "drizzle")]) {
    if (existsSync(resolve(candidate, "meta", "_journal.json"))) return candidate;
  }
  return null;
}

/** Ce que l'instantané JSON couvre — dit au démarrage pour qu'un déploiement sans persistance se voie. */
function snapshotNotice(): string {
  return DEV_PERSIST
    ? `domaine, comptes, missions et comptes rendus persistés en instantané JSON dans ${STATE_SNAPSHOT_DIR}`
    : "AUCUN instantané JSON : le domaine et les comptes seront PERDUS au redémarrage (STATE_SNAPSHOT=on pour les garder)";
}

/** Jeton d'injection du client Drizzle (null en mode in-memory). */
export const DRIZZLE = "DRIZZLE";

/**
 * Fournit le client Drizzle globalement. En `DB_DRIVER=memory`, la valeur est
 * `null` : aucune connexion Postgres n'est ouverte, l'API tourne sans base.
 */
@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<Db | null> => {
        const log = new Logger("Database");
        if (config.get<DbDriver>("dbDriver") !== "postgres") {
          log.log(`DB_DRIVER=memory — dépôts en mémoire ; ${snapshotNotice()}`);
          return null;
        }
        const url = config.get<string>("databaseUrl") as string;
        const db = createDb(url);
        // ÉCHOUER AU DÉMARRAGE, PAS À LA PREMIÈRE REQUÊTE. Une base injoignable
        // découverte sur un 500 en pleine conduite est le pire moment ; ici le
        // processus refuse de partir et dit pourquoi — sans jamais imprimer
        // le mot de passe de l'URL de connexion.
        try {
          await db.execute(sql`select 1`);
        } catch (e) {
          const hote = url.replace(/\/\/[^@]*@/, "//");
          throw new Error(`Base PostgreSQL injoignable (${hote}) : ${(e as Error).message}. Vérifier DATABASE_URL ou repasser DB_DRIVER=memory.`);
        }
        // MIGRATIONS AU DÉMARRAGE. Le schéma est versionné dans `drizzle/` ;
        // l'appliquer ici rend le déploiement reproductible d'un seul
        // `docker compose up`, sans étape manuelle qu'on oublie sur la station.
        // Idempotent : Drizzle tient un journal des migrations déjà passées.
        const folder = migrationsFolder();
        if (folder) {
          await migrate(db, { migrationsFolder: folder });
          log.log(`Migrations Drizzle appliquées depuis ${folder}`);
        } else {
          log.warn("Dossier de migrations Drizzle introuvable : schéma supposé à jour (npm run db:migrate)");
        }
        log.log(`DB_DRIVER=postgres — connexion vérifiée (audit, flags, bons de travail en base) ; ${snapshotNotice()}`);
        return db;
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
