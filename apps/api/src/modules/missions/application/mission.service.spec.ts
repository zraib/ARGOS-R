import { MissionService } from "@/modules/missions/application/mission.service";
import { InMemoryMissionRepository } from "@/modules/missions/infrastructure/in-memory-mission.repository";
import { SequentialMissionIdGenerator } from "@/modules/missions/infrastructure/sequential-mission-id.generator";
import type { MissionActor, MissionPayload } from "@/modules/missions/domain/mission";
import type { Clock } from "@/modules/missions/ports/clock.port";
import type { MissionEvent, MissionEventPublisher } from "@/modules/missions/ports/mission-events.port";

// ============================================================================
// ARGOS — la boucle fermée, vérifiée geste par geste
//
// Ce que ces tests protègent : la promesse « aucune action sans réponse ».
// Si la poignée de main peut être contournée — si n'importe qui peut accepter
// à la place du destinataire, si un refus peut passer sans motif, si un jalon
// peut être franchi avant acceptation — alors l'état affiché à l'état-major
// ne prouve plus rien. C'est exactement ce qui est testé ici.
// ============================================================================

/** Horloge figée : les horodatages deviennent vérifiables au caractère près. */
class FrozenClock implements Clock {
  constructor(private t = new Date("2026-08-30T09:00:00.000Z")) {}
  now(): Date {
    return this.t;
  }
  shortLabel(): string {
    return "09:00";
  }
  advance(minutes: number): void {
    this.t = new Date(this.t.getTime() + minutes * 60_000);
  }
}

/** Publieur espion : on vérifie ce que le service annonce, pas ce qu'il en fait. */
class SpyPublisher implements MissionEventPublisher {
  readonly events: MissionEvent[] = [];
  async publish(e: MissionEvent): Promise<void> {
    this.events.push(e);
  }
}

const TACOM: MissionActor = { userId: "c.tacom", role: "tacom" };
const RESP_U2: MissionActor = { userId: "r.u2", role: "resp_unit", entity: "U2" };
const RESP_U5: MissionActor = { userId: "r.u5", role: "resp_unit", entity: "U5" };

const ORDER_PAYLOAD: MissionPayload = { kind: "order", unitId: "U2", etaMin: 34 };

function build() {
  const repo = new InMemoryMissionRepository();
  // Le dépôt in-memory relit l'instantané de dev : on repart d'une ardoise
  // propre pour que les tests ne dépendent pas d'une exécution précédente.
  (repo as unknown as { missions: unknown[] }).missions = [];
  const clock = new FrozenClock();
  const events = new SpyPublisher();
  const service = new MissionService(repo, clock, new SequentialMissionIdGenerator(repo), events);
  return { service, repo, clock, events };
}

/** Émet un ordre TACOM → responsable de l'unité U2. */
async function issueOrder(service: MissionService) {
  return service.issue(
    {
      incidentId: "INC-2613",
      label: "1er GI — renfort sur zone",
      from: { role: "tacom", userId: "c.tacom" },
      to: { role: "resp_unit", entity: "U2" },
      payload: ORDER_PAYLOAD,
    },
    "c.tacom",
  );
}

describe("MissionService — le cycle nominal", () => {
  it("émet une boucle ouverte, numérotée et ancrée à son incident", async () => {
    const { service } = build();
    const m = await issueOrder(service);
    expect(m.id).toBe("M-0001");
    expect(m.state).toBe("issued");
    expect(m.incidentId).toBe("INC-2613");
    expect(m.milestones).toEqual([]);
  });

  it("déroule accepté → en route → sur zone → terminé", async () => {
    const { service, clock } = build();
    const { id } = await issueOrder(service);

    expect((await service.accept(id, RESP_U2)).state).toBe("accepted");
    clock.advance(3);
    // Le premier jalon fait passer en exécution : l'état découle du terrain.
    const enRoute = await service.milestone(id, RESP_U2, "en_route");
    expect(enRoute.state).toBe("in_progress");
    expect(enRoute.milestones.map((x) => x.key)).toEqual(["en_route"]);

    clock.advance(20);
    const onSite = await service.milestone(id, RESP_U2, "on_site");
    expect(onSite.milestones.map((x) => x.key)).toEqual(["en_route", "on_site"]);
    expect(onSite.state).toBe("in_progress");

    const done = await service.complete(id, RESP_U2);
    expect(done.state).toBe("completed");
    // Les jalons portent l'auteur et l'heure : la trace est exploitable.
    expect(done.milestones[0].by).toBe("r.u2");
    expect(done.milestones[0].at).toBe("2026-08-30T09:03:00.000Z");
  });

  it("numérote les missions en séquence continue", async () => {
    const { service } = build();
    await issueOrder(service);
    await issueOrder(service);
    const third = await issueOrder(service);
    expect(third.id).toBe("M-0003");
  });
});

describe("MissionService — la poignée de main ne se contourne pas", () => {
  it("un tiers ne peut PAS accepter à la place du destinataire", async () => {
    const { service } = build();
    const { id } = await issueOrder(service);
    // U5 est un responsable d'unité légitime — mais pas CELUI de la mission.
    await expect(service.accept(id, RESP_U5)).rejects.toThrow(/destinataire/i);
  });

  it("l'émetteur lui-même ne peut pas accepter sa propre demande", async () => {
    const { service } = build();
    const { id } = await issueOrder(service);
    await expect(service.accept(id, TACOM)).rejects.toThrow(/destinataire/i);
  });

  it("seul l'émetteur annule — le destinataire ne le peut pas", async () => {
    const { service } = build();
    const { id } = await issueOrder(service);
    await expect(service.cancel(id, RESP_U2, "plus nécessaire")).rejects.toThrow(/émetteur/i);
    const cancelled = await service.cancel(id, TACOM, "incident clos");
    expect(cancelled.state).toBe("cancelled");
    expect(cancelled.reason).toBe("incident clos");
  });

  it("un refus SANS motif est rejeté — le motif est ce qui rend le refus exploitable", async () => {
    const { service } = build();
    const { id } = await issueOrder(service);
    await expect(service.decline(id, RESP_U2, "   ")).rejects.toThrow(/motif/i);
    const declined = await service.decline(id, RESP_U2, "Unité déjà engagée sur INC-2607");
    expect(declined.state).toBe("declined");
    expect(declined.reason).toBe("Unité déjà engagée sur INC-2607");
  });
});

