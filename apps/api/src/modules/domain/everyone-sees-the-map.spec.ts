import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// ADR 0027 — « tout le monde doit voir ce qui se passe sur la carte »
//
//   1. les unités se voient de tous les rôles (défaut `UNITS_VISIBILITY=all`) :
//      un chef de PCT non déployé, un OPS de PCO, un LOG de PC FAR voient les
//      mêmes unités que le Super Administrateur dans le mode en service ;
//   2. les PC (chef, OPS, LOG), l'Anim affectent les unités à l'opération,
//      tous corps confondus — un chef de PCT affecte une unité FAR ;
//   3. un article du parc s'affecte à une équipe DU détenteur — une équipe
//      d'un autre détenteur est refusée (409), dissoudre l'équipe libère
//      l'article, et les articles d'avant restent tels quels (pas d'équipe).
// ============================================================================

describe("ADR 0027 — la carte de tous, l'affectation par les PC, l'équipement d'une équipe", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  let root: string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await jeton("m.zraib", "superadmin");
  });
  afterAll(async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" });
    await app.close();
  });

  const unitIds = async (t: string) => ((await base().get("/api/units").set(bearer(t)).expect(200)).body as { id: string }[]).map((u) => u.id).sort();

  it("sous Direx, les PC non déployés voient toutes les unités du mode — comme le Super Administrateur", async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "direx", password: "ARGOS-2026" }).expect(200);
    const anim = await jeton("n.direx", "direx_anim");
    const all = await unitIds(anim);
    expect(all.length).toBeGreaterThan(0);
    for (const [u, r] of [["c.pct", "pct_chef"], ["o.pco", "pco_ops"], ["l.pcfar", "pcfar_log"], ["c.pcf", "pcf_chef"], ["r.pct", "pct_rens"]] as const) {
      expect(await unitIds(await jeton(u, r))).toEqual(all);
    }
    // Le terrain aussi : ce qui est posé se lit de tous (200, même liste que l'Anim).
    const placedAnim = (await base().get("/api/resources/placed").set(bearer(anim)).expect(200)).body as unknown[];
    const placedPct = (await base().get("/api/resources/placed").set(bearer(await jeton("c.pct", "pct_chef"))).expect(200)).body as unknown[];
    expect(placedPct.length).toBe(placedAnim.length);
  });

  it("un chef de PCT, un LOG de PC FAR et l'Anim affectent une unité FAR à l'opération ; la synthèse ne peut pas", async () => {
    const inc = (
      await base().post("/api/incidents").set(bearer(root))
        .send({ type: "flood", titre: "Crue — affectation par les PC", region: "Rabat-Salé-Kénitra", sev: "high", st: "open", x: 300, y: 150, ll: [-6.82, 34.01] })
        .expect(201)
    ).body.id as string;
    const far = ((await base().get("/api/units").set(bearer(root)).expect(200)).body as { id: string; corps?: string }[]).filter((u) => (u.corps ?? "far") === "far");
    expect(far.length).toBeGreaterThanOrEqual(3);
    const [u1, u2, u3] = far;
    for (const [who, unit] of [[await jeton("c.pct", "pct_chef"), u1], [await jeton("l.pcfar", "pcfar_log"), u2], [await jeton("n.direx", "direx_anim"), u3]] as const) {
      await base().post(`/api/incidents/${inc}/assignments`).set(bearer(who)).send({ unitId: unit.id }).expect(201);
      await base().delete(`/api/incidents/${inc}/assignments/${unit.id}`).set(bearer(who)).expect(200);
    }
    await base().post(`/api/incidents/${inc}/assignments`).set(bearer(await jeton("s.pcfar", "pcfar_synth"))).send({ unitId: u1.id }).expect(403);
  });

  it("un article du parc s'affecte à une équipe du détenteur — et à elle seule ; l'équipe dissoute le libère", async () => {
    const [unitA, unitB] = ((await base().get("/api/units").set(bearer(root)).expect(200)).body as { id: string }[]).slice(0, 2);
    const teamA = (await base().post("/api/resources/teams").set(bearer(root)).send({ owner: { kind: "unit", id: unitA.id }, nom: "Groupe radio", memberIds: [] }).expect(201)).body as { id: string };
    const teamB = (await base().post("/api/resources/teams").set(bearer(root)).send({ owner: { kind: "unit", id: unitB.id }, nom: "Groupe étranger", memberIds: [] }).expect(201)).body as { id: string };
    const article = { desig: "Poste radio PRC-77", cat: "Transmissions", stock: 2, threshold: 1, cond: "ok" };
    // Une équipe d'un autre détenteur : refusée.
    await base().post("/api/resources/equipment").set(bearer(root)).send({ ...article, owner: { kind: "unit", id: unitA.id }, teamId: teamB.id }).expect(409);
    const eq = (await base().post("/api/resources/equipment").set(bearer(root)).send({ ...article, owner: { kind: "unit", id: unitA.id }, teamId: teamA.id }).expect(201)).body as { id: string; teamId?: string };
    expect(eq.teamId).toBe(teamA.id);
    // Sortir de l'équipe : chaîne vide ; y revenir : l'identifiant.
    expect(((await base().patch(`/api/resources/equipment/${eq.id}`).set(bearer(root)).send({ teamId: "" }).expect(200)).body as { teamId?: string }).teamId).toBeUndefined();
    expect(((await base().patch(`/api/resources/equipment/${eq.id}`).set(bearer(root)).send({ teamId: teamA.id }).expect(200)).body as { teamId?: string }).teamId).toBe(teamA.id);
    await base().patch(`/api/resources/equipment/${eq.id}`).set(bearer(root)).send({ teamId: teamB.id }).expect(409);
    // Dissoudre l'équipe : l'article revient au détenteur, sans autre changement.
    await base().delete(`/api/resources/teams/${teamA.id}`).set(bearer(root)).expect(200);
    const parc = (await base().get(`/api/resources?ownerKind=unit&ownerId=${unitA.id}`).set(bearer(root)).expect(200)).body as { equipment: { id: string; teamId?: string; desig: string }[] };
    const relu = parc.equipment.find((e) => e.id === eq.id);
    expect(relu?.teamId).toBeUndefined();
    expect(relu?.desig).toBe("Poste radio PRC-77");
    // Les articles d'avant n'ont pas d'équipe et n'ont pas bougé.
    expect(parc.equipment.filter((e) => e.id !== eq.id).every((e) => e.teamId === undefined)).toBe(true);
    await base().delete(`/api/resources/teams/${teamB.id}`).set(bearer(root)).expect(200);
  });
});
