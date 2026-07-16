import type { Config } from "drizzle-kit";

/** Config Drizzle Kit — génère/applique les migrations depuis le schéma canonique. */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://argos:change-me-strong@localhost:5432/argos",
  },
} satisfies Config;
