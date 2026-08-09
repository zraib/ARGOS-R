// ============================================================================
// ARGOS — cœur de domaine : le bon de travail (Work Order)
//
// COUCHE DOMAINE — la plus interne de l'architecture hexagonale du module.
// Elle n'importe RIEN : ni NestJS, ni Drizzle, ni `node:fs`, ni un DTO HTTP.
// C'est la garantie structurelle du principe d'inversion des dépendances :
// les règles métier ne peuvent pas dépendre d'un détail technique puisqu'elles
// n'ont aucun moyen de le nommer.
//
// L'agrégat `WorkOrder` encapsule son état (champs privés) et n'expose que des
// opérations métier. Toute transition invalide lève une erreur de domaine —
// elle ne renvoie ni `false` ni `null` : un ordre en mémoire est toujours dans
// un état valide (SRP : l'agrégat est seul responsable de ses invariants).
// ============================================================================

import { OrderTransitionError, OrderValidationError } from "@/modules/orders/domain/order-errors";

/** Urgence opérationnelle du bon de travail. */
export const ORDER_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

/** Étapes du cycle de vie d'un bon de travail. */
export const ORDER_STATUSES = [
  "requested",
  "approved",
  "assigned",
  "inprogress",
  "done",
  "verified",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Politique de transition : état courant → états atteignables.
 * Table de données plutôt que cascade de `if` — ajouter une étape au cycle de
 * vie se fait ici, sans toucher au service ni aux adaptateurs (principe
 * ouvert/fermé).
 */
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  requested: ["approved", "cancelled"],
  approved: ["assigned", "cancelled"],
  assigned: ["inprogress", "cancelled"],
  inprogress: ["done", "cancelled"],
  // Un bon « terminé » peut être renvoyé en exécution si le contrôle échoue.
  done: ["verified", "inprogress"],
  verified: [],
  cancelled: [],
};

/** États terminaux : plus aucune mutation n'est acceptée. */
const TERMINAL: readonly OrderStatus[] = ["verified", "cancelled"];

/** États exigeant qu'un exécutant soit nommé. */
const REQUIRES_ASSIGNEE: readonly OrderStatus[] = ["assigned", "inprogress", "done", "verified"];

const MAX_SUBJECT = 200;

/**
 * Représentation sérialisable d'un bon de travail — le seul format qui
 * traverse les frontières (persistance, HTTP, événements). Les noms de champs
 * reprennent ceux déjà consommés par l'écran « Bons de travail » du frontend
 * pour que le module se branche sans adaptation côté web.
 */
export interface OrderSnapshot {
  id: string;
  subject: string;
  /** Unité responsable de l'exécution (ex. « 3e BG »). */
  unit: string;
  /** Exécutant nommé, ou chaîne vide tant qu'aucun n'est désigné. */
  assignee: string;
  priority: OrderPriority;
  status: OrderStatus;
  /** Échéance affichable (ex. « Aujourd'hui 14:00 »). */
  sla: string;
  /** Horodatage affichable de création (ex. « 06:15 »). */
  created: string;
  /** Incident de rattachement, si le bon découle d'une opération. */
  incidentId?: string;
  /** Motif d'annulation, renseigné uniquement à l'annulation. */
  cancelReason?: string;
  /** Dernière modification (ISO 8601) — utile au tri et à la synchronisation. */
  updatedAt: string;
}

/** Données nécessaires à l'ouverture d'un bon de travail. */
export interface NewOrderProps {
  id: string;
  subject: string;
  unit: string;
  priority: OrderPriority;
  sla: string;
  assignee?: string;
  incidentId?: string;
}

/** Normalise et valide un champ texte obligatoire. */
function requireText(value: string | undefined, field: string, max = 120): string {
  const v = (value ?? "").trim();
  if (v.length === 0) throw new OrderValidationError(`Le champ « ${field} » est obligatoire.`);
  if (v.length > max) throw new OrderValidationError(`Le champ « ${field} » dépasse ${max} caractères.`);
  return v;
}

/**
 * Agrégat « bon de travail ». L'état est privé : il ne peut évoluer que par
 * les opérations métier ci-dessous, qui refusent toute transition interdite.
 */
export class WorkOrder {
  private constructor(
    private readonly _id: string,
    private _subject: string,
    private _unit: string,
    private _assignee: string,
    private _priority: OrderPriority,
    private _status: OrderStatus,
    private _sla: string,
    private readonly _created: string,
    private _incidentId: string | undefined,
    private _cancelReason: string | undefined,
    private _updatedAt: string,
  ) {}

