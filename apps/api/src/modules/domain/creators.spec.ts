import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// ADR 0030 — qui CRÉE sur la carte (profil direx) : unité, abri, hôpital,
// hôpital de campagne, morgue, morgue mobile.
//
// Décision du 23 septembre 2026 : le Super Administrateur, les chefs, les Rens,
// les OPS, les LOG et l'Anim. Chaque création porte ses coordonnées et
// ressort avec elles ; la synthèse et l'évaluation observent (403).
// ============================================================================

describe("ADR 0030 — créer une entité : chefs, Rens, OPS, LOG, Anim (profil direx)", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  let root: string;
  let hopital: string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await jeton("m.zraib", "superadmin");
    hopital = ((await base().get("/api/hospitals").set(bearer(root)).expect(200)).body as { id: string }[])[0].id;
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "direx", password: "ARGOS-2026" }).expect(200);
  });
  afterAll(async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" });
    await app.close();
  });

  // Une famille par rôle représentatif — chefs de PC opératif et tactique, Rens des deux niveaux, OPS, LOG, Anim, RLS.
  const CREATEURS = [
    ["c.pcfar", "pcfar_chef"], ["c.pct", "pct_chef"], ["c.pco", "pco_chef"],
    ["r.pcf", "pcf_planif_rens"], ["r.pct", "pct_rens"], ["r.direx", "direx_rls"],
    ["o.pco", "pco_ops"], ["l.pcf", "pcf_log"], ["n.direx", "direx_anim"],
  ] as const;

  it("chacun crée une unité, un hôpital, un hôpital de campagne, une morgue et une morgue mobile — coordonnées comprises", async () => {
    let k = 0;
    for (const [u, r] of CREATEURS) {
      const t = await jeton(u, r);
      k += 1;
      const ll: [number, number] = [-6.8 - k / 100, 34.0 + k / 100];
      const unite = (await base().post("/api/units").set(bearer(t))
        .send({ nom: `Unité ${r}`, corps: "far", ville: "Rabat", eff: 20, dispo: "ready", readiness: 70, x: 300, y: 150, ll })
        .expect(201)).body as { ll: [number, number] };
      expect(unite.ll).toEqual(ll);

      const hop = (await base().post("/api/hospitals").set(bearer(t))
        .send({ nom: `Hôpital ${r}`, ville: "Rabat", kind: "civ", type: "Hôpital provincial", region: "Rabat-Salé-Kénitra", province: "Rabat", lits: 50, rea: 4, staff: 30, amb: 2, heli: 0, x: 300, y: 150, ll })
        .expect(201)).body as { ll: [number, number] };
      expect(hop.ll).toEqual(ll);

      const campagne = (await base().post("/api/field-hospitals").set(bearer(t))
        .send({ hospitalId: hopital, ll, cap: 40 })
        .expect(201)).body as { ll: [number, number] };
      expect(campagne.ll).toEqual(ll);

      const morgue = (await base().post("/api/morgues").set(bearer(t))
        .send({ nom: `Morgue ${r}`, type: "temporary", region: "Rabat-Salé-Kénitra", ville: "Rabat", capacity: 10, ll })
        .expect(201)).body as { ll: [number, number] };
      expect(morgue.ll).toEqual(ll);

      const mobile = (await base().post("/api/morgues/mobile").set(bearer(t))
        .send({ nom: `Morgue mobile ${r}`, site: "Rabat", capacity: 12, ll, type: "truck" })
        .expect(201)).body as { ll: [number, number]; kind: string };
      expect(mobile.ll).toEqual(ll);
      expect(mobile.kind).toBe("mobile");
    }
  });

  it("la synthèse et l'évaluation observent : aucune création", async () => {
    const ll: [number, number] = [-6.9, 34.1];
    for (const [u, r] of [["s.pcfar", "pcfar_synth"], ["e.direx", "direx_eval"]] as const) {
      const t = await jeton(u, r);
      await base().post("/api/units").set(bearer(t)).send({ nom: "Refusée", corps: "far", ville: "Rabat", eff: 1, dispo: "ready", readiness: 1, x: 1, y: 1, ll }).expect(403);
      await base().post("/api/hospitals").set(bearer(t)).send({ nom: "Refusé", ville: "Rabat", kind: "civ", type: "Hôpital provincial", region: "Rabat-Salé-Kénitra", province: "Rabat", lits: 1, rea: 0, staff: 1, amb: 0, heli: 0, x: 1, y: 1, ll }).expect(403);
      await base().post("/api/field-hospitals").set(bearer(t)).send({ hospitalId: hopital, ll, cap: 10 }).expect(403);
      await base().post("/api/morgues").set(bearer(t)).send({ nom: "Refusée", type: "temporary", region: "Rabat-Salé-Kénitra", ville: "Rabat", capacity: 1, ll }).expect(403);
    }
  });

  it("créer n'est pas retirer : un chef de PCT ne supprime pas l'unité qu'il vient de créer", async () => {
    const t = await jeton("c.pct", "pct_chef");
    const u = (await base().post("/api/units").set(bearer(t))
      .send({ nom: "Unité du chef", corps: "far", ville: "Rabat", eff: 5, dispo: "ready", readiness: 50, x: 1, y: 1, ll: [-6.84, 34.02] })
      .expect(201)).body as { id: string };
    await base().delete(`/api/units/${u.id}?force=true`).set(bearer(t)).expect(403);
    await base().delete(`/api/units/${u.id}?force=true`).set(bearer(root)).expect(200);
  });
});
