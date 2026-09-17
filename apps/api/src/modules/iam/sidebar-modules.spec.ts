import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { CORE_MODULES, DEFAULT_ROLE_FEATURES, MODULE_KEYS } from "@/shared/permissions";

// ============================================================================
// Tout le menu dans la matrice rôle → modules (ADR 0017) — de bout en bout
//
//   1. chaque entrée de la barre latérale est un module, avec un défaut qui a
//      un sens pour le rôle (le commandant d'unité a « Ma responsabilité » et
//      « Gestion de mon entité » d'office) ;
//   2. le cœur (comptes, supervision, paramètres) figure mais ne se coupe par
//      rien — ni rôle, ni compte, ni drapeau ;
//   3. couper « Gestion de mon entité » retire au responsable ses ÉCRITURES
//      cantonnées, pas ses lectures, et ne touche pas les autres rôles.
// ============================================================================

describe("Menu complet dans la matrice — défauts, cœur verrouillé, gestion de mon entité", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });
  const devToken = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  let root: string;
  let unitId: string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await devToken("m.zraib", "superadmin");
    unitId = (
      await base().post("/api/units").set(auth(root))
        .send({ nom: "Unité — gestion de mon entité", corps: "far", ville: "Rabat", eff: 30, dispo: "ready", readiness: 70, x: 300, y: 150, ll: [-6.8, 34.0] })
        .expect(201)
    ).body.id as string;
    await base().post("/api/iam/users").set(auth(root))
      .send({ matricule: "c.unite", nom: "Commandant d'unité — test", roles: ["resp_unit"], assignments: { unit: unitId } })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it("chaque module du menu a un défaut par rôle ; le commandant d'unité a la gestion de son unité d'office", async () => {
    const res = await base().get("/api/iam/role-features/defaults").set(auth(root)).expect(200);
    for (const m of MODULE_KEYS) expect(typeof res.body.resp_unit[m]).toBe("boolean");
    expect(res.body.resp_unit).toMatchObject({ dashboard: true, myresp: true, myrespManage: true, units: true, resources: true });
    expect(res.body.resp_hospital).toMatchObject({ myresp: true, myrespManage: true, opsnet: false });
    expect(res.body.wali).toMatchObject({ dashboard: true, myresp: false, myrespManage: false, opsnet: true, users: false, settings: false, supervision: false });
    expect(res.body.opcom.opsnet).toBe(true);
    expect(res.body.admin).toMatchObject({ users: true, settings: true, supervision: false });
    expect(res.body.superadmin).toMatchObject({ users: true, settings: true, supervision: true });
    expect(DEFAULT_ROLE_FEATURES.resp_unit.myrespManage).toBe(true);
  });

  it("le cœur figure dans la matrice mais ne se coupe par rien", async () => {
    const users = await base().get("/api/iam/users").set(auth(root)).expect(200);
    const id = users.body.find((u: { matricule: string }) => u.matricule === "c.unite").id as string;
    for (const m of CORE_MODULES) {
      await base().patch("/api/iam/role-features/wali").set(auth(root)).send({ feature: m, enabled: false }).expect(400);
      await base().patch(`/api/iam/users/${id}/modules`).set(auth(root)).send({ module: m, enabled: false }).expect(400);
      await base().patch(`/api/flags/${m}`).set(auth(root)).send({ enabled: false }).expect(400);
    }
    const flags = await base().get("/api/flags").set(auth(root)).expect(200);
    expect(flags.body.settings).toBeUndefined();
    expect(flags.body.dashboard).toBe(true);
    const me = await base().get("/api/iam/me").set(auth(root)).expect(200);
    expect(me.body.modules).toMatchObject({ users: true, settings: true, supervision: true, myrespManage: true });
  });

  it("couper « Gestion de mon entité » retire au commandant ses écritures sur son unité, pas ses lectures ; les autres rôles ne bougent pas", async () => {
    const cdt = await devToken("c.unite", "resp_unit");
    await base().patch(`/api/units/${unitId}`).set(auth(cdt)).send({ readiness: 75 }).expect(200);
    // Coupé pour le rôle.
    await base().patch("/api/iam/role-features/resp_unit").set(auth(root)).send({ feature: "myrespManage", enabled: false }).expect(200);
    const refus = await base().patch(`/api/units/${unitId}`).set(auth(cdt)).send({ readiness: 76 }).expect(403);
    expect(refus.body.message).toMatch(/myrespManage/);
    await base().get("/api/units").set(auth(cdt)).expect(200);
    const me = await base().get("/api/iam/me").set(auth(cdt)).expect(200);
    expect(me.body.modules.myrespManage).toBe(false);
    expect(me.body.modules.myresp).toBe(true);
    // Un directeur d'hôpital lit toujours son établissement, coupé ou non.
    await base().patch("/api/iam/role-features/resp_hospital").set(auth(root)).send({ feature: "myrespManage", enabled: false }).expect(200);
    const dir = await devToken("s.moutaouakil", "resp_hospital");
    await base().get("/api/hospitals/H2/wards").set(auth(dir)).expect(200);
    await base().patch("/api/hospitals/H2").set(auth(dir)).send({ occ: 50 }).expect(403);
    // L'OPCOM (en démonstration) modifie les unités par la même route, sans être touché —
    // déployé sur une opération de la région, il voit le vivier de la région (ADR 0020).
    const op = (await base().post("/api/incidents").set(auth(root))
      .send({ type: "flood", titre: "Crue — vivier OPCOM", region: "Rabat-Salé-Kénitra", sev: "medium", st: "open", x: 300, y: 150, ll: [-6.8, 34.0] }).expect(201)).body.id as string;
    await base().post(`/api/incidents/${op}/deployments`).set(auth(root)).send({ matricule: "o.chraibi" }).expect(201);
    const opcom = await devToken("o.chraibi", "opcom");
    await base().patch(`/api/units/${unitId}`).set(auth(opcom)).send({ readiness: 77 }).expect(200);
    // Le compte rouvert malgré le rôle.
    const users = await base().get("/api/iam/users").set(auth(root)).expect(200);
    const id = users.body.find((u: { matricule: string }) => u.matricule === "c.unite").id as string;
    await base().patch(`/api/iam/users/${id}/modules`).set(auth(root)).send({ module: "myrespManage", enabled: true }).expect(200);
    await base().patch(`/api/units/${unitId}`).set(auth(cdt)).send({ readiness: 78 }).expect(200);
    // Remise à zéro : le défaut rend la gestion au commandant.
    await base().post("/api/iam/role-features/resp_unit/reset").set(auth(root)).expect(201);
    await base().post("/api/iam/role-features/resp_hospital/reset").set(auth(root)).expect(201);
    const rf = await base().get("/api/iam/role-features").set(auth(root)).expect(200);
    expect(rf.body.resp_unit.myrespManage).toBe(true);
  });
});
