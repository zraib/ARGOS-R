import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Postes d'opération sur la carte — vus par l'HTTP
//
// Ce que ces tests verrouillent : seul le Super Administrateur pose, déplace
// et retire un poste (l'Administrateur, qui « a tout », ne l'a pas) ; un poste
// désigne une INSTANCE — le compte qui tient le PC ou la cellule, déployé sur
// l'opération dans le même geste, ou l'abri / le parc représenté — et une
// instance ne se pose qu'une fois ; LIRE les postes suit la visibilité des
// incidents — un wali ne voit pas ceux d'une autre région.
// ============================================================================

describe("Postes sur la carte — édition réservée, instances uniques, lecture cantonnée", () => {
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

  type Inc = { id: string; region: string; archived?: boolean; st?: string };
  type Post = { id: string; incidentId: string; kind: string; ll: [number, number]; entityId?: string; matricule?: string; label?: string };
  let admin: string;
  let casa: Inc;
  let ailleurs: Inc;

  beforeAll(async () => {
    admin = await token("k.benjelloun", "superadmin");
    const incs = (await base().get("/api/incidents").set(auth(admin)).expect(200)).body as Inc[];
    const ouverte = (i: Inc) => !i.archived && i.st !== "closed";
    casa = incs.find((i) => i.region === "Casablanca-Settat" && ouverte(i))!;
    ailleurs = incs.find((i) => i.region !== "Casablanca-Settat" && ouverte(i))!;
    expect(casa).toBeDefined();
    expect(ailleurs).toBeDefined();
  });

  it("seul le Super Administrateur pose un poste — l'Administrateur et la conduite sont refusés", async () => {
    for (const [u, r] of [["h.alami", "admin"], ["s.bennani", "tacom"], ["w.casa", "wali"]] as const) {
      await base().post(`/api/incidents/${casa.id}/posts`).set(auth(await token(u, r))).send({ kind: "opcom", ll: [-7.6, 33.58], matricule: "o.chraibi" }).expect(403);
    }
  });

  it("un PC désigne LE compte qui le tient : posé, il est déployé sur l'opération ; posé deux fois, refusé", async () => {
    await base().post(`/api/incidents/${casa.id}/posts`).set(auth(admin)).send({ kind: "opcom", ll: [-7.6, 33.58] }).expect(400);
    await base().post(`/api/incidents/${casa.id}/posts`).set(auth(admin)).send({ kind: "opcom", ll: [-7.6, 33.58], matricule: "s.bennani" }).expect(400);
    await base().post(`/api/incidents/INC-0000/posts`).set(auth(admin)).send({ kind: "opcom", ll: [-7.6, 33.58], matricule: "o.chraibi" }).expect(404);
    const res = await base().post(`/api/incidents/${casa.id}/posts`).set(auth(admin)).send({ kind: "opcom", ll: [-7.6, 33.58], label: " PC avancé ", matricule: "o.chraibi" }).expect(201);
    expect(res.body).toMatchObject({ incidentId: casa.id, kind: "opcom", ll: [-7.6, 33.58], label: "PC avancé", matricule: "o.chraibi", createdBy: "k.benjelloun" });
    expect((res.body as Post).entityId).toBeUndefined();
    // Le compte est maintenant déployé sur l'opération — la doctrine de visibilité s'y appliquera.
    const deployed = (await base().get(`/api/incidents/${casa.id}/deployments`).set(auth(admin)).expect(200)).body as { matricule: string }[];
    expect(deployed.some((d) => d.matricule === "o.chraibi")).toBe(true);
    // Une instance ne se pose qu'une fois — ici comme ailleurs, quelle que soit la casse.
    await base().post(`/api/incidents/${casa.id}/posts`).set(auth(admin)).send({ kind: "opcom", ll: [-7.7, 33.5], matricule: "O.CHRAIBI" }).expect(409);
    await base().post(`/api/incidents/${ailleurs.id}/posts`).set(auth(admin)).send({ kind: "opcom", ll: [-7.9, 31.4], matricule: "o.chraibi" }).expect(409);
    // Un poste refusé n'a rien déployé.
    const la = (await base().get(`/api/incidents/${ailleurs.id}/deployments`).set(auth(admin)).expect(200)).body as { matricule: string }[];
    expect(la.some((d) => d.matricule === "o.chraibi")).toBe(false);
  });

  it("un abri ou un parc représentent une entité existante, posée une fois ; une nature inconnue est refusée", async () => {
    await base().post(`/api/incidents/${casa.id}/posts`).set(auth(admin)).send({ kind: "shelter", ll: [-7.6, 33.58] }).expect(400);
    await base().post(`/api/incidents/${casa.id}/posts`).set(auth(admin)).send({ kind: "shelter", ll: [-7.6, 33.58], entityId: "A999" }).expect(400);
    await base().post(`/api/incidents/${casa.id}/posts`).set(auth(admin)).send({ kind: "bunker", ll: [-7.6, 33.58] }).expect(400);
    const shelters = (await base().get("/api/shelters").set(auth(admin)).expect(200)).body as { id: string }[];
    const ok = await base().post(`/api/incidents/${casa.id}/posts`).set(auth(admin)).send({ kind: "shelter", ll: [-7.62, 33.59], entityId: shelters[0].id }).expect(201);
    expect(ok.body.entityId).toBe(shelters[0].id);
    await base().post(`/api/incidents/${ailleurs.id}/posts`).set(auth(admin)).send({ kind: "shelter", ll: [-7.9, 31.4], entityId: shelters[0].id }).expect(409);
    const parc = await base().post(`/api/incidents/${casa.id}/posts`).set(auth(admin)).send({ kind: "equipment", ll: [-7.63, 33.6], entityId: "U2" }).expect(201);
    expect(parc.body.entityId).toBe("U2");
  });

  it("lire les postes suit la visibilité des incidents : le wali ne voit que sa région", async () => {
    await base().post(`/api/incidents/${ailleurs.id}/posts`).set(auth(admin)).send({ kind: "tacom", ll: [-7.9, 31.4], matricule: "s.bennani" }).expect(201);
    const duWali = (await base().get("/api/posts").set(auth(await token("w.casa", "wali"))).expect(200)).body as Post[];
    expect(duWali.length).toBeGreaterThan(0);
    expect(duWali.every((p) => p.incidentId === casa.id)).toBe(true);
    const tous = (await base().get("/api/posts").set(auth(admin)).expect(200)).body as Post[];
    expect(tous.some((p) => p.incidentId === ailleurs.id)).toBe(true);
    // Un poste déployable NON déployé ne voit aucune opération, donc aucun poste (default-deny).
    expect((await base().get("/api/posts").set(auth(await token("y.tazi", "bluecell"))).expect(200)).body).toEqual([]);
  });

  it("se déplace, se renomme, se retire — et part avec son opération", async () => {
    const tmp = (await base().post("/api/incidents").set(auth(admin))
      .send({ type: "flood", titre: "Crue test — postes", region: "Casablanca-Settat", x: 0, y: 0, ll: [-7.5, 33.5], sev: "low", st: "open" })
      .expect(201)).body as { id: string };
    const post = (await base().post(`/api/incidents/${tmp.id}/posts`).set(auth(admin)).send({ kind: "bluecell", ll: [-7.5, 33.5], matricule: "y.tazi" }).expect(201)).body as Post;
    const moved = await base().patch(`/api/incidents/${tmp.id}/posts/${post.id}`).set(auth(admin)).send({ ll: [-7.51, 33.51], label: "Opérations" }).expect(200);
    expect(moved.body).toMatchObject({ ll: [-7.51, 33.51], label: "Opérations" });
    await base().patch(`/api/incidents/${casa.id}/posts/${post.id}`).set(auth(admin)).send({ ll: [-7.5, 33.5] }).expect(404);
    await base().patch(`/api/incidents/${tmp.id}/posts/${post.id}`).set(auth(await token("h.alami", "admin"))).send({ ll: [-7.5, 33.5] }).expect(403);
    const second = (await base().post(`/api/incidents/${tmp.id}/posts`).set(auth(admin)).send({ kind: "equipment", ll: [-7.52, 33.52], entityId: "U1" }).expect(201)).body as Post;
    await base().delete(`/api/incidents/${tmp.id}/posts/${post.id}`).set(auth(admin)).expect(200);
    // Retirer le lieu ne retire pas le compte de l'opération.
    const encore = (await base().get(`/api/incidents/${tmp.id}/deployments`).set(auth(admin)).expect(200)).body as { matricule: string }[];
    expect(encore.some((d) => d.matricule === "y.tazi")).toBe(true);
    await base().delete(`/api/incidents/${tmp.id}`).set(auth(admin)).expect(200);
    const rest = (await base().get("/api/posts").set(auth(admin)).expect(200)).body as Post[];
    expect(rest.some((p) => p.id === post.id || p.id === second.id)).toBe(false);
  });
});
