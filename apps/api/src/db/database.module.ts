import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
      useFactory: (config: ConfigService): Db | null => {
        if (config.get<DbDriver>("dbDriver") !== "postgres") return null;
        return createDb(config.get<string>("databaseUrl") as string);
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
