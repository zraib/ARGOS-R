import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

export type Db = NodePgDatabase<typeof schema>;

/** Crée le client Drizzle (pool pg). Appelé uniquement si DB_DRIVER=postgres. */
export function createDb(url: string): Db {
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema });
}