describe("MissionService — la machine d'états tient", () => {
  it("refuse un jalon avant acceptation", async () => {
    const { service } = build();
    const { id } = await issueOrder(service);
    await expect(service.milestone(id, RESP_U2, "en_route")).rejects.toThrow(/acceptée/i);
  });

  it("refuse le même jalon deux fois", async () => {
    const { service } = build();
    const { id } = await issueOrder(service);
    await service.accept(id, RESP_U2);
    await service.milestone(id, RESP_U2, "en_route");
    await expect(service.milestone(id, RESP_U2, "en_route")).rejects.toThrow(/déjà franchi/i);
  });

  it("une boucle close ne rouvre pas", async () => {
    const { service } = build();
    const { id } = await issueOrder(service);
    await service.decline(id, RESP_U2, "indisponible");
    await expect(service.accept(id, RESP_U2)).rejects.toThrow(/close/i);
    await expect(service.cancel(id, TACOM, "trop tard")).rejects.toThrow(/close/i);
  });

  it("une mission inconnue lève une erreur nommée", async () => {
    const { service } = build();
    await expect(service.accept("M-9999", RESP_U2)).rejects.toThrow(/introuvable/i);
  });
});

describe("MissionService — les corbeilles alimentent les écrans", () => {
  it("l'inbox ne montre au destinataire QUE ce qui attend son geste", async () => {
    const { service } = build();
    await issueOrder(service);
    // Une seconde mission, pour une autre unité.
    await service.issue({
      incidentId: "INC-2613",
      label: "5e BS — appui",
      from: { role: "tacom", userId: "c.tacom" },
      to: { role: "resp_unit", entity: "U5" },
      payload: { kind: "order", unitId: "U5" },
    });

    const forU2 = await service.inbox(RESP_U2);
    expect(forU2).toHaveLength(1);
    expect(forU2[0].payload).toMatchObject({ unitId: "U2" });

    const forU5 = await service.inbox(RESP_U5);
    expect(forU5.map((m) => m.id)).toEqual(["M-0002"]);
  });

  it("une boucle close sort de l'inbox", async () => {
    const { service } = build();
    const { id } = await issueOrder(service);
    expect(await service.inbox(RESP_U2)).toHaveLength(1);
    await service.accept(id, RESP_U2);
    expect(await service.inbox(RESP_U2)).toHaveLength(1); // acceptée = toujours ouverte
    await service.complete(id, RESP_U2);
    expect(await service.inbox(RESP_U2)).toHaveLength(0);
  });

  it("l'outbox suit ce que l'émetteur a demandé", async () => {
    const { service } = build();
    await issueOrder(service);
    const mine = await service.outbox(TACOM);
    expect(mine).toHaveLength(1);
    expect(await service.outbox(RESP_U2)).toHaveLength(0);
  });
});

describe("MissionService — cascade de suppression d'incident (lot G2)", () => {
  it("annule les boucles ouvertes de l'incident, et d'aucun autre", async () => {
    const { service } = build();
    await issueOrder(service);
    await service.issue({
      incidentId: "INC-2607",
      label: "Autre incident",
      from: { role: "tacom", userId: "c.tacom" },
      to: { role: "resp_unit", entity: "U5" },
      payload: { kind: "order", unitId: "U5" },
    });

    const n = await service.cancelAllForIncident("INC-2613", "incident supprimé", "s.admin");
    expect(n).toBe(1);
    expect((await service.list({ incidentId: "INC-2613" }))[0].state).toBe("cancelled");
    expect((await service.list({ incidentId: "INC-2607" }))[0].state).toBe("issued");
  });

  it("la purge retire définitivement les missions de l'incident", async () => {
    const { service } = build();
    await issueOrder(service);
    expect(await service.purgeIncident("INC-2613")).toBe(1);
    expect(await service.list({ incidentId: "INC-2613" })).toHaveLength(0);
  });
});

describe("MissionService — ce que le service annonce", () => {
  it("publie un événement par transition, avec l'état précédent et l'auteur", async () => {
    const { service, events } = build();
    const { id } = await issueOrder(service);
    await service.accept(id, RESP_U2);
    await service.milestone(id, RESP_U2, "en_route");

    expect(events.events.map((e) => e.type)).toEqual([
      "mission.issued",
      "mission.accepted",
      "mission.milestone",
    ]);
    expect(events.events[1].from).toBe("issued");
    expect(events.events[1].actor).toBe("r.u2");
  });

  it("persiste AVANT de publier : un abonné ne voit jamais un effet non enregistré", async () => {
    const { repo, clock } = build();
    const seen: string[] = [];
    const publisher: MissionEventPublisher = {
      async publish(e) {
        // Au moment de la diffusion, la mission doit déjà être en dépôt.
        seen.push((await repo.findById(e.mission.id))?.state ?? "ABSENTE");
      },
    };
    const service = new MissionService(repo, clock, new SequentialMissionIdGenerator(repo), publisher);
    const { id } = await issueOrder(service);
    await service.accept(id, RESP_U2);
    expect(seen).toEqual(["issued", "accepted"]);
  });
});
