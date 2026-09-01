import { createServer, type Server, type Socket } from "node:net";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TrackingService } from "@/modules/tracking/tracking.service";
import { ackBuffer, avlPacketLength, Codec8Error, decodeAvlPacket, readImei } from "@/modules/tracking/codec8";

// ============================================================================
// ARGOS — écouteur TCP des traceurs FMC920 (lot N-2)
//
// POURQUOI UN SECOND ÉCOUTEUR À CÔTÉ DU HTTP. Un FMC920 parle Codec 8 sur TCP
// brut ; il ne sait pas faire de requête HTTP. Deux voies existaient : passer
// par la plateforme du constructeur, ou être nous-mêmes le serveur du boîtier.
// La première ferait transiter les positions d'unités militaires par un service
// étranger — l'ADR 0006 l'exclut. Voir ADR 0008.
//
// AUCUNE DÉPENDANCE NOUVELLE : `node:net` suffit (MASTER_PLAN §4.3).
//
// CE QUE CET ÉCOUTEUR N'EST PAS. Le protocole Teltonika ne porte ni secret, ni
// certificat, ni horodatage signé : l'IMEI est la seule identité présentée, et
// il est imprimé sous le boîtier. Ce port ne doit donc JAMAIS être exposé à
// l'Internet public — il s'atteint par l'APN privé de l'opérateur ou par un
// tunnel. La liste blanche du registre réduit la surface, elle ne remplace pas
// le confinement réseau. C'est écrit ici parce que c'est ici qu'on l'oublie.
// ============================================================================

/** Au-delà, la trame est jugée aberrante et la session fermée. */
const MAX_BUFFER = 256 * 1024;

/** Sans un octet pendant ce délai, la session est close et le socket rendu. */
const IDLE_MS = 180_000;

@Injectable()
export class Fmc920TcpServer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("FMC920");
  private server: Server | null = null;

  /**
   * Port réellement lié, ou `null` si l'écouteur est éteint. Utile au test
   * d'intégration, qui demande le port 0 et doit savoir lequel a été attribué.
   */
  get boundPort(): number | null {
    const a = this.server?.address();
    return a && typeof a === "object" ? a.port : null;
  }

  constructor(
    private readonly tracking: TrackingService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Écouteur DÉSACTIVÉ par défaut. Ouvrir un port en écoute est une décision
    // de déploiement, pas un effet de bord de l'installation : sur un poste de
    // développement, rien ne doit se mettre à écouter tout seul.
    //
    // C'est la PRÉSENCE du réglage qui active, pas sa valeur : « 0 » est un
    // choix légitime (« attribue-moi un port libre »), et le confondre avec
    // « éteint » rendait l'écouteur intestable.
    const brut = this.config.get<string | number>("FMC920_PORT") ?? process.env.FMC920_PORT;
    if (brut === undefined || brut === null || `${brut}`.trim() === "") return;
    const port = Number(brut);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      this.log.error(`FMC920_PORT invalide : ${brut} — écouteur non démarré`);
      return;
    }
    // Adresse d'écoute explicite, bouclage par défaut : il faut VOULOIR
    // s'exposer au réseau, non s'y trouver faute d'avoir choisi.
    const host = String(this.config.get("FMC920_HOST") ?? process.env.FMC920_HOST ?? "127.0.0.1");

    const server = createServer((socket) => this.session(socket));
    server.on("error", (e) => this.log.error(`Écouteur en erreur : ${e.message}`));
    // On ATTEND la liaison : sans cela, `boundPort` est encore nul quand le
    // module est déclaré prêt, et rien ne garantit que le port écoute lorsque
    // le premier boîtier se présente.
    await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
    this.server = server;
    this.log.log(`Écouteur FMC920 sur ${host}:${this.boundPort} (Codec 8 / 8E)`);
  }

  onModuleDestroy(): void {
    this.server?.close();
    this.server = null;
  }

  /**
   * Une session = un boîtier = une fermeture.
   *
   * TOUT L'ÉTAT EST LOCAL, jamais porté par l'instance : deux boîtiers se
   * connectent en même temps, et un tampon partagé mêlerait leurs trames — les
   * positions de l'un iraient à l'autre.
   */
  private session(socket: Socket): void {
    const pair = `${socket.remoteAddress ?? "?"}:${socket.remotePort ?? "?"}`;
    let buffer = Buffer.alloc(0);
    let trackerId: string | null = null;
    /**
     * Les événements « data » se succèdent sans attendre les `await` du
     * traitement. Sans cette file, deux passages concurrents liraient et
     * tailleraient le MÊME tampon : trames coupées, positions perdues. Chaque
     * passage s'enchaîne donc au précédent.
     */
    let file: Promise<void> = Promise.resolve();

    socket.setTimeout(IDLE_MS);
    socket.on("timeout", () => socket.destroy());
    // Un boîtier en couverture médiocre coupe sans prévenir : c'est banal, pas
    // une erreur à journaliser en rouge.
    socket.on("error", () => socket.destroy());

    const traiter = async (): Promise<void> => {
      if (socket.destroyed) return;

      if (buffer.length > MAX_BUFFER) {
        this.log.warn(`Trame aberrante de ${pair} — session fermée`);
        socket.destroy();
        return;
      }

      // Étape 1 : la poignée de main, une seule fois par session.
      if (trackerId === null) {
        let lu: { imei: string; consumed: number } | null;
        try {
          lu = readImei(buffer);
        } catch (e) {
          this.log.warn(`Poignée de main invalide de ${pair} : ${(e as Error).message}`);
          socket.destroy();
          return;
        }
        if (!lu) return; // le TCP est un flot : on attend la suite
        buffer = buffer.subarray(lu.consumed);

        const verdict = await this.tracking.handshake(lu.imei);
        if (!verdict.ok) {
          // DEFAULT-DENY. Le refus est journalisé : un IMEI inconnu frappant à
          // la porte est un fait à connaître — boîtier mal saisi ou intrusion.
          this.log.warn(`IMEI refusé (${verdict.reason}) : ${lu.imei} depuis ${pair}`);
          socket.end(Buffer.from([0x00]));
          return;
        }
        trackerId = verdict.tracker.id;
        socket.write(Buffer.from([0x01]));
        this.log.log(`${verdict.tracker.label} (${lu.imei}) connecté depuis ${pair}`);
      }

      // Étape 2 : les paquets AVL, tant que le tampon en contient d'entiers.
      for (;;) {
        const taille = avlPacketLength(buffer);
        if (taille === null) return;
        const paquet = buffer.subarray(0, taille);
        buffer = buffer.subarray(taille);
        try {
          const { records } = decodeAvlPacket(paquet);
          const acceptes = await this.tracking.ingest(trackerId, records);
          // L'accusé libère le tampon DU BOÎTIER : il n'est émis qu'une fois la
          // donnée réellement versée, jamais avant.
          socket.write(ackBuffer(acceptes));
        } catch (e) {
          // Trame refusée : pas d'accusé, donc le boîtier la retransmettra.
          // C'est le comportement voulu — mieux vaut un doublon qu'un trou.
          const msg = e instanceof Codec8Error ? e.message : String(e);
          this.log.warn(`Paquet refusé de ${pair} : ${msg}`);
          socket.destroy();
          return;
        }
      }
    };

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      file = file.then(traiter).catch((e) => {
        this.log.error(`Session ${pair} interrompue : ${(e as Error).message}`);
        socket.destroy();
      });
    });
  }
}
