import { BadRequestException, Inject, Injectable, NotFoundException, ForbiddenException, ConflictException } from "@nestjs/common";
import { TRACKER_REGISTRY, type TrackerRegistry } from "@/modules/tracking/ports/tracker-registry.port";
import { IMEI_LENGTH, type AvlRecord } from "@/modules/tracking/codec8";
import { Tracker, TrackerFix, TrackerPatch, TrackerTarget, appKey, SharedPosition, TrackerSource } from "@/modules/tracking/tracking.types";

// ============================================================================
// ARGOS — cas d'usage du suivi de traceurs FMC920 (lot N-2)
//
// Assemble ce que le décodeur ne connaît pas : quel boîtier est déclaré, ce
// qu'il équipe, et ce qu'il advient d'une position reçue. Le décodeur reste
// une fonction pure d'octets ; ce service est le seul à décider.
//
// LA RÈGLE QUI GOUVERNE TOUT : un IMEI non déclaré n'est PAS admis. Ce n'est
// pas une commodité de tri, c'est la seule barrière d'un port TCP ouvert sur
// un réseau opérateur. Le protocole Teltonika ne porte ni secret ni
// certificat : l'IMEI est la seule identité présentée, et il est lisible sous
// le boîtier. Le registre est donc la liste blanche, et l'écouteur ne
// l'interroge pas pour informer — il l'interroge pour refuser.
// ============================================================================

/** Motif de refus d'une session, tel qu'il est journalisé. */
export type HandshakeVerdict =
  | { ok: true; tracker: Tracker }
  | { ok: false; reason: "inconnu" | "archivé" };

@Injectable()
export class TrackingService {
  constructor(@Inject(TRACKER_REGISTRY) private readonly registry: TrackerRegistry) {}

  // --- registre -------------------------------------------------------------

  async list(includeArchived = false): Promise<Tracker[]> {
    const all = await this.registry.list();
    return includeArchived ? all : all.filter((t) => !t.archived);
  }

  async get(id: string): Promise<Tracker> {
    const t = await this.registry.findById(id);
    if (!t) throw new NotFoundException(`Traceur inconnu : ${id}`);
    return t;
  }

  async declare(input: {
    source?: TrackerSource;
    imei?: string;
    account?: string;
    label: string;
    target?: TrackerTarget | null;
    incidentId?: string | null;
    actor: string;
  }): Promise<Tracker> {
    const source: TrackerSource = input.source ?? "device";
    let imei: string;
    let account: string | undefined;
    let id: string;
    if (source === "app") {
      // Partage par l'application : la clé tient la place de l'IMEI, un compte
      // n'a qu'un partage — deux partages du même compte diraient deux positions
      // pour une seule personne.
      account = (input.account ?? input.actor).trim().toLowerCase();
      if (!account) throw new BadRequestException("Le compte qui partage sa position est requis.");
      imei = appKey(account);
      id = `trk-app-${account}`;
      if (await this.registry.findByImei(imei)) throw new BadRequestException(`Ce compte partage déjà sa position : ${account}`);
    } else {
      imei = (input.imei ?? "").trim();
      // Contrôlé ici ET par le DTO : le DTO garde l'entrée HTTP, cette règle garde
      // le domaine — un futur import en masse n'aura pas de DTO devant lui.
      if (!new RegExp(`^\\d{${IMEI_LENGTH}}$`).test(imei)) {
        throw new BadRequestException(`L'IMEI doit compter ${IMEI_LENGTH} chiffres.`);
      }
      if (await this.registry.findByImei(imei)) {
        // Deux traceurs sous le même IMEI rendraient le rattachement ambigu à la
        // poignée de main : les positions d'un moyen iraient à l'autre.
        throw new BadRequestException(`IMEI déjà déclaré : ${imei}`);
      }
      id = `trk-${imei}`;
    }
    return this.registry.add({
      id,
      imei,
      source,
      ...(account ? { account } : {}),
      label: input.label.trim(),
      target: input.target ?? null,
      incidentId: input.incidentId ?? null,
      archived: false,
      createdBy: input.actor,
      createdAt: new Date().toISOString(),
      last: null,
      lastSeenAt: null,
      trail: [],
    });
  }

