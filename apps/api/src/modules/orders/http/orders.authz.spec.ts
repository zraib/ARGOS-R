// ============================================================================
// ARGOS — gate de sécurité du module « bons de travail »
//
// Le découplage vis-à-vis de la base ne relâche RIEN sur la sécurité : les
// nouvelles routes passent par les mêmes gardes globales (JWT + RBAC
// default-deny) que le reste de l'API. Ce fichier le prouve de bout en bout.
// ============================================================================

import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

describe("Bons de travail — RBAC et cycle de vie via HTTP", () => {
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

  it("refuse l'accès sans jeton (401)", async () => {
    await base().get("/api/orders").expect(401);
  });

  it("DEFAULT-DENY : resp_morgue ne peut pas lire les bons de travail (403)", async () => {
    const tok = await devToken("morgue", "resp_morgue");
    await base().get("/api/orders").set("Authorization", `Bearer ${tok}`).expect(403);
  });

  it("DEFAULT-DENY : l'administrateur lit mais ne crée pas (403)", async () => {
    const tok = await devToken("admin", "admin");
    await base().get("/api/orders").set("Authorization", `Bearer ${tok}`).expect(200);
    await base()
      .post("/api/orders")
      .set("Authorization", `Bearer ${tok}`)
      .send({ subject: "Essai", unit: "3e BG", priority: "low", sla: "Demain" })
      .expect(403);
  });

  it("la Cellule Verte pilote la file des bons", async () => {
    const tok = await devToken("log", "greencell");
    const list = await base().get("/api/orders").set("Authorization", `Bearer ${tok}`).expect(200);
    expect(Array.isArray(list.body)).toBe(true);

    const created = await base()
      .post("/api/orders")
      .set("Authorization", `Bearer ${tok}`)
      .send({ subject: "Acheminer 20 tentes — Asni", unit: "2e GL", priority: "urgent", sla: "Aujourd'hui 20:00" })
      .expect(201);
    expect(created.body.status).toBe("requested");

    const id = created.body.id as string;
    await base().patch(`/api/orders/${id}/status`).set("Authorization", `Bearer ${tok}`).send({ status: "approved" }).expect(200);
    await base().patch(`/api/orders/${id}/assignee`).set("Authorization", `Bearer ${tok}`).send({ assignee: "Sgt. M. Lamrani" }).expect(200);
    const assigned = await base()
      .patch(`/api/orders/${id}/status`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "assigned" })
      .expect(200);
    expect(assigned.body.assignee).toBe("Sgt. M. Lamrani");
  });

  it("une transition interdite renvoie 409 (erreur de domaine traduite)", async () => {
    const tok = await devToken("log", "greencell");
    const created = await base()
      .post("/api/orders")
      .set("Authorization", `Bearer ${tok}`)
      .send({ subject: "Contrôle NRBC", unit: "4e NRBC", priority: "medium", sla: "Demain 10:00" })
      .expect(201);
    await base()
      .patch(`/api/orders/${created.body.id}/status`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "verified" })
      .expect(409);
  });

  it("un bon inexistant renvoie 404", async () => {
    const tok = await devToken("log", "greencell");
    await base().get("/api/orders/BT-0000").set("Authorization", `Bearer ${tok}`).expect(404);
  });

  it("expose les indicateurs de pilotage", async () => {
    const tok = await devToken("log", "greencell");
    const res = await base().get("/api/orders/summary").set("Authorization", `Bearer ${tok}`).expect(200);
    expect(res.body).toHaveProperty("open");
    expect(res.body).toHaveProperty("byStatus.inprogress");
  });
});
