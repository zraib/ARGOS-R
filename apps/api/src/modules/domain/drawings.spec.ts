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

  it("la géométrie est vérifiée ; tout le monde dessine (le wali, un commandant d'unité, un rôle direx) ; seuls l'auteur et le Super Administrateur modifient ou retirent", async () => {
    const opcom = await jeton("o.chraibi", "opcom");
    const tacom = await jeton("t.chef", "tacom");
    const wali = await jeton("w.rabat", "wali");
    const admin = await jeton("h.alami", "admin");
    const root = await jeton("m.zraib", "superadmin");
    await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "polygon", label: "x", coords: [[-7.6, 33.6], [-7.55, 33.6]] }).expect(400);
    await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "circle", label: "x", coords: [[-7.6, 33.6]] }).expect(400);
    await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "point", label: "x", coords: [[-7.6, 33.6]], color: "rouge" }).expect(400);
    // Dessiner est ouvert à qui voit la carte — les deux profils.
    const duWali = (await base().post("/api/drawings").set(bearer(wali)).send({ kind: "point", label: "Point du wali", coords: [[-6.9, 34.0]] }).expect(201)).body;
    const cdt = await jeton("n.fassi", "resp_unit");
    await base().post("/api/drawings").set(bearer(cdt)).send({ kind: "circle", label: "Cercle du commandant", coords: [[-6.9, 34.0]], radiusM: 300 }).expect(201);
    // Sous le mode Direx aussi : l'OPS / PC FAR dessine, et voit ce que le wali a dessiné sous l'autre mode.
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "direx", password: "ARGOS-2026" }).expect(200);
    const ops = await jeton("o.pcfar", "pcfar_ops");
    const direx = (await base().post("/api/drawings").set(bearer(ops)).send({ kind: "polygon", label: "Secteur PC FAR", coords: [[-7.6, 33.6], [-7.5, 33.6], [-7.5, 33.7]] }).expect(201)).body;
    expect(((await base().get("/api/drawings").set(bearer(ops)).expect(200)).body as { id: string }[]).map((d) => d.id)).toEqual(expect.arrayContaining([duWali.id, direx.id]));
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" }).expect(200);
    const mien = (await base().post("/api/drawings").set(bearer(opcom)).send({ kind: "point", label: "Le mien", coords: [[-6.8, 34.0]] }).expect(201)).body;
    // Un autre compte — même l'administrateur — ne touche pas au croquis d'autrui ; l'auteur et le Super Administrateur, si.
    await base().patch(`/api/drawings/${mien.id}`).set(bearer(tacom)).send({ label: "Renommé par le TACOM" }).expect(403);
    await base().delete(`/api/drawings/${mien.id}`).set(bearer(tacom)).expect(403);
    await base().patch(`/api/drawings/${mien.id}`).set(bearer(admin)).send({ label: "Renommé par l'admin" }).expect(403);
    await base().patch(`/api/drawings/${mien.id}`).set(bearer(opcom)).send({ label: "Renommé par l'auteur" }).expect(200);
    await base().patch(`/api/drawings/${mien.id}`).set(bearer(root)).send({ label: "Renommé par le Super Administrateur" }).expect(200);
    await base().delete(`/api/drawings/${mien.id}`).set(bearer(opcom)).expect(200);
    await base().delete(`/api/drawings/${mien.id}`).set(bearer(root)).expect(404);
    await base().delete(`/api/drawings/${duWali.id}`).set(bearer(admin)).expect(403);
    await base().delete(`/api/drawings/${duWali.id}`).set(bearer(root)).expect(200);
  });
});
