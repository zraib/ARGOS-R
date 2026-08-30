// ============================================================================
// ARGOS — cœur de domaine : la MISSION, boucle fermée d'un geste opérationnel
//
// COUCHE DOMAINE — la plus interne. Elle n'importe RIEN : ni NestJS, ni
// Drizzle, ni un DTO HTTP. Les règles métier ne peuvent pas dépendre d'un
// détail technique puisqu'elles n'ont aucun moyen de le nommer.
//
// POURQUOI UN SEUL OBJET POUR TROIS GESTES
// Engager une unité, demander un moyen et transférer une victime sont, du
// point de vue du commandement, la MÊME chose : une demande qui doit être
// acceptée, suivie de jalons, et tracée. Les modéliser séparément aurait
// triplé la machine d'états, les tests et les écrans. `kind` distingue le
// contexte, `payload` porte ce qui lui est propre — le cycle de vie, lui, est
// unique. C'est le principe du document de doctrine « La Boucle Fermée » :
// aucune action sans réponse.
//
// RÈGLE D'ACTEUR — distincte du RBAC
// Le RBAC dit qui a le droit de toucher aux missions ; le domaine dit qui a le
// droit de faire CE geste sur CETTE mission : seul le destinataire accepte ou
// refuse, seul l'émetteur annule. Un OPCOM habilité ne peut pas accepter à la
// place de l'unité destinataire — sinon la « poignée de main » ne prouve plus
// rien.
// ============================================================================

import {
  MissionActorError,
  MissionTransitionError,
  MissionValidationError,
} from "@/modules/missions/domain/mission-errors";

/** Nature de la boucle. Le cycle de vie est le même pour les trois. */
export const MISSION_KINDS = ["order", "resource_request", "transfer"] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];

