import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// V-2 — le déploiement comme ACTE, pas comme champ de formulaire
//
// Ce que ces tests protègent, c'est la jonction entre les deux lots : V-1 a
// décidé qu'un OPCOM ne voit QUE l'incident sur lequel il est déployé ; V-2
// décide COMMENT il y est déployé. Si le geste et la doctrine se désaccordent,
// le symptôme n'est pas une erreur mais un officier qui voit trop, ou rien.
// ============================================================================

describe("V-2 — déploiement d'un poste sur une opération", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());

  const token = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // Données du seed (les tests n'héritent pas du dev-store : `NODE_ENV=test`).
  const OPEN_A = "INC-2607"; // en cours
  const OPEN_B = "INC-2606"; // en cours
  const CLOSED = "INC-2598"; // clos
  const DEPLOYABLE = "y.tazi"; // cellule bleue — poste déployable
  const NOT_DEPLOYABLE = "n.fassi"; // responsable d'unité — sert plusieurs opérations

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

  /** Remet le compte d'essai hors de toute opération. */
  const undeploy = async (matricule: string) => {
    for (const inc of [OPEN_A, OPEN_B]) {
      await base().delete(`/api/incidents/${inc}/deployments/${matricule}`).set(auth(su));
    }
  };

  // --- la jonction avec V-1 -------------------------------------------------

  it("déployer un poste lui OUVRE cette opération — et elle seule", async () => {
    await undeploy(DEPLOYABLE);

    // Non déployé : la doctrine du default-deny lui refuse tout.
    const before = await base().get("/api/incidents").set(auth(await token(DEPLOYABLE, "bluecell"))).expect(200);
    expect(before.body).toHaveLength(0);

    await base()
      .post(`/api/incidents/${OPEN_A}/deployments`)
      .set(auth(su))
      .send({ matricule: DEPLOYABLE })
      .expect(201);

    const after = await base().get("/api/incidents").set(auth(await token(DEPLOYABLE, "bluecell"))).expect(200);
    expect(after.body).toHaveLength(1);
    expect(after.body[0].id).toBe(OPEN_A);
  });

  it("redéployer RETIRE de l'opération précédente — un poste, une opération", async () => {
    await undeploy(DEPLOYABLE);
    await base().post(`/api/incidents/${OPEN_A}/deployments`).set(auth(su)).send({ matricule: DEPLOYABLE }).expect(201);

    const move = await base()
      .post(`/api/incidents/${OPEN_B}/deployments`)
      .set(auth(su))
      .send({ matricule: DEPLOYABLE })
      .expect(201);

    // Le retrait implicite est RENDU : c'est ce qui permet de le tracer plutôt
    // que de le subir.
    expect(move.body).toMatchObject({ previousIncidentId: OPEN_A, incidentId: OPEN_B, changed: true });

    const onA = await base().get(`/api/incidents/${OPEN_A}/deployments`).set(auth(su)).expect(200);
    expect(onA.body.map((p: { matricule: string }) => p.matricule)).not.toContain(DEPLOYABLE);
    const onB = await base().get(`/api/incidents/${OPEN_B}/deployments`).set(auth(su)).expect(200);
    expect(onB.body.map((p: { matricule: string }) => p.matricule)).toContain(DEPLOYABLE);
  });

  it("redéployer sur la MÊME opération ne change rien (geste idempotent)", async () => {
    await undeploy(DEPLOYABLE);
    await base().post(`/api/incidents/${OPEN_A}/deployments`).set(auth(su)).send({ matricule: DEPLOYABLE }).expect(201);
    const again = await base()
      .post(`/api/incidents/${OPEN_A}/deployments`)
      .set(auth(su))
      .send({ matricule: DEPLOYABLE })
      .expect(201);
    expect(again.body.changed).toBe(false);
  });

  it("retirer un poste le rend AVEUGLE — plus aucune opération", async () => {
    await undeploy(DEPLOYABLE);
    await base().post(`/api/incidents/${OPEN_A}/deployments`).set(auth(su)).send({ matricule: DEPLOYABLE }).expect(201);
    await base().delete(`/api/incidents/${OPEN_A}/deployments/${DEPLOYABLE}`).set(auth(su)).expect(200);

    const seen = await base().get("/api/incidents").set(auth(await token(DEPLOYABLE, "bluecell"))).expect(200);
    expect(seen.body).toHaveLength(0);
  });

  // --- les règles du métier -------------------------------------------------

  it("un poste NON déployable est refusé — il sert plusieurs opérations à la fois", async () => {
    const res = await base()
      .post(`/api/incidents/${OPEN_A}/deployments`)
      .set(auth(su))
      .send({ matricule: NOT_DEPLOYABLE })
      .expect(400);
    expect(String(res.body.message)).toContain("poste déployable");
  });

  it("on n'arme pas une opération CLOSE", async () => {
    await base()
      .post(`/api/incidents/${CLOSED}/deployments`)
      .set(auth(su))
      .send({ matricule: DEPLOYABLE })
      .expect(409);
  });

  it("retirer un poste qui n'est pas déployé ici est refusé (409, pas un succès muet)", async () => {
    await undeploy(DEPLOYABLE);
    await base().delete(`/api/incidents/${OPEN_A}/deployments/${DEPLOYABLE}`).set(auth(su)).expect(409);
  });

  it("une opération inconnue reste inconnue (404)", async () => {
    await base()
      .post("/api/incidents/INC-0000/deployments")
      .set(auth(su))
      .send({ matricule: DEPLOYABLE })
      .expect(404);
  });

  // --- qui a le droit d'armer ----------------------------------------------

  it("DEFAULT-DENY : une cellule bleue ne déploie personne (403)", async () => {
    // `incidents:update` n'est accordé qu'à l'admin, l'OPCOM et le TACOM.
    const t = await token(DEPLOYABLE, "bluecell");
    await base()
      .post(`/api/incidents/${OPEN_A}/deployments`)
      .set(auth(t))
      .send({ matricule: DEPLOYABLE })
      .expect(403);
  });

  it("un OPCOM ne peut pas armer une opération qu'il ne voit pas — et elle lui reste INCONNUE", async () => {
    await undeploy(DEPLOYABLE);
    // Un OPCOM déployé sur A : B est hors de sa portée.
    await base().post(`/api/incidents/${OPEN_A}/deployments`).set(auth(su)).send({ matricule: "s.bennani" }).expect(201);
    const t = await token("s.bennani", "tacom");

    // 404 et non 403 : répondre « interdit » confirmerait l'existence de B.
    await base()
      .post(`/api/incidents/${OPEN_B}/deployments`)
      .set(auth(t))
      .send({ matricule: DEPLOYABLE })
      .expect(404);

    // …mais il arme bien la sienne.
    await base()
      .post(`/api/incidents/${OPEN_A}/deployments`)
      .set(auth(t))
      .send({ matricule: DEPLOYABLE })
      .expect(201);

    await base().delete(`/api/incidents/${OPEN_A}/deployments/s.bennani`).set(auth(su));
  });

  // --- ce que les listes laissent voir --------------------------------------

  it("un compte Super Administrateur reste INVISIBLE dans les postes déployables", async () => {
    // Depuis la Phase 2, un compte Super Administrateur est invisible à tout
    // autre rôle. Le déploiement ne doit pas percer cette règle par une porte
    // latérale : la liste des postes déployables lit le MÊME registre.
    //
    // Le cas ne se produit que pour un compte cumulant le superadmin ET un rôle
    // déployable — rare, mais c'est exactement le profil d'un compte de service.
    const cumul = `sa.tacom.${Date.now()}`;
    await base()
      .post("/api/iam/users")
      .set(auth(su))
      .send({ matricule: cumul, nom: "Compte de service", roles: ["superadmin", "tacom"] })
      .expect(201);

    const asSu = await base().get("/api/deployable-posts").set(auth(su)).expect(200);
    const asAdmin = await base().get("/api/deployable-posts").set(auth(await token("h.alami", "admin"))).expect(200);

    expect(asSu.body.map((p: { matricule: string }) => p.matricule)).toContain(cumul);
    expect(asAdmin.body.map((p: { matricule: string }) => p.matricule)).not.toContain(cumul);
  });

  it("les postes déployables portent leur affectation COURANTE — on voit qui l'on retire", async () => {
    await undeploy(DEPLOYABLE);
    await base().post(`/api/incidents/${OPEN_A}/deployments`).set(auth(su)).send({ matricule: DEPLOYABLE }).expect(201);

    const res = await base().get("/api/deployable-posts").set(auth(su)).expect(200);
    const entry = res.body.find((p: { matricule: string }) => p.matricule === DEPLOYABLE);
    expect(entry.currentIncidentId).toBe(OPEN_A);
  });

  // --- la trace -------------------------------------------------------------

  it("le journal d'audit porte QUI a été déployé, et d'où il a été retiré", async () => {
    await undeploy(DEPLOYABLE);
    await base().post(`/api/incidents/${OPEN_A}/deployments`).set(auth(su)).send({ matricule: DEPLOYABLE }).expect(201);
    await base().post(`/api/incidents/${OPEN_B}/deployments`).set(auth(su)).send({ matricule: DEPLOYABLE }).expect(201);

    const log = await base().get("/api/audit?limit=50").set(auth(su)).expect(200);
    const rows: { path: string; meta?: Record<string, unknown> }[] = Array.isArray(log.body)
      ? log.body
      : (log.body.entries ?? log.body.items ?? []);

    // La route seule ne dirait ni qui, ni d'où : c'est tout l'objet de `meta`.
    const move = rows.find((e) => e.path?.includes(`${OPEN_B}/deployments`) && e.meta?.deployed === DEPLOYABLE);
    expect(move).toBeDefined();
    expect(move?.meta).toMatchObject({ deployed: DEPLOYABLE, onto: OPEN_B, withdrawnFrom: OPEN_A });
  });

  it("supprimer une opération LIBÈRE ses postes — pas de compte accroché à un fantôme", async () => {
    const created = await base()
      .post("/api/incidents")
      .set(auth(su))
      .send({
        titre: "Exercice — cascade de suppression",
        type: "industrial",
        region: "Casablanca-Settat",
        sev: "low",
        st: "open",
        x: 40,
        y: 40,
        ll: [-7.5898, 33.5731],
      })
      .expect(201);
    const id = created.body.id as string;

    await base().post(`/api/incidents/${id}/deployments`).set(auth(su)).send({ matricule: DEPLOYABLE }).expect(201);
    await base().delete(`/api/incidents/${id}`).set(auth(su)).expect(200);

    // Sans la cascade, le compte garderait une portée « incident » pointant vers
    // un identifiant disparu : il ne verrait plus jamais rien, sans erreur.
    const seen = await base().get("/api/incidents").set(auth(await token(DEPLOYABLE, "bluecell"))).expect(200);
    expect(seen.body).toHaveLength(0);
  });
});
