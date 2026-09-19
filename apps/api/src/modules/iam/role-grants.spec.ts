import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Fonctionnalités de l'API commutables par rôle (ADR 0022, lot 2)
//
// Les 43 lignes de la matrice s'ouvrent ou se coupent par rôle depuis
// « Rôles & fonctionnalités » ; coupée, une fonctionnalité retire TOUTES ses
// actions au rôle (403) et disparaît des permissions servies par /iam/me,
// sans toucher à la matrice. Le cœur et les administrateurs sont verrouillés.
// ============================================================================

describe("Fonctionnalités par rôle", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let root: string;
  let tacom: string;
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await jeton("m.zraib", "superadmin");
    tacom = await jeton("y.tazi", "tacom");
  });

  afterAll(async () => app.close());

  it("les défauts découlent de la matrice : 43 fonctionnalités par rôle, ouvertes quand le rôle en détient une action", async () => {
    const d = (await base().get("/api/iam/role-grants/defaults").set(bearer(tacom)).expect(200)).body;
    expect(Object.keys(d.tacom)).toHaveLength(43);
    expect(d.tacom.subincidents).toBe(true);
    expect(d.tacom.settings).toBe(false);
    expect(d.resp_shelter.assign).toBe(false);
    expect(d.opcom.assign).toBe(true);
    // En mode classique, le profil Direx n'est pas servi.
    expect(d.pcfar_chef).toBeUndefined();
    const g = (await base().get("/api/iam/role-grants").set(bearer(tacom)).expect(200)).body;
    expect(g.tacom).toEqual(d.tacom);
  });

  it("couper « Sous-incidents » au TACOM lui retire l'ajout, la modification et le retrait — et rien d'autre", async () => {
    const inc = (
      await base().post("/api/incidents").set(bearer(root))
        .send({ type: "flood", titre: "Crue — sous-incidents", region: "Casablanca-Settat", sev: "medium", st: "open", x: 300, y: 150, ll: [-7.6, 33.57] })
        .expect(201)
    ).body.id as string;
    await base().post(`/api/incidents/${inc}/deployments`).set(bearer(root)).send({ matricule: "y.tazi" }).expect(201);
    const body = { type: "gas_leak", sev: "medium", note: "Fuite sur la conduite" };
    await base().post(`/api/incidents/${inc}/sub-incidents`).set(bearer(tacom)).send(body).expect(201);

    // Seul le Super Administrateur règle la matrice.
    const admin = await jeton("h.alami", "admin");
    await base().patch("/api/iam/role-grants/tacom").set(bearer(admin)).send({ feature: "subincidents", enabled: false }).expect(403);
    const coupe = (await base().patch("/api/iam/role-grants/tacom").set(bearer(root)).send({ feature: "subincidents", enabled: false }).expect(200)).body;
    expect(coupe.subincidents).toBe(false);

    const refus = await base().post(`/api/incidents/${inc}/sub-incidents`).set(bearer(tacom)).send(body).expect(403);
    expect(refus.body.message).toContain("subincidents");
    // Les permissions servies ne portent plus la fonctionnalité ; l'incident lui-même reste lisible.
    const me = (await base().get("/api/iam/me").set(bearer(tacom)).expect(200)).body;
    expect(me.permissions.some((p: string) => p.startsWith("subincidents:"))).toBe(false);
    expect(me.permissions).toContain("incidents:view");
    const liste = (await base().get("/api/incidents").set(bearer(tacom)).expect(200)).body as { id: string }[];
    expect(liste.some((i) => i.id === inc)).toBe(true);

    // Réinitialiser rend la fonctionnalité.
    await base().post("/api/iam/role-grants/tacom/reset").set(bearer(root)).expect(201);
    await base().post(`/api/incidents/${inc}/sub-incidents`).set(bearer(tacom)).send(body).expect(201);
  });

  it("une fonctionnalité que la matrice vient d'ouvrir à un rôle n'est pas masquée par un « non » persisté d'avant", async () => {
    // Le commandant d'unité lit les incidents depuis le 19 septembre 2026 : ses grants servis le disent.
    const g = (await base().get("/api/iam/role-grants").set(bearer(root)).expect(200)).body;
    expect(g.resp_unit.incidents).toBe(true);
    const cdt = await jeton("n.fassi", "resp_unit");
    await base().get("/api/incidents").set(bearer(cdt)).expect(200);
  });

  it("le cœur et les administrateurs sont verrouillés ; une fonctionnalité inconnue est refusée", async () => {
    await base().patch("/api/iam/role-grants/tacom").set(bearer(root)).send({ feature: "users", enabled: true }).expect(400);
    await base().patch("/api/iam/role-grants/admin").set(bearer(root)).send({ feature: "incidents", enabled: false }).expect(403);
    await base().patch("/api/iam/role-grants/tacom").set(bearer(root)).send({ feature: "fantome", enabled: false }).expect(400);
    await base().patch("/api/iam/role-grants/inconnu").set(bearer(root)).send({ feature: "incidents", enabled: false }).expect(400);
  });

  it("la matrice servie ne porte que le mode en service ; un rôle de l'autre profil se règle mais ne se lit pas", async () => {
    const servie = (await base().get("/api/iam/role-grants").set(bearer(root)).expect(200)).body;
    expect(Object.keys(servie)).toContain("tacom");
    expect(Object.keys(servie)).not.toContain("pcf_ops");
    const coupe = (await base().patch("/api/iam/role-grants/pcf_ops").set(bearer(root)).send({ feature: "missions", enabled: false }).expect(200)).body;
    expect(coupe.missions).toBe(false);
    expect((await base().post("/api/iam/role-grants/pcf_ops/reset").set(bearer(root)).expect(201)).body.missions).toBe(true);
  });
});
