import { Test } from "@nestjs/testing";
import { CommsService } from "@/modules/domain/comms.service";
import { DomainService } from "@/modules/domain/domain.service";
import { CatalogService } from "@/modules/domain/catalog.service";
import { OperationalMissionEventPublisher } from "@/modules/missions/infrastructure/operational-mission-event.publisher";
import type { MissionSnapshot } from "@/modules/missions/domain/mission";
import type { MissionEvent } from "@/modules/missions/ports/mission-events.port";

// ============================================================================
// ARGOS — ce que la boucle rend VISIBLE (lot P1-a)
//
// Le lot S1 laissait les missions inertes. Ce test verrouille les trois effets
// qui les rendent visibles au commandement : la ligne de fil, le message dans
// le canal de l'incident, et la posture de l'unité qui suit ses jalons au lieu
// d'être ressaisie à la main.
// ============================================================================

function snap(over: Partial<MissionSnapshot> = {}): MissionSnapshot {
  return {
    id: "M-0001",
    kind: "order",
    incidentId: "INC-2613",
    label: "3e BG — renfort sur zone",
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

const ev = (type: MissionEvent["type"], mission: MissionSnapshot): MissionEvent => ({
  type,
  mission,
  at: "2026-08-30T09:00:00.000Z",
});

async function build() {
  const mod = await Test.createTestingModule({
    providers: [DomainService, CatalogService, CommsService, OperationalMissionEventPublisher],
  }).compile();
  return {
    publisher: mod.get(OperationalMissionEventPublisher),
    domain: mod.get(DomainService),
    comms: mod.get(CommsService),
  };
}

describe("Publieur opérationnel — la boucle devient visible", () => {
  it("inscrit chaque transition dans le fil du poste de commandement", async () => {
    const { publisher, domain } = await build();
    const before = domain.listFeed().length;
    await publisher.publish(ev("mission.issued", snap()));
    const feed = domain.listFeed();
    expect(feed.length).toBe(before + 1);
    expect(feed[0].txt).toContain("M-0001");
    expect(feed[0].txt).toContain("ORDRE ÉMIS");
  });

  it("poste un message système dans le canal de l'incident — créé au besoin", async () => {
    const { publisher, comms } = await build();
    await publisher.publish(ev("mission.accepted", snap({ state: "accepted" })));
    const chan = comms.channelForIncident("INC-2613");
    // Sans titre connu, le canal porte la référence telle quelle (ADR 0021).
    expect(chan.name).toBe("INC-2613");
    const msgs = comms.all().messages[chan.id];
    expect(msgs[msgs.length - 1].txt).toContain("ACCUSÉ RÉCEPTION");
    // Message de la plateforme, pas de l'opérateur.
    expect(msgs[msgs.length - 1].mine).toBe(false);
  });

  it("porte le motif d'un refus jusque dans le fil — c'est ce qui le rend exploitable", async () => {
    const { publisher, domain } = await build();
    await publisher.publish(ev("mission.declined", snap({ state: "declined", reason: "Unité déjà engagée sur INC-2607" })));
    expect(domain.listFeed()[0].txt).toContain("Unité déjà engagée sur INC-2607");
  });

  it("la posture de l'unité SUIT les jalons au lieu d'être ressaisie", async () => {
    const { publisher, domain } = await build();
    const unit = domain.listUnits()[0];

    await publisher.publish(ev("mission.accepted", snap({ state: "accepted", payload: { kind: "order", unitId: unit.id } })));
    expect(domain.listUnits().find((u) => u.id === unit.id)?.dispo).toBe("standby");

    await publisher.publish(ev("mission.milestone", snap({
      state: "in_progress",
      milestones: [{ key: "en_route", at: "2026-08-30T09:03:00.000Z", by: "r.u2" }],
      payload: { kind: "order", unitId: unit.id },
    })));
    expect(domain.listUnits().find((u) => u.id === unit.id)?.dispo).toBe("deployed");

    await publisher.publish(ev("mission.completed", snap({ state: "completed", payload: { kind: "order", unitId: unit.id } })));
    expect(domain.listUnits().find((u) => u.id === unit.id)?.dispo).toBe("ready");
  });

  it("un transfert ne touche à la posture d'aucune unité", async () => {
    const { publisher, domain } = await build();
    const before = domain.listUnits().map((u) => u.dispo);
    await publisher.publish(ev("mission.accepted", snap({
      kind: "transfer",
      payload: { kind: "transfer", subject: "casualty", toEntity: "H1", triage: "red" },
    })));
    expect(domain.listUnits().map((u) => u.dispo)).toEqual(before);
  });

  // --- Chaîne des personnes (lot P2-b) ------------------------------------

  it("EVASAN acceptée : le lit est RÉSERVÉ, pas encore occupé", async () => {
    const { publisher, domain } = await build();
    const h = domain.listHospitals()[0];
    const occAvant = h.occ;

    await publisher.publish(ev("mission.accepted", snap({
      kind: "transfer", state: "accepted",
      payload: { kind: "transfer", subject: "casualty", toEntity: h.id, triage: "red" },
    })));

    const apres = domain.listHospitals().find((x) => x.id === h.id)!;
    expect(apres.reserved).toBe(1);
    // La réservation ne consomme rien : l'occupation ne bouge qu'à l'arrivée.
    expect(apres.occ).toBe(occAvant);
  });

  it("arrivée confirmée : la réservation devient occupation", async () => {
    const { publisher, domain } = await build();
    const h = domain.listHospitals()[0];
    const occAvant = h.occ;
    const base = snap({
      kind: "transfer",
      payload: { kind: "transfer", subject: "casualty", toEntity: h.id, triage: "red" },
    });

    await publisher.publish(ev("mission.accepted", { ...base, state: "accepted" }));
    await publisher.publish(ev("mission.completed", { ...base, state: "completed" }));

    const apres = domain.listHospitals().find((x) => x.id === h.id)!;
    expect(apres.reserved).toBe(0);
    expect(apres.occ).toBe(occAvant + 1);
  });

  it("EVASAN refusée APRÈS acceptation : le lit est rendu", async () => {
    const { publisher, domain } = await build();
    const h = domain.listHospitals()[0];
    const base = snap({
      kind: "transfer",
      payload: { kind: "transfer", subject: "casualty", toEntity: h.id, triage: "yellow" },
    });

    await publisher.publish(ev("mission.accepted", { ...base, state: "accepted" }));
    expect(domain.listHospitals().find((x) => x.id === h.id)!.reserved).toBe(1);

    await publisher.publish({
      ...ev("mission.cancelled", { ...base, state: "cancelled", reason: "patient décédé sur place" }),
      from: "accepted",
    });
    expect(domain.listHospitals().find((x) => x.id === h.id)!.reserved).toBe(0);
  });

  it("refus d'une EVASAN JAMAIS acceptée : rien à rendre, aucun compteur négatif", async () => {
    const { publisher, domain } = await build();
    const h = domain.listHospitals()[0];
    await publisher.publish({
      ...ev("mission.declined", snap({
        kind: "transfer", state: "declined", reason: "aucun lit de réanimation",
        payload: { kind: "transfer", subject: "casualty", toEntity: h.id, triage: "red" },
      })),
      from: "issued",
    });
    const apres = domain.listHospitals().find((x) => x.id === h.id)!;
    expect(apres.reserved ?? 0).toBe(0);
  });

  it("décès accepté : le registre DVI est PRÉ-REMPLI, relié à son incident", async () => {
    const { publisher, domain } = await build();
    const morgue = domain.listMorgues()[0];
    const avant = domain.listMortuaryRecords(morgue.id).length;

    await publisher.publish(ev("mission.accepted", snap({
      id: "M-0042", kind: "transfer", state: "accepted", incidentId: "INC-2613",
      payload: { kind: "transfer", subject: "body", toEntity: morgue.id, fromEntity: "H1" },
    })));

    const recs = domain.listMortuaryRecords(morgue.id);
    expect(recs).toHaveLength(avant + 1);
    const rec = recs.find((r) => r.reference === "AH-M-0042")!;
    expect(rec).toBeDefined();
    // Relié à l'incident d'origine : c'est ce qui manquait à la saisie vierge.
    expect(rec.incidentId).toBe("INC-2613");
    expect(rec.foundAt).toBe("H1");
    expect(rec.status).toBe("unidentified");
  });

  it("une diffusion qui échoue ne remonte JAMAIS d'erreur au métier", async () => {
    const { publisher } = await build();
    // Mission volontairement malformée : le publieur doit encaisser.
    await expect(
      publisher.publish(ev("mission.issued", snap({ incidentId: undefined as unknown as string }))),
    ).resolves.toBeUndefined();
  });
});
