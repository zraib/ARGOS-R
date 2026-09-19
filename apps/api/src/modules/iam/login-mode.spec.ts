import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Le mode de l'application (ADR 0022) : « classique » ou « direx »
//
// Un réglage de la station, changé par le Super Administrateur seul, signé de
// son mot de passe. Sous un mode, l'autre profil de rôles n'est pas servi :
// ses comptes ne se connectent pas (avec le message qui dit à qui s'adresser),
// ses sessions tombent, ses rôles ne s'attribuent pas, ses colonnes ne
// s'affichent pas. L'administration et les chefs d'entité passent partout.
// ============================================================================

describe("Mode de l'application — réglage de station", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  let root: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  const login = (matricule: string, password: string) => base().post("/api/auth/login").send({ matricule, password });

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await jeton("m.zraib", "superadmin");
  });

  afterAll(async () => app.close());

  it("au départ, le mode classique est en service : servi par la sonde publique et par /iam/profiles", async () => {
    expect((await base().get("/api/health").expect(200)).body.roleProfile).toBe("classique");
    const cat = (await base().get("/api/iam/profiles").set(bearer(root)).expect(200)).body;
    expect(cat.active).toBe("classique");
    expect(cat.profiles.map((p: { id: string }) => p.id)).toEqual(["classique", "direx"]);
    expect(cat.profiles[1].roles).toHaveLength(28);
    expect((await base().get("/api/iam/me").set(bearer(root)).expect(200)).body.profile).toBe("classique");
  });

  it("en mode classique, un compte Direx n'entre pas et son jeton ne sert pas ; l'administration prépare pourtant ses comptes", async () => {
    // c.pcfar : Chef / PC FAR de démonstration (code provisoire PCFAR-2026).
    const refus = await login("c.pcfar", "PCFAR-2026").expect(403);
    expect(refus.body.message).toContain("Mode classique est activé");
    expect(refus.body.message).toContain("contactez l'administrateur");
    const t = await jeton("c.pcfar", "pcfar_chef");
    await base().get("/api/iam/me").set(bearer(t)).expect(401);
    // Les comptes de l'autre profil se créent et se gèrent : seul l'ACCÈS est fermé.
    await base().post("/api/iam/users").set(bearer(root)).send({ matricule: "x.direx", nom: "Préparé", roles: ["pcf_ops"] }).expect(201);
    // La matrice servie montre les deux profils : l'administration les règle tous deux.
    const defaults = (await base().get("/api/iam/role-features/defaults").set(bearer(root)).expect(200)).body;
    expect(Object.keys(defaults)).toContain("opcom");
    expect(Object.keys(defaults)).toContain("pcfar_chef");
  });

  it("seul le Super Administrateur change le mode, mot de passe à l'appui", async () => {
    const admin = await jeton("h.alami", "admin");
    await base().patch("/api/domain/profile").set(bearer(admin)).send({ profile: "direx", password: "argos" }).expect(403);
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "direx", password: "mauvais" }).expect(403);
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "autre", password: "ARGOS-2026" }).expect(400);
    expect((await base().get("/api/health").expect(200)).body.roleProfile).toBe("classique");
  });

  it("en mode Direx : les comptes Direx entrent, les comptes classiques sont refusés et leurs sessions tombent ; l'administration et les chefs d'entité passent", async () => {
    // y.tazi (cellule bleue, classique) tient une session avant la bascule.
    const tazi = (await login("y.tazi", "argos").expect(201)).body.access_token as string;
    await base().get("/api/iam/me").set(bearer(tazi)).expect(200);

    const res = (await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "direx", password: "ARGOS-2026" }).expect(200)).body;
    expect(res).toMatchObject({ profile: "direx", changed: true });
    expect((await base().get("/api/health").expect(200)).body.roleProfile).toBe("direx");

    // Sa session tombe à la requête suivante, sans attendre l'expiration du jeton.
    await base().get("/api/iam/me").set(bearer(tazi)).expect(401);
    const refus = await login("y.tazi", "argos").expect(403);
    expect(refus.body.message).toContain("Mode Direx est activé");

    // Le Chef / PC FAR entre, avec la dotation de son rôle.
    const chef = (await login("c.pcfar", "PCFAR-2026").expect(201)).body;
    expect(chef).toMatchObject({ profile: "direx", role: "pcfar_chef" });
    const me = (await base().get("/api/iam/me").set(bearer(chef.access_token)).expect(200)).body;
    expect(me.profile).toBe("direx");
    expect(me.permissions).toContain("assign:create");
    expect(me.permissions).not.toContain("users:view");
    // Non déployé, il ne voit aucun incident (default-deny) — comme l'OPCOM classique.
    expect((await base().get("/api/incidents").set(bearer(chef.access_token)).expect(200)).body).toEqual([]);

    // L'administration et les chefs d'entité passent dans les deux modes.
    await base().get("/api/iam/me").set(bearer(root)).expect(200);
    await login("h.alami", "argos").expect(201);
    await login("n.fassi", "A7X2-K9D3").expect(201);

    // Un compte ne mêle pas les deux organisations ; un compte Direx + chef d'entité, si.
    await base().post("/api/iam/users").set(bearer(root)).send({ matricule: "x.mixte", nom: "Mixte", roles: ["pcf_ops", "opcom"] }).expect(400);
    await base().post("/api/iam/users").set(bearer(root)).send({ matricule: "x.ok", nom: "PCF + unité", roles: ["pcf_ops", "resp_unit"], assignments: { unit: "U1" } }).expect(201);

    // Retour au mode classique : idempotent, et la station repart comme avant.
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" }).expect(200);
    expect((await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" }).expect(200)).body.changed).toBe(false);
    await login("y.tazi", "argos").expect(201);
  });
});
