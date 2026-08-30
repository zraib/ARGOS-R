import { InMemoryMissionRepository } from "@/modules/missions/infrastructure/in-memory-mission.repository";
import type { MissionRepository } from "@/modules/missions/ports/mission-repository.port";
import type { MissionSnapshot } from "@/modules/missions/domain/mission";

// ============================================================================
// ARGOS — test de CONTRAT du port de persistance des missions
//
// Ce fichier ne teste pas une implémentation : il teste le CONTRAT que toute
// implémentation doit honorer. Le jour où un dépôt Postgres arrivera, il
// s'ajoutera à la liste ci-dessous et devra passer les mêmes assertions —
// c'est ce qui rend les adaptateurs réellement substituables (Liskov), au
// lieu de l'espérer.
// ============================================================================

/** Fabriques d'adaptateurs à éprouver. Ajouter ici un futur dépôt Postgres. */
const IMPLEMENTATIONS: Array<[string, () => MissionRepository]> = [
  [
    "InMemoryMissionRepository",
    () => {
      const repo = new InMemoryMissionRepository();
      // Ardoise propre : le dépôt relit l'instantané de dev au démarrage.
      (repo as unknown as { missions: unknown[] }).missions = [];
      return repo;
    },
  ],
];

function snap(over: Partial<MissionSnapshot> = {}): MissionSnapshot {
  return {
    id: "M-0001",
    kind: "order",
    incidentId: "INC-2613",
    label: "1er GI — renfort",
    from: { role: "tacom", userId: "c.tacom" },
    to: { role: "resp_unit", entity: "U2" },
    state: "issued",
    milestones: [],
    payload: { kind: "order", unitId: "U2" },
    issuedAt: "2026-08-30T09:00:00.000Z",
    updatedAt: "2026-08-30T09:00:00.000Z",
    ...over,
  };
}

describe.each(IMPLEMENTATIONS)("Contrat MissionRepository — %s", (_name, make) => {
  it("rend null pour un identifiant inconnu (et ne lève pas)", async () => {
    await expect(make().findById("M-9999")).resolves.toBeNull();
  });

  it("save est idempotent sur l'identifiant : il remplace, il ne duplique pas", async () => {
    const repo = make();
    await repo.save(snap());
    await repo.save(snap({ state: "accepted", updatedAt: "2026-08-30T09:05:00.000Z" }));
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].state).toBe("accepted");
  });

  it("trie du plus récemment modifié au plus ancien", async () => {
    const repo = make();
    await repo.save(snap({ id: "M-0001", updatedAt: "2026-08-30T09:00:00.000Z" }));
    await repo.save(snap({ id: "M-0002", updatedAt: "2026-08-30T10:00:00.000Z" }));
    expect((await repo.findAll()).map((m) => m.id)).toEqual(["M-0002", "M-0001"]);
  });

  it("filtre par incident, nature, état et entité destinataire", async () => {
    const repo = make();
    await repo.save(snap({ id: "M-0001" }));
    await repo.save(snap({ id: "M-0002", incidentId: "INC-2607", to: { role: "resp_unit", entity: "U5" } }));
    await repo.save(snap({ id: "M-0003", kind: "transfer", payload: { kind: "transfer", subject: "casualty", toEntity: "H4" } }));

    expect((await repo.findAll({ incidentId: "INC-2613" })).map((m) => m.id).sort()).toEqual(["M-0001", "M-0003"]);
    expect((await repo.findAll({ kind: "transfer" })).map((m) => m.id)).toEqual(["M-0003"]);
    expect((await repo.findAll({ toEntity: "U5" })).map((m) => m.id)).toEqual(["M-0002"]);
    expect((await repo.findAll({ state: "issued" }))).toHaveLength(3);
  });

  it("openOnly écarte les boucles closes", async () => {
    const repo = make();
    await repo.save(snap({ id: "M-0001", state: "issued" }));
    await repo.save(snap({ id: "M-0002", state: "in_progress" }));
    await repo.save(snap({ id: "M-0003", state: "declined" }));
    await repo.save(snap({ id: "M-0004", state: "completed" }));
    await repo.save(snap({ id: "M-0005", state: "cancelled" }));
    expect((await repo.findAll({ openOnly: true })).map((m) => m.id).sort()).toEqual(["M-0001", "M-0002"]);
  });

  it("lastSequence suit le plus grand numéro attribué, jamais le nombre d'éléments", async () => {
    const repo = make();
    expect(await repo.lastSequence()).toBe(0);
    await repo.save(snap({ id: "M-0007" }));
    await repo.save(snap({ id: "M-0003" }));
    // 7 et non 2 : après une purge, la séquence ne doit pas réattribuer un
    // identifiant déjà émis.
    expect(await repo.lastSequence()).toBe(7);
  });

  it("removeByIncident ne retire que l'incident visé et rend le compte", async () => {
    const repo = make();
    await repo.save(snap({ id: "M-0001", incidentId: "INC-2613" }));
    await repo.save(snap({ id: "M-0002", incidentId: "INC-2613" }));
    await repo.save(snap({ id: "M-0003", incidentId: "INC-2607" }));
    expect(await repo.removeByIncident("INC-2613")).toBe(2);
    expect((await repo.findAll()).map((m) => m.id)).toEqual(["M-0003"]);
  });
});
