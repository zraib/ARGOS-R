import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { RealtimeService, type RealtimeEvent } from "@/modules/realtime/realtime.service";
import { AttachmentsService } from "@/modules/realtime/attachments.service";

// ============================================================================
// COMMS — fermeture des routes, présence et pièces jointes
//
// CE QUE CES TESTS PROTÈGENT AVANT TOUT : que les routes du centre de
// communication restent GARDÉES. Elles ne l'étaient pas — la garde RBAC laisse
// passer toute route qui ne déclare pas de permission, et quatre routes n'en
// déclaraient aucune : n'importe quel compte authentifié pouvait écrire dans
// n'importe quel canal et créer des groupes. Un trou refermé sans test se
// rouvre au premier ajout de route.
//
// Et que PARTICIPER n'est pas ADMINISTRER : chacun prend la parole, seule
// l'administration renomme et supprime.
// ============================================================================

describe("COMMS — gardes, présence, pièces jointes", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  let admin: string;

  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    admin = await jeton("m.zraib", "superadmin");
  });

  afterAll(async () => app.close());

  // --- les gardes -----------------------------------------------------------

  describe("les routes sont GARDÉES", () => {
    it("un rôle à qui le module `comms` est coupé ne lit pas le centre", async () => {
      // Depuis l'ADR 0015 TOUS les rôles communiquent — plus aucun n'est privé de
      // la ligne `comms`. La garde se prouve donc par la bascule : le module
      // coupé pour `resp_equipment`, la route le refuse ; rouvert, elle le sert.
      // Une route sans garde ignorerait la bascule.
      const t = await jeton("k.idrissi", "resp_equipment");
      await base().get("/api/comms").set(bearer(t)).expect(200);
      await base().patch("/api/iam/role-features/resp_equipment").set(bearer(admin)).send({ feature: "comms", enabled: false }).expect(200);
      await base().get("/api/comms").set(bearer(t)).expect(403);
      await base().post("/api/iam/role-features/resp_equipment/reset").set(bearer(admin)).expect(201);
      await base().get("/api/comms").set(bearer(t)).expect(200);
    });

    it("PARTICIPER : un rôle opérationnel peut prendre la parole", async () => {
      // La parole n'est pas de l'administration. Un centre où l'on peut lire
      // sans répondre n'est pas un centre de communication.
      const t = await jeton("y.tazi", "tacom");
      await base().post("/api/comms/messages").set(bearer(t)).send({ channelId: "c1", txt: "Reçu." }).expect(201);
    });

    it("ADMINISTRER : ce même rôle ne CRÉE pas de canal", async () => {
      const t = await jeton("y.tazi", "tacom");
      await base()
        .post("/api/comms/channels")
        .set(bearer(t))
        .send({ categoryId: "g1", name: "canal-pirate" })
        .expect(403);
      await base().post("/api/comms/categories").set(bearer(t)).send({ name: "GROUPE PIRATE" }).expect(403);
    });

    it("ADMINISTRER : ce même rôle ne RENOMME ni ne SUPPRIME un canal", async () => {
      // Un canal renommé sous les pieds d'une conduite en cours, ou supprimé
      // avec sa conversation, ne se rattrape pas.
      const t = await jeton("y.tazi", "tacom");
      await base().patch("/api/comms/channels/c1").set(bearer(t)).send({ name: "détourné" }).expect(403);
      await base().delete("/api/comms/channels/c1").set(bearer(t)).expect(403);
    });

    it("l'administration, elle, crée puis renomme puis supprime", async () => {
      const cree = await base()
        .post("/api/comms/channels")
        .set(bearer(admin))
        .send({ categoryId: "g1", name: "essai-comms" })
        .expect(201);
      const id = cree.body.id as string;

      const renomme = await base()
        .patch(`/api/comms/channels/${id}`)
        .set(bearer(admin))
        .send({ name: "essai-renommé" })
        .expect(200);
      expect(renomme.body.name).toBe("essai-renommé");

      await base().delete(`/api/comms/channels/${id}`).set(bearer(admin)).expect(200);
    });
  });

  // --- annuaire des correspondants ------------------------------------------

  describe("annuaire des correspondants", () => {
    it("s'ouvre à qui participe, sans exiger l'administration des comptes", async () => {
      // Un rôle opérationnel n'a PAS `users:view` : si cette permission était
      // exigée pour désigner un correspondant, composer un canal deviendrait
      // un geste d'administration.
      const conduite = await jeton("y.tazi", "tacom");
      await base().get("/api/comms/directory").set(bearer(conduite)).expect(200);
      await base().get("/api/iam/users").set(bearer(conduite)).expect(403);
    });

    it("ne rend que des comptes RÉELLEMENT actifs — jamais un compte jamais utilisé", async () => {
      const res = await base().get("/api/comms/directory").set(bearer(admin)).expect(200);
      const matricules = (res.body as { matricule: string }[]).map((u) => u.matricule);
      expect(matricules.length).toBeGreaterThan(0);
      // Comptes du jeu d'amorçage ouverts par l'administration et jamais
      // ouverts par leur titulaire : les convoquer n'adresserait la
      // conversation à personne, tout en laissant croire le contraire.
      for (const jamaisConnecte of ["n.fassi", "s.bennani", "r.idrissi", "w.casa", "p.casa"]) {
        expect(matricules).not.toContain(jamaisConnecte);
      }
      // Un compte qui s'est déjà connecté, lui, est joignable.
      expect(matricules).toContain("y.tazi");
    });

    it("ne laisse fuir aucun élément du cycle de vie du compte", async () => {
      const res = await base().get("/api/comms/directory").set(bearer(admin)).expect(200);
      for (const u of res.body as Record<string, unknown>[]) {
        expect(Object.keys(u).sort()).toEqual(["grade", "matricule", "nom", "roles"]);
      }
    });
  });

  // --- présence -------------------------------------------------------------

  describe("la présence EST la connexion", () => {
    it("personne n'est en ligne tant qu'aucun flux n'est ouvert", async () => {
      const res = await base().get("/api/comms/presence").set(bearer(admin)).expect(200);
      expect(res.body.online).toEqual([]);
    });

    it("deux onglets d'un même compte font UN présent, pas deux", () => {
      // Compter les flux ferait gonfler l'effectif apparent du poste de
      // commandement — un chef verrait douze officiers là où six travaillent.
      const rt = app.get(RealtimeService);
      const a = rt.open("y.tazi", "tacom");
      const b = rt.open("y.tazi", "tacom");
      const c = rt.open("h.alami", "admin");

      const en = rt.online();
      expect(en).toHaveLength(2);
      expect(en.find((u) => u.matricule === "y.tazi")?.sessions).toBe(2);

      // Fermer UN onglet ne fait pas disparaître l'officier.
      a.close();
      expect(rt.online().find((u) => u.matricule === "y.tazi")?.sessions).toBe(1);
      b.close();
      expect(rt.online().map((u) => u.matricule)).toEqual(["h.alami"]);
      c.close();
      expect(rt.online()).toEqual([]);
    });

    it("un départ est POUSSÉ aux flux restants", (done) => {
      // Sans cela la liste des présents se figerait à l'état du chargement, et
      // l'on croirait joignable quelqu'un qui est parti.
      const rt = app.get(RealtimeService);
      const reste = rt.open("h.alami", "admin");
      const part = rt.open("y.tazi", "tacom");

      const vus: string[][] = [];
      const sub = reste.events.subscribe((e) => {
        if (e.kind !== "presence") return;
        vus.push(e.online.map((u) => u.matricule));
        if (vus.length === 1) {
          expect(vus[0]).not.toContain("y.tazi");
          sub.unsubscribe();
          reste.close();
          done();
        }
      });
      part.close();
    });
  });

  // --- pièces jointes -------------------------------------------------------

  describe("pièces jointes", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 7),
    ]);

    it("accepte une image dont le CONTENU correspond au type déclaré", () => {
      const svc = app.get(AttachmentsService);
      const att = svc.store({ originalname: "photo.png", mimetype: "image/png", size: png.length, buffer: png }, "m.zraib");
      expect(att.mime).toBe("image/png");
      expect(svc.read(att.id).buf.equals(png)).toBe(true);
    });

    it("REFUSE un fichier maquillé — type déclaré contre octets réels", () => {
      // Le type annoncé par le navigateur est choisi par l'expéditeur ; les
      // premiers octets, non. C'est la seule vérification qui vaille.
      const svc = app.get(AttachmentsService);
      const faux = Buffer.from("MZ  pas une image", "binary");
      expect(() =>
        svc.store({ originalname: "innocent.png", mimetype: "image/png", size: faux.length, buffer: faux }, "m.zraib"),
      ).toThrow(/ne correspond pas au type déclaré/);
    });

    it("REFUSE un type hors de la liste blanche, et le NOMME", () => {
      const svc = app.get(AttachmentsService);
      expect(() =>
        svc.store(
          { originalname: "script.sh", mimetype: "application/x-sh", size: 3, buffer: Buffer.from("ls\n") },
          "m.zraib",
        ),
      ).toThrow(/application\/x-sh/);
    });

    it("le nom d'origine ne devient JAMAIS un chemin", () => {
      // « ../../etc/passwd » n'écrit pas hors du dossier : le fichier est stocké
      // sous un identifiant tiré au sort, le nom ne sert qu'à l'affichage.
      const svc = app.get(AttachmentsService);
      const att = svc.store(
        { originalname: "../../etc/passwd", mimetype: "image/png", size: png.length, buffer: png },
        "m.zraib",
      );
      expect(att.name).not.toContain("/");
      expect(att.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("une pièce jointe inconnue répond 404, pas un fichier vide", async () => {
      await base().get("/api/comms/attachments/inexistant").set(bearer(admin)).expect(404);
    });
  });

  // --- accusés et frappe : les deux coches et « en train d'écrire » ----------
  //
  // Conversation DIRECTE seulement. Ce que ces tests verrouillent : l'accusé
  // marque les messages de l'AUTRE (jamais les siens), il est poussé à
  // l'auteur et à lui seul, il se relit à froid ; la frappe n'atteint que le
  // correspondant et n'entre PAS au journal d'audit — elle se répète à chaque
  // touche.

  describe("accusés de réception et de lecture, signal de frappe", () => {
    let dm: string;
    const flux = (matricule: string, role: string) => {
      const s = app.get(RealtimeService).open(matricule, role);
      const recus: RealtimeEvent[] = [];
      s.events.subscribe((e) => recus.push(e));
      return { recus, close: s.close };
    };
    const compte = (b: unknown) => (Array.isArray(b) ? b.length : ((b as { entries?: unknown[] }).entries?.length ?? 0));

    beforeAll(async () => {
      dm = (await base().post("/api/comms/direct/h.alami").set(bearer(admin)).expect(201)).body.id as string;
    });

    it("un message reçu se marque « remis » puis « lu » — chez l'auteur, sur le flux, et à la relecture", async () => {
      const auteur = flux("m.zraib", "superadmin");
      const alami = await jeton("h.alami", "admin");
      const id = (await base().post("/api/comms/messages").set(bearer(admin)).send({ channelId: dm, txt: "Reçu ?" }).expect(201)).body.id as number;
      expect((await base().post(`/api/comms/channels/${dm}/receipts`).set(bearer(alami)).send({ state: "delivered", upToId: id }).expect(200)).body.applied).toBe(true);
      expect((await base().post(`/api/comms/channels/${dm}/receipts`).set(bearer(alami)).send({ state: "read", upToId: id }).expect(200)).body.applied).toBe(true);
      // Un accusé répété ne change rien, donc ne sonne pas.
      expect((await base().post(`/api/comms/channels/${dm}/receipts`).set(bearer(alami)).send({ state: "read", upToId: id }).expect(200)).body.applied).toBe(false);
      const recus = auteur.recus.filter((e): e is Extract<RealtimeEvent, { kind: "receipt" }> => e.kind === "receipt");
      expect(recus.map((e) => e.state)).toEqual(["delivered", "read"]);
      expect(recus.every((e) => e.by === "h.alami" && e.channelId === dm && e.upToId === id)).toBe(true);
      const comms = (await base().get("/api/comms").set(bearer(admin)).expect(200)).body as { messages: Record<string, { id: number; deliveredBy?: string[]; readBy?: string[] }[]> };
      const msg = comms.messages[dm].find((m) => m.id === id);
      expect(msg?.deliveredBy).toEqual(["h.alami"]);
      expect(msg?.readBy).toEqual(["h.alami"]);
      auteur.close();
    });

    it("ne marque jamais ses propres messages, et rien hors conversation directe", async () => {
      // m.zraib n'a que SES messages dans la conversation : rien à marquer.
      expect((await base().post(`/api/comms/channels/${dm}/receipts`).set(bearer(admin)).send({ state: "read", upToId: Number.MAX_SAFE_INTEGER }).expect(200)).body.applied).toBe(false);
      // Un canal de conduite n'a pas de coches.
      expect((await base().post("/api/comms/channels/c1/receipts").set(bearer(admin)).send({ state: "read", upToId: Number.MAX_SAFE_INTEGER }).expect(200)).body.applied).toBe(false);
      // Un tiers n'accuse rien dans une conversation qui ne le concerne pas.
      const tiers = await jeton("y.tazi", "tacom");
      await base().post(`/api/comms/channels/${dm}/receipts`).set(bearer(tiers)).send({ state: "read", upToId: 1 }).expect(403);
    });

    it("la frappe n'atteint que le correspondant et n'entre pas au journal d'audit", async () => {
      const alami = flux("h.alami", "admin");
      const tiers = flux("y.tazi", "tacom");
      const avant = compte((await base().get("/api/audit").set(bearer(admin)).expect(200)).body);
      expect((await base().post(`/api/comms/channels/${dm}/typing`).set(bearer(admin)).expect(200)).body.applied).toBe(true);
      expect((await base().post("/api/comms/channels/c1/typing").set(bearer(admin)).expect(200)).body.applied).toBe(false);
      const apres = compte((await base().get("/api/audit").set(bearer(admin)).expect(200)).body);
      expect(alami.recus.some((e) => e.kind === "typing" && e.matricule === "m.zraib" && e.channelId === dm && e.nom.length > 0)).toBe(true);
      expect(tiers.recus.some((e) => e.kind === "typing")).toBe(false);
      expect(apres).toBe(avant);
      alami.close();
      tiers.close();
    });
  });
});
