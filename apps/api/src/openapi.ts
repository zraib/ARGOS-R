import { DocumentBuilder } from "@nestjs/swagger";

/** Métadonnées OpenAPI de l'API ARGOS (contract-first). */
export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle("ARGOS API")
    .setDescription("API du poste de commandement ARGOS — Phase 0/1 : IAM/RBAC (default-deny), audit chaîné, feature flags.")
    .setVersion("0.1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearer")
    .addTag("health", "Sondes de disponibilité")
    .addTag("auth", "Authentification")
    .addTag("iam", "Identités, rôles et permissions")
    .addTag("audit", "Journal d'audit inviolable")
    .addTag("flags", "Feature flags")
    .build();
}
