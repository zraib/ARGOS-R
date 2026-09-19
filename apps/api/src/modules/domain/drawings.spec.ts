import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Croquis sur la carte (mode dessin) : points, cercles, polygones nommés —
// vus de qui voit la carte, dessinés par qui l'édite, retirés par l'auteur ou
// l'administration ; la géométrie est vérifiée.
// ============================================================================

describe("Croquis dessinés sur la carte", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => app.close());

  it("l'OPCOM dessine un point, un cercle et un polygone ; tout le monde les voit ; le nom et l'étiquette se déplacent", async () => {
    const opcom = await jeton("o.chraibi", "opcom");
    const wali = await jeton("w.rabat", "wali");
    const pt = (await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "point", label: "Point de regroupement", coords: [[-6.84, 34.02]] }).expect(201)).body;
    const cercle = (await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "circle", label: "Zone d'exclusion", coords: [[-7.6, 33.58]], radiusM: 800, color: "#ef4444" }).expect(201)).body;
    const poly = (await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "polygon", label: "Secteur nord", coords: [[-7.6, 33.6], [-7.55, 33.6], [-7.55, 33.65]] }).expect(201)).body;
    expect([pt.id, cercle.id, poly.id].every((id: string) => /^D\d+$/.test(id))).toBe(true);
    expect(cercle.radiusM).toBe(800);
    const vus = (await base().get("/api/drawings").set(bearer(wali)).expect(200)).body as { id: string }[];
    expect(vus.map((d) => d.id)).toEqual(expect.arrayContaining([pt.id, cercle.id, poly.id]));
    // Renommer, déplacer l'étiquette, ajouter un sommet.
    const maj = (await base().patch(`/api/drawings/${poly.id}`).set(bearer(opcom)).send({ label: "Secteur nord-est", labelLL: [-7.57, 33.62], coords: [[-7.6, 33.6], [-7.55, 33.6], [-7.55, 33.65], [-7.6, 33.65]] }).expect(200)).body;
    expect(maj.label).toBe("Secteur nord-est");
    expect(maj.labelLL).toEqual([-7.57, 33.62]);
    expect(maj.coords).toHaveLength(4);
    expect(maj.updatedBy).toBe("o.chraibi");
  });

  it("la géométrie est vérifiée ; le wali ne dessine pas ; l'auteur ou l'administration seuls retirent", async () => {
    const opcom = await jeton("o.chraibi", "opcom");
    const tacom = await jeton("t.chef", "tacom");
    const wali = await jeton("w.rabat", "wali");
    const root = await jeton("m.zraib", "superadmin");
    await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "polygon", label: "x", coords: [[-7.6, 33.6], [-7.55, 33.6]] }).expect(400);
    await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "circle", label: "x", coords: [[-7.6, 33.6]] }).expect(400);
    await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "point", label: "x", coords: [[-7.6, 33.6]], color: "rouge" }).expect(400);
    await base().post("/api/drawings").set(bearer(wali)).send({ kind: "point", label: "x", coords: [[-7.6, 33.6]] }).expect(403);
    const mien = (await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "point", label: "Le mien", coords: [[-6.8, 34.0]] }).expect(201)).body;
    await base().delete(`/api/drawings/${mien.id}`).set(bearer(tacom)).expect(403);
    await base().patch(`/api/drawings/${mien.id}`).set(bearer(tacom)).send({ label: "Renommé par le TACOM" }).expect(200);
    await base().delete(`/api/drawings/${mien.id}`).set(bearer(opcom)).expect(200);
    await base().delete(`/api/drawings/${mien.id}`).set(bearer(root)).expect(404);
    const autre = (await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "point", label: "Retiré par l'admin", coords: [[-6.8, 34.0]] }).expect(201)).body;
    await base().delete(`/api/drawings/${autre.id}`).set(bearer(root)).expect(200);
  });
});
