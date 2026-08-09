// ============================================================================
// ARGOS — tests unitaires d'OrderService
//
// Ces tests SONT la démonstration de l'inversion des dépendances : ils
// exercent l'intégralité des cas d'usage sans base de données, sans Docker,
// sans conteneur NestJS et sans le moindre `import` d'infrastructure. Le
// service est instancié à la main avec quatre doublures qui implémentent les
// ports. Si un jour il fallait démarrer Postgres pour lancer ce fichier, c'est
// que le découplage aurait été rompu.
// ============================================================================

import { OrderService } from "@/modules/orders/application/order.service";
import { OrderNotFoundError, OrderTransitionError, OrderValidationError } from "@/modules/orders/domain/order-errors";
import type { OrderSnapshot } from "@/modules/orders/domain/order";
import type { Clock } from "@/modules/orders/ports/clock.port";
import type { OrderIdGenerator } from "@/modules/orders/ports/order-id.port";
import type { OrderEvent, OrderEventPublisher } from "@/modules/orders/ports/order-events.port";
import type { OrderQuery, OrderRepository } from "@/modules/orders/ports/order-repository.port";

/** Doublure de dépôt : une Map. Substituable à n'importe quel adaptateur réel. */
class FakeOrderRepository implements OrderRepository {
  readonly items = new Map<string, OrderSnapshot>();
  saveCalls = 0;

  async findById(id: string): Promise<OrderSnapshot | null> {
    return this.items.get(id) ?? null;
  }

  async findAll(q: OrderQuery = {}): Promise<OrderSnapshot[]> {
    return [...this.items.values()].filter(
      (o) =>
        (q.status === undefined || o.status === q.status) &&
        (q.priority === undefined || o.priority === q.priority) &&
        (q.unit === undefined || o.unit === q.unit),
    );
  }

  async lastSequence(): Promise<number> {
    return [...this.items.keys()].reduce((max, id) => Math.max(max, parseInt(id.replace(/\D/g, ""), 10) || 0), 0);
  }

  async save(order: OrderSnapshot): Promise<void> {
    this.saveCalls += 1;
    this.items.set(order.id, order);
  }
}

/** Horloge figée : rend le service déterministe. */
class FrozenClock implements Clock {
  constructor(private readonly instant = new Date("2026-08-09T06:15:00.000Z")) {}
  now(): Date {
    return this.instant;
  }
  shortLabel(): string {
    return "06:15";
  }
}

class FixedIdGenerator implements OrderIdGenerator {
  constructor(private seq = 1000) {}
  async next(): Promise<string> {
    this.seq += 1;
    return `BT-${this.seq}`;
  }
}

class RecordingPublisher implements OrderEventPublisher {
  readonly events: OrderEvent[] = [];
  async publish(event: OrderEvent): Promise<void> {
    this.events.push(event);
  }
}

describe("OrderService — cas d'usage des bons de travail", () => {
  let repo: FakeOrderRepository;
  let events: RecordingPublisher;
  let service: OrderService;

  const openOrder = () =>
    service.create({ subject: "Déblaiement RP2010", unit: "3e BG", priority: "high", sla: "Aujourd'hui 14:00" }, "m.zraib");

  beforeEach(() => {
    repo = new FakeOrderRepository();
    events = new RecordingPublisher();
    // Instanciation directe : aucune infrastructure, aucun conteneur DI.
    service = new OrderService(repo, new FrozenClock(), new FixedIdGenerator(), events);
  });

  it("ouvre un bon à l'état « demandé » et le persiste", async () => {
    const order = await openOrder();
    expect(order.id).toBe("BT-1001");
    expect(order.status).toBe("requested");
    expect(order.created).toBe("06:15");
    expect(await repo.findById("BT-1001")).toEqual(order);
  });

  it("publie un événement métier après écriture", async () => {
    await openOrder();
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({ type: "order.created", actor: "m.zraib" });
  });

  it("refuse un objet vide (erreur de domaine, pas HTTP)", async () => {
    await expect(
      service.create({ subject: "   ", unit: "3e BG", priority: "low", sla: "Demain" }),
    ).rejects.toBeInstanceOf(OrderValidationError);
    expect(repo.saveCalls).toBe(0);
  });

  it("suit le cycle de vie complet demandé → vérifié", async () => {
    const { id } = await openOrder();
    await service.changeStatus(id, "approved");
    await service.assign(id, "Adj. R. Rahmouni");
    await service.changeStatus(id, "assigned");
    await service.changeStatus(id, "inprogress");
    await service.changeStatus(id, "done");
    const verified = await service.changeStatus(id, "verified");
    expect(verified.status).toBe("verified");
  });

  it("interdit un saut d'étape (demandé → terminé)", async () => {
    const { id } = await openOrder();
    await expect(service.changeStatus(id, "done")).rejects.toBeInstanceOf(OrderTransitionError);
  });

  it("interdit le passage à « assigné » sans exécutant désigné", async () => {
    const { id } = await openOrder();
    await service.changeStatus(id, "approved");
    await expect(service.changeStatus(id, "assigned")).rejects.toBeInstanceOf(OrderValidationError);
  });

  it("gèle un bon vérifié (état terminal)", async () => {
    const { id } = await openOrder();
    await service.changeStatus(id, "approved");
    await service.assign(id, "Cne. A. Kabbaj");
    await service.changeStatus(id, "assigned");
    await service.changeStatus(id, "inprogress");
    await service.changeStatus(id, "done");
    await service.changeStatus(id, "verified");
    await expect(service.amend(id, { priority: "low" })).rejects.toBeInstanceOf(OrderTransitionError);
    await expect(service.cancel(id, "trop tard")).rejects.toBeInstanceOf(OrderTransitionError);
  });

  it("annule un bon en conservant le motif", async () => {
    const { id } = await openOrder();
    const cancelled = await service.cancel(id, "Doublon du BT-3388", "m.zraib");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("Doublon du BT-3388");
    expect(events.events.at(-1)).toMatchObject({ type: "order.cancelled", from: "requested" });
  });

  it("exige un motif d'annulation non vide", async () => {
    const { id } = await openOrder();
    await expect(service.cancel(id, "  ")).rejects.toBeInstanceOf(OrderValidationError);
  });

  it("signale un bon inexistant", async () => {
    await expect(service.getById("BT-0000")).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("calcule les indicateurs de pilotage", async () => {
    await openOrder();
    const urgent = await service.create({ subject: "Groupe électrogène", unit: "2e GL", priority: "urgent", sla: "12:00" });
    await service.cancel(urgent.id, "annulé");
    await service.create({ subject: "Motopompe", unit: "3e BG", priority: "urgent", sla: "16:00" });

    const s = await service.summary();
    expect(s.total).toBe(3);
    expect(s.open).toBe(2);
    // Le bon urgent annulé ne compte pas comme en retard.
    expect(s.overdue).toBe(1);
    expect(s.byStatus.cancelled).toBe(1);
  });

  it("filtre la liste sans que le service ne connaisse le stockage", async () => {
    await openOrder();
    await service.create({ subject: "Motopompe", unit: "2e GL", priority: "medium", sla: "16:00" });
    expect(await service.list({ unit: "2e GL" })).toHaveLength(1);
  });
});
