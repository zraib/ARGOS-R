import "reflect-metadata";
import { connect, type Socket } from "node:net";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { Fmc920TcpServer } from "@/modules/tracking/infrastructure/fmc920.tcp-server";
import { crc16 } from "@/modules/tracking/codec8";

// ============================================================================
// N-2 — suivi de traceurs FMC920 : registre, RBAC, et chaîne TCP complète
//
// Ce que ces tests protègent :
//
//   1. LA LISTE BLANCHE. Un IMEI non déclaré est refusé à la poignée de main.
//      C'est la seule barrière d'un port TCP ouvert sur un réseau opérateur :
//      le protocole Teltonika ne porte ni secret ni certificat.
//   2. LA CHAÎNE ENTIÈRE. Des octets réels entrent par une vraie socket, une
//      position sort par l'API HTTP. Tester le décodeur seul ne prouverait pas
//      que le découpage du flot, l'accusé et le versement s'enchaînent.
//   3. L'ORDRE DU TEMPS. Un boîtier hors couverture mémorise puis déverse : les
//      enregistrements remontent dans le désordre, et la dernière position doit
//      rester la plus récente, pas la dernière reçue.
// ============================================================================

const IMEI = "356307042441013";
const IMEI_INCONNU = "999999999999999";

/** Emballe un champ de données hexadécimal dans un paquet AVL au CRC juste. */
function paquet(corpsHex: string): Buffer {
  const data = Buffer.from(corpsHex.replace(/\s+/g, ""), "hex");
  const t = Buffer.alloc(8 + data.length + 4);
  t.writeUInt32BE(0, 0);
  t.writeUInt32BE(data.length, 4);
  data.copy(t, 8);
  t.writeUInt32BE(crc16(data), 8 + data.length);
  return t;
}

/**
 * Un enregistrement Codec 8 fabriqué à la demande : Casablanca par défaut.
 * Coordonnées en entiers signés au 1/10 000 000 de degré.
 */
function record(opts: { at: number; lng: number; lat: number; sats?: number; speed?: number }): string {
  const b = Buffer.alloc(24);
  b.writeBigUInt64BE(BigInt(opts.at), 0);
  b.writeUInt8(1, 8); // priorité
  b.writeInt32BE(Math.round(opts.lng * 1e7), 9);
  b.writeInt32BE(Math.round(opts.lat * 1e7), 13);
  b.writeInt16BE(120, 17); // altitude
  b.writeUInt16BE(90, 19); // cap
  b.writeUInt8(opts.sats ?? 9, 21);
  b.writeUInt16BE(opts.speed ?? 42, 22);
  // Aucun élément d'entrée/sortie : événement 0, total 0, quatre décomptes nuls.
  return b.toString("hex") + "00" + "00" + "00000000";
}

function trameCodec8(...records: string[]): Buffer {
  const n = records.length.toString(16).padStart(2, "0");
  return paquet("08" + n + records.join("") + n);
}

