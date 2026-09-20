import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Les unités et le mode de l'application (ADR 0022)
//
// Une unité porte le mode où elle a été créée et ne se montre que sous lui :
// liste des unités (carte, répartition, affectation), détenteurs du registre,
// terrain et boîte à outils du mode édition. Les unités d'avant (sans mode)
// et les graines se voient des deux côtés ; hôpitaux et abris sont communs.
// ============================================================================

describe("Unités par mode de l'application", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let root: string;
  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  const setMode = (profile: string) => base().patch("/api/domain/profile").set(bearer(root)).send({ profile, password: "ARGOS-2026" }).expect(200);
  const unitIds = async () => ((await base().get("/api/units").set(bearer(root)).expect(200)).body as { id: string }[]).map((u) => u.id);
  const ownerIds = async () => ((await base().get("/api/resources/owners").set(bearer(root)).expect(200)).body as { kind: string; id: string }[]).filter((o) => o.kind === "unit").map((o) => o.id);

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    root = await jeton("m.zraib", "superadmin");
  });

  afterAll(async () => app.close());

  it("une unité créée sous un mode ne se montre que sous lui — pour le Super Administrateur aussi (ADR 0027 rév.) ; celles d'avant se voient des deux côtés", async () => {
    const avant = await unitIds();
    expect(avant.length).toBeGreaterThan(0);
    const body = { nom: "Unité du mode", corps: "far", ville: "Rabat", eff: 30, dispo: "ready", readiness: 80, x: 300, y: 150, ll: [-6.84, 34.02] };
    const classique = (await base().post("/api/units").set(bearer(root)).send({ ...body, nom: "Unité classique" }).expect(201)).body as { id: string; profile?: string };
    expect(classique.profile).toBe("classique");
    expect(await unitIds()).toContain(classique.id);

    await setMode("direx");
    const direx = (await base().post("/api/units").set(bearer(root)).send({ ...body, nom: "Unité Direx" }).expect(201)).body as { id: string; profile?: string };
    expect(direx.profile).toBe("direx");
    const sousDirex = await unitIds();
    expect(sousDirex).toContain(direx.id);
    expect(sousDirex).not.toContain(classique.id);
    for (const id of avant) expect(sousDirex).toContain(id);
    // Le registre, le terrain et la boîte à outils suivent : les détenteurs sont ceux du mode.
    const detenteurs = await ownerIds();
    expect(detenteurs).toContain(direx.id);
    expect(detenteurs).not.toContain(classique.id);
    await base().get(`/api/resources?ownerKind=unit&ownerId=${classique.id}`).set(bearer(root)).expect(404);
    await base().get(`/api/resources?ownerKind=unit&ownerId=${direx.id}`).set(bearer(root)).expect(200);
    // L'unité de l'autre mode ne se modifie pas non plus : elle n'existe pas ici.
    await base().patch(`/api/units/${classique.id}`).set(bearer(root)).send({ readiness: 50 }).expect(404);
    // Les hôpitaux restent communs.
    expect(((await base().get("/api/hospitals").set(bearer(root)).expect(200)).body as unknown[]).length).toBeGreaterThan(0);

    await setMode("classique");
    const sousClassique = await unitIds();
    expect(sousClassique).toContain(classique.id);
    expect(sousClassique).not.toContain(direx.id);
    expect(await ownerIds()).not.toContain(direx.id);
  });
});