  /** Ouvre un nouveau bon de travail à l'état « demandé ». */
  static open(props: NewOrderProps, now: Date, createdLabel: string): WorkOrder {
    if (!ORDER_PRIORITIES.includes(props.priority)) {
      throw new OrderValidationError(`Priorité inconnue : ${String(props.priority)}.`);
    }
    return new WorkOrder(
      requireText(props.id, "identifiant", 32),
      requireText(props.subject, "objet", MAX_SUBJECT),
      requireText(props.unit, "unité"),
      (props.assignee ?? "").trim(),
      props.priority,
      "requested",
      requireText(props.sla, "échéance"),
      createdLabel,
      props.incidentId?.trim() || undefined,
      undefined,
      now.toISOString(),
    );
  }

  /**
   * Reconstitue un agrégat depuis sa forme persistée. Les invariants ne sont
   * pas rejoués : la donnée stockée a déjà été validée à l'écriture, et un
   * rejeu rendrait l'historique irrécupérable après une évolution des règles.
   */
  static restore(s: OrderSnapshot): WorkOrder {
    return new WorkOrder(
      s.id, s.subject, s.unit, s.assignee, s.priority, s.status, s.sla, s.created,
      s.incidentId, s.cancelReason, s.updatedAt,
    );
  }

  get id(): string {
    return this._id;
  }

  get status(): OrderStatus {
    return this._status;
  }

  get assignee(): string {
    return this._assignee;
  }

  /** Le bon est-il clos (vérifié ou annulé) ? */
  get isTerminal(): boolean {
    return TERMINAL.includes(this._status);
  }

  /** États atteignables depuis l'état courant (utile à l'IHM). */
  get nextStatuses(): readonly OrderStatus[] {
    return ALLOWED_TRANSITIONS[this._status];
  }

  /** Désigne — ou remplace — l'exécutant du bon. */
  assignTo(assignee: string, now: Date): void {
    this.guardMutable();
    this._assignee = requireText(assignee, "exécutant");
    this.touch(now);
  }

  /** Fait évoluer le bon vers l'étape suivante du cycle de vie. */
  moveTo(next: OrderStatus, now: Date): void {
    this.guardMutable();
    if (!ALLOWED_TRANSITIONS[this._status].includes(next)) {
      throw new OrderTransitionError(this._status, next);
    }
    if (REQUIRES_ASSIGNEE.includes(next) && this._assignee.length === 0) {
      throw new OrderValidationError(
        `Passage à « ${next} » impossible : aucun exécutant n'est désigné sur le bon ${this._id}.`,
      );
    }
    this._status = next;
    this.touch(now);
  }

  /** Annule le bon (état terminal) en conservant le motif. */
  cancel(reason: string, now: Date): void {
    this.guardMutable();
    if (!ALLOWED_TRANSITIONS[this._status].includes("cancelled")) {
      throw new OrderTransitionError(this._status, "cancelled");
    }
    this._status = "cancelled";
    this._cancelReason = requireText(reason, "motif d'annulation");
    this.touch(now);
  }

  /** Met à jour les données descriptives (objet, unité, priorité, échéance). */
  amend(patch: Partial<Pick<NewOrderProps, "subject" | "unit" | "priority" | "sla" | "incidentId">>, now: Date): void {
    this.guardMutable();
    if (patch.subject !== undefined) this._subject = requireText(patch.subject, "objet", MAX_SUBJECT);
    if (patch.unit !== undefined) this._unit = requireText(patch.unit, "unité");
    if (patch.sla !== undefined) this._sla = requireText(patch.sla, "échéance");
    if (patch.priority !== undefined) {
      if (!ORDER_PRIORITIES.includes(patch.priority)) {
        throw new OrderValidationError(`Priorité inconnue : ${String(patch.priority)}.`);
      }
      this._priority = patch.priority;
    }
    if (patch.incidentId !== undefined) this._incidentId = patch.incidentId.trim() || undefined;
    this.touch(now);
  }

  /** Forme sérialisable — seul format qui franchit les frontières du domaine. */
  snapshot(): OrderSnapshot {
    return {
      id: this._id,
      subject: this._subject,
      unit: this._unit,
      assignee: this._assignee,
      priority: this._priority,
      status: this._status,
      sla: this._sla,
      created: this._created,
      ...(this._incidentId ? { incidentId: this._incidentId } : {}),
      ...(this._cancelReason ? { cancelReason: this._cancelReason } : {}),
      updatedAt: this._updatedAt,
    };
  }

  private guardMutable(): void {
    if (this.isTerminal) {
      throw new OrderTransitionError(this._status, this._status, `Le bon ${this._id} est clos ; il n'est plus modifiable.`);
    }
  }

  private touch(now: Date): void {
    this._updatedAt = now.toISOString();
  }
}

/** Garde de type : la valeur est-elle un statut connu ? */
export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
}

/** Garde de type : la valeur est-elle une priorité connue ? */
export function isOrderPriority(v: unknown): v is OrderPriority {
  return typeof v === "string" && (ORDER_PRIORITIES as readonly string[]).includes(v);
}
