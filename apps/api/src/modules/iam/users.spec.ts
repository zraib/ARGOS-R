import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

/**
 * Gate de sécurité Phase 2 (gestion des utilisateurs) : prouve que les règles
 * d'attribution de rôles et les actions privilégiées sont appliquées CÔTÉ
 * SERVEUR (le frontend ne fait que refléter). Le registre est in-memory.
 */
describe("IAM users — RBAC + règles d'attribution (Phase 2)", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());

  const token = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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

  it("DEFAULT-DENY : un resp_unit ne peut pas créer d'utilisateur (403)", async () => {
    const t = await token("agent", "resp_unit");
    await base().post("/api/iam/users").set(auth(t)).send({ matricule: "x.test", nom: "X", roles: ["resp_unit"] }).expect(403);
  });

  it("un Admin ne peut PAS créer un Administrateur (403 — règle serveur)", async () => {
    const t = await token("h.alami", "admin");
    await base().post("/api/iam/users").set(auth(t)).send({ matricule: "new.admin", nom: "New Admin", roles: ["admin"] }).expect(403);
  });

  it("un Admin ne peut PAS créer un Super Administrateur (403)", async () => {
    const t = await token("h.alami", "admin");
    await base().post("/api/iam/users").set(auth(t)).send({ matricule: "new.super", nom: "New Super", roles: ["superadmin"] }).expect(403);
  });

  it("un Admin ne peut attribuer qu'UN SEUL rôle (400 si plusieurs)", async () => {
    const t = await token("h.alami", "admin");
    await base().post("/api/iam/users").set(auth(t)).send({ matricule: "multi.by.admin", nom: "Multi", roles: ["tacom", "bluecell"] }).expect(400);
  });

  it("un Admin peut créer un rôle non privilégié → code temporaire généré (201)", async () => {
    const t = await token("h.alami", "admin");
    const res = await base().post("/api/iam/users").set(auth(t)).send({ matricule: "agent.admin", nom: "Agent Admin", roles: ["resp_unit"], assignments: { unit: "U1" } }).expect(201);
    expect(res.body.tempPassword).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(res.body.user.status).toBe("inactive");
  });

  it("un Super Admin peut créer un compte MULTI-RÔLES (201)", async () => {
    const t = await token("k.benjelloun", "superadmin");
    const res = await base().post("/api/iam/users").set(auth(t)).send({ matricule: "s.multi", nom: "S Multi", roles: ["tacom", "bluecell", "resp_unit"], assignments: { unit: "U2" } }).expect(201);
    expect(res.body.user.roles).toEqual(["tacom", "bluecell", "resp_unit"]);
  });

  it("activation forcée : Admin et Super Admin (matrice : A-M-Ar-V sur Utilisateurs)", async () => {
    const su = await token("k.benjelloun", "superadmin");
    const created = await base().post("/api/iam/users").set(auth(su)).send({ matricule: "to.activate", nom: "To Activate", roles: ["strategic"] }).expect(201);
    const id = created.body.user.id as string;

    const adminTok = await token("h.alami", "admin");
    await base().post(`/api/iam/users/${id}/active`).set(auth(adminTok)).send({ active: true }).expect(201);

    const res = await base().post(`/api/iam/users/${id}/active`).set(auth(su)).send({ active: true }).expect(201);
    expect(res.body.status).toBe("active");
  });

  it("matrice rôle→fonctionnalités : Admin et Super Admin (matrice : M sur Utilisateurs)", async () => {
    const adminTok = await token("h.alami", "admin");
    await base().patch("/api/iam/role-features/tacom").set(auth(adminTok)).send({ feature: "triage", enabled: true }).expect(200);

    const su = await token("k.benjelloun", "superadmin");
    const res = await base().patch("/api/iam/role-features/tacom").set(auth(su)).send({ feature: "triage", enabled: true }).expect(200);
    expect(res.body.triage).toBe(true);
  });

  it("le code temporaire est consultable par un Admin (200)", async () => {
    const t = await token("h.alami", "admin");
    const list = await base().get("/api/iam/users").set(auth(t)).expect(200);
    const fassi = (list.body as Array<{ id: string; matricule: string }>).find((u) => u.matricule === "n.fassi");
    expect(fassi).toBeDefined();
    const res = await base().get(`/api/iam/users/${fassi!.id}/temp-code`).set(auth(t)).expect(200);
    expect(res.body.tempPassword).toBe("A7X2-K9D3");
  });

  it("cycle de vie : login code temp → changement mdp obligatoire → activé", async () => {
    // 1er login avec le code temporaire.
    const login1 = await base().post("/api/auth/login").send({ matricule: "n.fassi", password: "A7X2-K9D3" }).expect(201);
    expect(login1.body.mustChangePassword).toBe(true);
    expect(login1.body.role).toBe("resp_unit");

    // Changement de mot de passe (authentifié avec le jeton du login).
    await base().post("/api/auth/change-password").set(auth(login1.body.access_token)).send({ newPassword: "motdepasse1" }).expect(201);

    // Reconnexion avec le nouveau mot de passe → plus de changement requis.
    const login2 = await base().post("/api/auth/login").send({ matricule: "n.fassi", password: "motdepasse1" }).expect(201);
    expect(login2.body.mustChangePassword).toBe(false);

    // L'ancien code temporaire ne fonctionne plus.
    await base().post("/api/auth/login").send({ matricule: "n.fassi", password: "A7X2-K9D3" }).expect(401);
  });

  it("compte multi-rôles : login → sélection de rôle → nouveau jeton", async () => {
    const login = await base().post("/api/auth/login").send({ matricule: "s.bennani", password: "Q4M8-P2L6" }).expect(201);
    expect(login.body.mustChooseRole).toBe(true);
    // Rôle non attribué → refusé.
    await base().post("/api/auth/select-role").set(auth(login.body.access_token)).send({ role: "superadmin" }).expect(403);
    // Rôle attribué → nouveau jeton.
    const sel = await base().post("/api/auth/select-role").set(auth(login.body.access_token)).send({ role: "bluecell" }).expect(201);
    expect(sel.body.role).toBe("bluecell");
  });

  it("un Administrateur ne voit AUCUN Super Administrateur dans le registre", async () => {
    const adminTok = await token("h.alami", "admin");
    const superTok = await token("m.zraib", "superadmin");

    const asAdmin = await base().get("/api/iam/users").set(auth(adminTok)).expect(200);
    const asSuper = await base().get("/api/iam/users").set(auth(superTok)).expect(200);

    const supersSeenByAdmin = (asAdmin.body as { roles: string[] }[]).filter((u) => u.roles.includes("superadmin"));
    const supersSeenBySuper = (asSuper.body as { roles: string[] }[]).filter((u) => u.roles.includes("superadmin"));
    expect(supersSeenByAdmin).toHaveLength(0);
    expect(supersSeenBySuper.length).toBeGreaterThan(0);
    // Il voit bien le reste du registre.
    expect(asAdmin.body.length).toBe(asSuper.body.length - supersSeenBySuper.length);
  });

  it("un compte Super Administrateur est INTROUVABLE (404) pour un Administrateur", async () => {
    const adminTok = await token("h.alami", "admin");
    const superTok = await token("m.zraib", "superadmin");
    const all = await base().get("/api/iam/users").set(auth(superTok)).expect(200);
    const su = (all.body as { id: string; roles: string[] }[]).find((u) => u.roles.includes("superadmin"));
    expect(su).toBeDefined();

    // 404 et non 403 : un 403 confirmerait l'existence du compte.
    await base().get(`/api/iam/users/${su!.id}/temp-code`).set(auth(adminTok)).expect(404);
    await base().post(`/api/iam/users/${su!.id}/active`).set(auth(adminTok)).send({ active: false }).expect(404);
    await base().delete(`/api/iam/users/${su!.id}`).set(auth(adminTok)).expect(403);
  });

  it("un Administrateur DÉSACTIVE un compte mais ne le supprime pas", async () => {
    const adminTok = await token("h.alami", "admin");
    const created = await base()
      .post("/api/iam/users")
      .set(auth(adminTok))
      .send({ matricule: "u.desactive", nom: "À désactiver", roles: ["bluecell"] })
      .expect(201);
    const id = created.body.user.id as string;

    const off = await base().post(`/api/iam/users/${id}/active`).set(auth(adminTok)).send({ active: false }).expect(201);
    expect(off.body.status).toBe("inactive");
    // …mais la suppression lui reste interdite (réservée au Super Administrateur).
    await base().delete(`/api/iam/users/${id}`).set(auth(adminTok)).expect(403);
  });


  // --- RATTACHEMENTS DE PORTÉE (lot V-1) ------------------------------------
  // Le wali, la place d'armes et la conduite déployée ne répondent pas d'une
  // ENTITÉ mais d'un PÉRIMÈTRE. Ces règles décident ce que le compte verra :
  // une portée mal posée est une fuite ou un écran vide, jamais un simple
  // détail de saisie.

  it("V-1 : un wali SANS région est refusé — sinon il ne verrait rien du tout", async () => {
    const t = await token("m.zraib", "superadmin");
    const res = await base()
      .post("/api/iam/users")
      .set(auth(t))
      .send({ matricule: `w.sansregion.${Date.now()}`, nom: "Wali", roles: ["wali"], assignments: {} })
      .expect(400);
    expect(String(res.body.message)).toContain("Région administrative");
  });

  it("V-1 : une région hors référentiel est refusée — « Oriental » n'est pas « L'Oriental »", async () => {
    const t = await token("m.zraib", "superadmin");
    await base()
      .post("/api/iam/users")
      .set(auth(t))
      .send({
        matricule: `w.faux.${Date.now()}`,
        nom: "Wali",
        roles: ["wali"],
        assignments: { region: "Oriental" },
      })
      .expect(400);
  });

  it("V-1 : un OPCOM ne peut pas se voir affecter une RÉGION (portée orpheline)", async () => {
    const t = await token("m.zraib", "superadmin");
    const res = await base()
      .post("/api/iam/users")
      .set(auth(t))
      .send({
        matricule: `o.faux.${Date.now()}`,
        nom: "OPCOM",
        roles: ["opcom"],
        assignments: { region: "Casablanca-Settat" },
      })
      .expect(400);
    expect(String(res.body.message)).toContain("aucun rôle du compte n'en relève");
  });

  it("V-1 : un OPCOM est créé SANS incident — le déploiement est un acte distinct", async () => {
    const t = await token("m.zraib", "superadmin");
    await base()
      .post("/api/iam/users")
      .set(auth(t))
      .send({ matricule: `o.libre.${Date.now()}`, nom: "OPCOM", roles: ["opcom"] })
      .expect(201);
  });

  it("V-1 : modifier un compte n'EFFACE PAS sa portée (le piège du normalisateur)", async () => {
    const t = await token("m.zraib", "superadmin");
    const created = await base()
      .post("/api/iam/users")
      .set(auth(t))
      .send({
        matricule: `w.persist.${Date.now()}`,
        nom: "Wali",
        roles: ["wali"],
        assignments: { region: "Souss-Massa" },
      })
      .expect(201);
    const id = created.body.user.id as string;

    // Un patch qui ne parle QUE du téléphone : la région doit survivre. Le
    // normalisateur reconstruit l'objet d'affectation à chaque écriture — omettre
    // les périmètres l'aurait vidé sans le moindre message d'erreur, et le wali
    // se serait retrouvé aveugle après une modification anodine. (Le grade ne
    // convient pas ici : un wali est une autorité civile, l'API le refuse.)
    const patched = await base().patch(`/api/iam/users/${id}`).set(auth(t)).send({ phone: "+212600000001" }).expect(200);
    expect(patched.body.assignments?.region).toBe("Souss-Massa");
  });

  it("V-1 : un responsable d'abri cumule SON abri ET son incident de déploiement", async () => {
    const t = await token("m.zraib", "superadmin");
    const res = await base()
      .post("/api/iam/users")
      .set(auth(t))
      .send({
        matricule: `r.abri.${Date.now()}`,
        nom: "Resp Abri",
        roles: ["resp_shelter"],
        assignments: { shelter: "AB-04", incident: "INC-2607" },
      })
      .expect(201);
    expect(res.body.user.assignments).toMatchObject({ shelter: "AB-04", incident: "INC-2607" });
  });

});
