// ============================================================================
// ARGOS — décodeur Teltonika Codec 8 / Codec 8 Extended (lot N-2)
//
// CE QUE CE FICHIER EST. Une fonction pure : des octets entrent, des positions
// sortent. Aucun réseau, aucune base, aucun Nest — c'est ce qui permet de le
// couvrir de tests à partir des trames publiées par le constructeur, et c'est
// la seule façon d'avoir confiance dans un décodeur binaire (ADR 0004).
//
// LE PROTOCOLE, tel que le FMC920 le parle sur TCP :
//
//   1. À la connexion, le boîtier envoie son IMEI : 2 octets de longueur
//      (0x000F = 15) puis 15 chiffres ASCII. Le serveur répond UN octet :
//      0x01 pour accepter, 0x00 pour refuser — et refuser ferme la session.
//
//   2. Puis des paquets AVL :
//        4 octets  zéros
//        4 octets  longueur du champ de données
//        1 octet   identifiant de codec  (0x08 = Codec 8, 0x8E = Codec 8 Ext.)
//        1 octet   nombre d'enregistrements
//        N × enregistrement
//        1 octet   nombre d'enregistrements, RÉPÉTÉ
//        4 octets  CRC-16 du champ de données
//      Le serveur répond 4 octets : le nombre d'enregistrements acceptés. Sans
//      cet accusé, le boîtier retransmet — la donnée n'est jamais perdue, mais
//      elle arrive en double.
//
// CE QUI EST DÉCODÉ, ET CE QUI NE L'EST PAS. La trame, l'horodatage, la
// position, et les éléments d'entrées/sorties par taille (1, 2, 4, 8 octets)
// sont décodés — leur disposition est publiée et vérifiable sur les trames
// d'exemple du constructeur. Les éléments de LONGUEUR VARIABLE du Codec 8
// Extended (dont la liste de balises Bluetooth, identifiant 385) sont conservés
// TELS QUELS, en hexadécimal : leur structure interne n'est pas assez
// documentée pour être décodée sans deviner, et un décodage faux d'une donnée
// de sécurité est pire qu'un décodage absent. Rien n'est perdu, rien n'est
// inventé.
// ============================================================================

/** Identifiants de codec acceptés. Tout autre est refusé, jamais deviné. */
export const CODEC_8 = 0x08;
export const CODEC_8_EXT = 0x8e;

/** Longueur de l'IMEI d'un FMC920, en chiffres. */
export const IMEI_LENGTH = 15;

/** Priorité déclarée par le boîtier pour un enregistrement. */
export type AvlPriority = "low" | "high" | "panic";

const PRIORITIES: Record<number, AvlPriority> = { 0: "low", 1: "high", 2: "panic" };

/** Un élément d'entrée/sortie de longueur fixe, ramené à un nombre. */
export interface AvlIoValue {
  id: number;
  value: number;
}

/** Un élément de longueur variable — conservé brut, non interprété. */
export interface AvlIoRaw {
  id: number;
  /** Contenu en hexadécimal minuscule. L'interprétation reste à faire. */
  hex: string;
}

/** Un enregistrement AVL décodé. */
export interface AvlRecord {
  /** Millisecondes depuis l'époque, UTC — tel que le boîtier l'horodate. */
  timestamp: number;
  priority: AvlPriority;
  /** [lng, lat] en degrés — ordre cohérent avec le reste du domaine ARGOS. */
  ll: [number, number];
  altitudeM: number;
  /** Cap en degrés depuis le nord, 0–359. */
  headingDeg: number;
  satellites: number;
  speedKmh: number;
  /**
   * Position EXPLOITABLE ou non. Le boîtier émet lat = lon = 0 avec zéro
   * satellite quand il n'a pas de fix — porter ce point sur une carte
   * placerait l'unité au large du golfe de Guinée. Le champ dit la vérité ;
   * c'est à l'appelant de ne pas tracer ce qui n'est pas localisé.
   */
  fix: boolean;
  /** Identifiant de l'événement ayant déclenché l'envoi ; 0 = envoi périodique. */
  eventIoId: number;
  io: AvlIoValue[];
  /** Éléments de longueur variable (Codec 8 Extended), non interprétés. */
  ioRaw: AvlIoRaw[];
}

