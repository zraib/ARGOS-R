import {
  ackBuffer,
  avlPacketLength,
  Codec8Error,
  crc16,
  decodeAvlPacket,
  readImei,
} from "@/modules/tracking/codec8";

// ============================================================================
// N-2 — le décodeur Codec 8 / Codec 8 Extended
//
// Les deux trames de référence sont celles PUBLIÉES PAR TELTONIKA comme
// exemples de leur protocole. C'est le seul point d'ancrage honnête : un
// décodeur binaire testé sur des trames que l'on a soi-même fabriquées ne prouve
// que sa cohérence avec ses propres erreurs.
//
// Ce que ces tests protègent :
//   1. la trame est refusée EN ENTIER quand le CRC échoue — une position
//      corrompue portée sur la carte est pire qu'une position absente ;
//   2. l'absence de fix est DITE, jamais confondue avec la position 0,0 ;
//   3. le découpage du flot TCP attend la suite au lieu de rejeter.
// ============================================================================

const hex = (s: string) => Buffer.from(s.replace(/\s+/g, ""), "hex");

/** Codec 8, un enregistrement — exemple du constructeur. */
const TRAME_C8 = hex(
  "00000000000000360801" +
    "0000016B40D8EA30" + // horodatage
    "01" + // priorité
    "00000000" + // longitude
    "00000000" + // latitude
    "0000" + // altitude
    "0000" + // cap
    "00" + // satellites
    "0000" + // vitesse
    "01" + // identifiant d'événement
    "05" + // nombre total d'éléments
    "02" +
    "1503" +
    "0101" + // 2 éléments d'un octet
    "01" +
    "425E0F" + // 1 élément de deux octets
    "01" +
    "F10000601A" + // 1 élément de quatre octets
    "01" +
    "4E0000000000000000" + // 1 élément de huit octets
    "01" + // décompte répété
    "0000C7CF", // CRC-16
);

/** Codec 8 Extended, un enregistrement — exemple du constructeur. */
const TRAME_C8E = hex(
  "000000000000004A8E01" +
    "0000016B412CEE00" +
    "01" +
    "00000000" +
    "00000000" +
    "0000" +
    "0000" +
    "00" +
    "0000" +
    "0001" + // identifiant d'événement (2 octets en Extended)
    "0005" + // nombre total
    "0001" +
    "000101" +
    "0001" +
    "0011001D" +
    "0001" +
    "0010015E2C88" +
    "0002" +
    "000B000000003544C87A" +
    "000E000000001DD7E06A" +
    "0000" + // aucun élément de longueur variable
    "01" +
    "00002994",
);

