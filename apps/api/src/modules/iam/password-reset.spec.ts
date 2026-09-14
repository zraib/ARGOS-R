import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// « Mot de passe oublié » — la demande publique, ceux qu'elle prévient, et
// le geste qui la sert.
//
// Ce que ces tests verrouillent : la route ne dit JAMAIS si un compte existe ;
// seuls les administrateurs capables de servir la demande la reçoivent ; une
// demande répétée ne fait pas sonner deux fois ; et régénérer le code la clôt,
// puis le nouveau code ouvre le circuit du premier login.
// ============================================================================

describe("IAM — mot de passe oublié", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());

  const token = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  type Notice = { id: string; kind: string; matricule?: string; userId?: string; nom?: string };
  type User = { id: string; matricule: string; resetRequestedAt: string | null };
  const noticesOf = async (username: string, role: string) =>
    (await base().get("/api/comms/notices").set(auth(await token(username, role))).expect(200)).body as Notice[];
  const userByMatricule = async (matricule: string) => {
    const t = await token("m.zraib", "superadmin");
    const users = (await base().get("/api/iam/users").set(auth(t)).expect(200)).body as User[];
    return users.find((u) => u.matricule === matricule);
  };
  const demander = (matricule: string) => base().post("/api/auth/password-reset-request").send({ matricule });

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

  it("répond la même chose que le compte existe ou non — l'écran de connexion n'est pas un annuaire", async () => {
    const inconnu = await demander("personne.ici").expect(202);
    const connu = await demander("n.fassi").expect(202);
    expect(inconnu.body).toEqual({ ok: true });
    expect(connu.body).toEqual({ ok: true });
  });

  it("pose la demande sur le compte et prévient les administrateurs qui peuvent la servir", async () => {
    const fassi = await userByMatricule("n.fassi");
    expect(fassi?.resetRequestedAt).toEqual(expect.any(String));
    // n.fassi n'est pas privilégié : le Super Admin ET l'Administrateur sont prévenus.
    for (const [u, r] of [["m.zraib", "superadmin"], ["h.alami", "admin"]] as const) {
      const n = (await noticesOf(u, r)).find((x) => x.kind === "password_reset_requested" && x.matricule === "n.fassi");
      expect(n).toMatchObject({ userId: fassi!.id, nom: "Lt. N. Fassi" });
    }
  });

  it("un compte privilégié n'alerte que le Super Admin — jamais l'Administrateur, qui ne peut pas le servir", async () => {
    await demander("h.alami").expect(202);
    expect((await noticesOf("m.zraib", "superadmin")).some((n) => n.matricule === "h.alami")).toBe(true);
    expect((await noticesOf("h.alami", "admin")).some((n) => n.matricule === "h.alami")).toBe(false);
  });

  it("une demande répétée ne fait pas sonner deux fois", async () => {
    const avant = (await noticesOf("m.zraib", "superadmin")).filter((n) => n.matricule === "n.fassi").length;
    await demander("N.Fassi").expect(202);
    const apres = (await noticesOf("m.zraib", "superadmin")).filter((n) => n.matricule === "n.fassi").length;
    expect(apres).toBe(avant);
  });

  it("le compte système ne se demande pas ici : son code se remet hors-bande, sans alerte", async () => {
    await demander("m.zraib").expect(202);
    expect((await userByMatricule("m.zraib"))?.resetRequestedAt).toBeNull();
    expect((await noticesOf("m.zraib", "superadmin")).some((n) => n.matricule === "m.zraib")).toBe(false);
  });

  it("régénérer le code clôt la demande, et le nouveau code rouvre le circuit du premier login", async () => {
    const admin = await token("h.alami", "admin");
    const fassi = await userByMatricule("n.fassi");
    const res = await base().post(`/api/iam/users/${fassi!.id}/reset-code`).set(auth(admin)).expect(201);
    const code = res.body.tempPassword as string;
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect((await userByMatricule("n.fassi"))?.resetRequestedAt).toBeNull();
    // L'ancien code ne vaut plus rien ; le nouveau impose de poser un mot de passe.
    await base().post("/api/auth/login").send({ matricule: "n.fassi", password: "A7X2-K9D3" }).expect(401);
    const login = await base().post("/api/auth/login").send({ matricule: "n.fassi", password: code }).expect(201);
    expect(login.body.mustChangePassword).toBe(true);
  });

  it("une demande n'est pas un ordre : le mot de passe reste valable tant qu'aucun administrateur n'agit", async () => {
    // y.tazi a son mot de passe ; il « oublie », puis s'en souvient et se connecte.
    await demander("y.tazi").expect(202);
    expect((await userByMatricule("y.tazi"))?.resetRequestedAt).toEqual(expect.any(String));
    await base().post("/api/auth/login").send({ matricule: "y.tazi", password: "argos" }).expect(201);
    // Reconnecté de lui-même : la demande n'a plus d'objet, elle disparaît.
    expect((await userByMatricule("y.tazi"))?.resetRequestedAt).toBeNull();
  });

  it("le corps est validé : un matricule vide ou une clé inconnue sont refusés", async () => {
    await base().post("/api/auth/password-reset-request").send({ matricule: "" }).expect(400);
    await base().post("/api/auth/password-reset-request").send({ matricule: "x", role: "superadmin" }).expect(400);
  });
});