  async update(id: string, patch: TrackerPatch): Promise<Tracker> {
    await this.get(id);
    return this.registry.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    return this.registry.remove(id);
  }

  /** Le partage de position du compte `account`, s'il en a déclaré un (archivé compris). */
  async mine(account: string): Promise<Tracker | null> {
    return this.registry.findByImei(appKey(account));
  }

  /**
   * Verse une position partagée par l'application. Seul le compte du partage
   * peut le faire, et seulement sur un partage actif : c'est ce qui rend
   * l'entrée HTTP acceptable là où l'ingestion des boîtiers reste TCP — un
   * compte ne peut dire que SA propre position, jamais celle d'un moyen.
   */
  async sharePosition(id: string, account: string, pos: SharedPosition): Promise<Tracker> {
    const tracker = await this.get(id);
    if (tracker.source !== "app") throw new ConflictException("Ce traceur est un boîtier : ses positions n'entrent que par le réseau.");
    if (tracker.account !== account.trim().toLowerCase()) throw new ForbiddenException("Seul le compte qui partage sa position peut la verser.");
    if (tracker.archived) throw new ConflictException("Partage archivé : réactivez-le avant de partager.");
    const [lng, lat] = pos.ll;
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new BadRequestException("Position hors du globe.");
    const now = Date.now();
    const at = pos.at !== undefined && pos.at > 0 && pos.at <= now + 60_000 ? pos.at : now;
    const fix: TrackerFix = {
      at,
      ll: [lng, lat],
      speedKmh: Math.max(0, Math.round(pos.speedKmh ?? 0)),
      headingDeg: Math.round(((pos.headingDeg ?? 0) % 360 + 360) % 360),
      altitudeM: Math.round(pos.altitudeM ?? 0),
      // Un téléphone ne dit pas ses satellites : sa précision tient lieu de qualité.
      satellites: pos.accuracyM !== undefined && pos.accuracyM <= 50 ? 1 : 0,
      priority: "low",
    };
    await this.registry.appendFix(id, fix);
    await this.registry.touch(id, new Date(now).toISOString());
    return this.get(id);
  }

  // --- ingestion ------------------------------------------------------------

  /**
   * Décide si un boîtier est admis à parler.
   *
   * Appelé par l'écouteur TCP à la poignée de main, AVANT tout décodage : un
   * boîtier refusé ne doit pas pouvoir faire travailler le décodeur, ne
   * serait-ce que pour ne pas offrir de surface à qui sonde le port.
   */
  async handshake(imei: string): Promise<HandshakeVerdict> {
    const tracker = await this.registry.findByImei(imei);
    if (!tracker) return { ok: false, reason: "inconnu" };
    // Un traceur archivé est un boîtier retiré du service — volé, réformé,
    // rendu. Il cesse d'être admis, sinon l'archivage ne protégerait de rien.
    if (tracker.archived) return { ok: false, reason: "archivé" };
    return { ok: true, tracker };
  }

  /**
   * Verse les enregistrements d'un paquet et rend le nombre ACCEPTÉ.
   *
   * Ce nombre part dans l'accusé de réception : le boîtier efface de son tampon
   * ce qui a été accusé. Compter juste n'est donc pas cosmétique — sous-compter
   * fait retransmettre en boucle, sur-compter perd des positions à jamais.
   *
   * Les enregistrements SANS FIX sont acceptés (ils sont bien reçus, et le
   * boîtier doit pouvoir les effacer) mais ne sont pas versés à la trace : le
   * 0,0 d'un boîtier sans satellite n'est pas une position.
   */
  async ingest(trackerId: string, records: AvlRecord[]): Promise<number> {
    const maintenant = new Date().toISOString();
    for (const r of records) {
      if (!r.fix) continue;
      const fix: TrackerFix = {
        at: r.timestamp,
        ll: r.ll,
        speedKmh: r.speedKmh,
        headingDeg: r.headingDeg,
        altitudeM: r.altitudeM,
        satellites: r.satellites,
        priority: r.priority,
      };
      await this.registry.appendFix(trackerId, fix);
    }
    // Le contact est noté même sans un seul fix : un boîtier qui émet depuis un
    // sous-sol est vivant, et le faire passer pour muet enverrait chercher une
    // panne qui n'existe pas.
    await this.registry.touch(trackerId, maintenant);
    return records.length;
  }
}
