import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { RealtimeService, type RealtimeEvent } from "@/modules/realtime/realtime.service";

// ============================================================================
// ADR 0029 — ce que tout le monde voit bouger sur la carte
//
//   1. toute écriture du domaine qui RÉUSSIT pousse un événement `domain` :
//      incident, sous-incident, incident rattaché, victime, unité, abri,
//      morgue mobile — un refus (403) n'en pousse aucun ;
//   2. une simulation partagée est servie à tous, retirée par son auteur ou le
//      Super Administrateur, refusée (403) à un tiers ;
//   3. ouvrir un abri revient aux chefs, aux OPS, aux LOG et aux Rens ;
//   4. un type d'incident AJOUTÉ se modifie ; un type fourni d'origine, non.
// ============================================================================

describe("ADR 0029 — la carte de tous : changements poussés, simulations partagées, abris, types", () => {
  let app: INestApplication;
  let realtime: RealtimeService;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  let root: string;
  /** Les événements poussés pendant une action — le flux temps réel est écouté à la source. */
  let vus: RealtimeEvent[] = [];

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    realtime = app.get(RealtimeService);
    const emit = realtime.emit.bind(realtime);
    jest.spyOn(realtime, "emit").mockImplementation((e: RealtimeEvent) => { vus.push(e); emit(e); });
    root = await jeton("m.zraib", "superadmin");
  });
  afterAll(async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" });
    await app.close();
  });
  beforeEach(() => { vus = []; });

  const domaine = () => vus.filter((e) => e.kind === "domain");

  it("chaque écriture du domaine pousse un événement ; un refus n'en pousse aucun", async () => {
    const inc = (await base().post("/api/incidents").set(bearer(root))
      .send({ type: "flood", titre: "Crue — temps réel", region: "Rabat-Salé-Kénitra", sev: "high", st: "open", x: 300, y: 150, ll: [-6.82, 34.01] })
      .expect(201)).body as { id: string };
    expect(domaine()).toContainEqual({ kind: "domain", what: "incidents" });

    vus = [];
    await base().post(`/api/incidents/${inc.id}/sub-incidents`).set(bearer(root)).send({ type: "gas_leak", sev: "medium", note: "Fuite" }).expect(201);
    expect(domaine().length).toBeGreaterThan(0);

    vus = [];
    const child = (await base().post("/api/incidents").set(bearer(root))
      .send({ type: "landslide", titre: "Glissement — rattaché", region: "Rabat-Salé-Kénitra", sev: "high", st: "open", x: 300, y: 150, ll: [-6.83, 34.0], parentId: inc.id })
      .expect(201)).body as { id: string; parentId?: string };
    expect(child.parentId).toBe(inc.id);
    expect(domaine().length).toBeGreaterThan(0);

    vus = [];
    await base().post(`/api/incidents/${inc.id}/victims`).set(bearer(root)).send({ kind: "injured", note: "Relevée pendant l'essai" }).expect(201);
    expect(domaine().length).toBeGreaterThan(0);

    vus = [];
    const unit = (await base().post("/api/units").set(bearer(root))
      .send({ nom: `Unité temps réel ${Date.now()}`, corps: "far", ville: "Rabat", eff: 20, dispo: "ready", readiness: 70, x: 300, y: 150, ll: [-6.84, 34.02] })
      .expect(201)).body as { id: string };
    expect(domaine()).toContainEqual({ kind: "domain", what: "units" });

    vus = [];
    await base().patch(`/api/units/${unit.id}`).set(bearer(root)).send({ readiness: 80 }).expect(200);
    expect(domaine()).toContainEqual({ kind: "domain", what: "units" });

    vus = [];
    const abri = (await base().post("/api/shelters").set(bearer(root))
      .send({ nom: `Abri temps réel ${Date.now()}`, ville: "Rabat", kind: "tentes", tents: 10, perTent: 6, ll: [-6.85, 34.03] })
      .expect(201)).body as { id: string; ll?: [number, number] };
    // L'abri porte sa position : la carte le montre dès sa création.
    expect(abri.ll).toEqual([-6.85, 34.03]);
    expect(domaine()).toContainEqual({ kind: "domain", what: "shelters" });

    vus = [];
    const mobile = (await base().post("/api/morgues/mobile").set(bearer(root))
      .send({ nom: `Morgue mobile ${Date.now()}`, site: "Rabat", capacity: 20, ll: [-6.86, 34.04], type: "truck" })
      .expect(201)).body as { id: string; kind: string; deployment?: unknown };
    expect(mobile.kind).toBe("mobile");
    expect(mobile.deployment).toBeTruthy();
    expect(domaine().length).toBeGreaterThan(0);

    // Un refus ne réveille personne : un directeur d'hôpital n'ouvre pas d'unité.
    vus = [];
    await base().post("/api/units").set(bearer(await jeton("s.moutaouakil", "resp_hospital")))
      .send({ nom: "Unité refusée", corps: "far", ville: "Rabat", eff: 10, dispo: "ready", readiness: 50, x: 1, y: 1, ll: [-6.8, 34.0] })
      .expect(403);
    expect(domaine()).toEqual([]);
  });

  it("le réseau hospitalier aussi : un établissement créé, un hôpital de campagne déployé puis retiré poussent `hospitals`", async () => {
    const hop = (await base().post("/api/hospitals").set(bearer(root))
      .send({ nom: `Hôpital temps réel ${Date.now()}`, ville: "Rabat", kind: "civ", type: "Hôpital provincial", region: "Rabat-Salé-Kénitra", province: "Rabat", lits: 20, rea: 2, staff: 10, amb: 1, heli: 0, x: 1, y: 1, ll: [-6.87, 34.05] })
      .expect(201)).body as { id: string };
    expect(domaine()).toContainEqual({ kind: "domain", what: "hospitals" });
    vus = [];
    const campagne = (await base().post("/api/field-hospitals").set(bearer(root)).send({ hospitalId: hop.id, ll: [-6.88, 34.06] }).expect(201)).body as { id: string };
    expect(domaine()).toEqual([{ kind: "domain", what: "hospitals" }]);
    vus = [];
    await base().delete(`/api/field-hospitals/${campagne.id}`).set(bearer(root)).expect(200);
    expect(domaine()).toEqual([{ kind: "domain", what: "hospitals" }]);
    vus = [];
    await base().delete(`/api/hospitals/${hop.id}`).set(bearer(root)).expect(200);
    expect(domaine()).toContainEqual({ kind: "domain", what: "hospitals" });
  });

  it("une simulation partagée se voit de tous ; son auteur ou le Super Administrateur la retire, un tiers non", async () => {
    const wali = await jeton("h.alami", "wali");
    const sim = (await base().post("/api/simulations").set(bearer(wali))
      .send({ kind: "flood", label: "Rupture Al Wahda — cadrage", seed: [-5.36, 34.6], params: { source: "dam", volumeHm3: 3522, damHeightM: 88, horizonH: 6, extentKm: 100 } })
      .expect(201)).body as { id: string; createdBy: string };
    expect(sim.createdBy).toBe("h.alami");
    expect(vus).toContainEqual({ kind: "simulations" });

    // Servie à un autre compte, quel qu'il soit.
    const vue = (await base().get("/api/simulations").set(bearer(await jeton("n.fassi", "resp_unit"))).expect(200)).body as { id: string }[];
    expect(vue.some((s) => s.id === sim.id)).toBe(true);

    // Republier la même nature remplace la sienne : les postes n'empilent pas les calculs.
    const bis = (await base().post("/api/simulations").set(bearer(wali))
      .send({ kind: "flood", label: "Rupture Al Wahda — 200 km", seed: [-5.36, 34.6], params: { source: "dam", extentKm: 200 } })
      .expect(201)).body as { id: string };
    const apres = (await base().get("/api/simulations").set(bearer(root)).expect(200)).body as { id: string; createdBy: string }[];
    expect(apres.filter((s) => s.createdBy === "h.alami" && s.id === sim.id)).toHaveLength(0);

    await base().delete(`/api/simulations/${bis.id}`).set(bearer(await jeton("n.fassi", "resp_unit"))).expect(403);
    vus = [];
    await base().delete(`/api/simulations/${bis.id}`).set(bearer(root)).expect(200);
    expect(vus).toContainEqual({ kind: "simulations" });
    expect(((await base().get("/api/simulations").set(bearer(root)).expect(200)).body as unknown[]).length).toBe(0);
  });

  it("ouvrir un abri revient aux chefs, aux OPS, aux LOG et aux Rens ; la synthèse observe", async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "direx", password: "ARGOS-2026" }).expect(200);
    const abri = (nom: string) => ({ nom, ville: "Rabat", kind: "tentes" as const, tents: 5, perTent: 6 });
    for (const [u, r] of [["c.pct", "pct_chef"], ["c.pcfar", "pcfar_chef"], ["o.pco", "pco_ops"], ["l.pcfar", "pcfar_log"], ["r.pct", "pct_rens"]] as const) {
      await base().post("/api/shelters").set(bearer(await jeton(u, r))).send(abri(`Abri ${r}`)).expect(201);
    }
    await base().post("/api/shelters").set(bearer(await jeton("s.pcfar", "pcfar_synth"))).send(abri("Abri refusé")).expect(403);
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" }).expect(200);
  });

  it("un type d'incident ajouté se modifie ; un type fourni d'origine, non", async () => {
    const id = `sandstorm_${Date.now()}`;
    await base().post("/api/incident-types").set(bearer(root))
      .send({ id, labels: { fr: "Tempête de sable", ar: "عاصفة رملية", en: "Sandstorm" }, icon: "M2 12h20" })
      .expect(201);
    const maj = (await base().patch(`/api/incident-types/${id}`).set(bearer(root))
      .send({ labels: { fr: "Tempête de sable (Sud)", ar: "عاصفة رملية", en: "Sandstorm (South)" }, icon: "M3 12h18" })
      .expect(200)).body as { id: string; labels: { fr: string }; icon: string };
    expect(maj.id).toBe(id);
    expect(maj.labels.fr).toBe("Tempête de sable (Sud)");
    expect(maj.icon).toBe("M3 12h18");
    await base().patch("/api/incident-types/earthquake").set(bearer(root)).send({ icon: "M2 2h2" }).expect(409);
    await base().patch(`/api/incident-types/inconnu_${Date.now()}`).set(bearer(root)).send({ icon: "M2 2h2" }).expect(404);
  });
});
