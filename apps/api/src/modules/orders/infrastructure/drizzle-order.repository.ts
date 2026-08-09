// ============================================================================
// ARGOS — adaptateur de persistance : PostgreSQL via Drizzle
//
// Seconde implémentation du MÊME port `OrderRepository`. C'est la preuve
// concrète de l'inversion des dépendances : passer de la mémoire à Postgres se
// joue entièrement ici et dans la racine de composition ; `OrderService` n'a
// pas connaissance de ce fichier et n'a pas une ligne à changer.
//
// Substituabilité (Liskov) : ce dépôt respecte le contrat au même titre que
// l'implémentation mémoire — mêmes cas limites (`findById` renvoie `null` et
// ne lève pas), même tri, même idempotence de `save`. La suite de tests de
// contrat (`order-repository.contract.spec.ts`) est écrite une fois et
// exécutée contre chaque adaptateur.
//
// Migration : `npm run db:generate` puis `npm run db:migrate` (table
// `work_orders`, voir db/schema.ts).
// ============================================================================

import { desc, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { workOrders } from "@/db/schema";
import type { OrderPriority, OrderSnapshot, OrderStatus } from "@/modules/orders/domain/order";
import type { OrderQuery, OrderRepository } from "@/modules/orders/ports/order-repository.port";

type Row = typeof workOrders.$inferSelect;

/** Ligne SQL → instantané de domaine. */
function toSnapshot(r: Row): OrderSnapshot {
  return {
    id: r.id,
    subject: r.subject,
    unit: r.unit,
    assignee: r.assignee,
    priority: r.priority as OrderPriority,
    status: r.status as OrderStatus,
    sla: r.sla,
    created: r.createdLabel,
    ...(r.incidentId ? { incidentId: r.incidentId } : {}),
    ...(r.cancelReason ? { cancelReason: r.cancelReason } : {}),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<OrderSnapshot | null> {
    const rows = await this.db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    return rows.length > 0 ? toSnapshot(rows[0]) : null;
  }

  async findAll(query: OrderQuery = {}): Promise<OrderSnapshot[]> {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(workOrders.status, query.status));
    if (query.priority) filters.push(eq(workOrders.priority, query.priority));
    if (query.unit) filters.push(sql`lower(${workOrders.unit}) = lower(${query.unit})`);
    if (query.assignee) filters.push(sql`lower(${workOrders.assignee}) = lower(${query.assignee})`);
    if (query.incidentId) filters.push(eq(workOrders.incidentId, query.incidentId));
    const rows = await this.db
      .select()
      .from(workOrders)
      .where(filters.length > 0 ? sql.join(filters, sql` and `) : undefined)
      .orderBy(desc(workOrders.updatedAt), desc(workOrders.id));
    return rows.map(toSnapshot);
  }

  async lastSequence(): Promise<number> {
    // Extrait la partie numérique de l'identifiant (« BT-3391 » → 3391).
    const rows = await this.db
      .select({ max: sql<number | null>`max(nullif(regexp_replace(${workOrders.id}, '\\D', '', 'g'), '')::bigint)` })
      .from(workOrders);
    return Number(rows[0]?.max ?? 0);
  }

  async save(order: OrderSnapshot): Promise<void> {
    const values = {
      id: order.id,
      subject: order.subject,
      unit: order.unit,
      assignee: order.assignee,
      priority: order.priority,
      status: order.status,
      sla: order.sla,
      createdLabel: order.created,
      incidentId: order.incidentId ?? null,
      cancelReason: order.cancelReason ?? null,
      updatedAt: new Date(order.updatedAt),
    };
    await this.db
      .insert(workOrders)
      .values(values)
      .onConflictDoUpdate({ target: workOrders.id, set: { ...values, id: undefined } });
  }
}