/** Résultat du décodage d'un paquet AVL complet. */
export interface AvlPacket {
  codecId: number;
  records: AvlRecord[];
}

/** Erreur de protocole — trame refusée EN ENTIER, jamais à moitié. */
export class Codec8Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Codec8Error";
  }
}

/**
 * CRC-16/ARC, tel que Teltonika le publie : polynôme réfléchi 0xA001,
 * initialisation à zéro, pas de OU exclusif final.
 */
export function crc16(buf: Buffer): number {
  let crc = 0;
  for (const octet of buf) {
    crc ^= octet;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
  }
  return crc & 0xffff;
}

/**
 * Lit l'IMEI d'une trame d'ouverture de session.
 *
 * Rend `null` si la trame est incomplète — le TCP est un FLOT, pas une suite
 * de messages : il faut savoir attendre la suite plutôt que rejeter.
 */
export function readImei(buf: Buffer): { imei: string; consumed: number } | null {
  if (buf.length < 2) return null;
  const len = buf.readUInt16BE(0);
  if (len !== IMEI_LENGTH) throw new Codec8Error(`Longueur d'IMEI inattendue : ${len}`);
  if (buf.length < 2 + len) return null;
  const imei = buf.subarray(2, 2 + len).toString("ascii");
  if (!/^\d{15}$/.test(imei)) throw new Codec8Error("IMEI non numérique");
  return { imei, consumed: 2 + len };
}

/** Curseur de lecture — évite de promener un décalage à la main partout. */
class Reader {
  private o = 0;
  constructor(private readonly b: Buffer) {}
  get offset(): number {
    return this.o;
  }
  private need(n: number): void {
    if (this.o + n > this.b.length) throw new Codec8Error("Trame tronquée");
  }
  u8(): number {
    this.need(1);
    return this.b.readUInt8(this.o++);
  }
  u16(): number {
    this.need(2);
    const v = this.b.readUInt16BE(this.o);
    this.o += 2;
    return v;
  }
  i16(): number {
    this.need(2);
    const v = this.b.readInt16BE(this.o);
    this.o += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.b.readUInt32BE(this.o);
    this.o += 4;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.b.readInt32BE(this.o);
    this.o += 4;
    return v;
  }
  /**
   * Entier 64 bits ramené à un nombre. Les horodatages en millisecondes tiennent
   * très largement sous 2^53 ; les compteurs de kilométrage aussi. Une valeur
   * qui dépasserait est saturée plutôt que rendue fausse en silence.
   */
  u64(): number {
    this.need(8);
    const v = this.b.readBigUInt64BE(this.o);
    this.o += 8;
    return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : Number.MAX_SAFE_INTEGER;
  }
  bytes(n: number): Buffer {
    this.need(n);
    const v = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return v;
  }
}

/**
 * Décode un paquet AVL complet.
 *
 * `buf` commence aux quatre octets de zéros. Le CRC est VÉRIFIÉ : une trame
 * dont le contrôle échoue est refusée en entier. Accepter une trame corrompue
 * reviendrait à porter une unité à une position inventée.
 */
