import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Le mode édition suit le mode de l'application ; LOG / OPS des PC et Anim
// tiennent unités, abris, morgues et la répartition (ADR 0022, lot 6)
//
// - Sous un mode, seules les natures de poste du mode se posent et se listent :
//   en Direx ni OPCOM, ni TACOM, ni cellules ; en classique ni PC FAR, ni PCF.
// - LOG et OPS des PC (PCO, PCT, PC FAR, PCF) et Anim / DIREX créent, modifient
//   et retirent des unités, des abris et des morgues, et émettent des ordres.
// ============================================================================

describe("Mode édition par mode de l'application et droits des PC opératifs", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let root: string;
  let inc: string;
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  const setMode = (profile: string) => base().patch("/api/domain/profile").set(bearer(root)).send({ profile, password: "ARGOS-2026" }).expect(200);
  const postKinds = async (t: string) => ((await base().get("/api/posts").set(bearer(t)).expect(200)).body as { kind: string }[]).map((p) => p.kind);

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await jeton("m.zraib", "superadmin");
    inc = ((await base().get("/api/incidents").set(bearer(root)).expect(200)).body as { id: string }[])[0].id;
  });

  afterAll(async () => {
    await setMode("classique");
    await app.close();
  });

  it("sous un mode, seules les natures de poste du mode se posent et se listent", async () => {
    // Classique : l'OPCOM se pose, le PC FAR n'existe pas.
    const opcom = (await base().post(`/api/incidents/${inc}/posts`).set(bearer(root)).send({ kind: "opcom", ll: [-7.6, 33.6], matricule: "o.chraibi" }).expect(201)).body as { id: string };
    const refusClassique = await base().post(`/api/incidents/${inc}/posts`).set(bearer(root)).send({ kind: "pcfar", ll: [-7.61, 33.6], matricule: "c.pcfar" }).expect(403);
    expect(refusClassique.body.message).toMatch(/pcfar/);
    expect(await postKinds(root)).toContain("opcom");

    await setMode("direx");
    // Direx : le PC FAR se pose, l'OPCOM et les cellules n'existent pas — même pour le Super Administrateur.
    const pcfar = (await base().post(`/api/incidents/${inc}/posts`).set(bearer(root)).send({ kind: "pcfar", ll: [-7.62, 33.6], matricule: "c.pcfar" }).expect(201)).body as { id: string };
    await base().post(`/api/incidents/${inc}/posts`).set(bearer(root)).send({ kind: "opcom", ll: [-7.63, 33.6], matricule: "o.chraibi" }).expect(403);
    await base().post(`/api/incidents/${inc}/posts`).set(bearer(root)).send({ kind: "bluecell", ll: [-7.64, 33.6], matricule: "c.bleu" }).expect(403);
    const kinds = await postKinds(root);
    expect(kinds).toContain("pcfar");
    expect(kinds).not.toContain("opcom");
    // Le Chef / DIREX pose les PC opératifs, l'OPS / PC FAR pose les PC tactiques.
    const chef = await jeton("a.direx", "direx_chef");
    const ops = await jeton("o.pcfar", "pcfar_ops");
    await base().post(`/api/incidents/${inc}/posts`).set(bearer(chef)).send({ kind: "pcf", ll: [-7.65, 33.6], matricule: "c.pcf" }).expect(201);
    await base().post(`/api/incidents/${inc}/posts`).set(bearer(ops)).send({ kind: "pct", ll: [-7.66, 33.6], matricule: "c.pct" }).expect(201);
    await base().post(`/api/incidents/${inc}/posts`).set(bearer(ops)).send({ kind: "pcfar", ll: [-7.67, 33.6], matricule: "c.pcfar" }).expect(403);

    await setMode("classique");
    const retour = await postKinds(root);
    expect(retour).toContain("opcom");
    expect(retour).not.toContain("pcfar");
    await base().delete(`/api/incidents/${inc}/posts/${opcom.id}`).set(bearer(root)).expect(200);
    await setMode("direx");
    await base().delete(`/api/incidents/${inc}/posts/${pcfar.id}`).set(bearer(root)).expect(200);
    await setMode("classique");
  });

  it("LOG / PCF, OPS / PC FAR et Anim / DIREX créent, modifient et retirent unités, abris et morgues, et émettent des ordres", async () => {
    await setMode("direx");
    for (const [username, role] of [["l.pcf", "pcf_log"], ["o.pcfar", "pcfar_ops"], ["n.direx", "direx_anim"], ["l.pco", "pco_log"]] as const) {
      const t = await jeton(username, role);
      // Unité : créée, modifiée, retirée (hors mode opérationnel — ADR 0016).
      const unit = (await base().post("/api/units").set(bearer(t)).send({ nom: `Unité ${role}`, corps: "far", ville: "Rabat", eff: 20, dispo: "ready", readiness: 70, x: 300, y: 150, ll: [-6.84, 34.02] }).expect(201)).body as { id: string };
      await base().patch(`/api/units/${unit.id}`).set(bearer(t)).send({ readiness: 60 }).expect(200);
      // Ordre : l'unité est engagée sur l'opération.
      const mission = (await base().post("/api/missions").set(bearer(t)).send({ incidentId: inc, label: `Renfort ${role}`, to: { role: "resp_unit", entity: unit.id }, payload: { kind: "order", unitId: unit.id } }).expect(201)).body as { id: string };
      await base().post(`/api/missions/${mission.id}/cancel`).set(bearer(t)).send({ reason: "Fin de test" }).expect(201);
      await base().delete(`/api/units/${unit.id}?force=true`).set(bearer(t)).expect(200);
      // Abri : ouvert, modifié, fermé.
      const shelter = (await base().post("/api/shelters").set(bearer(t)).send({ nom: `Abri ${role}`, ville: "Rabat", kind: "tentes", tents: 10, region: "Rabat-Salé-Kénitra" }).expect(201)).body as { id: string };
      await base().patch(`/api/shelters/${shelter.id}`).set(bearer(t)).send({ nom: `Abri ${role} bis` }).expect(200);
      await base().delete(`/api/shelters/${shelter.id}`).set(bearer(t)).expect(200);
      // Morgue : créée, retirée.
      const morgue = (await base().post("/api/morgues").set(bearer(t)).send({ nom: `Morgue ${role}`, type: "temporary", region: "Rabat-Salé-Kénitra", ville: "Rabat", capacity: 10, ll: [-6.84, 34.02] }).expect(201)).body as { id: string };
      await base().delete(`/api/morgues/${morgue.id}`).set(bearer(t)).expect(200);
    }
    // SYNTH / PC FAR lit et n'agit pas ; le Chef / PC FAR ne retire pas d'abri.
    const synth = await jeton("s.pcfar", "pcfar_synth");
    await base().post("/api/shelters").set(bearer(synth)).send({ nom: "Abri refusé", ville: "Rabat", kind: "tentes", tents: 5 }).expect(403);
    const chef = await jeton("c.pcfar", "pcfar_chef");
    const abri = (await base().post("/api/shelters").set(bearer(root)).send({ nom: "Abri du chef", ville: "Rabat", kind: "tentes", tents: 5 }).expect(201)).body as { id: string };
    await base().delete(`/api/shelters/${abri.id}`).set(bearer(chef)).expect(403);
    await base().delete(`/api/shelters/${abri.id}`).set(bearer(root)).expect(200);
    await setMode("classique");
  });
});
