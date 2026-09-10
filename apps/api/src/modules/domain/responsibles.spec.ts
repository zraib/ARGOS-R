import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";

// ============================================================================
// Qui tient quoi, et la conversation directe — vus par l'HTTP
//
// Deux promesses : la fiche d'une entité peut nommer son titulaire quel que
// soit le rôle qui la consulte (même exposition que l'annuaire), et une
// conversation directe ne sort du serveur que pour ses deux correspondants —
// le tiers ne la voit pas dans le centre, quel que soit son rôle.
// ============================================================================

describe("Comms — responsables et conversation directe", () => {
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

  type Resp = { kind: string; entityId: string; role: string; matricule: string; nom: string; grade?: string };

  it("nomme le titulaire de chaque entité affectée, pour un wali comme pour un superadmin", async () => {
    const wali = await token("w.casa", "wali");
    const res = await base().get("/api/comms/responsables").set(auth(wali)).expect(200);
    const list = res.body as Resp[];
    const u2 = list.find((r) => r.kind === "unit" && r.entityId === "U2");
    expect(u2).toMatchObject({ role: "resp_unit", matricule: "s.bennani", grade: "Commandant" });
    // Un rôle déployable sans déploiement ne tient aucun poste d'incident.
    expect(list.some((r) => r.kind === "incident" && r.matricule === "s.bennani")).toBe(false);
    const h2 = list.find((r) => r.kind === "hospital" && r.entityId === "H2");
    expect(h2).toMatchObject({ role: "resp_hospital", matricule: "s.moutaouakil", nom: "Salma Moutaouakil" });
  });

  it("un compte déployé sur un incident tient son poste sur cet incident", async () => {
    const admin = await token("k.benjelloun", "superadmin");
    await base().post("/api/incidents/INC-2616/deployments").set(auth(admin)).send({ matricule: "s.bennani" }).expect((r) => {
      // Selon l'état du registre in-memory, 200/201 (posé) — jamais un refus.
      if (r.status >= 400) throw new Error(`déploiement refusé : ${r.status} ${JSON.stringify(r.body)}`);
    });
    const res = await base().get("/api/comms/responsables").set(auth(admin)).expect(200);
    const postes = (res.body as Resp[]).filter((r) => r.kind === "incident" && r.matricule === "s.bennani");
    expect(postes.map((p) => p.role).sort()).toEqual(["bluecell", "tacom"]);
    expect(postes.every((p) => p.entityId === "INC-2616")).toBe(true);
  });

  it("la conversation directe s'ouvre pour deux, se retrouve, et reste invisible au tiers", async () => {
    const wali = await token("w.casa", "wali");
    const first = await base().post("/api/comms/direct/s.bennani").set(auth(wali)).expect(201);
    expect(first.body).toMatchObject({ direct: true, members: ["w.casa", "s.bennani"] });
    const again = await base().post("/api/comms/direct/S.BENNANI").set(auth(wali)).expect(201);
    expect(again.body.id).toBe(first.body.id);

    const ids = async (t: string) =>
      ((await base().get("/api/comms").set(auth(t)).expect(200)).body.categories as { chans: { id: string }[] }[]).flatMap((c) =>
        c.chans.map((ch) => ch.id),
      );
    expect(await ids(wali)).toContain(first.body.id);
    expect(await ids(await token("s.bennani", "tacom"))).toContain(first.body.id);
    expect(await ids(await token("p.casa", "place_arme"))).not.toContain(first.body.id);
    expect(await ids(await token("k.benjelloun", "superadmin"))).not.toContain(first.body.id);
  });

  it("refuse un correspondant inconnu, et un tiers ne peut ni y écrire ni la recomposer", async () => {
    const wali = await token("w.casa", "wali");
    await base().post("/api/comms/direct/inconnu").set(auth(wali)).expect(404);
    const chan = (await base().post("/api/comms/direct/s.bennani").set(auth(wali)).expect(201)).body as { id: string };
    const tiers = await token("p.casa", "place_arme");
    await base().post("/api/comms/messages").set(auth(tiers)).send({ channelId: chan.id, txt: "…" }).expect(403);
    await base().post(`/api/comms/channels/${chan.id}/members`).set(auth(tiers)).send({ matricules: ["p.casa"] }).expect(400);
  });
});
