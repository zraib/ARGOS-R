import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// ADR 0034 — les personnes IMPLIQUÉES : touchées par l'incident (évacuées,
// relogées, sinistrées, témoins…) sans être blessées, disparues ni décédées.
// Elles se déclarent et s'affinent comme le reste du bilan, mais ne comptent
// jamais parmi les victimes.
// ============================================================================

describe("ADR 0034 — personnes impliquées", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let root: string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = (await base().post("/api/auth/dev-token").send({ username: "m.zraib", role: "superadmin" }).expect(201)).body.access_token as string;
  });
  afterAll(async () => {
    await app.close();
  });

  type Cas = { dead: number; injured: number; missing: number; involved?: number };
  const lire = async (id: string): Promise<Cas> =>
    ((await base().get("/api/incidents").set(bearer(root)).expect(200)).body as { id: string; casualties: Cas }[]).find((i) => i.id === id)!.casualties;

  it("déclarées avec l'incident, elles restent hors du total des victimes ; nommées, elles s'ajoutent à elles seules", async () => {
    const inc = (await base().post("/api/incidents").set(bearer(root))
      .send({ type: "flood", titre: "Crue — quartier évacué", region: "Rabat-Salé-Kénitra", sev: "high", st: "open", x: 300, y: 150, ll: [-6.82, 34.01], casualties: { dead: 1, injured: 2, missing: 0, involved: 40 } })
      .expect(201)).body as { id: string; casualties: Cas };
    expect(inc.casualties.involved).toBe(40);

    const tdb = (await base().get(`/api/incidents/${inc.id}/dashboard`).set(bearer(root)).expect(200)).body as { casualties: Cas & { total: number } };
    expect(tdb.casualties.total).toBe(3);
    expect(tdb.casualties.involved).toBe(40);

    // Une personne impliquée nommée : le compteur tient le plus grand des deux.
    await base().post(`/api/incidents/${inc.id}/victims`).set(bearer(root)).send({ kind: "involved", lastName: "Alaoui", firstName: "Samir", note: "Relogé au gymnase" }).expect(201);
    expect(await lire(inc.id)).toMatchObject({ dead: 1, injured: 2, missing: 0, involved: 40 });

    // Un client qui corrige le bilan SANS les impliqués ne les remet pas à zéro.
    await base().patch(`/api/incidents/${inc.id}`).set(bearer(root)).send({ casualties: { dead: 1, injured: 3, missing: 0 } }).expect(200);
    expect(await lire(inc.id)).toMatchObject({ injured: 3, involved: 40 });

    // Corrigés à 0, il reste la personne nommée.
    await base().patch(`/api/incidents/${inc.id}`).set(bearer(root)).send({ casualties: { dead: 1, injured: 3, missing: 0, involved: 0 } }).expect(200);
    expect((await lire(inc.id)).involved).toBe(1);
  });

  it("un nombre négatif est refusé", async () => {
    await base().post("/api/incidents").set(bearer(root))
      .send({ type: "flood", titre: "Refus", region: "Rabat-Salé-Kénitra", sev: "low", st: "open", x: 1, y: 1, ll: [-6.8, 34.0], casualties: { dead: 0, injured: 0, missing: 0, involved: -3 } })
      .expect(400);
  });
});
