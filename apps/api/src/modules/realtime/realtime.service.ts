import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Subject, type Observable } from "rxjs";

// ============================================================================
// ARGOS — temps réel : diffusion d'événements et présence (lot COMMS)
//
// POURQUOI SSE, ET PAS UN WEBSOCKET. Le besoin est ASYMÉTRIQUE : le serveur
// pousse (messages, arrivées, départs, canaux), le client envoie par des POST
// ordinaires déjà audités et gardés par le RBAC. Un WebSocket demanderait
// `@nestjs/websockets` et `socket.io` — deux dépendances nouvelles, un second
// protocole à sécuriser, et un chemin d'écriture qui contournerait les gardes
// HTTP existantes. Les Server-Sent Events tiennent sur `rxjs`, déjà présent :
// aucune dépendance ajoutée (MASTER_PLAN §4.3), et l'écriture reste sur la
// route HTTP qui la journalise.
//
// LA PRÉSENCE EST LA CONNEXION. Un utilisateur est « en ligne » tant que son
// flux est ouvert — pas parce qu'un booléen a été mis à `true` quelque part et
// jamais remis à `false`. C'est ce qui rend la liste HONNÊTE : une fermeture
// d'onglet, une coupure réseau, une mise en veille retirent l'utilisateur sans
// que personne ait à le déclarer. Un état déclaratif finit toujours par mentir.
// ============================================================================

/** Ce qui est poussé aux clients. Le type est le contrat du flux. */
export type RealtimeEvent =
  /** Un message est arrivé dans un canal. */
  | { kind: "message"; channelId: string; message: unknown }
  /** Un canal a été créé, renommé ou supprimé. */
  | { kind: "channel"; action: "created" | "updated" | "deleted"; channelId: string; payload?: unknown }
  /** La liste des présents a changé. */
  | { kind: "presence"; online: PresenceUser[] }
  /** Une alerte adressée à des comptes précis — jamais diffusée à tous. */
  | { kind: "notice"; notice: Notice }
  /** Les postes d'une opération ont changé : chaque poste relit ceux qu'il a le droit de voir. */
  | { kind: "posts"; incidentId: string };

/**
 * Une alerte adressée : l'incident déclaré dans la région d'un wali ou d'une
 * place d'armes. Elle porte de quoi l'afficher ET de quoi centrer la carte
 * sans rien recharger.
 */
export interface Notice {
  id: string;
  /** ISO 8601. */
  at: string;
  kind: "incident_declared";
  incidentId: string;
  titre: string;
  region: string;
  ll: [number, number];
  sev: string;
  type: string;
}

export interface PresenceUser {
  matricule: string;
  role: string;
  /** Nombre de flux ouverts — un même compte peut avoir deux onglets. */
  sessions: number;
  since: string;
}

/**
 * Un flux inactif est fermé au-delà de ce délai sans battement.
 *
 * Les intermédiaires (proxy, APN mobile) coupent les connexions muettes sans
 * prévenir : le battement les garde ouvertes ET sert de preuve de vie.
 */
export const HEARTBEAT_MS = 25_000;

@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly log = new Logger("Realtime");

  /** Un sujet par connexion. La clé est un identifiant de flux, pas de compte. */
  private readonly flux = new Map<string, { subject: Subject<RealtimeEvent>; matricule: string; role: string; since: string }>();

  private compteur = 0;

  /**
   * Ouvre un flux pour un compte et rend l'observable à servir en SSE.
   *
   * Rend aussi la fonction de fermeture : c'est l'appelant (le contrôleur, qui
   * seul connaît la requête HTTP) qui sait quand la connexion tombe.
   */
  open(matricule: string, role: string): { events: Observable<RealtimeEvent>; close: () => void } {
    const id = `f${++this.compteur}`;
    const subject = new Subject<RealtimeEvent>();
    this.flux.set(id, { subject, matricule, role, since: new Date().toISOString() });
    this.log.log(`${matricule} connecté (${this.flux.size} flux ouverts)`);
    // La présence est annoncée à TOUS, y compris au nouvel arrivant : il doit
    // voir la liste complète sans avoir à la demander séparément.
    this.diffuserPresence();

    return {
      events: subject.asObservable(),
      close: () => {
        const f = this.flux.get(id);
        if (!f) return;
        f.subject.complete();
        this.flux.delete(id);
        this.log.log(`${matricule} déconnecté (${this.flux.size} flux restants)`);
        this.diffuserPresence();
      },
    };
  }

  /**
   * Qui est en ligne, agrégé par compte.
   *
   * Deux onglets d'un même officier ne font pas deux présents : ils font un
   * présent avec deux sessions. Compter les flux ferait gonfler l'effectif
   * apparent du poste de commandement.
   */
  online(): PresenceUser[] {
    const parCompte = new Map<string, PresenceUser>();
    for (const f of this.flux.values()) {
      const existant = parCompte.get(f.matricule);
      if (existant) {
        existant.sessions++;
        // On garde la PLUS ANCIENNE connexion : « en ligne depuis » doit dire
        // depuis quand l'officier est là, pas depuis quand il a ouvert un onglet.
        if (f.since < existant.since) existant.since = f.since;
      } else {
        parCompte.set(f.matricule, { matricule: f.matricule, role: f.role, sessions: 1, since: f.since });
      }
    }
    return [...parCompte.values()].sort((a, b) => a.matricule.localeCompare(b.matricule, "fr"));
  }

  /** Pousse un événement à tous les flux ouverts. */
  emit(event: RealtimeEvent): void {
    for (const f of this.flux.values()) f.subject.next(event);
  }

  /**
   * Pousse un événement aux seuls flux de ces comptes. Ce qui ne concerne
   * que deux personnes (une conversation directe) ou une région (l'alerte
   * de son wali) ne traverse pas le fil de tout le monde.
   */
  emitTo(matricules: readonly string[], event: RealtimeEvent): void {
    const cibles = new Set(matricules.map((m) => m.toLowerCase()));
    for (const f of this.flux.values()) if (cibles.has(f.matricule.toLowerCase())) f.subject.next(event);
  }

  private diffuserPresence(): void {
    this.emit({ kind: "presence", online: this.online() });
  }

  onModuleDestroy(): void {
    for (const f of this.flux.values()) f.subject.complete();
    this.flux.clear();
  }
}
