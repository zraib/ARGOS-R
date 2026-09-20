import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { CommsService as CommsServiceType } from "@/modules/domain/comms.service";

// Par défaut, tout le monde voit ce qui se passe sur la carte (décision du 20
// septembre 2026, ADR 0027) ; cette suite éprouve le cantonnement par portée
// (ADR 0019/0020), qui reste disponible sur une station qui le choisit.
process.env.UNITS_VISIBILITY = "scoped";

// ============================================================================
// Ce qu'un compte VOIT des ressources, et à qui un message est poussé
// (ADR 0019) — de bout en bout, en mode OPÉRATIONNEL
//
//   1. un responsable ne voit que son entité ; un wali sa région ; la conduite
//      déployée les détenteurs engagés sur son opération ; le responsable de
//      parc son unité — et ce qu'on ne voit pas répond 404, lecture et écriture ;
//   2. le registre entier, le terrain et la liste des détenteurs suivent la
//      même portée ;
//   3. un message ne se pousse qu'à l'audience du canal : les deux
//      correspondants d'une conversation directe, tous pour un canal ouvert.
// ============================================================================

describe("Visibilité des ressources et audience des messages (ADR 0019) — opérationnel", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });
  const devToken = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  let root: string;
  let rabat: string;
  let casa: string;
  let inc: string;
  let comms: CommsServiceType;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.APP_MODE = "operational";
    const { AppModule } = await import("@/app.module");
    const { CommsService } = await import("@/modules/domain/comms.service");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    comms = app.get(CommsService);
    root = await devToken("m.zraib", "superadmin");
    const mk = async (nom: string, ville: string, ll: [number, number]) =>
      (await base().post("/api/units").set(auth(root)).send({ nom, corps: "far", ville, eff: 20, dispo: "ready", readiness: 70, x: 300, y: 150, ll }).expect(201)).body.id as string;
    rabat = await mk("Unité Rabat", "Rabat", [-6.84, 34.02]);
    casa = await mk("Unité Casablanca", "Casablanca", [-7.6, 33.57]);
    for (const [u, nom] of [[rabat, "P. Rabat"], [casa, "P. Casa"]] as const) {
      await base().post("/api/resources/persons").set(auth(root)).send({ owner: { kind: "unit", id: u }, corps: "far", grade: "Sergent", nom, prenom: "X", matricule: `M-${u}`, fonction: "chef" }).expect(201);
    }
    inc = (
      await base().post("/api/incidents").set(auth(root))
        .send({ type: "flood", titre: "Crue Rabat — visibilité", region: "Rabat-Salé-Kénitra", sev: "medium", st: "open", x: 300, y: 150, ll: [-6.82, 34.01] })
        .expect(201)
    ).body.id as string;
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "w.rsk", nom: "Wali RSK", roles: ["wali"], assignments: { region: "Rabat-Salé-Kénitra" } }).expect(201);
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "c.rabat", nom: "Cdt Rabat", roles: ["resp_unit"], assignments: { unit: rabat } }).expect(201);
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "q.parc", nom: "Parc Casa", roles: ["resp_equipment"], assignments: { equipment: casa } }).expect(201);
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "t.ops", nom: "Chef TACOM", roles: ["tacom"] }).expect(201);
    await base().post(`/api/incidents/${inc}/deployments`).set(auth(root)).send({ matricule: "t.ops" }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.APP_MODE;
  });

  it("chacun ne voit que les détenteurs qui le concernent — et le reste n'existe pas pour lui", async () => {
    const owners = async (tok: string) => (await base().get("/api/resources/owners").set(auth(tok)).expect(200)).body.map((o: { id: string }) => o.id) as string[];
    const wali = await devToken("w.rsk", "wali");
    const cdt = await devToken("c.rabat", "resp_unit");
    const parc = await devToken("q.parc", "resp_equipment");
    const tacom = await devToken("t.ops", "tacom");
    const strat = await devToken("r.idrissi", "strategic");
    expect(await owners(wali)).toContain(rabat);
    expect(await owners(wali)).not.toContain(casa);
    expect(await owners(cdt)).toEqual([rabat]);
    expect(await owners(parc)).toEqual([casa]);
    // Le TACOM est déployé sur l'opération, mais aucune unité n'y est encore affectée.
    expect(await owners(tacom)).toEqual([]);
    expect(await owners(strat)).toEqual(expect.arrayContaining([rabat, casa]));
    // Lecture d'une entité hors portée : 404, et l'écriture aussi.
    await base().get(`/api/resources?ownerKind=unit&ownerId=${casa}`).set(auth(cdt)).expect(404);
    await base().get(`/api/resources?ownerKind=unit&ownerId=${rabat}`).set(auth(cdt)).expect(200);
    await base().post("/api/resources/persons").set(auth(cdt)).send({ owner: { kind: "unit", id: casa }, corps: "far", nom: "Y", prenom: "Z", matricule: "M-Z", fonction: "x" }).expect(404);
    await base().get(`/api/resources?ownerKind=unit&ownerId=${casa}`).set(auth(wali)).expect(404);
    // Le registre entier ne rend que ce qu'on voit.
    const tout = await base().get("/api/resources").set(auth(wali)).expect(200);
    expect(tout.body.persons.map((p: { nom: string }) => p.nom)).toEqual(["P. Rabat"]);
    const rien = await base().get("/api/resources").set(auth(tacom)).expect(200);
    expect(rien.body.persons).toEqual([]);
  });

  it("l'affectation d'une unité à l'opération ouvre ses ressources à la conduite déployée ; le terrain suit", async () => {
    const tacom = await devToken("t.ops", "tacom");
    await base().post(`/api/incidents/${inc}/assignments`).set(auth(root)).send({ unitId: casa, destination: "pco" }).expect(201);
    const owners = (await base().get("/api/resources/owners").set(auth(tacom)).expect(200)).body.map((o: { id: string }) => o.id);
    expect(owners).toEqual([casa]);
    await base().get(`/api/resources?ownerKind=unit&ownerId=${casa}`).set(auth(tacom)).expect(200);
    await base().get(`/api/resources?ownerKind=unit&ownerId=${rabat}`).set(auth(tacom)).expect(404);
    // Terrain : une équipe de Rabat posée n'apparaît pas au TACOM de l'opération de Casablanca… mais bien au wali de Rabat.
    const team = (await base().post("/api/resources/teams").set(auth(root)).send({ owner: { kind: "unit", id: rabat }, nom: "Équipe Rabat", memberIds: [] }).expect(201)).body.id as string;
    await base().put(`/api/resources/teams/${team}/position`).set(auth(root)).send({ ll: [-6.8, 34.0] }).expect(200);
    const wali = await devToken("w.rsk", "wali");
    expect((await base().get("/api/resources/placed").set(auth(wali)).expect(200)).body.map((p: { id: string }) => p.id)).toEqual([team]);
    expect((await base().get("/api/resources/placed").set(auth(tacom)).expect(200)).body).toEqual([]);
  });

  it("un message ne se pousse qu'à l'audience du canal", async () => {
    const dm = (await base().post("/api/comms/direct/c.rabat").set(auth(root)).expect(201)).body as { id: string };
    expect(comms.audienceOf(dm.id)?.map((m) => m.toLowerCase()).sort()).toEqual(["c.rabat", "m.zraib"]);
    const all = await base().get("/api/comms").set(auth(root)).expect(200);
    const open = all.body.categories.flatMap((c: { chans: { id: string; members?: string[]; direct?: boolean }[] }) => c.chans).find((c: { direct?: boolean; members?: string[] }) => !c.direct && !(c.members?.length));
    expect(open).toBeDefined();
    expect(comms.audienceOf(open.id)).toBeNull();
    expect(comms.audienceOf("nope")).toBeNull();
  });
});
