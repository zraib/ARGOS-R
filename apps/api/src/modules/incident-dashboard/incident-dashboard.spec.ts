import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// V-3 — le tableau de bord d'UNE opération
//
// C'est ici que la garde `canSeeIncident`, écrite au lot V-1, sert enfin à
// quelque chose. La permission `dash_incident:view` dit « ce rôle peut lire un
// tableau de bord d'incident » ; elle ne dit pas LEQUEL. Sans la seconde garde,
// un OPCOM ouvrirait celui d'une autre opération en devinant son identifiant —
// et l'identifiant est séquentiel.
// ============================================================================

describe("V-3 — tableau de bord par incident", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());

  const token = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const CASA = "INC-2612"; // Casablanca-Settat — en cours
  // Une AUTRE région, et une opération ouverte : le test y déploie un poste.
  const ELSEWHERE = "INC-2620"; // Drâa-Tafilalet — en cours
  let su: string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    su = await token("m.zraib", "superadmin");
  });

  afterAll(async () => {
    await app.close();
  });

  /** Crée un compte avec sa portée et renvoie un jeton pour ce rôle. */
  const account = async (matricule: string, role: string, assignments?: Record<string, string>) => {
    await base()
      .post("/api/iam/users")
      .set(auth(su))
      .send({ matricule, nom: "Essai", roles: [role], ...(assignments ? { assignments } : {}) })
      .expect(201);
    return token(matricule, role);
  };

  // --- la double garde ------------------------------------------------------

  it("un wali ouvre le tableau de bord de SA région, pas celui d'une autre", async () => {
    const t = await account(`w.v3.${Date.now()}`, "wali", { region: "Casablanca-Settat" });
    await base().get(`/api/incidents/${CASA}/dashboard`).set(auth(t)).expect(200);
    // 404 et non 403 : « interdit » confirmerait l'existence de l'opération à
    // quelqu'un qui n'a pas à la connaître.
    await base().get(`/api/incidents/${ELSEWHERE}/dashboard`).set(auth(t)).expect(404);
  });

  it("un OPCOM n'ouvre que le tableau de bord de l'opération où il est déployé", async () => {
    const m = `o.v3.${Date.now()}`;
    const t = await account(m, "opcom");

    // Non déployé : aucun tableau de bord, pas même celui d'un incident réel.
    await base().get(`/api/incidents/${CASA}/dashboard`).set(auth(t)).expect(404);

    await base().post(`/api/incidents/${ELSEWHERE}/deployments`).set(auth(su)).send({ matricule: m }).expect(201);
    await base().get(`/api/incidents/${ELSEWHERE}/dashboard`).set(auth(t)).expect(200);
    await base().get(`/api/incidents/${CASA}/dashboard`).set(auth(t)).expect(404);
  });

  it("un responsable d'hôpital ouvre les tableaux de bord des opérations où SON établissement sert", async () => {
    // La portée `entity` est faite pour lui : contrairement à la conduite, il
    // sert plusieurs opérations à la fois.
    const t = await account(`h.v3.${Date.now()}`, "resp_hospital", { hospital: "H1" });
    await base().get(`/api/incidents/${CASA}/dashboard`).set(auth(t)).expect(404);

    // On engage H1 sur l'opération : elle entre dans son périmètre.
    const inc = await base().get("/api/incidents").set(auth(su)).expect(200);
    const target = (inc.body as { id: string; responders?: { units: string[]; hospitals: string[] } }[]).find(
      (i) => i.id === CASA,
    );
    await base()
      .patch(`/api/incidents/${CASA}`)
      .set(auth(su))
      .send({
        responders: {
          units: target?.responders?.units ?? [],
          hospitals: [...new Set([...(target?.responders?.hospitals ?? []), "H1"])],
        },
      })
      .expect(200);

    await base().get(`/api/incidents/${CASA}/dashboard`).set(auth(t)).expect(200);
  });

  it("DEFAULT-DENY : un rôle absent de la ligne `dash_incident` reçoit 403", async () => {
    // `resp_equipment` n'y figure pas : il pilote un parc, pas une opération.
    const t = await account(`e.v3.${Date.now()}`, "resp_equipment", { equipment: "P1" });
    await base().get(`/api/incidents/${CASA}/dashboard`).set(auth(t)).expect(403);
  });

  it("une opération inconnue reste inconnue (404)", async () => {
    await base().get("/api/incidents/INC-0000/dashboard").set(auth(su)).expect(404);
  });

  // --- ce que l'agrégat dit -------------------------------------------------

  it("l'engagement est calculé depuis les intervenants — personnel, ambulances, hélicoptères", async () => {
    const units = await base().get("/api/units").set(auth(su)).expect(200);
    const hosps = await base().get("/api/hospitals").set(auth(su)).expect(200);
    const u = (units.body as { id: string; eff: number }[])[0];
    const h = (hosps.body as { id: string; amb: number; heli: number; lits: number; occ: number }[])[0];

    const created = await base()
      .post("/api/incidents")
      .set(auth(su))
      .send({
        titre: "Essai — agrégat d'engagement",
        type: "industrial",
        region: "Souss-Massa",
        sev: "low",
        st: "open",
        x: 40,
        y: 40,
        ll: [-9.6, 30.42],
        responders: { units: [u.id], hospitals: [h.id] },
      })
      .expect(201);

    const dash = await base().get(`/api/incidents/${created.body.id}/dashboard`).set(auth(su)).expect(200);
    expect(dash.body.engagement.personnel).toBe(u.eff);
    expect(dash.body.engagement.ambulances).toBe(h.amb);
    expect(dash.body.engagement.helicopteres).toBe(h.heli);
    expect(dash.body.engagement.hospitals[0]).toMatchObject({ id: h.id, lits: h.lits, occ: h.occ });
  });

  it("les lits LIBRES retranchent les réservations — sinon deux EVASAN visent le même", async () => {
    const hosps = await base().get("/api/hospitals").set(auth(su)).expect(200);
    const h = (hosps.body as { id: string; lits: number; occ: number; reserved?: number }[])[0];

    const created = await base()
      .post("/api/incidents")
      .set(auth(su))
      .send({
        titre: "Essai — lits réservés",
        type: "industrial",
        region: "Souss-Massa",
        sev: "low",
        st: "open",
        x: 40,
        y: 40,
        ll: [-9.6, 30.42],
        responders: { units: [], hospitals: [h.id] },
      })
      .expect(201);

    const dash = await base().get(`/api/incidents/${created.body.id}/dashboard`).set(auth(su)).expect(200);
    const row = dash.body.engagement.hospitals[0];
    expect(row.libres).toBe(Math.max(0, h.lits - h.occ - (h.reserved ?? 0)));
  });

  it("le fil de l'opération repose sur le LIEN, pas sur une recherche dans le texte", async () => {
    const m = `f.v3.${Date.now()}`;
    await base().post("/api/iam/users").set(auth(su)).send({ matricule: m, nom: "Essai", roles: ["opcom"] }).expect(201);

    const beforeMine = (await base().get(`/api/incidents/${ELSEWHERE}/dashboard`).set(auth(su)).expect(200)).body
      .timeline.length as number;
    const beforeOther = (await base().get(`/api/incidents/${CASA}/dashboard`).set(auth(su)).expect(200)).body
      .timeline.length as number;

    // ELSEWHERE et non CASA : ce dernier est CLOS dans le seed, et la règle V-2
    // refuse d'armer une opération close — la règle vaut aussi pour les tests.
    await base().post(`/api/incidents/${ELSEWHERE}/deployments`).set(auth(su)).send({ matricule: m }).expect(201);

    const mine = await base().get(`/api/incidents/${ELSEWHERE}/dashboard`).set(auth(su)).expect(200);
    const other = await base().get(`/api/incidents/${CASA}/dashboard`).set(auth(su)).expect(200);

    // Le geste s'inscrit dans le fil de SON opération, et n'y touche qu'elle.
    expect(mine.body.timeline.length).toBe(beforeMine + 1);
    expect(other.body.timeline.length).toBe(beforeOther);
    // Et chaque ligne porte le rattachement : le fil n'est pas reconstitué en
    // cherchant l'identifiant dans le texte, ce qui raterait en silence dès
    // qu'une formulation change.
    for (const f of mine.body.timeline) expect(f.incidentId).toBe(ELSEWHERE);
  });

  // --- la description, enfin conservée --------------------------------------

  it("la description saisie à la déclaration est PERSISTÉE — elle était perdue", async () => {
    const desc = "Fuite sur bac de stockage, vent de secteur nord-ouest, périmètre établi à 300 m.";
    const created = await base()
      .post("/api/incidents")
      .set(auth(su))
      .send({
        titre: "Essai — description",
        type: "industrial",
        region: "Souss-Massa",
        sev: "low",
        st: "open",
        x: 40,
        y: 40,
        ll: [-9.6, 30.42],
        desc,
      })
      .expect(201);

    const dash = await base().get(`/api/incidents/${created.body.id}/dashboard`).set(auth(su)).expect(200);
    expect(dash.body.incident.desc).toBe(desc);
  });

  it("une MODIFICATION ne peut pas écrire une région hors référentiel", async () => {
    // La contrainte existait à la création (V-1) mais pas à la modification :
    // « Oriental » aurait soustrait l'incident au wali de « L'Oriental ».
    await base().patch(`/api/incidents/${CASA}`).set(auth(su)).send({ region: "Oriental" }).expect(400);
    await base().patch(`/api/incidents/${CASA}`).set(auth(su)).send({ region: "Casablanca-Settat" }).expect(200);
  });
});
