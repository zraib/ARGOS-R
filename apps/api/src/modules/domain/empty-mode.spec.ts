import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// ARGOS — station vide (ADR 0015) : suppressions, bascules effectives, purge
//
// Ce que ce fichier prouve :
//   1. les entités (unité, abri, morgue, hôpital) se suppriment — par le seul
//      Super Administrateur, avec des garde-fous qui disent ce qui retient
//      l'entité et un `force` qui passe outre en connaissance de cause ;
//   2. les bascules d'administration sont EFFECTIVES côté API : un module coupé
//      pour un rôle lui est refusé ; un drapeau global coupé est refusé à tous,
//      joker compris — et tout compte lit ces bascules pour se masquer ;
//   3. la purge signée vide le domaine en gardant le réseau hospitalier, les
//      comptes et le profil de données annoncé.
// ============================================================================

describe("Station vide — suppressions, bascules, purge", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });

  const devToken = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  let root: string;
  let admin: string;

  const createUnit = async (nom: string): Promise<string> => {
    const res = await base().post("/api/units").set(auth(root))
      .send({ nom, ville: "Rabat", eff: 40, dispo: "ready", readiness: 80, x: 300, y: 150, ll: [-6.84, 34.02] })
      .expect(201);
    return res.body.id as string;
  };
  const createIncident = async (titre: string, responders?: { units: string[]; hospitals: string[]; morgues?: string[] }): Promise<string> => {
    const res = await base().post("/api/incidents").set(auth(root))
      .send({ type: "wildfire", titre, region: "Fès-Meknès", sev: "high", st: "open", x: 300, y: 150, ll: [-5.11, 33.53], ...(responders ? { responders } : {}) })
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
    root = await devToken("m.zraib", "superadmin");
    admin = await devToken("h.alami", "admin");
  });

  afterAll(async () => {
    await app.close();
  });

  // --- 1. suppressions -----------------------------------------------------

  it("l'ADMINISTRATEUR ne supprime ni unité, ni abri, ni morgue, ni hôpital (403)", async () => {
    const id = await createUnit("Unité test — admin");
    await base().delete(`/api/units/${id}`).set(auth(admin)).expect(403);
    await base().delete("/api/shelters/AB-01").set(auth(admin)).expect(403);
    await base().delete("/api/morgues/M1").set(auth(admin)).expect(403);
    await base().delete("/api/hospitals/H1").set(auth(admin)).expect(403);
    const units = await base().get("/api/units").set(auth(root)).expect(200);
    expect(units.body.map((u: { id: string }) => u.id)).toContain(id);
  });

  it("le Super Administrateur supprime une unité libre — elle disparaît, avec son parc", async () => {
    const id = await createUnit("Unité test — libre");
    await base().post(`/api/equipment-parks/${id}/items`).set(auth(root))
      .send({ desig: "Groupe électrogène", cat: "Énergie", stock: 2, threshold: 1, cond: "ok" }).expect(201);
    const res = await base().delete(`/api/units/${id}`).set(auth(root)).expect(200);
    expect(res.body.deleted).toBe(id);
    expect(res.body.removed).toBeGreaterThanOrEqual(2);
    const units = await base().get("/api/units").set(auth(root)).expect(200);
    expect(units.body.map((u: { id: string }) => u.id)).not.toContain(id);
    await base().delete(`/api/units/${id}`).set(auth(root)).expect(404);
  });

  it("une unité engagée sur une opération active est retenue (409, garde-fous nommés) ; `force` la retire et la désengage", async () => {
    const id = await createUnit("Unité test — engagée");
    const inc = await createIncident("Feu de forêt — unité engagée", { units: [id], hospitals: [] });
    const refus = await base().delete(`/api/units/${id}`).set(auth(root)).expect(409);
    expect(refus.body.blockers).toEqual([expect.stringContaining(inc)]);
    await base().delete(`/api/units/${id}?force=true`).set(auth(root)).expect(200);
    const incidents = await base().get("/api/incidents").set(auth(root)).expect(200);
    const incident = incidents.body.find((i: { id: string }) => i.id === inc);
    expect(incident.responders.units).not.toContain(id);
  });

  it("une morgue qui a des corps au registre est retenue ; vide, elle part avec ses postes", async () => {
    const site = await base().post("/api/morgues").set(auth(root))
      .send({ nom: "Morgue test", type: "temporary", region: "Fès-Meknès", ville: "Fès", capacity: 10, ll: [-5.0, 34.03] })
      .expect(201);
    const mid = site.body.id as string;
    await base().post(`/api/morgues/${mid}/records`).set(auth(root)).send({ sex: "unknown" }).expect(201);
    const refus = await base().delete(`/api/morgues/${mid}`).set(auth(root)).expect(409);
    expect(refus.body.blockers[0]).toMatch(/corps au registre/);
    // En connaissance de cause : le site et son registre partent ensemble.
    const res = await base().delete(`/api/morgues/${mid}?force=1`).set(auth(root)).expect(200);
    expect(res.body.removed).toBe(2);
    const morgues = await base().get("/api/morgues").set(auth(root)).expect(200);
    expect(morgues.body.map((m: { id: string }) => m.id)).not.toContain(mid);
  });

  it("un hôpital part avec ses services ; une morgue qui lui était rattachée est détachée, pas supprimée", async () => {
    const h = await base().post("/api/hospitals").set(auth(root))
      .send({ nom: "Hôpital test", ville: "Fès", lits: 100, rea: 10, staff: 50, amb: 4, heli: 0, x: 300, y: 150, ll: [-5.0, 34.03] })
      .expect(201);
    const hid = h.body.id as string;
    await base().post(`/api/hospitals/${hid}/wards`).set(auth(root)).send({ nom: "Urgences", lits: 20, occ: 5, statut: "open" }).expect(201);
    const m = await base().post("/api/morgues").set(auth(root))
      .send({ nom: "Chambre mortuaire test", type: "hospital", region: "Fès-Meknès", ville: "Fès", capacity: 6, hospitalId: hid })
      .expect(201);
    const mid = m.body.id as string;
    const refus = await base().delete(`/api/hospitals/${hid}`).set(auth(root)).expect(409);
    expect(refus.body.blockers[0]).toMatch(/morgue\(s\) rattachée\(s\)/);
    const res = await base().delete(`/api/hospitals/${hid}?force=true`).set(auth(root)).expect(200);
    expect(res.body.removed).toBe(2); // l'établissement + son service
    const hospitals = await base().get("/api/hospitals").set(auth(root)).expect(200);
    expect(hospitals.body.map((x: { id: string }) => x.id)).not.toContain(hid);
    const morgues = await base().get("/api/morgues").set(auth(root)).expect(200);
    const kept = morgues.body.find((x: { id: string; hospitalId?: string }) => x.id === mid);
    expect(kept).toBeDefined();
    expect(kept.hospitalId).toBeUndefined();
  });

  // --- 2. bascules effectives ---------------------------------------------

  it("tout compte lit les drapeaux et la matrice rôle → modules (pour masquer ce que l'API refuse)", async () => {
    const resp = await devToken("n.fassi", "resp_unit");
    const flags = await base().get("/api/flags").set(auth(resp)).expect(200);
    expect(flags.body.hospitals).toBe(true);
    const rf = await base().get("/api/iam/role-features").set(auth(resp)).expect(200);
    expect(rf.body.resp_unit.units).toBe(true);
    const defaults = await base().get("/api/iam/role-features/defaults").set(auth(resp)).expect(200);
    expect(defaults.body.resp_hospital.hospitals).toBe(true);
    // Mais il ne les MODIFIE pas.
    await base().patch("/api/iam/role-features/resp_unit").set(auth(resp)).send({ feature: "units", enabled: false }).expect(403);
    await base().patch("/api/flags/hospitals").set(auth(resp)).send({ enabled: false }).expect(403);
  });

  it("un module coupé pour un rôle lui est refusé par l'API, puis rendu par la réinitialisation", async () => {
    const resp = await devToken("s.moutaouakil", "resp_hospital");
    await base().get("/api/hospitals").set(auth(resp)).expect(200);
    await base().patch("/api/iam/role-features/resp_hospital").set(auth(root)).send({ feature: "hospitals", enabled: false }).expect(200);
    const refus = await base().get("/api/hospitals").set(auth(resp)).expect(403);
    expect(refus.body.message).toMatch(/Module coupé pour le rôle resp_hospital : hospitals/);
    // Le cœur reste : le compte se lit toujours lui-même.
    await base().get("/api/iam/me").set(auth(resp)).expect(200);
    // L'administrateur n'est pas concerné : sa matrice est verrouillée ouverte.
    await base().get("/api/hospitals").set(auth(admin)).expect(200);
    await base().post("/api/iam/role-features/resp_hospital/reset").set(auth(root)).expect(201);
    await base().get("/api/hospitals").set(auth(resp)).expect(200);
  });

  it("un drapeau global coupé ferme le module à TOUS, joker compris — et se rallume depuis les Paramètres", async () => {
    await base().patch("/api/flags/shelters").set(auth(root)).send({ enabled: false }).expect(200);
    await base().get("/api/shelters").set(auth(admin)).expect(403);
    const refus = await base().get("/api/shelters").set(auth(root)).expect(403);
    expect(refus.body.message).toMatch(/Module désactivé : shelters/);
    // Le module `settings` ne se coupe pas : on peut toujours rallumer.
    await base().patch("/api/flags/shelters").set(auth(root)).send({ enabled: true }).expect(200);
    await base().get("/api/shelters").set(auth(root)).expect(200);
  });

  it("un module inconnu ou un drapeau inconnu sont refusés (400 / 404)", async () => {
    await base().patch("/api/iam/role-features/resp_unit").set(auth(root)).send({ feature: "hospinet", enabled: false }).expect(400);
    await base().patch("/api/flags/hospinet").set(auth(root)).send({ enabled: false }).expect(404);
  });

  // --- 3. profil et purge ---------------------------------------------------

  it("le profil de données est annoncé (santé, référentiel, administration) — « demo » sous test", async () => {
    const health = await base().get("/api/health").expect(200);
    expect(health.body.dataProfile).toBe("demo");
    const ref = await base().get("/api/reference").set(auth(root)).expect(200);
    expect(ref.body.dataProfile).toBe("demo");
    expect(ref.body.vehRoutes.length).toBeGreaterThan(0);
    const profile = await base().get("/api/domain/profile").set(auth(root)).expect(200);
    expect(profile.body.profile).toBe("demo");
    expect(profile.body.counts.hospitals).toBeGreaterThan(0);
    await base().get("/api/domain/profile").set(auth(admin)).expect(200);
  });

  it("la purge : refusée à l'administrateur, non signée sans le bon mot de passe, puis vide tout sauf le réseau hospitalier et les comptes", async () => {
    await createIncident("Incident à purger");
    await base().post("/api/domain/purge").set(auth(admin)).send({ password: "argos" }).expect(403);
    await base().post("/api/domain/purge").set(auth(root)).send({ password: "mauvais" }).expect(403);
    const before = await base().get("/api/hospitals").set(auth(root)).expect(200);
    const res = await base().post("/api/domain/purge").set(auth(root)).send({ password: "ARGOS-2026" }).expect(200);
    expect(res.body.removed).toBeGreaterThan(0);
    expect(res.body.incidents).toBeGreaterThan(0);
    for (const path of ["/api/incidents", "/api/units", "/api/shelters", "/api/morgues"]) {
      const r = await base().get(path).set(auth(root)).expect(200);
      expect(r.body).toEqual([]);
    }
    // Le fil ne garde que la trace du geste lui-même.
    const feed = await base().get("/api/feed").set(auth(root)).expect(200);
    expect(feed.body.map((f: { txt: string }) => f.txt)).toEqual([expect.stringContaining("remis à zéro par m.zraib")]);
    const after = await base().get("/api/hospitals").set(auth(root)).expect(200);
    expect(after.body.length).toBe(before.body.length);
    const users = await base().get("/api/iam/users").set(auth(root)).expect(200);
    expect(users.body.length).toBeGreaterThan(3);
    const profile = await base().get("/api/domain/profile").set(auth(root)).expect(200);
    expect(profile.body.seededLeft).toBe(0);
  });
});