/** États de la boucle. */
export const MISSION_STATES = [
  "issued",
  "accepted",
  "declined",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type MissionState = (typeof MISSION_STATES)[number];

/**
 * Jalons d'exécution. Volontairement génériques : « en route » vaut pour une
 * unité qui roule comme pour une ambulance qui transporte un blessé.
 */
export const MISSION_MILESTONES = ["en_route", "on_site", "handover"] as const;
export type MissionMilestoneKey = (typeof MISSION_MILESTONES)[number];

/**
 * Politique de transition : état courant → états atteignables. Table de
 * données plutôt que cascade de `if` — faire évoluer le cycle de vie se fait
 * ici, sans toucher au service ni aux adaptateurs (ouvert/fermé).
 */
const ALLOWED_TRANSITIONS: Readonly<Record<MissionState, readonly MissionState[]>> = {
  issued: ["accepted", "declined", "cancelled"],
  accepted: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  declined: [],
  completed: [],
  cancelled: [],
};

/** États terminaux : plus aucune mutation n'est acceptée. */
const TERMINAL: readonly MissionState[] = ["declined", "completed", "cancelled"];

const MAX_LABEL = 200;
const MAX_REASON = 400;

/**
 * Partie prenante d'une mission. `entity` cantonne la boucle à une entité
 * précise (unité U2, hôpital H4…) et sert la portée ABAC : c'est ce champ qui
 * permet de dire « cette mission est pour VOUS » sans interroger l'annuaire.
 */
export interface Party {
  /** Rôle attendu du côté concerné (ex. « resp_unit », « tacom »). */
  role: string;
  /** Matricule, quand la partie est une personne nommée. */
  userId?: string;
  /** Entité concernée (identifiant d'unité, d'hôpital, d'abri, de morgue). */
  entity?: string;
}

/** Jalon franchi, horodaté et attribué. */
export interface Milestone {
  key: MissionMilestoneKey;
  at: string;
  by: string;
}

/**
 * Charge utile propre au `kind`. Union discriminée : le compilateur refuse de
 * lire un champ d'ordre sur un transfert.
 */
export type MissionPayload =
  | { kind: "order"; unitId: string; note?: string; etaMin?: number }
  | { kind: "resource_request"; capability: string; urgency: "low" | "medium" | "high"; note?: string }
  | {
      kind: "transfer";
      /** Ce qui est transféré : une victime, un corps, une personne à héberger. */
      subject: "casualty" | "body" | "displaced";
      /** Entité de départ et d'arrivée (site de triage → hôpital, hôpital → morgue…). */
      fromEntity?: string;
      toEntity: string;
      /** Catégorie de triage — jamais de donnée nominative (arbitrage Q3). */
      triage?: "red" | "yellow" | "green" | "black";
      note?: string;
    };

/**
 * Forme sérialisable — le seul format qui traverse les frontières
 * (persistance, HTTP, événements).
 */
export interface MissionSnapshot {
  id: string;
  kind: MissionKind;
  /** Incident de rattachement : TOUTE mission est ancrée à un incident. */
  incidentId: string;
  label: string;
  from: Party;
  to: Party;
  state: MissionState;
  milestones: Milestone[];
  /** Motif — obligatoire au refus et à l'annulation. */
  reason?: string;
  payload: MissionPayload;
  issuedAt: string;
  updatedAt: string;
}

/** Données nécessaires à l'émission d'une mission. */
export interface NewMissionProps {
  id: string;
  incidentId: string;
  label: string;
  from: Party;
  to: Party;
  payload: MissionPayload;
}

/** Normalise et valide un champ texte obligatoire. */
function requireText(value: string | undefined, field: string, max = 120): string {
  const v = (value ?? "").trim();
  if (v.length === 0) throw new MissionValidationError(`Le champ « ${field} » est obligatoire.`);
  if (v.length > max) throw new MissionValidationError(`Le champ « ${field} » dépasse ${max} caractères.`);
  return v;
}

/** Valide une partie prenante. */
function requireParty(p: Party | undefined, field: string): Party {
  if (!p) throw new MissionValidationError(`Le champ « ${field} » est obligatoire.`);
  return {
    role: requireText(p.role, `${field}.role`, 40),
    ...(p.userId?.trim() ? { userId: p.userId.trim() } : {}),
    ...(p.entity?.trim() ? { entity: p.entity.trim() } : {}),
  };
}

/**
 * Une partie DÉSIGNE-t-elle l'acteur qui agit ? Un acteur correspond s'il est
 * nommément la partie, ou s'il tient l'entité visée avec le bon rôle.
 * L'identité nominative prime : si la partie nomme quelqu'un, seul lui agit.
 */
function partyMatches(party: Party, actor: MissionActor): boolean {
  if (party.userId) return party.userId === actor.userId;
  if (party.entity) return party.entity === actor.entity && party.role === actor.role;
  return party.role === actor.role;
}

/** Acteur d'un geste, tel que le service le construit depuis la session. */
export interface MissionActor {
  userId: string;
  role: string;
  entity?: string;
}

/**
 * Agrégat « mission ». L'état est privé : il n'évolue que par les opérations
 * ci-dessous, qui refusent toute transition interdite et tout acteur non
 * habilité.
 */
export class Mission {
  private constructor(
    private readonly _id: string,
    private readonly _kind: MissionKind,
    private readonly _incidentId: string,
    private _label: string,
    private readonly _from: Party,
    private readonly _to: Party,
    private _state: MissionState,
    private _milestones: Milestone[],
    private _reason: string | undefined,
    private readonly _payload: MissionPayload,
    private readonly _issuedAt: string,
    private _updatedAt: string,
  ) {}

  /** Émet une nouvelle mission à l'état « émise ». */
  static issue(props: NewMissionProps, now: Date): Mission {
    if (!MISSION_KINDS.includes(props.payload?.kind)) {
      throw new MissionValidationError(`Nature de mission inconnue : ${String(props.payload?.kind)}.`);
    }
    const at = now.toISOString();
    return new Mission(
      requireText(props.id, "identifiant", 32),
      props.payload.kind,
      requireText(props.incidentId, "incident"),
      requireText(props.label, "objet", MAX_LABEL),
      requireParty(props.from, "émetteur"),
      requireParty(props.to, "destinataire"),
      "issued",
      [],
      undefined,
      props.payload,
      at,
      at,
    );
  }

  /**
   * Reconstitue un agrégat depuis sa forme persistée. Les invariants ne sont
   * pas rejoués : la donnée stockée a déjà été validée à l'écriture, et un
   * rejeu rendrait l'historique irrécupérable après une évolution des règles.
   */
  static restore(s: MissionSnapshot): Mission {
    return new Mission(
      s.id, s.kind, s.incidentId, s.label, s.from, s.to, s.state,
      [...s.milestones], s.reason, s.payload, s.issuedAt, s.updatedAt,
    );
  }

  get id(): string {
    return this._id;
  }

  get state(): MissionState {
    return this._state;
  }

  get incidentId(): string {
    return this._incidentId;
  }

  /** La boucle est-elle close (refusée, terminée ou annulée) ? */
  get isTerminal(): boolean {
    return TERMINAL.includes(this._state);
  }

  /** États atteignables depuis l'état courant (utile à l'IHM). */
  get nextStates(): readonly MissionState[] {
    return ALLOWED_TRANSITIONS[this._state];
  }

  /** L'acteur est-il le destinataire de la mission ? */
  isFor(actor: MissionActor): boolean {
    return partyMatches(this._to, actor);
  }

  /** L'acteur est-il l'émetteur de la mission ? */
  isFrom(actor: MissionActor): boolean {
    return partyMatches(this._from, actor);
  }

  /** Le destinataire accuse réception et prend la mission à son compte. */
  accept(actor: MissionActor, now: Date): void {
    this.guardRecipient(actor, "accepter");
    this.moveTo("accepted", now);
  }

  /** Le destinataire refuse — le motif est obligatoire, c'est ce qui rend le refus exploitable. */
  decline(actor: MissionActor, reason: string, now: Date): void {
    this.guardRecipient(actor, "refuser");
    this._reason = requireText(reason, "motif de refus", MAX_REASON);
    this.moveTo("declined", now);
  }

  /**
   * Le destinataire franchit un jalon. Le premier jalon fait passer la mission
   * en exécution : l'état découle du terrain, il n'est pas ressaisi à part.
   */
  reachMilestone(actor: MissionActor, key: MissionMilestoneKey, now: Date): void {
    this.guardRecipient(actor, "jalonner");
    if (!MISSION_MILESTONES.includes(key)) {
      throw new MissionValidationError(`Jalon inconnu : ${String(key)}.`);
    }
    if (this._state !== "accepted" && this._state !== "in_progress") {
      throw new MissionTransitionError(
        this._state,
        "in_progress",
        `Jalon impossible : la mission ${this._id} doit d'abord être acceptée.`,
      );
    }
    if (this._milestones.some((m) => m.key === key)) {
      throw new MissionValidationError(`Jalon « ${key} » déjà franchi sur la mission ${this._id}.`);
    }
    this._milestones.push({ key, at: now.toISOString(), by: actor.userId });
    if (this._state === "accepted") this._state = "in_progress";
    this.touch(now);
  }

  /** Le destinataire clôt la mission. */
  complete(actor: MissionActor, now: Date): void {
    this.guardRecipient(actor, "terminer");
    this.moveTo("completed", now);
  }

  /** L'émetteur annule — motif obligatoire, comme pour un refus. */
  cancel(actor: MissionActor, reason: string, now: Date): void {
    if (!this.isFrom(actor)) {
      throw new MissionActorError(
        `Seul l'émetteur peut annuler la mission ${this._id}.`,
      );
    }
    this._reason = requireText(reason, "motif d'annulation", MAX_REASON);
    this.moveTo("cancelled", now);
  }

  /**
   * Annulation par le système (suppression de l'incident porteur, par
   * exemple). Contourne la règle d'acteur — pas la machine d'états : une
   * mission déjà close le reste.
   */
  cancelBySystem(reason: string, now: Date): void {
    this._reason = requireText(reason, "motif d'annulation", MAX_REASON);
    this.moveTo("cancelled", now);
  }

  /** Forme sérialisable — seul format qui franchit les frontières du domaine. */
  snapshot(): MissionSnapshot {
    return {
      id: this._id,
      kind: this._kind,
      incidentId: this._incidentId,
      label: this._label,
      from: this._from,
      to: this._to,
      state: this._state,
      milestones: [...this._milestones],
      ...(this._reason ? { reason: this._reason } : {}),
      payload: this._payload,
      issuedAt: this._issuedAt,
      updatedAt: this._updatedAt,
    };
  }

  /** Applique une transition en vérifiant la politique. */
  private moveTo(next: MissionState, now: Date): void {
    if (this.isTerminal) {
      throw new MissionTransitionError(
        this._state,
        next,
        `La mission ${this._id} est close ; elle n'est plus modifiable.`,
      );
    }
    if (!ALLOWED_TRANSITIONS[this._state].includes(next)) {
      throw new MissionTransitionError(this._state, next);
    }
    this._state = next;
    this.touch(now);
  }

  private guardRecipient(actor: MissionActor, geste: string): void {
    if (!this.isFor(actor)) {
      throw new MissionActorError(
        `Seul le destinataire peut ${geste} la mission ${this._id}.`,
      );
    }
  }

  private touch(now: Date): void {
    this._updatedAt = now.toISOString();
  }
}

/** Garde de type : la valeur est-elle un état connu ? */
export function isMissionState(v: unknown): v is MissionState {
  return typeof v === "string" && (MISSION_STATES as readonly string[]).includes(v);
}

/** Garde de type : la valeur est-elle une nature connue ? */
export function isMissionKind(v: unknown): v is MissionKind {
  return typeof v === "string" && (MISSION_KINDS as readonly string[]).includes(v);
}
