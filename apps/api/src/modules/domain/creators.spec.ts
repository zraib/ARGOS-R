import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// ADR 0030 — qui CRÉE sur la carte (profil direx) : unité, abri, hôpital,
// hôpital de campagne, morgue, morgue mobile — et, depuis la révision du même
// jour, qui crée SUPPRIME.
//
// Décision du 23 septembre 2026 : le Super Administrateur, les chefs, les Rens,
// les OPS, les LOG et l'Anim. Chaque création porte ses coordonnées et
// ressort avec elles ; chacun retire ce qu'il a créé ; la synthèse et
// l'évaluation observent (403).
// ============================================================================

describe("ADR 0030 — créer et supprimer une entité : chefs, Rens, OPS, LOG, Anim (profil direx)", () => {
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

  it("qui crée supprime : chacun retire l'unité, l'hôpital, l'hôpital de campagne, la morgue, la morgue mobile et l'abri qu'il a créés", async () => {
    let k = 0;
    for (const [u, r] of CREATEURS) {
      const t = await jeton(u, r);
      k += 1;
      const ll: [number, number] = [-7.2 - k / 100, 33.5 + k / 100];
      const unite = (await base().post("/api/units").set(bearer(t))
        .send({ nom: `Unité à retirer ${r}`, corps: "far", ville: "Rabat", eff: 5, dispo: "ready", readiness: 50, x: 1, y: 1, ll })
        .expect(201)).body as { id: string };
      await base().delete(`/api/units/${unite.id}`).set(bearer(t)).expect(200);

      const hop = (await base().post("/api/hospitals").set(bearer(t))
        .send({ nom: `Hôpital à retirer ${r}`, ville: "Rabat", kind: "civ", type: "Hôpital provincial", region: "Rabat-Salé-Kénitra", province: "Rabat", lits: 20, rea: 2, staff: 10, amb: 1, heli: 0, x: 1, y: 1, ll })
        .expect(201)).body as { id: string };
      await base().delete(`/api/hospitals/${hop.id}`).set(bearer(t)).expect(200);

      const campagne = (await base().post("/api/field-hospitals").set(bearer(t))
        .send({ hospitalId: hopital, ll, cap: 20 })
        .expect(201)).body as { id: string };
      expect(campagne.id).toMatch(/^HDC-\d{2,}$/);
      await base().delete(`/api/field-hospitals/${campagne.id}`).set(bearer(t)).expect(200);

      const morgue = (await base().post("/api/morgues").set(bearer(t))
        .send({ nom: `Morgue à retirer ${r}`, type: "temporary", region: "Rabat-Salé-Kénitra", ville: "Rabat", capacity: 5, ll })
        .expect(201)).body as { id: string };
      await base().delete(`/api/morgues/${morgue.id}`).set(bearer(t)).expect(200);

      const mobile = (await base().post("/api/morgues/mobile").set(bearer(t))
        .send({ nom: `Morgue mobile à retirer ${r}`, site: "Rabat", capacity: 6, ll, type: "truck" })
        .expect(201)).body as { id: string };
      await base().delete(`/api/morgues/${mobile.id}`).set(bearer(t)).expect(200);

      const abri = (await base().post("/api/shelters").set(bearer(t))
        .send({ nom: `Abri à retirer ${r}`, ville: "Rabat", kind: "tentes", tents: 4, perTent: 6, ll })
        .expect(201)).body as { id: string };
      await base().delete(`/api/shelters/${abri.id}`).set(bearer(t)).expect(200);
    }
  });

  it("la synthèse et l'évaluation ne suppriment rien", async () => {
    const ll: [number, number] = [-7.4, 33.4];
    const unite = (await base().post("/api/units").set(bearer(root)).send({ nom: "Unité gardée", corps: "far", ville: "Rabat", eff: 5, dispo: "ready", readiness: 50, x: 1, y: 1, ll }).expect(201)).body as { id: string };
    const hop = (await base().post("/api/hospitals").set(bearer(root)).send({ nom: "Hôpital gardé", ville: "Rabat", kind: "civ", type: "Hôpital provincial", region: "Rabat-Salé-Kénitra", province: "Rabat", lits: 20, rea: 2, staff: 10, amb: 1, heli: 0, x: 1, y: 1, ll }).expect(201)).body as { id: string };
    const campagne = (await base().post("/api/field-hospitals").set(bearer(root)).send({ hospitalId: hopital, ll, cap: 20 }).expect(201)).body as { id: string };
    const morgue = (await base().post("/api/morgues").set(bearer(root)).send({ nom: "Morgue gardée", type: "temporary", region: "Rabat-Salé-Kénitra", ville: "Rabat", capacity: 5, ll }).expect(201)).body as { id: string };
    const abri = (await base().post("/api/shelters").set(bearer(root)).send({ nom: "Abri gardé", ville: "Rabat", kind: "tentes", tents: 4, perTent: 6, ll }).expect(201)).body as { id: string };
    for (const [u, r] of [["s.pcfar", "pcfar_synth"], ["e.direx", "direx_eval"]] as const) {
      const t = await jeton(u, r);
      await base().delete(`/api/units/${unite.id}`).set(bearer(t)).expect(403);
      await base().delete(`/api/hospitals/${hop.id}`).set(bearer(t)).expect(403);
      await base().delete(`/api/field-hospitals/${campagne.id}`).set(bearer(t)).expect(403);
      await base().delete(`/api/morgues/${morgue.id}`).set(bearer(t)).expect(403);
      await base().delete(`/api/shelters/${abri.id}`).set(bearer(t)).expect(403);
    }
    for (const chemin of [`units/${unite.id}`, `hospitals/${hop.id}`, `field-hospitals/${campagne.id}`, `morgues/${morgue.id}`, `shelters/${abri.id}`]) {
      await base().delete(`/api/${chemin}`).set(bearer(root)).expect(200);
    }
  });

  it("un hôpital de campagne qui sert une opération active est retenu (409) ; forcé, il part — un inconnu répond 404", async () => {
    const t = await jeton("c.pct", "pct_chef");
    const inc = (await base().post("/api/incidents").set(bearer(root))
      .send({ type: "flood", titre: "Crue — détachement engagé", region: "Rabat-Salé-Kénitra", sev: "high", st: "open", x: 300, y: 150, ll: [-6.82, 34.01] })
      .expect(201)).body as { id: string };
    const campagne = (await base().post("/api/field-hospitals").set(bearer(t))
      .send({ hospitalId: hopital, ll: [-6.83, 34.02], cap: 30, incidentId: inc.id })
      .expect(201)).body as { id: string; nom: string };
    const refus = (await base().delete(`/api/field-hospitals/${campagne.id}`).set(bearer(t)).expect(409)).body as { blockers: string[] };
    expect(refus.blockers).toContain(`engagé sur ${inc.id}`);
    await base().delete(`/api/field-hospitals/${campagne.id}?force=true`).set(bearer(t)).expect(200);
    const reste = (await base().get("/api/field-hospitals").set(bearer(root)).expect(200)).body as { id: string }[];
    expect(reste.some((f) => f.id === campagne.id)).toBe(false);
    await base().delete(`/api/field-hospitals/${campagne.id}`).set(bearer(t)).expect(404);
    // Le numéro libéré se réemploie, jamais deux détachements du même nom.
    const suivant = (await base().post("/api/field-hospitals").set(bearer(t)).send({ hospitalId: hopital, ll: [-6.83, 34.02] }).expect(201)).body as { id: string; nom: string };
    const noms = ((await base().get("/api/field-hospitals").set(bearer(root)).expect(200)).body as { nom: string }[]).map((f) => f.nom);
    expect(new Set(noms).size).toBe(noms.length);
    await base().delete(`/api/field-hospitals/${suivant.id}`).set(bearer(root)).expect(200);
  });
});
