import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Mode édition par rôle, ressources sur le terrain, simulations réservées
// (ADR 0018) — de bout en bout
//
//   1. le stratégique pose les OPCOM, l'OPCOM son dispositif tactique, chacun
//      rien d'autre — et retire ce qu'il pose ;
//   2. le TACOM et les cellules posent leurs équipes, équipements et
//      véhicules — jamais un poste ; la carte relit ce qui est posé ;
//   3. couper le module « mode édition » pour un rôle ferme ses poses ;
//   4. le panache NRBC revient à la conduite, pas au wali.
// ============================================================================

describe("Mode édition par rôle — postes, ressources sur le terrain, simulations", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });
  const devToken = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  let root: string;
  let inc: string;
  let unit: string;
  let team: string;
  let vehicle: string;
  let equip: string;

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
        .send({ type: "wildfire", titre: "Feu — mode édition", region: "Casablanca-Settat", sev: "high", st: "open", x: 300, y: 150, ll: [-7.6, 33.57] })
        .expect(201)
    ).body.id as string;
    // Un chef d'OPCOM et un chef de TACOM déployés sur l'opération.
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "t.chef", nom: "Chef TACOM", roles: ["tacom"] }).expect(201);
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "c.bleu", nom: "Cellule bleue", roles: ["bluecell"] }).expect(201);
    await base().post(`/api/incidents/${inc}/deployments`).set(auth(root)).send({ matricule: "o.chraibi" }).expect(201);
    await base().post(`/api/incidents/${inc}/deployments`).set(auth(root)).send({ matricule: "t.chef" }).expect(201);
    unit = (
      await base().post("/api/units").set(auth(root))
        .send({ nom: "Unité — terrain", corps: "far", ville: "Casablanca", eff: 40, dispo: "ready", readiness: 80, x: 300, y: 150, ll: [-7.6, 33.57] })
        .expect(201)
    ).body.id as string;
    const owner = { kind: "unit", id: unit };
    team = (await base().post("/api/resources/teams").set(auth(root)).send({ owner, nom: "Équipe cyno", memberIds: [] }).expect(201)).body.id as string;
    vehicle = (await base().post("/api/resources/vehicles").set(auth(root)).send({ owner, type: "VLTT", plate: "M-1", qty: 1, state: "ok" }).expect(201)).body.id as string;
    equip = (await base().post("/api/resources/equipment").set(auth(root)).send({ owner, desig: "Groupe électrogène", cat: "energie", stock: 2, threshold: 1, cond: "ok" }).expect(201)).body.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("le stratégique pose les OPCOM et rien d'autre ; l'OPCOM pose les TACOM et les cellules, pas les OPCOM ; chacun retire ce qu'il pose", async () => {
    const strat = await devToken("r.idrissi", "strategic");
    const opcom = await devToken("o.chraibi", "opcom");
    const refus = await base().post(`/api/incidents/${inc}/posts`).set(auth(strat)).send({ kind: "tacom", ll: [-7.6, 33.6], matricule: "t.chef" }).expect(403);
    expect(refus.body.message).toMatch(/pose opcom/);
    const opcomPost = await base().post(`/api/incidents/${inc}/posts`).set(auth(strat)).send({ kind: "opcom", ll: [-7.6, 33.6], matricule: "o.chraibi" }).expect(201);
    await base().post(`/api/incidents/${inc}/posts`).set(auth(opcom)).send({ kind: "opcom", ll: [-7.61, 33.6], matricule: "o.chraibi" }).expect(403);
    const tacomPost = await base().post(`/api/incidents/${inc}/posts`).set(auth(opcom)).send({ kind: "tacom", ll: [-7.62, 33.6], matricule: "t.chef" }).expect(201);
    await base().post(`/api/incidents/${inc}/posts`).set(auth(opcom)).send({ kind: "bluecell", ll: [-7.63, 33.6], matricule: "c.bleu" }).expect(201);
    // Le stratégique déplace et retire l'OPCOM ; il ne touche pas au TACOM.
    await base().patch(`/api/incidents/${inc}/posts/${opcomPost.body.id}`).set(auth(strat)).send({ ll: [-7.65, 33.61] }).expect(200);
    await base().delete(`/api/incidents/${inc}/posts/${tacomPost.body.id}`).set(auth(strat)).expect(403);
    await base().delete(`/api/incidents/${inc}/posts/${opcomPost.body.id}`).set(auth(strat)).expect(200);
    await base().delete(`/api/incidents/${inc}/posts/${tacomPost.body.id}`).set(auth(opcom)).expect(200);
    // Un TACOM n'a pas de poste à poser : le 403 le dit.
    const tacom = await devToken("t.chef", "tacom");
    const rien = await base().post(`/api/incidents/${inc}/posts`).set(auth(tacom)).send({ kind: "bluecell", ll: [-7.6, 33.6], matricule: "c.bleu" }).expect(403);
    expect(rien.body.message).toMatch(/ne pose rien/);
  });

  it("le TACOM et les cellules posent équipes, équipements et véhicules ; le stratégique et le wali rien ; la carte relit le terrain", async () => {
    const tacom = await devToken("t.chef", "tacom");
    const blue = await devToken("c.bleu", "bluecell");
    const strat = await devToken("r.idrissi", "strategic");
    const wali = await devToken("w.casa", "wali");
    const at = { ll: [-7.58, 33.59], incidentId: inc };
    await base().put(`/api/resources/teams/${team}/position`).set(auth(blue)).send(at).expect(200);
    await base().put(`/api/resources/equipment/${equip}/position`).set(auth(blue)).send(at).expect(200);
    await base().delete(`/api/resources/equipment/${equip}/position`).set(auth(blue)).expect(200);
    await base().put(`/api/resources/equipment/${equip}/position`).set(auth(wali)).send(at).expect(403);
    const placed = await base().put(`/api/resources/equipment/${equip}/position`).set(auth(tacom)).send(at).expect(200);
    expect(placed.body).toMatchObject({ kind: "equipment", id: equip, label: "Groupe électrogène", position: { by: "t.chef", incidentId: inc } });
    await base().put(`/api/resources/vehicles/${vehicle}/position`).set(auth(tacom)).send({ ll: [-7.57, 33.59] }).expect(200);
    await base().put(`/api/resources/teams/${team}/position`).set(auth(strat)).send(at).expect(403);
    await base().put(`/api/resources/teams/nope/position`).set(auth(tacom)).send(at).expect(404);
    const carte = await base().get("/api/resources/placed").set(auth(strat)).expect(200);
    expect(carte.body.map((p: { kind: string; id: string }) => `${p.kind}:${p.id}`).sort()).toEqual([`equipment:${equip}`, `teams:${team}`, `vehicles:${vehicle}`].sort());
    // La boîte à outils de la cellule propose les trois natures ; l'équipe y est marquée posée.
    const outils = await base().get("/api/resources/placeable").set(auth(blue)).expect(200);
    expect(new Set(outils.body.map((r: { kind: string }) => r.kind))).toEqual(new Set(["teams", "vehicles", "equipment"]));
    expect(outils.body.find((r: { kind: string; id: string }) => r.kind === "teams" && r.id === team).placed).toBe(true);
    // Retirer du terrain.
    await base().delete(`/api/resources/teams/${team}/position`).set(auth(blue)).expect(200);
    await base().delete(`/api/resources/teams/${team}/position`).set(auth(blue)).expect(404);
    const apres = await base().get("/api/resources/placed").set(auth(root)).expect(200);
    expect(apres.body).toHaveLength(2);
  });

  it("couper le mode édition pour un rôle ferme ses poses ; le panache NRBC revient à la conduite", async () => {
    const blue = await devToken("c.bleu", "bluecell");
    await base().patch("/api/iam/role-features/bluecell").set(auth(root)).send({ feature: "mapEdit", enabled: false }).expect(200);
    const refus = await base().put(`/api/resources/teams/${team}/position`).set(auth(blue)).send({ ll: [-7.58, 33.59] }).expect(403);
    expect(refus.body.message).toMatch(/mapEdit/);
    await base().post("/api/iam/role-features/bluecell/reset").set(auth(root)).expect(201);
    await base().put(`/api/resources/teams/${team}/position`).set(auth(blue)).send({ ll: [-7.58, 33.59] }).expect(200);
    const defaults = await base().get("/api/iam/role-features/defaults").set(auth(root)).expect(200);
    expect(defaults.body.bluecell).toMatchObject({ mapEdit: true, simFlood: false, simFire: false, simNrbc: false });
    expect(defaults.body.tacom).toMatchObject({ mapEdit: true, simFlood: true, simFire: true, simNrbc: true });
    expect(defaults.body.wali).toMatchObject({ mapEdit: false, simFlood: false, simNrbc: false });
    expect(defaults.body.strategic).toMatchObject({ mapEdit: true, simFlood: true, simFire: true, simNrbc: true });
    const wali = await devToken("w.casa", "wali");
    await base().get(`/api/nrbc/plume/${inc}`).set(auth(wali)).expect(403);
    const opcom = await devToken("o.chraibi", "opcom");
    const plume = await base().get(`/api/nrbc/plume/${inc}`).set(auth(opcom));
    expect(plume.status).not.toBe(403);
  });
});
