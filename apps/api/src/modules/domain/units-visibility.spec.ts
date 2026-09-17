import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Unités visibles par qui les a inscrites ou qu'elles concernent, la carte de
// tous, le tableau de bord sur les données introduites (ADR 0020) — de bout
// en bout, en démonstration (les cellules y inscrivent des unités)
// ============================================================================

describe("ADR 0020 — unités par auteur et concernement, carte de tous, tableau de bord réel", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });
  const devToken = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  let root: string;
  let inc: string;
  let casaUnit: string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await devToken("m.zraib", "superadmin");
    inc = (
      await base().post("/api/incidents").set(auth(root))
        .send({ type: "flood", titre: "Crue Rabat — visibilité des unités", region: "Rabat-Salé-Kénitra", sev: "high", st: "open", x: 300, y: 150, ll: [-6.82, 34.01], casualties: { dead: 2, injured: 7, missing: 1 } })
        .expect(201)
    ).body.id as string;
    casaUnit = (
      await base().post("/api/units").set(auth(root)).send({ nom: "Unité Casablanca — admin", corps: "far", ville: "Casablanca", eff: 20, dispo: "ready", readiness: 70, x: 300, y: 150, ll: [-7.6, 33.57] }).expect(201)
    ).body.id as string;
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "c.rabat", nom: "Cellule Rabat", roles: ["bluecell"] }).expect(201);
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "c.libre", nom: "Cellule libre", roles: ["bluecell"] }).expect(201);
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "t.rabat", nom: "TACOM Rabat", roles: ["tacom"] }).expect(201);
    for (const m of ["c.rabat", "t.rabat", "o.chraibi"]) await base().post(`/api/incidents/${inc}/deployments`).set(auth(root)).send({ matricule: m }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it("une unité inscrite par une cellule déployée rejoint son opération ; chacun voit les siennes et celles de son opération, rien d'autre", async () => {
    const cell = await devToken("c.rabat", "bluecell");
    const created = await base().post("/api/units").set(auth(cell))
      .send({ nom: "Section cyno — cellule", corps: "dgpc", ville: "Rabat", eff: 8, dispo: "ready", readiness: 90, x: 300, y: 150, ll: [-6.84, 34.02] })
      .expect(201);
    expect(created.body.createdBy).toBe("c.rabat");
    expect(created.body.assignment).toMatchObject({ incidentId: inc, destination: "pco", deployed: false });
    const ids = async (tok: string) => (await base().get("/api/units").set(auth(tok)).expect(200)).body.map((u: { id: string }) => u.id) as string[];
    // La cellule : la sienne, pas celle de l'admin à Casablanca.
    expect(await ids(cell)).toEqual([created.body.id]);
    // Le TACOM de l'opération la voit (affectée) ; pas l'unité de Casablanca.
    const tacom = await devToken("t.rabat", "tacom");
    expect(await ids(tacom)).toEqual([created.body.id]);
    // L'OPCOM de l'opération : le dispositif ET le vivier de la région de l'opération (il affecte).
    const opcom = await devToken("o.chraibi", "opcom");
    const vus = await ids(opcom);
    expect(vus).toContain(created.body.id);
    expect(vus).not.toContain(casaUnit);
    // Une cellule non déployée ne voit rien ; le wali de Casablanca voit l'unité de sa région, pas celle de Rabat.
    const libre = await devToken("c.libre", "bluecell");
    expect(await ids(libre)).toEqual([]);
    const wali = await devToken("w.casa", "wali");
    expect(await ids(wali)).toContain(casaUnit);
    expect(await ids(wali)).not.toContain(created.body.id);
    // Ce qu'on ne voit pas ne se modifie pas — et n'existe pas.
    await base().patch(`/api/units/${created.body.id}`).set(auth(libre)).send({ readiness: 50 }).expect(404);
    await base().patch(`/api/units/${created.body.id}`).set(auth(cell)).send({ readiness: 95 }).expect(200);
    // L'administration voit tout.
    expect(await ids(root)).toEqual(expect.arrayContaining([created.body.id, casaUnit]));
  });

  it("tout le monde voit l'incident sur la carte, même sans le voir dans sa liste", async () => {
    const libre = await devToken("c.libre", "bluecell");
    const liste = await base().get("/api/incidents").set(auth(libre)).expect(200);
    expect(liste.body).toEqual([]);
    const carte = await base().get("/api/incidents/map").set(auth(libre)).expect(200);
    expect(carte.body.map((i: { id: string }) => i.id)).toContain(inc);
    expect(carte.body.every((i: { archived?: boolean }) => !i.archived)).toBe(true);
  });

  it("le tableau de bord se lit par chacun, sur sa portée, et compte ce qui a été introduit", async () => {
    const today = new Date();
    const label = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}`;
    // Le wali de Casablanca-Settat ne voit pas la crue de Rabat : ses statistiques ne la comptent pas.
    const wali = await devToken("w.casa", "wali");
    const sWali = await base().get("/api/dashboard/stats").set(auth(wali)).expect(200);
    const rabatCount = (s: { body: { severity: { high: number } } }) => s.body.severity.high;
    // Le stratégique voit tout : la crue déclarée aujourd'hui compte dans le jour d'aujourd'hui, avec son bilan.
    const strat = await devToken("r.idrissi", "strategic");
    const sAll = await base().get("/api/dashboard/stats").set(auth(strat)).expect(200);
    expect(rabatCount(sAll)).toBeGreaterThan(rabatCount(sWali));
    const jour = sAll.body.evolution.find((p: { d: string }) => p.d === label);
    expect(jour.opened).toBeGreaterThanOrEqual(1);
    expect(sAll.body.casualties.dead).toBeGreaterThanOrEqual(2);
    expect(sAll.body.casualties.injured).toBeGreaterThanOrEqual(7);
    // Clôturer date la clôture, et le jour la compte.
    await base().patch(`/api/incidents/${inc}`).set(auth(root)).send({ st: "closed" }).expect(200);
    const apres = await base().get("/api/dashboard/stats").set(auth(strat)).expect(200);
    expect(apres.body.evolution.find((p: { d: string }) => p.d === label).closed).toBeGreaterThanOrEqual(1);
    // Un commandant d'unité lit aussi le tableau de bord (et le fil) — sur sa portée.
    const cdt = await devToken("n.fassi", "resp_unit");
    await base().get("/api/dashboard/stats").set(auth(cdt)).expect(200);
    await base().get("/api/feed").set(auth(cdt)).expect(200);
    await base().get("/api/catalog").set(auth(cdt)).expect(200);
  });
});
