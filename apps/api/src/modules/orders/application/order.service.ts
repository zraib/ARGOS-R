// ============================================================================
// ARGOS — OrderService : cas d'usage des bons de travail
//
// COUCHE APPLICATIVE. Orchestre le domaine et les ports ; ne contient aucune
// règle métier (elles sont dans l'agrégat `WorkOrder`) et aucun détail
// technique (ils sont dans `infrastructure/`).
//
// ─── Inversion des dépendances, strictement ─────────────────────────────────
// Les seuls imports de ce fichier sont : le domaine, les ports, et `@Injectable`
// / `@Inject` de NestJS (annotations du conteneur, pas une dépendance métier).
// AUCUN import de `drizzle-orm`, `pg`, `node:fs`, d'un DTO HTTP ou d'un dépôt
// concret. Ce service ignore jusqu'à l'existence d'une base de données : il
// connaît un `OrderRepository`, c'est-à-dire une promesse de comportement.
//
// Conséquences pratiques :
//   • basculer mémoire → PostgreSQL ne touche pas une ligne de ce fichier,
//     seulement la racine de composition (`orders.module.ts`) ;
//   • les tests unitaires (`order.service.spec.ts`) tournent sans base, sans
//     Docker et sans NestJS, avec un faux dépôt de vingt lignes ;
//   • la règle est vérifiée automatiquement par un test d'architecture qui
//     échoue si un import interdit apparaît ici.
// ============================================================================

import { Inject, Injectable } from "@nestjs/common";
import {
  WorkOrder,
  type NewOrderProps,
  type OrderPriority,
  type OrderSnapshot,
  type OrderStatus,
} from "@/modules/orders/domain/order";
import { OrderNotFoundError } from "@/modules/orders/domain/order-errors";
import { CLOCK, type Clock } from "@/modules/orders/ports/clock.port";
import { ORDER_ID_GENERATOR, type OrderIdGenerator } from "@/modules/orders/ports/order-id.port";
import {
  ORDER_EVENT_PUBLISHER,
  type OrderEvent,
  type OrderEventPublisher,
} from "@/modules/orders/ports/order-events.port";
import {
  ORDER_REPOSITORY,
  type OrderQuery,
  type OrderRepository,
} from "@/modules/orders/ports/order-repository.port";

/** Entrée du cas d'usage « ouvrir un bon de travail ». */
export interface CreateOrderInput {
  subject: string;
  unit: string;
  priority: OrderPriority;
  sla: string;
  assignee?: string;
  incidentId?: string;
}

/** Entrée du cas d'usage « corriger un bon de travail ». */
export type AmendOrderInput = Partial<Pick<NewOrderProps, "subject" | "unit" | "priority" | "sla" | "incidentId">>;

/** Indicateurs agrégés alimentant les tuiles de l'écran « Bons de travail ». */
export interface OrderSummary {
  total: number;
  /** Bons ni terminés, ni vérifiés, ni annulés. */
  open: number;
  inProgress: number;
  /** Bons urgents non encore vérifiés — la file à surveiller. */
  overdue: number;
  byStatus: Record<OrderStatus, number>;
}

@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ORDER_ID_GENERATOR) private readonly ids: OrderIdGenerator,
    @Inject(ORDER_EVENT_PUBLISHER) private readonly events: OrderEventPublisher,
  ) {}

  /** Liste les bons de travail correspondant aux critères. */
  list(query: OrderQuery = {}): Promise<OrderSnapshot[]> {
    return this.orders.findAll(query);
  }

  /** Récupère un bon ; lève `OrderNotFoundError` s'il n'existe pas. */
  async getById(id: string): Promise<OrderSnapshot> {
    const found = await this.orders.findById(id);
    if (!found) throw new OrderNotFoundError(id);
    return found;
  }

  /** Ouvre un bon de travail à l'état « demandé ». */
  async create(input: CreateOrderInput, actor?: string): Promise<OrderSnapshot> {
    const id = await this.ids.next();
    const order = WorkOrder.open({ ...input, id }, this.clock.now(), this.clock.shortLabel());
    return this.commit(order, "order.created", actor);
  }

  /** Désigne l'exécutant d'un bon. */
  async assign(id: string, assignee: string, actor?: string): Promise<OrderSnapshot> {
    const order = await this.load(id);
    order.assignTo(assignee, this.clock.now());
    return this.commit(order, "order.assigned", actor);
  }

  /** Fait avancer un bon dans son cycle de vie. */
  async changeStatus(id: string, next: OrderStatus, actor?: string): Promise<OrderSnapshot> {
    const order = await this.load(id);
    const from = order.status;
    order.moveTo(next, this.clock.now());
    return this.commit(order, "order.status_changed", actor, from);
  }

  /** Annule un bon en conservant le motif. */
  async cancel(id: string, reason: string, actor?: string): Promise<OrderSnapshot> {
    const order = await this.load(id);
    const from = order.status;
    order.cancel(reason, this.clock.now());
    return this.commit(order, "order.cancelled", actor, from);
  }

  /** Corrige les données descriptives d'un bon. */
  async amend(id: string, patch: AmendOrderInput, actor?: string): Promise<OrderSnapshot> {
    const order = await this.load(id);
    order.amend(patch, this.clock.now());
    return this.commit(order, "order.amended", actor);
  }

  /** Indicateurs de pilotage calculés sur l'ensemble des bons. */
  async summary(): Promise<OrderSummary> {
    const all = await this.orders.findAll();
    const byStatus = {
      requested: 0, approved: 0, assigned: 0, inprogress: 0, done: 0, verified: 0, cancelled: 0,
    } satisfies Record<OrderStatus, number>;
    for (const o of all) byStatus[o.status] += 1;
    return {
      total: all.length,
      open: all.filter((o) => o.status !== "done" && o.status !== "verified" && o.status !== "cancelled").length,
      inProgress: byStatus.inprogress,
      overdue: all.filter((o) => o.priority === "urgent" && o.status !== "verified" && o.status !== "cancelled").length,
      byStatus,
    };
  }

  /** Charge un agrégat depuis sa forme persistée. */
  private async load(id: string): Promise<WorkOrder> {
    return WorkOrder.restore(await this.getById(id));
  }

  /**
   * Persiste puis annonce. L'ordre importe : on ne publie que ce qui est
   * écrit. Un échec de diffusion ne doit pas faire échouer la mutation
   * métier — l'adaptateur d'événements est responsable de sa propre
   * robustesse (au pire, l'événement est perdu, pas le bon de travail).
   */
  private async commit(order: WorkOrder, type: OrderEvent["type"], actor?: string, from?: OrderStatus): Promise<OrderSnapshot> {
    const snapshot = order.snapshot();
    await this.orders.save(snapshot);
    await this.events.publish({ type, order: snapshot, at: this.clock.now().toISOString(), ...(from ? { from } : {}), ...(actor ? { actor } : {}) });
    return snapshot;
  }
}