export function decodeAvlPacket(buf: Buffer): AvlPacket {
  if (buf.length < 12) throw new Codec8Error("Paquet trop court");
  if (buf.readUInt32BE(0) !== 0) throw new Codec8Error("Préambule non nul");

  const dataLength = buf.readUInt32BE(4);
  const dataStart = 8;
  const dataEnd = dataStart + dataLength;
  if (buf.length < dataEnd + 4) throw new Codec8Error("Paquet incomplet");

  const data = buf.subarray(dataStart, dataEnd);
  const attendu = buf.readUInt32BE(dataEnd) & 0xffff;
  const calcule = crc16(data);
  if (attendu !== calcule) {
    throw new Codec8Error(`CRC invalide : reçu 0x${attendu.toString(16)}, calculé 0x${calcule.toString(16)}`);
  }

  const r = new Reader(data);
  const codecId = r.u8();
  if (codecId !== CODEC_8 && codecId !== CODEC_8_EXT) {
    throw new Codec8Error(`Codec non pris en charge : 0x${codecId.toString(16)}`);
  }
  const ext = codecId === CODEC_8_EXT;

  const count = r.u8();
  const records: AvlRecord[] = [];
  for (let i = 0; i < count; i++) records.push(readRecord(r, ext));

  // Le nombre est répété en fin de trame. Une divergence signale un décodage
  // parti de travers ; mieux vaut refuser que livrer des positions décalées.
  const count2 = r.u8();
  if (count2 !== count) throw new Codec8Error(`Décompte incohérent : ${count} puis ${count2}`);

  return { codecId, records };
}

function readRecord(r: Reader, ext: boolean): AvlRecord {
  const timestamp = r.u64();
  const priority = PRIORITIES[r.u8()] ?? "low";

  // Coordonnées : entiers signés au 1/10 000 000 de degré.
  const lng = r.i32() / 1e7;
  const lat = r.i32() / 1e7;
  const altitudeM = r.i16();
  const headingDeg = r.u16();
  const satellites = r.u8();
  const speedKmh = r.u16();

  // Les identifiants et les décomptes font UN octet en Codec 8, DEUX en
  // Codec 8 Extended. C'est toute la différence entre les deux formats, avec
  // la section de longueur variable qui n'existe qu'en Extended.
  const n = () => (ext ? r.u16() : r.u8());
  const id = () => (ext ? r.u16() : r.u8());

  const eventIoId = id();
  n(); // nombre total d'éléments — recomposé ci-dessous, pas utilisé tel quel

  const io: AvlIoValue[] = [];
  const lire = (compte: number, valeur: () => number) => {
    for (let i = 0; i < compte; i++) io.push({ id: id(), value: valeur() });
  };
  lire(n(), () => r.u8());
  lire(n(), () => r.u16());
  lire(n(), () => r.u32());
  lire(n(), () => r.u64());

  const ioRaw: AvlIoRaw[] = [];
  if (ext) {
    const nx = r.u16();
    for (let i = 0; i < nx; i++) {
      const elementId = r.u16();
      const longueur = r.u16();
      ioRaw.push({ id: elementId, hex: r.bytes(longueur).toString("hex") });
    }
  }

  // Sans fix, le boîtier émet 0,0 avec zéro satellite. Le dire explicitement
  // évite que quiconque en aval prenne le golfe de Guinée pour une position.
  const fix = satellites > 0 && !(lat === 0 && lng === 0);

  return { timestamp, priority, ll: [lng, lat], altitudeM, headingDeg, satellites, speedKmh, fix, eventIoId, io, ioRaw };
}

/**
 * Longueur totale du paquet AVL en tête de `buf`, ou `null` si les octets
 * ne suffisent pas encore à la connaître.
 *
 * C'est ce qui permet de découper un FLOT TCP en messages. Sans cela, deux
 * paquets arrivés dans le même segment seraient lus comme un seul, et un
 * paquet coupé en deux serait rejeté à tort.
 */
export function avlPacketLength(buf: Buffer): number | null {
  if (buf.length < 8) return null;
  const total = 8 + buf.readUInt32BE(4) + 4;
  return buf.length < total ? null : total;
}

/** Accusé de réception : le nombre d'enregistrements acceptés, sur 4 octets. */
export function ackBuffer(accepted: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(accepted, 0);
  return b;
}
