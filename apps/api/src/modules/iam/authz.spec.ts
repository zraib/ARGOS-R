import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

/**
 * Gate de sécurité Phase 0 (MASTER_PLAN §7) : prouve que l'accès non autorisé
 * échoue (default-deny), que les permissions sont résolues côté serveur depuis
 * le rôle, et que la chaîne d'audit reste valide.
 */
describe("Authz — default-deny (gate de sécurité Phase 0)", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());

  const devToken = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("la sonde de santé est publique", async () => {
    await base().get("/api/health").expect(200);
  });

  it("refuse l'accès sans jeton (401)", async () => {
    await base().get("/api/iam/me").expect(401);
  });

  it("en production, aucun jeton de développement n'est émis — même en AUTH_MODE=dev (403)", async () => {
    // La station tourne en `AUTH_MODE=dev` ET en production : la route ne doit
    // pas y offrir un jeton de n'importe quel rôle sans mot de passe.
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await base().post("/api/auth/dev-token").send({ username: "x", role: "superadmin" }).expect(403);
    } finally {
      process.env.NODE_ENV = previous;
    }
    await base().post("/api/auth/dev-token").send({ username: "x", role: "superadmin" }).expect(201);
  });

  it("résout les permissions depuis le rôle (resp_unit)", async () => {
    const tok = await devToken("agent", "resp_unit");
    const res = await base().get("/api/iam/me").set("Authorization", `Bearer ${tok}`).expect(200);
    expect(res.body.role).toBe("resp_unit");
    // Dotation issue de la matrice : le Responsable Unité pilote SON unité,
    // voit l'annuaire et le parc, mais n'archive ni ne supprime rien.
    const perms: string[] = res.body.permissions;
    expect(perms).toEqual(expect.arrayContaining(["units:view", "units:create", "units:update", "teams:view", "equipment:view"]));
    expect(perms).not.toContain("units:archive");
    expect(perms).not.toContain("units:delete");
  });

  it("DEFAULT-DENY : resp_unit ne peut pas lister les utilisateurs (403)", async () => {
    const tok = await devToken("agent", "resp_unit");
    await base().get("/api/iam/users").set("Authorization", `Bearer ${tok}`).expect(403);
  });

  it("un Super Admin peut lister les utilisateurs (200)", async () => {
    const tok = await devToken("k.benjelloun", "superadmin");
    await base().get("/api/iam/users").set("Authorization", `Bearer ${tok}`).expect(200);
  });

  it("DEFAULT-DENY : l'auditeur ne peut pas basculer un flag (403) mais peut lire l'audit (200)", async () => {
    const tok = await devToken("auditeur", "strategic");
    await base().patch("/api/flags/map").set("Authorization", `Bearer ${tok}`).send({ enabled: false }).expect(403);
    await base().get("/api/audit").set("Authorization", `Bearer ${tok}`).expect(200);
  });

  it("valide les entrées (flag booléen) — 400 sinon", async () => {
    const tok = await devToken("k.benjelloun", "superadmin");
    await base().patch("/api/flags/triage").set("Authorization", `Bearer ${tok}`).send({ enabled: "oui" }).expect(400);
  });

  it("la chaîne d'audit reste intègre après des mutations", async () => {
    const tok = await devToken("k.benjelloun", "superadmin");
    await base().patch("/api/flags/analytics").set("Authorization", `Bearer ${tok}`).send({ enabled: false }).expect(200);
    const res = await base().get("/api/audit/verify").set("Authorization", `Bearer ${tok}`).expect(200);
    expect(res.body.valid).toBe(true);
  });
});
