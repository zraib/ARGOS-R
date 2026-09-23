import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// ADR 0032 — « Actions entreprises » : le journal de conduite d'un incident
//
// Décision du 23 septembre 2026 : l'Anim, les chefs des PC (PC FAR, PCF, PCT,
// PCO), tous les OPS, tous les LOG et les Rens le tiennent (profil direx) ;
// les autres le lisent. En classique : l'OPCOM, le TACOM et ses PC, les trois
// cellules — sans suppression.
// ============================================================================

describe("ADR 0032 — actions entreprises d'un incident", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  let root: string;
  let inc: string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await jeton("m.zraib", "superadmin");
    inc = ((await base().post("/api/incidents").set(bearer(root))
      .send({ type: "flood", titre: "Crue — journal de conduite", region: "Rabat-Salé-Kénitra", sev: "high", st: "open", x: 300, y: 150, ll: [-6.82, 34.01] })
      .expect(201)).body as { id: string }).id;
  });
  afterAll(async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" });
    await app.close();
  });

  type Entry = { id: string; at: string; event: string; action: string; by: string; updatedBy?: string };
  const journal = async (t: string): Promise<Entry[]> =>
    ((await base().get("/api/incidents").set(bearer(t)).expect(200)).body as { id: string; actionsLog?: Entry[] }[]).find((i) => i.id === inc)?.actionsLog ?? [];

  it("direx : l'Anim, les chefs des PC, les OPS, les LOG et les Rens saisissent, corrigent et retirent ; le journal reste chronologique", async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "direx", password: "ARGOS-2026" }).expect(200);
    const TENANTS = [
      ["n.direx", "direx_anim"], ["c.pcfar", "pcfar_chef"], ["c.pcf", "pcf_chef"], ["c.pct", "pct_chef"], ["c.pco", "pco_chef"],
      ["o.pcfar", "pcfar_ops"], ["o.pct", "pct_ops"], ["l.pcf", "pcf_log"], ["l.pco", "pco_log"],
      ["r.pcfar", "pcfar_planif_rens"], ["r.pct", "pct_rens"], ["r.pco", "pco_rens_com"], ["r.direx", "direx_rls"],
    ] as const;
    let heure = 0;
    for (const [u, r] of TENANTS) {
      const t = await jeton(u, r);
      heure += 1;
      // Saisies dans le désordre : 13 h, 12 h, 11 h… le journal les range.
      const at = new Date(Date.UTC(2026, 8, 23, 14 - heure, 5)).toISOString();
      const e = (await base().post(`/api/incidents/${inc}/actions`).set(bearer(t))
        .send({ at, event: `Événement ${r}`, action: `Action ${r}` })
        .expect(201)).body as Entry;
      expect(e).toMatchObject({ at, event: `Événement ${r}`, action: `Action ${r}`, by: u });
      const corr = (await base().patch(`/api/incidents/${inc}/actions/${e.id}`).set(bearer(t)).send({ action: `Action ${r} (corrigée)` }).expect(200)).body as Entry;
      expect(corr).toMatchObject({ action: `Action ${r} (corrigée)`, updatedBy: u });
    }
    const lignes = await journal(root);
    expect(lignes).toHaveLength(TENANTS.length);
    expect(lignes.map((l) => l.at)).toEqual([...lignes.map((l) => l.at)].sort());
    // Retirer : le Rens de PCT retire la ligne qu'il a saisie.
    const rens = await jeton("r.pct", "pct_rens");
    const sienne = lignes.find((l) => l.by === "r.pct")!;
    await base().delete(`/api/incidents/${inc}/actions/${sienne.id}`).set(bearer(rens)).expect(200);
    expect(await journal(root)).toHaveLength(TENANTS.length - 1);
  });

  it("direx : le Chef DIREX, l'évaluation et la synthèse lisent le journal sans le tenir", async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "direx", password: "ARGOS-2026" }).expect(200);
    const une = (await journal(root))[0];
    for (const [u, r] of [["a.direx", "direx_chef"], ["e.direx", "direx_eval"], ["s.pcfar", "pcfar_synth"]] as const) {
      const t = await jeton(u, r);
      expect((await journal(t)).length).toBeGreaterThan(0);
      await base().post(`/api/incidents/${inc}/actions`).set(bearer(t)).send({ at: "2026-09-23T10:00:00Z", event: "x", action: "y" }).expect(403);
      await base().patch(`/api/incidents/${inc}/actions/${une.id}`).set(bearer(t)).send({ action: "z" }).expect(403);
      await base().delete(`/api/incidents/${inc}/actions/${une.id}`).set(bearer(t)).expect(403);
    }
  });

  it("classique : l'OPCOM et les cellules saisissent et corrigent, sans retirer ; le wali lit", async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" }).expect(200);
    const opcom = await jeton("o.chraibi", "opcom");
    const e = (await base().post(`/api/incidents/${inc}/actions`).set(bearer(opcom)).send({ at: "2026-09-23T15:00:00Z", event: "Réplique ressentie", action: "Évacuation du quartier nord" }).expect(201)).body as Entry;
    await base().patch(`/api/incidents/${inc}/actions/${e.id}`).set(bearer(await jeton("y.tazi", "bluecell"))).send({ event: "Réplique M4,1 ressentie" }).expect(200);
    await base().delete(`/api/incidents/${inc}/actions/${e.id}`).set(bearer(opcom)).expect(403);
    const wali = await jeton("h.alami", "wali");
    await base().post(`/api/incidents/${inc}/actions`).set(bearer(wali)).send({ at: "2026-09-23T15:10:00Z", event: "x", action: "y" }).expect(403);
    expect((await journal(wali)).some((l) => l.event === "Réplique M4,1 ressentie")).toBe(true);
  });

  it("une ligne sans événement ni action est refusée ; incident ou ligne inconnus répondent 404 ; le fil annonce l'action", async () => {
    await base().post(`/api/incidents/${inc}/actions`).set(bearer(root)).send({ at: "2026-09-23T16:00:00Z", event: "  ", action: "" }).expect(400);
    await base().post(`/api/incidents/${inc}/actions`).set(bearer(root)).send({ at: "pas une date", event: "x", action: "y" }).expect(400);
    await base().post("/api/incidents/INC-0000/actions").set(bearer(root)).send({ at: "2026-09-23T16:00:00Z", event: "x", action: "y" }).expect(404);
    await base().patch(`/api/incidents/${inc}/actions/${inc}-A999`).set(bearer(root)).send({ action: "z" }).expect(404);
    await base().post(`/api/incidents/${inc}/actions`).set(bearer(root)).send({ at: "2026-09-23T16:00:00Z", event: "", action: "Point de regroupement ouvert au stade" }).expect(201);
    const fil = (await base().get("/api/feed").set(bearer(root)).expect(200)).body as { txt: string }[];
    expect(fil.some((f) => f.txt.includes("Point de regroupement ouvert au stade"))).toBe(true);
  });
});
