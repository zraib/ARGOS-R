import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// ARGOS — gouvernance : qui supprime quoi (lots G1 et G2)
//
// La règle du dépôt est monolithique : PERSONNE ne supprime, sauf le Super
// Administrateur. `expand()` n'émet jamais `delete` ; seul le joker `*` du
// superadmin porte ces permissions.
//
// Ce fichier le PROUVE au lieu de l'affirmer. L'administrateur — le rôle le
// plus doté après le superadmin — se voit refuser la suppression d'un incident
// ET celle d'un canal. Une règle sans exception se vérifie par un test ; une
// règle avec exceptions se vérifie par une matrice, et se casse en silence.
// ============================================================================

describe("Gouvernance — suppressions réservées au Super Administrateur", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());

  const devToken = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  const createIncident = async (tok: string, titre: string): Promise<string> => {
    const res = await base()
      .post("/api/incidents")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        type: "wildfire", titre, region: "Fès-Meknès",
        sev: "high", st: "open", x: 300, y: 150, ll: [-5.11, 33.53],
      })
      .expect(201);
    return res.body.id as string;
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

  // --- G2 · incidents ------------------------------------------------------

  it("l'ADMINISTRATEUR ne peut PAS supprimer un incident (403)", async () => {
    const admin = await devToken("h.alami", "admin");
    const id = await createIncident(admin, "Incident de test — admin");
    await base().delete(`/api/incidents/${id}`).set("Authorization", `Bearer ${admin}`).expect(403);
    // Et il est toujours là.
    const list = await base().get("/api/incidents").set("Authorization", `Bearer ${admin}`).expect(200);
    expect((list.body as { id: string }[]).some((i) => i.id === id)).toBe(true);
  });

  it("la CONDUITE (opcom) ne peut pas non plus (403)", async () => {
    const admin = await devToken("h.alami", "admin");
    const id = await createIncident(admin, "Incident de test — opcom");
    const opcom = await devToken("c.opcom", "opcom");
    await base().delete(`/api/incidents/${id}`).set("Authorization", `Bearer ${opcom}`).expect(403);
  });

  it("le SUPERADMIN supprime, et la cascade emporte les boucles", async () => {
    const admin = await devToken("h.alami", "admin");
    const id = await createIncident(admin, "Incident de test — cascade");
    const tacom = await devToken("c.tacom", "tacom");

    // Une boucle ouverte sur cet incident.
    await base()
      .post("/api/missions")
      .set("Authorization", `Bearer ${tacom}`)
      .send({
        incidentId: id, label: "Renfort",
        to: { role: "resp_unit", entity: "U9" },
        payload: { kind: "order", unitId: "U9" },
      })
      .expect(201);
    const before = await base().get(`/api/missions?incidentId=${id}`).set("Authorization", `Bearer ${tacom}`).expect(200);
    expect(before.body.missions).toHaveLength(1);

    const su = await devToken("m.zraib", "superadmin");
    await base().delete(`/api/incidents/${id}`).set("Authorization", `Bearer ${su}`).expect(200);

    // L'incident ET ses boucles ont disparu.
    const list = await base().get("/api/incidents").set("Authorization", `Bearer ${su}`).expect(200);
    expect((list.body as { id: string }[]).some((i) => i.id === id)).toBe(false);
    const after = await base().get(`/api/missions?incidentId=${id}`).set("Authorization", `Bearer ${su}`).expect(200);
    expect(after.body.missions).toHaveLength(0);
  });

  it("supprimer un incident inconnu rend 404, pas un succès silencieux", async () => {
    const su = await devToken("m.zraib", "superadmin");
    await base().delete("/api/incidents/INC-0000").set("Authorization", `Bearer ${su}`).expect(404);
  });

  // --- G1 · canaux ---------------------------------------------------------

  it("l'incident naît avec son canal, et l'ADMIN ne peut pas le supprimer (403)", async () => {
    const admin = await devToken("h.alami", "admin");
    const id = await createIncident(admin, "Incident de test — canal");
    const chanId = `c-${id.toLowerCase()}`;

    const comms = await base().get("/api/comms").set("Authorization", `Bearer ${admin}`).expect(200);
    const names = (comms.body.categories as { chans: { id: string }[] }[]).flatMap((c) => c.chans.map((x) => x.id));
    expect(names).toContain(chanId);

    await base().delete(`/api/comms/channels/${chanId}`).set("Authorization", `Bearer ${admin}`).expect(403);
  });

  it("le SUPERADMIN se voit refuser la suppression tant que l'incident est ACTIF (400)", async () => {
    const admin = await devToken("h.alami", "admin");
    const id = await createIncident(admin, "Incident de test — canal actif");
    const su = await devToken("m.zraib", "superadmin");
    const res = await base().delete(`/api/comms/channels/c-${id.toLowerCase()}`).set("Authorization", `Bearer ${su}`);
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/actif|archivez/i);
  });

  it("l'admin peut RENOMMER un canal et gérer ses membres — il ne peut simplement pas supprimer", async () => {
    const admin = await devToken("h.alami", "admin");
    const id = await createIncident(admin, "Incident de test — membres");
    const chanId = `c-${id.toLowerCase()}`;

    const renamed = await base()
      .patch(`/api/comms/channels/${chanId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ topic: "Coordination secteur nord" })
      .expect(200);
    expect(renamed.body.topic).toBe("Coordination secteur nord");

    const withMembers = await base()
      .post(`/api/comms/channels/${chanId}/members`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ matricules: ["i.benfares", "n.fassi"] })
      .expect(201);
    expect(withMembers.body.members).toEqual(expect.arrayContaining(["i.benfares", "n.fassi"]));

    const removed = await base()
      .delete(`/api/comms/channels/${chanId}/members/n.fassi`)
      .set("Authorization", `Bearer ${admin}`)
      .expect(200);
    expect(removed.body.members).not.toContain("n.fassi");
  });
});
