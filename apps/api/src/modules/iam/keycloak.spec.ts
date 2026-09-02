import "reflect-metadata";
import { createServer, type Server } from "node:http";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { SignJWT, exportJWK, generateKeyPair, type KeyLike } from "jose";
import { AppModule } from "@/app.module";

// ============================================================================
// MODE KEYCLOAK — la vérification RS256 par JWKS distant, éprouvée sans Keycloak
//
// En production l'API ne signe rien : elle VÉRIFIE des jetons émis par
// Keycloak (RS256), contre le JWKS du realm, l'émetteur et l'audience. Ce test
// joue Keycloak avec une paire de clés générée à la volée et un serveur HTTP
// local qui sert le JWKS. Ce qu'il verrouille (registre R-2) :
//   - un jeton correctement signé, émis et adressé passe, avec son rôle ARGOS ;
//   - mauvaise audience, mauvais émetteur, expiration, autre clé, algorithme
//     HS256 du mode dev : refusés ;
//   - hors mode dev, l'API ne fabrique AUCUN jeton (dev-token et login → 403).
// ============================================================================

describe("Authentification Keycloak (RS256 / JWKS)", () => {
  let app: INestApplication;
  let jwks: Server;
  let issuer: string;
  let privateKey: KeyLike;
  let otherKey: KeyLike;
  const kid = "argos-test-key";
  const envAvant = { ...process.env };

  const base = () => request(app.getHttpServer());

  /** Un jeton comme Keycloak l'émettrait, avec les écarts voulus par chaque cas. */
  const jeton = async (
    roles: string[],
    opts: { audience?: string; issuer?: string; key?: KeyLike; exp?: string; username?: string } = {},
  ) =>
    new SignJWT({ preferred_username: opts.username ?? "m.zraib", realm_access: { roles } })
      .setProtectedHeader({ alg: "RS256", kid })
      .setSubject("uuid-m-zraib")
      .setIssuer(opts.issuer ?? issuer)
      .setAudience(opts.audience ?? "argos-api")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(opts.key ?? privateKey);

  beforeAll(async () => {
    const paire = await generateKeyPair("RS256");
    privateKey = paire.privateKey;
    otherKey = (await generateKeyPair("RS256")).privateKey;
    const jwk = { ...(await exportJWK(paire.publicKey)), kid, alg: "RS256", use: "sig" };

    // Le « realm » : seule la route du JWKS existe, c'est tout ce que l'API lit.
    jwks = createServer((req, res) => {
      if (req.url === "/realms/argos/protocol/openid-connect/certs") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ keys: [jwk] }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((r) => jwks.listen(0, "127.0.0.1", r));
    const port = (jwks.address() as { port: number }).port;
    issuer = `http://127.0.0.1:${port}/realms/argos`;

    process.env.AUTH_MODE = "keycloak";
    process.env.KEYCLOAK_ISSUER = issuer;
    process.env.KEYCLOAK_AUDIENCE = "argos-api";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((r) => jwks.close(() => r()));
    // Les autres suites tournent dans le même processus : on rend l'environnement tel qu'on l'a trouvé.
    process.env.AUTH_MODE = envAvant.AUTH_MODE;
    process.env.KEYCLOAK_ISSUER = envAvant.KEYCLOAK_ISSUER;
    process.env.KEYCLOAK_AUDIENCE = envAvant.KEYCLOAK_AUDIENCE;
    for (const k of ["AUTH_MODE", "KEYCLOAK_ISSUER", "KEYCLOAK_AUDIENCE"]) if (envAvant[k] === undefined) delete process.env[k];
  });

  it("un jeton Keycloak valide passe, et son rôle ARGOS est résolu", async () => {
    const t = await jeton(["opcom"]);
    const res = await base().get("/api/iam/me").set("Authorization", `Bearer ${t}`).expect(200);
    expect(res.body.role).toBe("opcom");
    expect(res.body.username ?? res.body.matricule ?? res.body.sub).toBeDefined();
  });

  it("plusieurs rôles ARGOS : le plus élevé dans l'ordre de la matrice l'emporte", async () => {
    const t = await jeton(["opcom", "superadmin", "wali"]);
    const res = await base().get("/api/iam/me").set("Authorization", `Bearer ${t}`).expect(200);
    expect(res.body.role).toBe("superadmin");
  });

  it("aucun rôle ARGOS parmi les rôles du realm : refusé", async () => {
    const t = await jeton(["offline_access", "uma_authorization"]);
    await base().get("/api/iam/me").set("Authorization", `Bearer ${t}`).expect(401);
  });

  it("mauvaise audience : refusé", async () => {
    await base().get("/api/iam/me").set("Authorization", `Bearer ${await jeton(["opcom"], { audience: "autre-api" })}`).expect(401);
  });

  it("mauvais émetteur : refusé", async () => {
    await base()
      .get("/api/iam/me")
      .set("Authorization", `Bearer ${await jeton(["opcom"], { issuer: "http://keycloak.pirate/realms/argos" })}`)
      .expect(401);
  });

  it("jeton expiré : refusé", async () => {
    await base().get("/api/iam/me").set("Authorization", `Bearer ${await jeton(["opcom"], { exp: "-1m" })}`).expect(401);
  });

  it("signé par une autre clé, même kid : refusé", async () => {
    await base().get("/api/iam/me").set("Authorization", `Bearer ${await jeton(["opcom"], { key: otherKey })}`).expect(401);
  });

  it("un jeton HS256 du mode dev ne vaut rien en mode keycloak", async () => {
    const hs = await new SignJWT({ preferred_username: "m.zraib", role: "superadmin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("argos-dev-secret-change-me"));
    await base().get("/api/iam/me").set("Authorization", `Bearer ${hs}`).expect(401);
  });

  it("hors mode dev, l'API ne fabrique aucun jeton : dev-token refusé, login sans jeton", async () => {
    await base().post("/api/auth/dev-token").send({ username: "m.zraib", role: "superadmin" }).expect(403);
    // Un mot de passe faux est refusé avant toute émission (401) ; un mot de
    // passe juste serait refusé à l'émission (403). Dans les deux cas : pas de jeton.
    const res = await base().post("/api/auth/login").send({ matricule: "m.zraib", password: "n'importe quoi" });
    expect([401, 403]).toContain(res.status);
    expect(res.body.access_token).toBeUndefined();
  });

  it("sans jeton : 401, même en mode keycloak", async () => {
    await base().get("/api/iam/me").expect(401);
  });
});
