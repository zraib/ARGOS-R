import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

/**
 * Gate de sécurité Phase 2 (gestion des utilisateurs) : prouve que les règles
 * d'attribution de rôles et les actions privilégiées sont appliquées CÔTÉ
 * SERVEUR (le frontend ne fait que refléter). Le registre est in-memory.
 */
describe("IAM users — RBAC + règles d'attribution (Phase 2)", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());

  const token = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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

  it("DEFAULT-DENY : un resp_unit ne peut pas créer d'utilisateur (403)", async () => {
    const t = await token("agent", "resp_unit");
    await base().post("/api/iam/users").set(auth(t)).send({ matricule: "x.test", nom: "X", roles: ["resp_unit"] }).expect(403);
  });

  it("un Admin ne peut PAS créer un Administrateur (403 — règle serveur)", async () => {
    const t = await token("h.alami", "admin");
    await base().post("/api/iam/users").set(auth(t)).send({ matricule: "new.admin", nom: "New Admin", roles: ["admin"] }).expect(403);
  });

  it("un Admin ne peut PAS créer un Super Administrateur (403)", async () => {
    const t = await token("h.alami", "admin");
    await base().post("/api/iam/users").set(auth(t)).send({ matricule: "new.super", nom: "New Super", roles: ["superadmin"] }).expect(403);
  });

  it("un Admin ne peut attribuer qu'UN SEUL rôle (400 si plusieurs)", async () => {
    const t = await token("h.alami", "admin");
    await base().post("/api/iam/users").set(auth(t)).send({ matricule: "multi.by.admin", nom: "Multi", roles: ["tacom", "bluecell"] }).expect(400);
  });

  it("un Admin peut créer un rôle non privilégié → code temporaire généré (201)", async () => {
    const t = await token("h.alami", "admin");
    const res = await base().post("/api/iam/users").set(auth(t)).send({ matricule: "agent.admin", nom: "Agent Admin", roles: ["resp_unit"], assignments: { unit: "U1" } }).expect(201);
    expect(res.body.tempPassword).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(res.body.user.status).toBe("inactive");
  });

  it("un Super Admin peut créer un compte MULTI-RÔLES (201)", async () => {
    const t = await token("k.benjelloun", "superadmin");
    const res = await base().post("/api/iam/users").set(auth(t)).send({ matricule: "s.multi", nom: "S Multi", roles: ["tacom", "bluecell", "resp_unit"], assignments: { unit: "U2" } }).expect(201);
    expect(res.body.user.roles).toEqual(["tacom", "bluecell", "resp_unit"]);
  });

  it("activation forcée : réservée au Super Admin (Admin 403, Super Admin 201)", async () => {
    const su = await token("k.benjelloun", "superadmin");
    const created = await base().post("/api/iam/users").set(auth(su)).send({ matricule: "to.activate", nom: "To Activate", roles: ["strategic"] }).expect(201);
    const id = created.body.user.id as string;

    const adminTok = await token("h.alami", "admin");
    await base().post(`/api/iam/users/${id}/active`).set(auth(adminTok)).send({ active: true }).expect(403);

    const res = await base().post(`/api/iam/users/${id}/active`).set(auth(su)).send({ active: true }).expect(201);
    expect(res.body.status).toBe("active");
  });

  it("matrice rôle→fonctionnalités : Admin 403, Super Admin 200", async () => {
    const adminTok = await token("h.alami", "admin");
    await base().patch("/api/iam/role-features/tacom").set(auth(adminTok)).send({ feature: "triage", enabled: true }).expect(403);

    const su = await token("k.benjelloun", "superadmin");
    const res = await base().patch("/api/iam/role-features/tacom").set(auth(su)).send({ feature: "triage", enabled: true }).expect(200);
    expect(res.body.triage).toBe(true);
  });

  it("le code temporaire est consultable par un Admin (200)", async () => {
    const t = await token("h.alami", "admin");
    const list = await base().get("/api/iam/users").set(auth(t)).expect(200);
    const fassi = (list.body as Array<{ id: string; matricule: string }>).find((u) => u.matricule === "n.fassi");
    expect(fassi).toBeDefined();
    const res = await base().get(`/api/iam/users/${fassi!.id}/temp-code`).set(auth(t)).expect(200);
    expect(res.body.tempPassword).toBe("A7X2-K9D3");
  });

  it("cycle de vie : login code temp → changement mdp obligatoire → activé", async () => {
    // 1er login avec le code temporaire.
    const login1 = await base().post("/api/auth/login").send({ matricule: "n.fassi", password: "A7X2-K9D3" }).expect(201);
    expect(login1.body.mustChangePassword).toBe(true);
    expect(login1.body.role).toBe("resp_unit");

    // Changement de mot de passe (authentifié avec le jeton du login).
    await base().post("/api/auth/change-password").set(auth(login1.body.access_token)).send({ newPassword: "motdepasse1" }).expect(201);

    // Reconnexion avec le nouveau mot de passe → plus de changement requis.
    const login2 = await base().post("/api/auth/login").send({ matricule: "n.fassi", password: "motdepasse1" }).expect(201);
    expect(login2.body.mustChangePassword).toBe(false);

    // L'ancien code temporaire ne fonctionne plus.
    await base().post("/api/auth/login").send({ matricule: "n.fassi", password: "A7X2-K9D3" }).expect(401);
  });

  it("compte multi-rôles : login → sélection de rôle → nouveau jeton", async () => {
    const login = await base().post("/api/auth/login").send({ matricule: "s.bennani", password: "Q4M8-P2L6" }).expect(201);
    expect(login.body.mustChooseRole).toBe(true);
    // Rôle non attribué → refusé.
    await base().post("/api/auth/select-role").set(auth(login.body.access_token)).send({ role: "superadmin" }).expect(403);
    // Rôle attribué → nouveau jeton.
    const sel = await base().post("/api/auth/select-role").set(auth(login.body.access_token)).send({ role: "bluecell" }).expect(201);
    expect(sel.body.role).toBe("bluecell");
  });
});
