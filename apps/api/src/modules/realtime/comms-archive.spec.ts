import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// COMMS — traçabilité des conversations (ADR 0021)
//
// Trois promesses, par les routes : le canal d'une opération porte son TITRE
// et le suit (renommé avec lui, archivé avec lui) ; archiver est un acte
// d'administration qui laisse lire sans laisser écrire ; l'export est un
// document que l'import reprend en archives — sans rien fusionner, sans
// reprendre deux fois la même chose, et sous les mêmes gardes.
// ============================================================================

interface ChanView { id: string; name: string; incidentId?: string; archived?: boolean; archivedBy?: string; imported?: { originalId: string } }
interface CommsView { categories: { id: string; name: string; chans: ChanView[] }[]; messages: Record<string, { txt: string; at?: string }[]> }
interface ExportDoc { format: string; exportedAt: string; exportedBy: string; channels: { id: string; name: string; messages: unknown[] }[] }

describe("COMMS — traçabilité : nom d'incident, archives, export, import", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  let admin: string;
  let tacom: string;

  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const centre = async (t: string): Promise<CommsView> => (await base().get("/api/comms").set(bearer(t)).expect(200)).body as CommsView;
  const canal = (c: CommsView, pred: (ch: ChanView) => boolean) => c.categories.flatMap((g) => g.chans).find(pred);

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    admin = await jeton("m.zraib", "superadmin");
    tacom = await jeton("y.tazi", "tacom");
  });

  afterAll(async () => app.close());

  it("le canal d'une opération porte son titre, tel quel, et le suit — renommé, archivé, rouvert", async () => {
    const id = (
      await base().post("/api/incidents").set(bearer(admin))
        .send({ type: "flood", titre: "Crue de l'oued Ourika — traçabilité", region: "Marrakech-Safi", sev: "medium", st: "open", x: 300, y: 150, ll: [-7.9, 31.4] })
        .expect(201)
    ).body.id as string;
    let chan = canal(await centre(admin), (ch) => ch.incidentId === id);
    expect(chan?.name).toBe("Crue de l'oued Ourika — traçabilité");

    await base().patch(`/api/incidents/${id}`).set(bearer(admin)).send({ titre: "Crue de l'Ourika (révisée)" }).expect(200);
    chan = canal(await centre(admin), (ch) => ch.incidentId === id);
    expect(chan?.name).toBe("Crue de l'Ourika (révisée)");

    // Un message avant l'archivage — il restera lisible.
    await base().post("/api/comms/messages").set(bearer(admin)).send({ channelId: chan!.id, txt: "Point de situation." }).expect(201);
    await base().patch(`/api/incidents/${id}`).set(bearer(admin)).send({ archived: true }).expect(200);
    const vu = await centre(admin);
    chan = canal(vu, (ch) => ch.incidentId === id);
    expect(chan?.archived).toBe(true);
    expect(chan?.archivedBy).toBe("m.zraib");
    expect(vu.messages[chan!.id].map((m) => m.txt)).toContain("Point de situation.");
    expect(vu.messages[chan!.id].every((m) => typeof m.at === "string")).toBe(true);
    await base().post("/api/comms/messages").set(bearer(admin)).send({ channelId: chan!.id, txt: "Trop tard." }).expect(403);

    await base().patch(`/api/incidents/${id}`).set(bearer(admin)).send({ archived: false }).expect(200);
    chan = canal(await centre(admin), (ch) => ch.incidentId === id);
    expect(chan?.archived).toBeUndefined();
    await base().post("/api/comms/messages").set(bearer(admin)).send({ channelId: chan!.id, txt: "Reprise." }).expect(201);
  });

  it("archiver est un acte d'administration : la conduite lit l'archive, n'y écrit plus, ne l'archive pas elle-même", async () => {
    await base().post("/api/comms/channels/c1/archive").set(bearer(tacom)).expect(403);
    const archive = (await base().post("/api/comms/channels/c1/archive").set(bearer(admin)).expect(201)).body as ChanView;
    expect(archive.archived).toBe(true);
    expect(canal(await centre(tacom), (ch) => ch.id === "c1")?.archived).toBe(true);
    await base().post("/api/comms/messages").set(bearer(tacom)).send({ channelId: "c1", txt: "Reçu." }).expect(403);
    await base().post("/api/comms/channels/c1/unarchive").set(bearer(tacom)).expect(403);
    await base().post("/api/comms/channels/c1/unarchive").set(bearer(admin)).expect(201);
    await base().post("/api/comms/messages").set(bearer(tacom)).send({ channelId: "c1", txt: "Reçu." }).expect(201);
  });

  it("chacun exporte une conversation qu'il voit ; tout le centre, l'administration seule", async () => {
    const doc = (await base().get("/api/comms/channels/c1/export").set(bearer(tacom)).expect(200)).body as ExportDoc;
    expect(doc.format).toBe("iris-comms/1");
    expect(doc.exportedBy).toBe("y.tazi");
    expect(doc.channels).toHaveLength(1);
    expect(doc.channels[0].id).toBe("c1");
    expect(doc.channels[0].messages.length).toBeGreaterThan(0);
    await base().get("/api/comms/channels/c-fantome/export").set(bearer(tacom)).expect(404);
    await base().get("/api/comms/export").set(bearer(tacom)).expect(403);
    const tout = (await base().get("/api/comms/export").set(bearer(admin)).expect(200)).body as ExportDoc;
    expect(tout.channels.length).toBeGreaterThan(1);
  });

  it("l'import reprend l'export en archives — une fois, sous « ARCHIVES IMPORTÉES », par l'administration seule", async () => {
    const doc = (await base().get("/api/comms/channels/c1/export").set(bearer(admin)).expect(200)).body as ExportDoc;
    await base().post("/api/comms/import").set(bearer(tacom)).send(doc).expect(403);
    const res = (await base().post("/api/comms/import").set(bearer(admin)).send(doc).expect(201)).body as { channels: number; messages: number; skipped: number };
    expect(res.channels).toBe(1);
    expect(res.messages).toBe(doc.channels[0].messages.length);
    expect(res.skipped).toBe(0);

    const vu = await centre(tacom);
    const groupe = vu.categories.find((g) => g.id === "g-import");
    expect(groupe?.name).toBe("ARCHIVES IMPORTÉES");
    const repris = groupe?.chans.find((ch) => ch.imported?.originalId === "c1");
    expect(repris?.archived).toBe(true);
    expect(repris?.name).toBe(`${doc.channels[0].name} (${doc.exportedAt.slice(0, 10)})`);
    expect(vu.messages[repris!.id]).toHaveLength(doc.channels[0].messages.length);
    // Le canal d'origine n'a rien reçu : rien n'est fusionné.
    expect(canal(vu, (ch) => ch.id === "c1")?.archived).toBeUndefined();
    // Lisible, pas inscriptible ; et le même export ne se reprend pas deux fois.
    await base().post("/api/comms/messages").set(bearer(tacom)).send({ channelId: repris!.id, txt: "Non." }).expect(403);
    const encore = (await base().post("/api/comms/import").set(bearer(admin)).send(doc).expect(201)).body as { channels: number; skipped: number };
    expect(encore).toMatchObject({ channels: 0, skipped: 1 });
  });

  it("un document qui n'est pas un export iris-comms/1 est refusé", async () => {
    await base().post("/api/comms/import").set(bearer(admin)).send({ format: "autre", exportedAt: "2026-01-01", channels: [] }).expect(400);
    await base().post("/api/comms/import").set(bearer(admin)).send({ format: "iris-comms/1", exportedAt: "2026-01-01", channels: "non" }).expect(400);
    await base().post("/api/comms/import").set(bearer(admin)).send({ format: "iris-comms/1", exportedAt: "2026-01-01", channels: [{ id: "x", name: "x", messages: [{ txt: 42 }] }] }).expect(400);
  });
});
