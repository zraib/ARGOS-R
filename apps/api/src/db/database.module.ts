import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import type { DbDriver } from "@/config/configuration";

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
          log.log("DB_DRIVER=memory — dépôts en mémoire, instantané JSON de développement");
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
        log.log("DB_DRIVER=postgres — connexion vérifiée (audit, flags, bons de travail persistés en base)");
        return db;
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