describe("N-2 — traceurs FMC920", () => {
  let app: INestApplication;
  let port: number;
  const base = () => request(app.getHttpServer());
  let tok: string;
  const auth = () => ({ Authorization: `Bearer ${tok}` });

  const jeton = async (username: string, role: string): Promise<string> =>
    (await base().post("/api/auth/dev-token").send({ username, role }).expect(201)).body.access_token as string;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    // Port 0 : le système en attribue un libre. Un port figé ferait échouer la
    // suite sur un poste où il est déjà pris — un verdict qui dépendrait de la
    // machine plutôt que du code.
    process.env.FMC920_PORT = "0";
    process.env.FMC920_HOST = "127.0.0.1";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const bound = app.get(Fmc920TcpServer).boundPort;
    expect(bound).not.toBeNull();
    port = bound!;
    tok = await jeton("m.zraib", "superadmin");
  });

  afterAll(async () => {
    await app.close();
    delete process.env.FMC920_PORT;
    delete process.env.FMC920_HOST;
  });

  // --- registre -------------------------------------------------------------

  describe("registre", () => {
    it("déclare un traceur et refuse un IMEI mal formé", async () => {
      const res = await base()
        .post("/api/tracking/trackers")
        .set(auth())
        .send({ imei: IMEI, label: "Ambulance 04", target: { kind: "unit", id: "U3" } })
        .expect(201);
      expect(res.body.id).toBe(`trk-${IMEI}`);
      expect(res.body.last).toBeNull();
      expect(res.body.lastSeenAt).toBeNull();

      await base()
        .post("/api/tracking/trackers")
        .set(auth())
        .send({ imei: "12345", label: "Trop court" })
        .expect(400);
    });

    it("refuse deux traceurs sous le MÊME IMEI", async () => {
      // L'IMEI est la seule identité présentée à la poignée de main : un doublon
      // enverrait les positions d'un moyen à l'autre.
      await base()
        .post("/api/tracking/trackers")
        .set(auth())
        .send({ imei: IMEI, label: "Doublon" })
        .expect(400);
    });

    it("DEFAULT-DENY : un rôle à qui le module `trackers` est coupé est refusé", async () => {
      // Les responsables lisent les positions depuis l'ADR 0015 (elles doivent
      // apparaître sur leur carte) : la garde se prouve par la bascule du module.
      const t = await jeton("resp.h4", "resp_hospital");
      await base().get("/api/tracking/trackers").set({ Authorization: `Bearer ${t}` }).expect(200);
      await base().patch("/api/iam/role-features/resp_hospital").set({ Authorization: `Bearer ${tok}` }).send({ feature: "trackers", enabled: false }).expect(200);
      await base().get("/api/tracking/trackers").set({ Authorization: `Bearer ${t}` }).expect(403);
      await base().post("/api/iam/role-features/resp_hospital/reset").set({ Authorization: `Bearer ${tok}` }).expect(201);
      await base().get("/api/tracking/trackers").set({ Authorization: `Bearer ${t}` }).expect(200);
    });

    it("la suppression définitive est réservée au Super Administrateur", async () => {
      const t = await jeton("y.tazi", "tacom");
      await base().delete(`/api/tracking/trackers/trk-${IMEI}`).set({ Authorization: `Bearer ${t}` }).expect(403);
    });
  });

  // --- partage de position par l'application -------------------------------

  describe("partage de position par l'application (ADR 0008, révision)", () => {
    it("se déclare sans IMEI, pour un compte, une seule fois", async () => {
      const res = await base()
        .post("/api/tracking/trackers")
        .set(auth())
        .send({ source: "app", account: "n.fassi", label: "Lt Fassi — téléphone", target: { kind: "personnel", id: "n.fassi" }, incidentId: "INC-2612" })
        .expect(201);
      expect(res.body).toMatchObject({ id: "trk-app-n.fassi", source: "app", account: "n.fassi", imei: "app:n.fassi", incidentId: "INC-2612" });
      await base().post("/api/tracking/trackers").set(auth()).send({ source: "app", account: "n.fassi", label: "Doublon" }).expect(400);
      // Un boîtier, lui, exige toujours son IMEI.
      await base().post("/api/tracking/trackers").set(auth()).send({ label: "Sans IMEI" }).expect(400);
    });

    it("le compte retrouve SON partage, même sans droit de voir le registre", async () => {
      const t = await jeton("n.fassi", "resp_unit");
      const res = await base().get("/api/tracking/trackers/mine").set({ Authorization: `Bearer ${t}` }).expect(200);
      expect(res.body.tracker?.id).toBe("trk-app-n.fassi");
      const autre = await jeton("resp.h4", "resp_hospital");
      expect((await base().get("/api/tracking/trackers/mine").set({ Authorization: `Bearer ${autre}` }).expect(200)).body.tracker).toBeNull();
    });

    it("seul le compte du partage verse sa position ; un boîtier n'accepte rien par HTTP", async () => {
      const t = await jeton("n.fassi", "resp_unit");
      const res = await base()
        .post("/api/tracking/trackers/trk-app-n.fassi/position")
        .set({ Authorization: `Bearer ${t}` })
        .send({ ll: [-7.61, 33.59], accuracyM: 12, speedKmh: 4.4, headingDeg: 360 })
        .expect(201);
      expect(res.body.last).toMatchObject({ ll: [-7.61, 33.59], speedKmh: 4, headingDeg: 0, satellites: 1, priority: "low" });
      expect(res.body.lastSeenAt).not.toBeNull();
      // Un autre compte — même le superadmin — ne peut pas parler à sa place.
      await base().post("/api/tracking/trackers/trk-app-n.fassi/position").set(auth()).send({ ll: [-7.6, 33.6] }).expect(403);
      // Hors du globe : refusé.
      await base().post("/api/tracking/trackers/trk-app-n.fassi/position").set({ Authorization: `Bearer ${t}` }).send({ ll: [-200, 33.6] }).expect(400);
      // Le boîtier FMC920 n'a pas d'entrée HTTP.
      await base().post(`/api/tracking/trackers/trk-${IMEI}/position`).set(auth()).send({ ll: [-7.6, 33.6] }).expect(409);
      // Archivé : le partage s'arrête.
      await base().patch("/api/tracking/trackers/trk-app-n.fassi").set(auth()).send({ archived: true }).expect(200);
      await base().post("/api/tracking/trackers/trk-app-n.fassi/position").set({ Authorization: `Bearer ${t}` }).send({ ll: [-7.6, 33.6] }).expect(409);
    });
  });

  // --- la chaîne TCP --------------------------------------------------------

  describe("chaîne TCP complète", () => {
    it("REFUSE un IMEI non déclaré à la poignée de main", async () => {
      // Le registre EST la liste blanche. Sans ce refus, n'importe quel boîtier
      // atteignant le port pourrait écrire dans la carte de l'état-major.
      const s = await ouvrir(port);
      const reponse = await echange(s, imeiFrame(IMEI_INCONNU));
      expect(reponse[0]).toBe(0x00);
      s.destroy();
    });

    it("accepte un IMEI déclaré, verse la position, et l'accuse", async () => {
      const s = await ouvrir(port);
      expect((await echange(s, imeiFrame(IMEI)))[0]).toBe(0x01);

      const at = Date.UTC(2026, 8, 1, 9, 30, 0);
      const ack = await echange(s, trameCodec8(record({ at, lng: -7.6, lat: 33.57 })));
      // L'accusé porte le nombre d'enregistrements acceptés : le boîtier efface
      // de son tampon ce qui est accusé, donc ce compte n'est pas cosmétique.
      expect(ack.readUInt32BE(0)).toBe(1);
      s.destroy();

      const res = await base().get(`/api/tracking/trackers/trk-${IMEI}`).set(auth()).expect(200);
      expect(res.body.last.ll[0]).toBeCloseTo(-7.6, 6);
      expect(res.body.last.ll[1]).toBeCloseTo(33.57, 6);
      expect(res.body.last.at).toBe(at);
      expect(res.body.last.speedKmh).toBe(42);
      expect(res.body.lastSeenAt).not.toBeNull();
    });

    it("un enregistrement SANS FIX est accusé mais jamais porté sur la carte", async () => {
      // Le boîtier émet 0,0 avec zéro satellite quand il n'a pas de fix. Le
      // tracer placerait l'unité au large du golfe de Guinée ; ne pas l'accuser
      // ferait retransmettre à l'infini. Les deux à la fois, donc.
      const avant = (await base().get(`/api/tracking/trackers/trk-${IMEI}`).set(auth())).body;

      const s = await ouvrir(port);
      await echange(s, imeiFrame(IMEI));
      const ack = await echange(s, trameCodec8(record({ at: Date.now(), lng: 0, lat: 0, sats: 0 })));
      expect(ack.readUInt32BE(0)).toBe(1);
      s.destroy();

      const apres = (await base().get(`/api/tracking/trackers/trk-${IMEI}`).set(auth())).body;
      expect(apres.trail).toHaveLength(avant.trail.length);
      expect(apres.last.at).toBe(avant.last.at);
      // Le CONTACT, lui, est bien noté : un boîtier qui émet depuis un sous-sol
      // est vivant, et le croire muet enverrait chercher une panne inexistante.
      expect(new Date(apres.lastSeenAt).getTime()).toBeGreaterThanOrEqual(new Date(avant.lastSeenAt).getTime());
    });

    it("un déversement de tampon ne fait pas RECULER le moyen", async () => {
      // Hors couverture, le FMC920 mémorise puis déverse : les enregistrements
      // remontent dans le désordre. Sans tri, la trace zigzaguerait entre passé
      // et présent, et la « dernière » position serait la plus ancienne.
      const recent = Date.UTC(2026, 8, 1, 12, 0, 0);
      const ancien = Date.UTC(2026, 8, 1, 11, 0, 0);

      const s = await ouvrir(port);
      await echange(s, imeiFrame(IMEI));
      await echange(s, trameCodec8(record({ at: recent, lng: -7.5, lat: 33.6 })));
      await echange(s, trameCodec8(record({ at: ancien, lng: -8.0, lat: 33.2 })));
      s.destroy();

      const t = (await base().get(`/api/tracking/trackers/trk-${IMEI}`).set(auth())).body;
      expect(t.last.at).toBe(recent);
      expect(t.last.ll[0]).toBeCloseTo(-7.5, 6);
      // La trace reste ordonnée dans le TEMPS, pas dans l'ordre d'arrivée.
      const dates = (t.trail as { at: number }[]).map((f) => f.at);
      expect(dates).toEqual([...dates].sort((a, b) => a - b));
    });

    it("plusieurs enregistrements dans une seule trame sont tous versés", async () => {
      const t0 = Date.UTC(2026, 8, 2, 8, 0, 0);
      const s = await ouvrir(port);
      await echange(s, imeiFrame(IMEI));
      const ack = await echange(
        s,
        trameCodec8(
          record({ at: t0, lng: -7.61, lat: 33.58 }),
          record({ at: t0 + 30_000, lng: -7.62, lat: 33.59 }),
          record({ at: t0 + 60_000, lng: -7.63, lat: 33.6 }),
        ),
      );
      expect(ack.readUInt32BE(0)).toBe(3);
      s.destroy();

      const t = (await base().get(`/api/tracking/trackers/trk-${IMEI}`).set(auth())).body;
      expect(t.last.at).toBe(t0 + 60_000);
    });

    it("un traceur ARCHIVÉ cesse d'être admis", async () => {
      // Sinon l'archivage ne protégerait de rien : un boîtier volé continuerait
      // d'écrire dans la carte.
      await base().patch(`/api/tracking/trackers/trk-${IMEI}`).set(auth()).send({ archived: true }).expect(200);

      const s = await ouvrir(port);
      expect((await echange(s, imeiFrame(IMEI)))[0]).toBe(0x00);
      s.destroy();

      await base().patch(`/api/tracking/trackers/trk-${IMEI}`).set(auth()).send({ archived: false }).expect(200);
    });

    it("une trame au CRC faux est refusée, sans accusé — le boîtier retransmettra", async () => {
      const s = await ouvrir(port);
      await echange(s, imeiFrame(IMEI));
      const abimee = trameCodec8(record({ at: Date.now(), lng: -7.6, lat: 33.57 }));
      abimee[abimee.length - 1] ^= 0xff;
      s.write(abimee);
      // La session est fermée par le serveur : c'est la fermeture, et non un
      // accusé, qui est le signal attendu.
      await new Promise<void>((r) => s.once("close", () => r()));
      expect(s.destroyed).toBe(true);
    });
  });
});

// --- petits utilitaires de socket -------------------------------------------

/** Trame d'ouverture de session : 2 octets de longueur + 15 chiffres ASCII. */
function imeiFrame(imei: string): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(imei.length, 0);
  return Buffer.concat([b, Buffer.from(imei, "ascii")]);
}

function ouvrir(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect({ port, host: "127.0.0.1" });
    s.once("connect", () => resolve(s));
    s.once("error", reject);
  });
}

/** Écrit, puis attend la première réponse. */
function echange(s: Socket, payload: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new Error("Pas de réponse du serveur")), 5000);
    s.once("data", (d) => {
      clearTimeout(minuteur);
      resolve(d);
    });
    s.write(payload);
  });
}
