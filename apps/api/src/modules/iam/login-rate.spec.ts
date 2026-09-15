import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Connexion — la borne des échecs (ADR 0013 : la station peut être exposée le
// temps d'une démonstration, la route de connexion est alors publique).
//
// Ce que ces tests verrouillent : dix échecs sur un compte ferment la porte de
// CE compte (429, pas 401 — l'appelant sait qu'il doit attendre, pas que le
// mot de passe est faux) ; les autres comptes ne sont pas concernés ; les
// réussites ne comptent pas.
// ============================================================================

describe("IAM — borne des échecs de connexion", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const login = (matricule: string, password: string) => base().post("/api/auth/login").send({ matricule, password });

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

  it("dix échecs ferment le compte visé (429), les autres comptes restent ouverts", async () => {
    for (let i = 0; i < 10; i++) await login("compte.cible", "faux").expect(401);
    // Onzième : la fenêtre est épuisée — même avec le bon mot de passe on
    // n'apprendrait rien, la réponse est « attendez », pas « incorrect ».
    await login("compte.cible", "faux").expect(429);
    await login("Compte.Cible ", "faux").expect(429); // la clé est le matricule normalisé
    // Un autre compte, à l'instant même, se connecte normalement.
    await login("s.bennani", "Q4M8-P2L6").expect(201);
  });

  it("les connexions réussies ne consomment pas la borne", async () => {
    for (let i = 0; i < 12; i++) await login("n.fassi", "A7X2-K9D3").expect(201);
  });
});
