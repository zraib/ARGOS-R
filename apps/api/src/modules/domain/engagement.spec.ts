import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// Cette suite éprouve le CANTONNEMENT des incidents par portée (doctrine V-1) ;
// par défaut, tout incident se voit de tous (décision du 19 septembre 2026).
process.env.INCIDENTS_VISIBILITY = "scoped";

// ============================================================================
// Engagement par le répartiteur et hôpital de campagne sur la carte
//
// Un ORDRE émis par la répartition engage l'unité sur l'opération : elle en
// devient intervenante et affectée, son commandant voit l'opération et
// l'ordre dans ses « Ordres reçus » ; refusé ou annulé, l'engagement tombe.
// Un hôpital de campagne se déploie à un point choisi sur la carte, par
// l'API, et se relit à sa position.
// ============================================================================

describe("Répartition — l'ordre engage l'unité ; hôpital de campagne posé", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let root: string;
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
  });

  afterAll(async () => app.close());

  it("un ordre engage l'unité : son commandant voit l'opération et l'ordre ; annulé, tout retombe", async () => {
    const inc = (
      await base().post("/api/incidents").set(bearer(root))
        .send({ type: "flood", titre: "Crue — engagement", region: "Rabat-Salé-Kénitra", sev: "medium", st: "open", x: 300, y: 150, ll: [-6.82, 34.01] })
        .expect(201)
    ).body.id as string;
    const unit = (
      await base().post("/api/units").set(bearer(root))
        // À Agadir : hors de la région de l'opération, pour que seul l'engagement la lui montre.
        .send({ nom: "Unité engagée", corps: "far", ville: "Agadir", eff: 30, dispo: "ready", readiness: 80, x: 300, y: 150, ll: [-9.6, 30.42] })
        .expect(201)
    ).body.id as string;
    await base().post("/api/iam/users").set(bearer(root)).send({ matricule: "c.engage", nom: "Commandant engagé", roles: ["resp_unit"], assignments: { unit } }).expect(201);
    const cdt = await jeton("c.engage", "resp_unit");
    // Avant l'ordre : l'unité ne sert pas l'opération et n'est pas de sa région — son commandant ne la voit pas.
    const ids = async () => ((await base().get("/api/incidents").set(bearer(cdt)).expect(200)).body as { id: string }[]).map((i) => i.id);
    expect(await ids()).not.toContain(inc);

    const mission = (
      await base().post("/api/missions").set(bearer(root))
        .send({ incidentId: inc, label: "Unité engagée — renfort", to: { role: "resp_unit", entity: unit }, payload: { kind: "order", unitId: unit } })
        .expect(201)
    ).body as { id: string };
    // L'unité est intervenante et affectée ; son commandant voit l'opération et reçoit l'ordre.
    const vu = (await base().get("/api/incidents").set(bearer(root)).expect(200)).body.find((i: { id: string }) => i.id === inc);
    expect(vu.responders.units).toContain(unit);
    expect(vu.assignments.map((a: { unitId: string; engagement?: string }) => [a.unitId, a.engagement])).toContainEqual([unit, mission.id]);
    expect(await ids()).toContain(inc);
    const inbox = (await base().get("/api/missions/inbox").set(bearer(cdt)).expect(200)).body.missions as { id: string }[];
    expect(inbox.map((m) => m.id)).toContain(mission.id);
    // L'unité elle-même porte son affectation.
    const u = (await base().get("/api/units").set(bearer(root)).expect(200)).body.find((x: { id: string }) => x.id === unit);
    expect(u.assignment).toMatchObject({ incidentId: inc, deployed: false });

    // Annulé par le répartiteur : l'engagement tombe, le commandant ne voit plus l'opération.
    await base().post(`/api/missions/${mission.id}/cancel`).set(bearer(root)).send({ reason: "Relevée" }).expect(201);
    const apres = (await base().get("/api/incidents").set(bearer(root)).expect(200)).body.find((i: { id: string }) => i.id === inc);
    expect(apres.responders.units).not.toContain(unit);
    expect((apres.assignments ?? []).some((a: { unitId: string }) => a.unitId === unit)).toBe(false);
    expect(await ids()).not.toContain(inc);
  });

  it("une affectation de l'OPCOM ne tombe pas avec un ordre refusé", async () => {
    const inc = (
      await base().post("/api/incidents").set(bearer(root))
        .send({ type: "wildfire", titre: "Feu — affectation", region: "Casablanca-Settat", sev: "high", st: "open", x: 300, y: 150, ll: [-7.6, 33.57] })
        .expect(201)
    ).body.id as string;
    const unit = (
      await base().post("/api/units").set(bearer(root))
        .send({ nom: "Unité affectée", corps: "far", ville: "Casablanca", eff: 30, dispo: "ready", readiness: 80, x: 300, y: 150, ll: [-7.6, 33.6] })
        .expect(201)
    ).body.id as string;
    await base().post(`/api/incidents/${inc}/assignments`).set(bearer(root)).send({ unitId: unit, destination: "pct" }).expect(201);
    const mission = (
      await base().post("/api/missions").set(bearer(root))
        .send({ incidentId: inc, label: "Ordre", to: { role: "resp_unit", entity: unit }, payload: { kind: "order", unitId: unit } })
        .expect(201)
    ).body as { id: string };
    await base().post(`/api/missions/${mission.id}/cancel`).set(bearer(root)).send({ reason: "Sans suite" }).expect(201);
    const vu = (await base().get("/api/incidents").set(bearer(root)).expect(200)).body.find((i: { id: string }) => i.id === inc);
    expect(vu.assignments.some((a: { unitId: string }) => a.unitId === unit)).toBe(true);
    expect(vu.responders.units).toContain(unit);
  });

  it("un incident se déclare RATTACHÉ à un autre — mêmes étapes, sous « Sous-incidents : ajouter » ; un parent clos ou rattaché est refusé", async () => {
    const parent = (
      await base().post("/api/incidents").set(bearer(root))
        .send({ type: "flood", titre: "Crue — parent", region: "Rabat-Salé-Kénitra", sev: "medium", st: "open", x: 300, y: 150, ll: [-6.82, 34.01] })
        .expect(201)
    ).body.id as string;
    const body = { type: "landslide", titre: "Glissement — rattaché", region: "Rabat-Salé-Kénitra", sev: "high", st: "open", x: 300, y: 150, ll: [-6.83, 34.0] };
    const child = (await base().post("/api/incidents").set(bearer(root)).send({ ...body, parentId: parent }).expect(201)).body as { id: string; parentId?: string };
    expect(child.parentId).toBe(parent);
    // Un rattaché ne porte pas de rattaché ; un parent inconnu est refusé.
    await base().post("/api/incidents").set(bearer(root)).send({ ...body, parentId: child.id }).expect(400);
    await base().post("/api/incidents").set(bearer(root)).send({ ...body, parentId: "INC-0000" }).expect(400);
    // L'OPCOM déclare (ALL sur `incidents`) ; le rattachement suit sa dotation « Sous-incidents ».
    const opcom = await jeton("o.chraibi", "opcom");
    await base().post(`/api/incidents/${parent}/deployments`).set(bearer(root)).send({ matricule: "o.chraibi" }).expect(201);
    await base().post("/api/incidents").set(bearer(opcom)).send({ ...body, parentId: parent }).expect(201);
    // « Sous-incidents » coupé à l'OPCOM : le rattachement lui est refusé, la déclaration simple non.
    await base().patch("/api/iam/role-grants/opcom").set(bearer(root)).send({ feature: "subincidents", enabled: false }).expect(200);
    await base().post("/api/incidents").set(bearer(opcom)).send({ ...body, parentId: parent }).expect(403);
    await base().post("/api/incidents").set(bearer(opcom)).send(body).expect(201);
    await base().post("/api/iam/role-grants/opcom/reset").set(bearer(root)).expect(201);
    // Un incident rattaché se voit de tous (décision du 19 septembre), sur la carte et dans la liste.
    const carte = (await base().get("/api/incidents/map").set(bearer(await jeton("y.tazi", "bluecell"))).expect(200)).body as { id: string }[];
    expect(carte.some((i) => i.id === child.id)).toBe(true);
  });

  it("un hôpital de campagne se déploie à un point choisi et se relit à sa position", async () => {
    const hosp = (await base().get("/api/hospitals").set(bearer(root)).expect(200)).body[0] as { id: string };
    const field = (
      await base().post("/api/field-hospitals").set(bearer(root)).send({ hospitalId: hosp.id, ll: [-7.1, 33.2], cap: 60 }).expect(201)
    ).body as { hid: string; nom: string; ll: [number, number]; cap: number; kind: string; deployedBy: string };
    expect(field).toMatchObject({ hid: hosp.id, ll: [-7.1, 33.2], cap: 60, deployedBy: "m.zraib" });
    expect(["mil_field", "civ_field"]).toContain(field.kind);
    const liste = (await base().get("/api/field-hospitals").set(bearer(root)).expect(200)).body as { nom: string; ll?: [number, number] }[];
    expect(liste.find((f) => f.nom === field.nom)?.ll).toEqual([-7.1, 33.2]);
    await base().post("/api/field-hospitals").set(bearer(root)).send({ hospitalId: "H-fantome", ll: [-7.1, 33.2] }).expect(400);
    // Une cellule bleue n'a pas `hospinet:create` : refusée.
    const cell = await jeton("y.tazi", "bluecell");
    await base().post("/api/field-hospitals").set(bearer(cell)).send({ hospitalId: hosp.id, ll: [-7.1, 33.2] }).expect(403);
  });
});
