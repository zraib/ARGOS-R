// Configuration typée chargée depuis l'environnement (12-factor).
export type AuthMode = "keycloak" | "dev";
export type DbDriver = "memory" | "postgres";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  authMode: AuthMode;
  devSecret: string;
  keycloak: { issuer: string; audience: string; jwksUri: string };
  corsOrigins: string[];
  dbDriver: DbDriver;
  databaseUrl: string;
}

export default function configuration(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  // Mode d'authentification : Keycloak (RS256/JWKS) en production, mode dev
  // (HS256 + secret local) sinon — pour tester sans dépendre du serveur Keycloak.
  const authMode = (process.env.AUTH_MODE as AuthMode) ?? (nodeEnv === "production" ? "keycloak" : "dev");
  const issuer = process.env.KEYCLOAK_ISSUER ?? "http://localhost:8080/realms/argos";
  return {
    port: parseInt(process.env.PORT ?? "4000", 10),
    nodeEnv,
    authMode,
    devSecret: process.env.AUTH_DEV_SECRET ?? "argos-dev-secret-change-me",
    keycloak: {
      issuer,
      audience: process.env.KEYCLOAK_AUDIENCE ?? "argos-api",
      jwksUri: `${issuer}/protocol/openid-connect/certs`,
    },
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3100").split(","),
    // Persistance : in-memory par défaut (Phase 0, sans base) ; postgres pour la
    // couche Drizzle réelle (voir infra/compose + src/db/schema.ts).
    dbDriver: (process.env.DB_DRIVER as DbDriver) ?? "memory",
    databaseUrl: process.env.DATABASE_URL ?? "postgres://argos:change-me-strong@localhost:5432/argos",
  };
}
