// ============================================================================
// ARGOS — adaptateur de persistance : mémoire (+ instantané disque en dev)
//
// Implémente `OrderRepository`. C'est le module de BAS niveau : il dépend de
// l'abstraction définie par le métier, l'inverse n'est jamais vrai. Le service
// ne connaît pas ce fichier et ne l'importe nulle part.
// ============================================================================

import { Injectable } from "@nestjs/common";
import { loadDevState, saveDevState } from "@/common/dev-store";
import { WORK_ORDERS } from "@/modules/domain/catalog.data";
import type { OrderSnapshot } from "@/modules/orders/domain/order";
import type { OrderQuery, OrderRepository } from "@/modules/orders/ports/order-repository.port";

/**
 * Version du jeu de départ : à incrémenter quand les bons de démonstration
 * changent, pour que l'instantané dev écrit avec l'ancienne version soit
 * ignoré (même mécanique que `DOMAIN_SEED_VERSION`).
 */
const ORDERS_SEED_VERSION = 1;

interface OrdersSnapshotFile {
  seedVersion?: number;
  orders?: OrderSnapshot[];
}

/** Convertit un bon de travail du catalogue de démonstration en instantané. */
function fromCatalog(w: (typeof WORK_ORDERS)[number], at: string): OrderSnapshot {
  return {
    id: w.id,
    subject: w.subject,
    unit: w.unit,
    // Le catalogue note « — » lorsqu'aucun exécutant n'est désigné.
    assignee: w.assignee === "—" ? "" : w.assignee,
    priority: w.priority,
    status: w.status,
    sla: w.sla,
    created: w.created,
    updatedAt: at,
  };
}

@Injectable()
export class InMemoryOrderRepository implements OrderRepository {
  private readonly items = new Map<string, OrderSnapshot>();

  constructor() {
    const snap = loadDevState<OrdersSnapshotFile>("orders", {});
    const source =
      snap.seedVersion === ORDERS_SEED_VERSION && snap.orders
        ? snap.orders
        : WORK_ORDERS.map((w) => fromCatalog(w, new Date(0).toISOString()));
    for (const o of source) this.items.set(o.id, o);
    if (snap.seedVersion !== ORDERS_SEED_VERSION) this.persist();
  }

  async findById(id: string): Promise<OrderSnapshot | null> {
    return this.items.get(id) ?? null;
  }

  async findAll(query: OrderQuery = {}): Promise<OrderSnapshot[]> {
    const eq = (a: string | undefined, b: string | undefined) =>
      b === undefined || (a ?? "").toLowerCase() === b.toLowerCase();
    return [...this.items.values()]
      .filter(
        (o) =>
          (query.status === undefined || o.status === query.status) &&
          (query.priority === undefined || o.priority === query.priority) &&
          eq(o.unit, query.unit) &&
          eq(o.assignee, query.assignee) &&
          eq(o.incidentId, query.incidentId),
      )
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? 1 : -1));
  }

  async lastSequence(): Promise<number> {
    let max = 0;
    for (const id of this.items.keys()) {
      const n = parseInt(id.replace(/\D/g, ""), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return max;
  }

  async save(order: OrderSnapshot): Promise<void> {
    this.items.set(order.id, order);
    this.persist();
  }

  private persist(): void {
    saveDevState("orders", { seedVersion: ORDERS_SEED_VERSION, orders: [...this.items.values()] });
  }
}