describe("N-2 — décodeur Codec 8", () => {
  describe("ouverture de session", () => {
    it("lit l'IMEI d'une trame complète", () => {
      const t = Buffer.concat([hex("000F"), Buffer.from("356307042441013", "ascii")]);
      expect(readImei(t)).toEqual({ imei: "356307042441013", consumed: 17 });
    });

    it("ATTEND la suite plutôt que de rejeter une trame incomplète", () => {
      // Le TCP est un flot : un IMEI peut arriver coupé en deux segments.
      // Rejeter ici fermerait la session d'un boîtier parfaitement sain.
      expect(readImei(hex("00"))).toBeNull();
      expect(readImei(Buffer.concat([hex("000F"), Buffer.from("35630", "ascii")]))).toBeNull();
    });

    it("refuse une longueur ou un contenu non conformes", () => {
      expect(() => readImei(hex("0010"))).toThrow(Codec8Error);
      expect(() => readImei(Buffer.concat([hex("000F"), Buffer.from("PAS-UN-IMEI-XXX", "ascii")]))).toThrow(
        /non numérique/,
      );
    });
  });

  describe("Codec 8", () => {
    it("décode la trame de référence du constructeur", () => {
      const p = decodeAvlPacket(TRAME_C8);
      expect(p.codecId).toBe(0x08);
      expect(p.records).toHaveLength(1);
      const r = p.records[0];
      expect(r.timestamp).toBe(1560161086000);
      expect(new Date(r.timestamp).toISOString()).toBe("2019-06-10T10:04:46.000Z");
      expect(r.priority).toBe("high");
      expect(r.eventIoId).toBe(1);
    });

    it("range les éléments par taille, sans en perdre un seul", () => {
      const { io } = decodeAvlPacket(TRAME_C8).records[0];
      // 2 éléments d'un octet, 1 de deux, 1 de quatre, 1 de huit = 5 au total,
      // ce que la trame annonce dans son champ « nombre total ».
      expect(io).toHaveLength(5);
      expect(io).toEqual([
        { id: 21, value: 3 },
        { id: 1, value: 1 },
        { id: 66, value: 0x5e0f },
        { id: 241, value: 0x601a },
        { id: 78, value: 0 },
      ]);
    });

    it("DIT l'absence de fix au lieu de livrer la position 0,0", () => {
      // Sans ce champ, un boîtier sous un hangar placerait son unité au large
      // du golfe de Guinée — une position plausible pour une carte, absurde
      // pour un état-major.
      const r = decodeAvlPacket(TRAME_C8).records[0];
      expect(r.ll).toEqual([0, 0]);
      expect(r.satellites).toBe(0);
      expect(r.fix).toBe(false);
    });
  });

  describe("Codec 8 Extended", () => {
    it("décode la trame de référence du constructeur", () => {
      const p = decodeAvlPacket(TRAME_C8E);
      expect(p.codecId).toBe(0x8e);
      expect(p.records).toHaveLength(1);
      expect(p.records[0].eventIoId).toBe(1);
      expect(p.records[0].io).toHaveLength(5);
      expect(p.records[0].io.map((x) => x.id)).toEqual([1, 17, 16, 11, 14]);
    });

    it("CONSERVE les éléments de longueur variable sans les interpréter", () => {
      // La liste de balises Bluetooth (identifiant 385) voyage ici. Sa structure
      // interne n'est pas assez documentée pour être décodée sans deviner : on
      // garde les octets, on n'invente pas leur sens.
      const balises = "0201cafe";
      const corps =
        "8E01" +
        "0000016B412CEE00" +
        "01" +
        "0000000000000000" +
        "0000" +
        "0000" +
        "00" +
        "0000" +
        "0000" +
        "0001" + // un seul élément, de longueur variable
        "0000" +
        "0000" +
        "0000" +
        "0000" +
        "0001" +
        "0181" + // identifiant 385
        "0004" +
        balises +
        "01";
      expect(decodeAvlPacket(trameAvecCrc(corps)).records[0].ioRaw).toEqual([{ id: 385, hex: balises }]);
    });
  });

  describe("refus", () => {
    it("refuse la trame EN ENTIER quand le CRC échoue", () => {
      // Un octet retourné en vol, et la position devient une invention. Rien
      // n'est sauvé d'une trame corrompue : elle est jetée entière.
      const abimee = Buffer.from(TRAME_C8);
      abimee[20] ^= 0xff;
      expect(() => decodeAvlPacket(abimee)).toThrow(/CRC invalide/);
    });

    it("refuse un codec inconnu plutôt que de le deviner", () => {
      expect(() => decodeAvlPacket(trameAvecCrc("0C01" + "00".repeat(20) + "01"))).toThrow(/Codec non pris en charge/);
    });

    it("refuse un décompte incohérent entre les deux extrémités", () => {
      // Le décompte est répété en fin de trame. Une divergence signale un
      // décodage parti de travers : livrer les positions serait les décaler.
      const corps = TRAME_C8.subarray(8, 8 + TRAME_C8.readUInt32BE(4)).toString("hex");
      const fausse = corps.slice(0, -2) + "02";
      expect(() => decodeAvlPacket(trameAvecCrc(fausse))).toThrow(/Décompte incohérent/);
    });

    it("refuse un préambule non nul", () => {
      const t = Buffer.from(TRAME_C8);
      t.writeUInt32BE(1, 0);
      expect(() => decodeAvlPacket(t)).toThrow(/Préambule non nul/);
    });
  });

  describe("découpage du flot TCP", () => {
    it("attend la suite tant que le paquet est incomplet", () => {
      // Le défaut classique : croire qu'un segment TCP est un message. Un
      // paquet coupé en deux serait rejeté, deux paquets collés lus comme un.
      expect(avlPacketLength(TRAME_C8.subarray(0, 4))).toBeNull();
      expect(avlPacketLength(TRAME_C8.subarray(0, TRAME_C8.length - 1))).toBeNull();
      expect(avlPacketLength(TRAME_C8)).toBe(TRAME_C8.length);
    });

    it("borne le paquet même quand deux trames arrivent collées", () => {
      const colles = Buffer.concat([TRAME_C8, TRAME_C8E]);
      const n = avlPacketLength(colles);
      expect(n).toBe(TRAME_C8.length);
      expect(decodeAvlPacket(colles.subarray(n!)).codecId).toBe(0x8e);
    });
  });

  it("l'accusé porte le nombre d'enregistrements acceptés", () => {
    // Sans accusé, le boîtier retransmet : la donnée n'est pas perdue, mais
    // elle arrive en double, indéfiniment.
    expect(ackBuffer(1).toString("hex")).toBe("00000001");
    expect(ackBuffer(255).toString("hex")).toBe("000000ff");
  });

  it("le CRC-16 est bien celui du constructeur (ARC, polynôme 0xA001)", () => {
    expect(crc16(Buffer.from("123456789", "ascii"))).toBe(0xbb3d);
  });
});

/** Emballe un champ de données hexadécimal dans un paquet AVL au CRC juste. */
function trameAvecCrc(corpsHex: string): Buffer {
  const data = Buffer.from(corpsHex, "hex");
  const t = Buffer.alloc(8 + data.length + 4);
  t.writeUInt32BE(0, 0);
  t.writeUInt32BE(data.length, 4);
  data.copy(t, 8);
  t.writeUInt32BE(crc16(data), 8 + data.length);
  return t;
}
