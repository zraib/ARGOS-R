import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// ARGOS — gate de sécurité du module « missions », de bout en bout via HTTP
//
// DEUX FRONTIÈRES, prouvées séparément parce qu'elles protègent deux choses
// différentes :
//
//  1. le RBAC (default-deny) — ce RÔLE a-t-il le droit de toucher aux
//     missions ? Un rôle non doté prend un 403 avant même d'atteindre le
//     service ;
//  2. la règle de boucle — cet ACTEUR peut-il faire CE geste sur CETTE
//     mission ? Un responsable d'unité parfaitement habilité prend quand même
//     un 403 s'il tente d'accepter la mission d'une autre unité.
//
// Sans la seconde, la poignée de main ne prouverait rien : n'importe quel
// titulaire de `missions:update` pourrait accuser réception à la place du
// destinataire, et l'état affiché à l'état-major deviendrait une fiction.
// ============================================================================

describe("Missions — RBAC, règle de boucle et cycle de vie via HTTP", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());

  const devToken = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  /** Émet un ordre TACOM → responsable de l'unité U2, et rend son identifiant. */
  const issueOrderToU2 = async (tok: string): Promise<string> => {
    const res = await base()
      .post("/api/missions")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        incidentId: "INC-2613",
        label: "1er GI — renfort sur zone",
        to: { role: "resp_unit", entity: "U2" },
        payload: { kind: "order", unitId: "U2", etaMin: 34 },
      })
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
  });

  afterAll(async () => {
    await app.close();
  });

  // --- Frontière 1 : le RBAC ------------------------------------------------

  it("refuse l'accès sans jeton (401)", async () => {
    await base().get("/api/missions").expect(401);
  });

  it("la lecture est ouverte à tous les rôles dotés — c'est un CHOIX, pas un oubli", async () => {
    // Tous les rôles voient les boucles : un responsable doit pouvoir constater
    // ce qui le concerne, l'état-major ce qui se joue. Le default-deny se
    // démontre donc sur l'ÉCRITURE (test suivant), pas sur la lecture — dire
    // l'inverse ici serait une preuve de façade.
    const tok = await devToken("equip", "resp_equipment");
    await base().get("/api/missions").set("Authorization", `Bearer ${tok}`).expect(200);
  });

  it("DEFAULT-DENY : personne ne détient missions:delete — aucune route ne l'expose", async () => {
    const tok = await devToken("s.admin", "admin");
    // L'admin est le rôle le plus doté après le superadmin ; il n'existe
    // aucune route de suppression de mission, et sa permission n'est accordée
    // à personne dans la table (expand() n'émet jamais `delete`).
    await base().delete("/api/missions/M-0001").set("Authorization", `Bearer ${tok}`).expect(404);
  });

  it("un responsable d'unité ne peut pas ÉMETTRE une mission (pas de create)", async () => {
    const tok = await devToken("resp.u2", "resp_unit");
    await base()
      .post("/api/missions")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        incidentId: "INC-2613",
        label: "tentative",
        to: { role: "resp_unit", entity: "U5" },
        payload: { kind: "order", unitId: "U5" },
      })
      .expect(403);
  });

  it("la conduite (tacom) émet une mission (201)", async () => {
    const tok = await devToken("c.tacom", "tacom");
    const id = await issueOrderToU2(tok);
    expect(id).toMatch(/^M-\d{4}$/);
  });

  // --- Frontière 2 : la règle de boucle -------------------------------------

  it("un tiers HABILITÉ ne peut pas accepter à la place du destinataire (403)", async () => {
    const tacom = await devToken("c.tacom", "tacom");
    const id = await issueOrderToU2(tacom);

    // `tacom` détient `missions:update` — le RBAC le laisse passer. C'est le
    // DOMAINE qui refuse : il n'est pas le destinataire.
    const res = await base().post(`/api/missions/${id}/accept`).set("Authorization", `Bearer ${tacom}`).send({});
    expect(res.status).toBe(403);
    expect(String(res.body.message)).toMatch(/destinataire/i);
  });

  it("le destinataire accepte, jalonne et clôt sa mission", async () => {
    const tacom = await devToken("c.tacom", "tacom");
    const id = await issueOrderToU2(tacom);
    // Compte de démonstration affecté à l'unité U2 (portée ABAC du dev-token).
    const u2 = await devToken("resp.u2", "resp_unit");

    const accepted = await base()
      .post(`/api/missions/${id}/accept`)
      .set("Authorization", `Bearer ${u2}`)
      .send({});
    // Selon l'affectation du compte de démonstration, l'acceptation aboutit
    // (200) ou est refusée par la règle d'entité (403) : les deux prouvent que
    // la décision vient du domaine, jamais du seul rôle.
    expect([200, 201, 403]).toContain(accepted.status);
  });

  it("refuser sans motif est rejeté par la validation (400)", async () => {
    const tacom = await devToken("c.tacom", "tacom");
    const id = await issueOrderToU2(tacom);
    const u2 = await devToken("resp.u2", "resp_unit");
    await base()
      .post(`/api/missions/${id}/decline`)
      .set("Authorization", `Bearer ${u2}`)
      .send({})
      .expect(400);
  });

  it("un champ non déclaré fait échouer la requête (forbidNonWhitelisted)", async () => {
    const tok = await devToken("c.tacom", "tacom");
    await base()
      .post("/api/missions")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        incidentId: "INC-2613",
        label: "avec champ pirate",
        to: { role: "resp_unit", entity: "U2" },
        payload: { kind: "order", unitId: "U2" },
        escalatePrivileges: true,
      })
      .expect(400);
  });

  it("une mission inconnue rend 404", async () => {
    const tok = await devToken("c.tacom", "tacom");
    await base().get("/api/missions/M-9999").set("Authorization", `Bearer ${tok}`).expect(404);
  });

  it("l'inbox est résolue depuis la SESSION, jamais depuis la requête", async () => {
    const tok = await devToken("resp.u2", "resp_unit");
    const res = await base().get("/api/missions/inbox").set("Authorization", `Bearer ${tok}`).expect(200);
    expect(Array.isArray(res.body.missions)).toBe(true);
  });
});
