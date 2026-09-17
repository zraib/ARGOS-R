import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Chaîne de commandement pendant un incident (ADR 0016) — de bout en bout
//
//   1. l'OPCOM affecte des unités par corps, vers le PCO ou le PCT ; le TACOM
//      et les cellules déploient et retirent ; une unité n'est affectée qu'à
//      une opération à la fois ;
//   2. les ressources d'une entité sont tenues par son chef et par les
//      cellules selon le mode ; visibles par la conduite ;
//   3. une bascule de module PROPRE À UN COMPTE est effective côté API ;
//   4. une alerte s'acquitte, et l'acquittement survit.
// ============================================================================

describe("Chaîne de commandement — affectation, déploiement, ressources, bascule par compte", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });

  const devToken = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  let root: string;
  let inc: string;
  let far: string;
  let civil: string;
  let gend: string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await devToken("m.zraib", "superadmin");
    const mk = async (nom: string, corps: string) =>
      (await base().post("/api/units").set(auth(root)).send({ nom, corps, ville: "Casablanca", eff: 40, dispo: "ready", readiness: 80, x: 300, y: 150, ll: [-7.6, 33.57] }).expect(201)).body.id as string;
    far = await mk("Bataillon FAR — test", "far");
    civil = await mk("Compagnie DGPC — test", "dgpc");
    gend = await mk("Escadron Gendarmerie — test", "gendarmerie");
    inc = (
      await base().post("/api/incidents").set(auth(root))
        .send({ type: "wildfire", titre: "Feu — chaîne de commandement", region: "Casablanca-Settat", sev: "high", st: "open", x: 300, y: 150, ll: [-7.6, 33.57] })
        .expect(201)
    ).body.id as string;
    // L'OPCOM de démonstration et un représentant gendarmerie sont déployés sur l'opération.
    await base().post(`/api/incidents/${inc}/deployments`).set(auth(root)).send({ matricule: "o.chraibi" }).expect(201);
    await base().post("/api/iam/users").set(auth(root))
      .send({ matricule: "g.rep", nom: "Rep Gendarmerie", roles: ["gendarmerie"] }).expect(201);
    await base().post(`/api/incidents/${inc}/deployments`).set(auth(root)).send({ matricule: "g.rep" }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it("le wali affecte une unité civile (→ PCO), pas une unité des FAR ; le représentant gendarmerie, la sienne", async () => {
    const wali = await devToken("w.casa", "wali");
    const a = await base().post(`/api/incidents/${inc}/assignments`).set(auth(wali)).send({ unitId: civil, destination: "pct" }).expect(201);
    expect(a.body.destination).toBe("pco"); // civil → PCO, quoi qu'on demande
    await base().post(`/api/incidents/${inc}/assignments`).set(auth(wali)).send({ unitId: far }).expect(403);
    const g = await devToken("g.rep", "gendarmerie");
    await base().post(`/api/incidents/${inc}/assignments`).set(auth(g)).send({ unitId: gend }).expect(201);
    await base().post(`/api/incidents/${inc}/assignments`).set(auth(g)).send({ unitId: civil }).expect(403);
  });

  it("le chef de l'OPCOM affecte tout, vers le PCT pour les FAR ; l'unité porte son affectation ; une seule opération à la fois", async () => {
    const opcom = await devToken("o.chraibi", "opcom");
    const a = await base().post(`/api/incidents/${inc}/assignments`).set(auth(opcom)).send({ unitId: far, destination: "pct" }).expect(201);
    expect(a.body.destination).toBe("pct");
    const units = await base().get("/api/units").set(auth(root)).expect(200);
    const u = units.body.find((x: { id: string }) => x.id === far);
    expect(u.assignment).toEqual({ incidentId: inc, destination: "pct", deployed: false });
    const list = await base().get(`/api/incidents/${inc}/assignments`).set(auth(opcom)).expect(200);
    expect(list.body.assignments.map((x: { unitId: string }) => x.unitId).sort()).toEqual([civil, far, gend].sort());
    expect(list.body.assignableCorps).toBe("*");
    // Une seconde opération ne peut pas la prendre sans qu'on la retire.
    const inc2 = (await base().post("/api/incidents").set(auth(root))
      .send({ type: "flood", titre: "Crue — seconde", region: "Casablanca-Settat", sev: "medium", st: "open", x: 300, y: 150, ll: [-7.5, 33.5] }).expect(201)).body.id;
    await base().post(`/api/incidents/${inc2}/assignments`).set(auth(root)).send({ unitId: far }).expect(409);
  });

  it("le TACOM déploie et retire ; l'OPCOM ne déploie pas ; le retrait d'affectation ramène l'unité à disposition", async () => {
    const opcom = await devToken("o.chraibi", "opcom");
    await base().post(`/api/incidents/${inc}/assignments/${far}/deploy`).set(auth(opcom)).expect(403);
    const tacom = await devToken("s.bennani", "tacom");
    // Le TACOM de démonstration n'est pas déployé sur cette opération : on l'y déploie.
    await base().post(`/api/incidents/${inc}/deployments`).set(auth(root)).send({ matricule: "s.bennani" }).expect(201);
    const d = await base().post(`/api/incidents/${inc}/assignments/${far}/deploy`).set(auth(tacom)).expect(201);
    expect(d.body.deployedBy).toBe("s.bennani");
    let units = await base().get("/api/units").set(auth(root)).expect(200);
    expect(units.body.find((x: { id: string }) => x.id === far).dispo).toBe("deployed");
    await base().post(`/api/incidents/${inc}/assignments/${far}/withdraw`).set(auth(tacom)).expect(201);
    units = await base().get("/api/units").set(auth(root)).expect(200);
    expect(units.body.find((x: { id: string }) => x.id === far).dispo).toBe("ready");
    await base().delete(`/api/incidents/${inc}/assignments/${far}`).set(auth(opcom)).expect(200);
    units = await base().get("/api/units").set(auth(root)).expect(200);
    expect(units.body.find((x: { id: string }) => x.id === far).assignment).toBeUndefined();
  });

  it("ressources : le responsable tient sa seule unité ; la cellule bleue tient en démonstration ; la conduite lit", async () => {
    const resp = await devToken("n.fassi", "resp_unit"); // U3
    const p = await base().post("/api/resources/persons").set(auth(resp))
      .send({ owner: { kind: "unit", id: "U3" }, corps: "far", grade: "Sergent", nom: "Alami", prenom: "Karim", matricule: "MLE-1", fonction: "Chef de groupe" })
      .expect(201);
    expect(p.body.id).toMatch(/^P-/);
    // 404 et non 403 depuis l'ADR 0019 : l'unité d'un autre n'existe pas pour
    // un responsable — on ne lui dit même pas qu'elle est là.
    await base().post("/api/resources/persons").set(auth(resp))
      .send({ owner: { kind: "unit", id: far }, corps: "far", nom: "X", prenom: "Y", matricule: "MLE-2", fonction: "—" })
      .expect(404);
    const team = await base().post("/api/resources/teams").set(auth(resp)).send({ owner: { kind: "unit", id: "U3" }, nom: "Binôme 1", memberIds: [p.body.id] }).expect(201);
    expect(team.body.memberIds).toEqual([p.body.id]);
    const blue = await devToken("y.tazi", "bluecell");
    await base().post("/api/resources/vehicles").set(auth(blue)).send({ owner: { kind: "unit", id: far }, type: "VLTT", plate: "FAR-1", qty: 2 }).expect(201);
    // La logistique reste à la cellule verte.
    await base().post("/api/resources/supplies").set(auth(blue)).send({ owner: { kind: "unit", id: far }, kind: "fuel", label: "Gazole", qty: 500, unit: "L" }).expect(403);
    const green = await devToken("g.log", "greencell");
    await base().post("/api/resources/supplies").set(auth(green)).send({ owner: { kind: "unit", id: far }, kind: "fuel", label: "Gazole", qty: 500, unit: "L" }).expect(201);
    const opcom = await devToken("o.chraibi", "opcom");
    const view = await base().get(`/api/resources?ownerKind=unit&ownerId=${far}`).set(auth(opcom)).expect(200);
    expect(view.body.vehicles).toHaveLength(1);
    expect(view.body.supplies).toHaveLength(1);
    expect(view.body.canManage.persons).toBe(false);
    await base().post("/api/resources/persons").set(auth(opcom))
      .send({ owner: { kind: "unit", id: far }, corps: "far", nom: "X", prenom: "Y", matricule: "MLE-3", fonction: "—" }).expect(403);
    // Retirer l'unité emporte ses ressources.
    await base().delete(`/api/units/${far}?force=true`).set(auth(root)).expect(200);
    await base().get(`/api/resources?ownerKind=unit&ownerId=${far}`).set(auth(root)).expect(404);
    const all = await base().get("/api/resources").set(auth(root)).expect(200);
    expect(all.body.vehicles.some((v: { owner: { id: string } }) => v.owner.id === far)).toBe(false);
  });

  it("une bascule de module propre à un compte est effective : coupée pour lui seul, puis rendue au rôle", async () => {
    const resp = await devToken("s.moutaouakil", "resp_hospital");
    const users = await base().get("/api/iam/users").set(auth(root)).expect(200);
    const id = users.body.find((u: { matricule: string }) => u.matricule === "s.moutaouakil").id;
    await base().get("/api/hospitals").set(auth(resp)).expect(200);
    await base().patch(`/api/iam/users/${id}/modules`).set(auth(root)).send({ module: "hospitals", enabled: false }).expect(200);
    const refus = await base().get("/api/hospitals").set(auth(resp)).expect(403);
    expect(refus.body.message).toMatch(/compte s\.moutaouakil/);
    const me = await base().get("/api/iam/me").set(auth(resp)).expect(200);
    expect(me.body.modules.hospitals).toBe(false);
    expect(me.body.modules.comms).toBe(true);
    expect(me.body.appMode).toBe("demo");
    // Un autre responsable d'hôpital n'est pas touché.
    await base().post("/api/iam/users").set(auth(root)).send({ matricule: "h.two", nom: "Deux", roles: ["resp_hospital"], assignments: { hospital: "H3" } }).expect(201);
    const other = await devToken("h.two", "resp_hospital");
    await base().get("/api/hospitals").set(auth(other)).expect(200);
    await base().patch(`/api/iam/users/${id}/modules`).set(auth(root)).send({ module: "hospitals", enabled: null }).expect(200);
    await base().get("/api/hospitals").set(auth(resp)).expect(200);
  });

  it("le mode de la station se change au niveau Super Administrateur, signé — et se lit partout", async () => {
    const admin = await devToken("h.alami", "admin");
    await base().patch("/api/domain/mode").set(auth(admin)).send({ mode: "exercise", password: "argos" }).expect(403);
    await base().patch("/api/domain/mode").set(auth(root)).send({ mode: "exercise", password: "mauvais" }).expect(403);
    await base().patch("/api/domain/mode").set(auth(root)).send({ mode: "nope", password: "ARGOS-2026" }).expect(400);
    // Sous test (hors production), le réglage est persisté sans redémarrer le processus.
    const res = await base().patch("/api/domain/mode").set(auth(root)).send({ mode: "exercise", password: "ARGOS-2026" }).expect(200);
    expect(res.body).toMatchObject({ mode: "exercise", restarting: false, dataProfile: "empty" });
    const profile = await base().get("/api/domain/profile").set(auth(root)).expect(200);
    expect(profile.body.mode).toBe("demo"); // le processus reste dans son mode jusqu'au redémarrage
    expect(profile.body.pending).toBe("exercise");
    const health = await base().get("/api/health").expect(200);
    expect(health.body.appMode).toBe("demo");
  });

  it("une alerte s'acquitte, pour le compte, et l'acquittement se relit", async () => {
    // La déclaration d'un incident à Casablanca-Settat alerte le wali de la région.
    await base().post("/api/incidents").set(auth(root))
      .send({ type: "flood", titre: "Crue — alerte wali", region: "Casablanca-Settat", sev: "medium", st: "open", x: 300, y: 150, ll: [-7.5, 33.5] }).expect(201);
    const wali = await devToken("w.casa", "wali");
    const before = await base().get("/api/comms/notices").set(auth(wali)).expect(200);
    const pending = before.body.filter((n: { acked: boolean }) => !n.acked);
    expect(pending.length).toBeGreaterThan(0);
    await base().post(`/api/comms/notices/${pending[0].id}/ack`).set(auth(wali)).expect(201);
    const after = await base().get("/api/comms/notices").set(auth(wali)).expect(200);
    expect(after.body.find((n: { id: string }) => n.id === pending[0].id).acked).toBe(true);
    const all = await base().post("/api/comms/notices/all/ack").set(auth(wali)).expect(201);
    expect(all.body.acked).toBe(pending.length - 1);
    const done = await base().get("/api/comms/notices").set(auth(wali)).expect(200);
    expect(done.body.every((n: { acked: boolean }) => n.acked)).toBe(true);
  });
});
