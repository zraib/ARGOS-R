import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { firstValueFrom, take, toArray } from "rxjs";
import { AppModule } from "@/app.module";
import { RealtimeService, type RealtimeEvent } from "@/modules/realtime/realtime.service";

// ============================================================================
// Alertes adressées — l'incident déclaré prévient les autorités de SA région
//
// Ce que ces tests verrouillent : le wali et la place d'armes de la région
// reçoivent l'alerte, personne d'autre ; une autre région n'est pas prévenue ;
// et l'alerte est gardée pour qui n'était pas connecté.
// ============================================================================

describe("Alertes — le wali et la place d'armes sont prévenus à la déclaration", () => {
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

  type Notice = { id: string; kind: string; incidentId: string; region: string; titre: string; ll: [number, number] };
  const declare = async (region: string, titre: string, ll: [number, number]) => {
    const admin = await token("k.benjelloun", "superadmin");
    const res = await base()
      .post("/api/incidents")
      .set(auth(admin))
      .send({ type: "flood", titre, region, x: 0, y: 0, ll, sev: "medium", st: "open" })
      .expect(201);
    return res.body as { id: string };
  };
  const noticesOf = async (username: string, role: string) =>
    (await base().get("/api/comms/notices").set(auth(await token(username, role))).expect(200)).body as Notice[];

  it("prévient le wali ET la place d'armes de la région, avec le point de l'incident", async () => {
    const inc = await declare("Casablanca-Settat", "Crue test — Casablanca", [-7.6, 33.58]);
    for (const [u, r] of [["w.casa", "wali"], ["p.casa", "place_arme"]] as const) {
      const mine = await noticesOf(u, r);
      const n = mine.find((x) => x.incidentId === inc.id);
      expect(n).toMatchObject({ kind: "incident_declared", region: "Casablanca-Settat", titre: "Crue test — Casablanca", ll: [-7.6, 33.58] });
      // La plus récente d'abord.
      expect(mine[0].incidentId).toBe(inc.id);
    }
  });

  it("prévient aussi le directeur d'hôpital et le commandant d'unité dont l'établissement est dans la région", async () => {
    const inc = await declare("Casablanca-Settat", "Crue test — responsables", [-7.61, 33.57]);
    // H2 est à Casablanca : sa directrice est prévenue.
    expect((await noticesOf("s.moutaouakil", "resp_hospital")).some((n) => n.incidentId === inc.id)).toBe(true);
    // U3 est à Agadir (Souss-Massa) : son commandant ne l'est pas.
    expect((await noticesOf("n.fassi", "resp_unit")).some((n) => n.incidentId === inc.id)).toBe(false);
  });

  it("ne prévient ni un poste déployable sans établissement dans la région, ni les autorités d'une AUTRE région", async () => {
    const inc = await declare("Marrakech-Safi", "Crue test — Ourika", [-7.79, 31.32]);
    // y.tazi tient une cellule, aucune entité : rien ne le rattache à la région.
    expect((await noticesOf("y.tazi", "bluecell")).some((n) => n.incidentId === inc.id)).toBe(false);
    // s.bennani commande U2, à Marrakech : l'incident le concerne, il est prévenu.
    expect((await noticesOf("s.bennani", "resp_unit")).some((n) => n.incidentId === inc.id)).toBe(true);
    expect((await noticesOf("w.casa", "wali")).some((n) => n.incidentId === inc.id)).toBe(false);
    expect((await noticesOf("p.casa", "place_arme")).some((n) => n.incidentId === inc.id)).toBe(false);
  });

  it("est poussée sur le flux des seuls destinataires connectés", async () => {
    const rt = app.get(RealtimeService);
    const wali = rt.open("w.casa", "wali");
    const tiers = rt.open("s.bennani", "tacom");
    const recus: RealtimeEvent[] = [];
    const recusTiers: RealtimeEvent[] = [];
    wali.events.subscribe((e) => recus.push(e));
    tiers.events.subscribe((e) => recusTiers.push(e));
    const attendu = firstValueFrom(wali.events.pipe(take(1), toArray()));
    const inc = await declare("Casablanca-Settat", "Crue test — flux", [-7.61, 33.6]);
    await attendu;
    expect(recus.some((e) => e.kind === "notice" && e.notice.incidentId === inc.id)).toBe(true);
    expect(recusTiers.some((e) => e.kind === "notice")).toBe(false);
    wali.close();
    tiers.close();
  });
});
