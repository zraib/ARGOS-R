// ============================================================================
// ARGOS — tests de CONTRAT du port OrderRepository
//
// Écrits une fois contre l'interface, exécutés contre chaque adaptateur. C'est
// la mise en pratique du principe de substitution de Liskov : un adaptateur
// n'est acceptable que s'il satisfait le même contrat observable que les
// autres — mêmes cas limites, même tri, même idempotence.
//
// `DrizzleOrderRepository` n'est pas exercé ici (il exige un Postgres réel).
// Pour l'intégrer à une campagne d'intégration, il suffit d'ajouter une entrée
// au tableau `ADAPTERS` : la suite de tests, elle, ne change pas.
// ============================================================================

import { InMemoryOrderRepository } from "@/modules/orders/infrastructure/in-memory-order.repository";
import type { OrderSnapshot } from "@/modules/orders/domain/order";
import type { OrderRepository } from "@/modules/orders/ports/order-repository.port";

const ADAPTERS: [string, () => OrderRepository][] = [
  ["InMemoryOrderRepository", () => new InMemoryOrderRepository()],
];

function snapshot(id: string, over: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id,
    subject: `Objet ${id}`,
    unit: "3e BG",
    assignee: "",
    priority: "medium",
    status: "requested",
    sla: "Aujourd'hui 18:00",
    created: "06:15",
    updatedAt: "2026-08-09T06:15:00.000Z",
    ...over,
  };
}

describe.each(ADAPTERS)("Contrat OrderRepository — %s", (_name, make) => {
  let repo: OrderRepository;

  beforeEach(() => {
    // NODE_ENV=test désactive l'instantané disque (voir common/dev-store) :
    // chaque adaptateur démarre donc sur le jeu de départ, sans effet de bord.
    repo = make();
  });

  it("findById renvoie null pour un identifiant inconnu (ne lève pas)", async () => {
    await expect(repo.findById("BT-inexistant")).resolves.toBeNull();
  });

  it("save puis findById restitue un instantané identique", async () => {
    const o = snapshot("BT-9001");
    await repo.save(o);
    expect(await repo.findById("BT-9001")).toEqual(o);
  });

  it("save est idempotent sur l'identifiant (remplace, ne duplique pas)", async () => {
    await repo.save(snapshot("BT-9002"));
    await repo.save(snapshot("BT-9002", { status: "approved" }));
    const found = await repo.findAll({ status: "approved" });
    expect(found.filter((o) => o.id === "BT-9002")).toHaveLength(1);
  });

  it("findAll filtre par statut, priorité et unité", async () => {
    await repo.save(snapshot("BT-9003", { status: "done", priority: "urgent", unit: "2e GL" }));
    expect(await repo.findAll({ status: "done", priority: "urgent", unit: "2e GL" })).toHaveLength(1);
    expect(await repo.findAll({ status: "done", priority: "low", unit: "2e GL" })).toHaveLength(0);
  });

  it("findAll trie du plus récemment modifié au plus ancien", async () => {
    await repo.save(snapshot("BT-9101", { unit: "ZZZ", updatedAt: "2030-01-01T00:00:00.000Z" }));
    await repo.save(snapshot("BT-9102", { unit: "ZZZ", updatedAt: "2031-01-01T00:00:00.000Z" }));
    const rows = await repo.findAll({ unit: "ZZZ" });
    expect(rows.map((r) => r.id)).toEqual(["BT-9102", "BT-9101"]);
  });

  it("lastSequence renvoie le plus grand numéro attribué", async () => {
    await repo.save(snapshot("BT-9500"));
    await expect(repo.lastSequence()).resolves.toBeGreaterThanOrEqual(9500);
  });
});
