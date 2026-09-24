import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// ADR 0037 — le briefing corrigé à la main
//
// Le briefing est calculé sur les données (ADR 0032). Demande du 24 septembre
// 2026 : pouvoir le reprendre à la main. La version corrigée est enregistrée
// sur l'incident principal — tous les postes la lisent — par ceux qui tiennent
// le journal de conduite (`actions_log:update`), sur un incident qu'ils voient ;
// on revient au calcul en la retirant.
// ============================================================================

describe("ADR 0037 — briefing corrigé à la main", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  let root: string;
  let inc: string;

  const BRIEF = {
    situation: "Crue de l'oued Bouregreg : 2 quartiers inondés.\n- 3 blessés évacués.   \n\n",
    taken: "- 23/09 14:05 — Digue rompue → Section du génie engagée (c.pct).",
    anticipation: "- Nouvelle montée des eaux possible cette nuit.",
    objectives: "- Mettre à l'abri les riverains.",
    concept: "- Commandement : PCT au stade.",
    actions: "1. Évacuer le quartier nord.\n2. Diffuser un point de situation à 18 h.",
  };

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await jeton("m.zraib", "superadmin");
    inc = ((await base().post("/api/incidents").set(bearer(root))
      .send({ type: "flood", titre: "Crue — briefing corrigé", region: "Rabat-Salé-Kénitra", sev: "high", st: "open", x: 300, y: 150, ll: [-6.82, 34.01] })
      .expect(201)).body as { id: string }).id;
  });
  afterAll(async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" });
    await app.close();
  });

  type Saved = { sections: Record<keyof typeof BRIEF, string>; by: string; at: string };
  const surCarte = async (t: string): Promise<Saved | undefined> =>
    ((await base().get("/api/incidents/map").set(bearer(t)).expect(200)).body as { id: string; briefing?: Saved }[]).find((i) => i.id === inc)?.briefing;

  it("enregistré sur l'incident : six rubriques, auteur, heure — le texte gardé tel quel, blancs de fin retirés ; chaque poste le lit", async () => {
    const saved = (await base().put(`/api/incidents/${inc}/briefing`).set(bearer(root)).send(BRIEF).expect(200)).body as Saved;
    expect(saved.by).toBe("m.zraib");
    expect(Number.isNaN(Date.parse(saved.at))).toBe(false);
    expect(saved.sections.situation).toBe("Crue de l'oued Bouregreg : 2 quartiers inondés.\n- 3 blessés évacués.");
    expect(saved.sections.actions).toBe(BRIEF.actions);
    // La carte de chacun (ADR 0020) porte la version corrigée : tous les postes la lisent.
    const wali = await jeton("h.alami", "wali");
    expect((await surCarte(wali))?.sections.concept).toBe(BRIEF.concept);
    // Le fil annonce la correction.
    const fil = (await base().get("/api/feed").set(bearer(root)).expect(200)).body as { txt: string }[];
    expect(fil.some((f) => f.txt.includes(`${inc} — briefing corrigé par m.zraib`))).toBe(true);
  });

  it("direx : l'Anim corrige ; le Chef DIREX, qui lit le journal sans le tenir, est refusé", async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "direx", password: "ARGOS-2026" }).expect(200);
    const anim = await jeton("n.direx", "direx_anim");
    const saved = (await base().put(`/api/incidents/${inc}/briefing`).set(bearer(anim)).send({ ...BRIEF, concept: "- Commandement : PCO à la préfecture." }).expect(200)).body as Saved;
    expect(saved.by).toBe("n.direx");
    const chef = await jeton("d.direx", "direx_chef");
    await base().put(`/api/incidents/${inc}/briefing`).set(bearer(chef)).send(BRIEF).expect(403);
    await base().delete(`/api/incidents/${inc}/briefing`).set(bearer(chef)).expect(403);
  });

  it("classique : l'OPCOM, qui tient le journal, corrige ; le wali lit sans corriger", async () => {
    await base().patch("/api/domain/profile").set(bearer(root)).send({ profile: "classique", password: "ARGOS-2026" }).expect(200);
    // Un incident déclaré se voit de tous (décision du 19 septembre) : l'OPCOM le corrige même sans y être déployé.
    const saved = (await base().put(`/api/incidents/${inc}/briefing`).set(bearer(await jeton("o.chraibi", "opcom"))).send(BRIEF).expect(200)).body as Saved;
    expect(saved.by).toBe("o.chraibi");
    await base().put(`/api/incidents/${inc}/briefing`).set(bearer(await jeton("h.alami", "wali"))).send(BRIEF).expect(403);
  });

  it("revenir au calcul retire la version ; les formes invalides sont refusées", async () => {
    await base().put(`/api/incidents/${inc}/briefing`).set(bearer(root)).send({ ...BRIEF, situation: "x".repeat(6001) }).expect(400);
    await base().put(`/api/incidents/${inc}/briefing`).set(bearer(root)).send({ ...BRIEF, taken: "x".repeat(12000) }).expect(200);
    const incomplet: Partial<typeof BRIEF> = { ...BRIEF };
    delete incomplet.actions;
    await base().put(`/api/incidents/${inc}/briefing`).set(bearer(root)).send(incomplet).expect(400);
    await base().put("/api/incidents/INC-0000/briefing").set(bearer(root)).send(BRIEF).expect(404);
    await base().delete(`/api/incidents/${inc}/briefing`).set(bearer(root)).expect(200);
    expect(await surCarte(root)).toBeUndefined();
    await base().delete(`/api/incidents/${inc}/briefing`).set(bearer(root)).expect(404);
  });
});
