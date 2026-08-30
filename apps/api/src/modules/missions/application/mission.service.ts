// ============================================================================
// ARGOS — service applicatif des missions
//
// COUCHE APPLICATION : elle orchestre le domaine et les ports, sans connaître
// aucun détail technique. Elle n'importe ni Drizzle, ni un DTO HTTP, ni le fil
// d'événements — uniquement le domaine et les quatre ports du module.
//
// Le service ne décide JAMAIS qui a le droit de faire quoi sur une mission :
// cette règle appartient à l'agrégat (`accept` refuse un acteur qui n'est pas
// le destinataire). Le service se contente de lui transmettre l'acteur issu de
// la session. Deux gardes valent mieux qu'une : le RBAC filtre à l'entrée du
// contrôleur, le domaine tranche sur la mission elle-même.
// ============================================================================

import { Inject, Injectable } from "@nestjs/common";
import {
  Mission,
  type MissionActor,
  type MissionMilestoneKey,
  type MissionSnapshot,
  type NewMissionProps,
} from "@/modules/missions/domain/mission";
import { MissionNotFoundError } from "@/modules/missions/domain/mission-errors";
import { MISSION_CLOCK, type Clock } from "@/modules/missions/ports/clock.port";
import { MISSION_ID_GENERATOR, type MissionIdGenerator } from "@/modules/missions/ports/mission-id.port";
import {
  MISSION_EVENT_PUBLISHER,
  type MissionEvent,
  type MissionEventPublisher,
} from "@/modules/missions/ports/mission-events.port";
import {
  MISSION_REPOSITORY,
  type MissionQuery,
  type MissionRepository,
} from "@/modules/missions/ports/mission-repository.port";

/** Émission d'une mission — l'identifiant est attribué par le générateur. */
export type IssueMissionInput = Omit<NewMissionProps, "id">;

@Injectable()
export class MissionService {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly repo: MissionRepository,
    @Inject(MISSION_CLOCK) private readonly clock: Clock,
    @Inject(MISSION_ID_GENERATOR) private readonly ids: MissionIdGenerator,
    @Inject(MISSION_EVENT_PUBLISHER) private readonly events: MissionEventPublisher,
  ) {}

  /** Ouvre une boucle : émet une mission vers son destinataire. */
  async issue(input: IssueMissionInput, actor?: string): Promise<MissionSnapshot> {
    const id = await this.ids.next();
    const mission = Mission.issue({ ...input, id }, this.clock.now());
    return this.persistAndPublish(mission, "mission.issued", undefined, actor);
  }

  /** Le destinataire accuse réception. */
  async accept(id: string, actor: MissionActor): Promise<MissionSnapshot> {
    const { mission, before } = await this.load(id);
    mission.accept(actor, this.clock.now());
    return this.persistAndPublish(mission, "mission.accepted", before, actor.userId);
  }

  /** Le destinataire refuse, motif obligatoire. */
  async decline(id: string, actor: MissionActor, reason: string): Promise<MissionSnapshot> {
    const { mission, before } = await this.load(id);
    mission.decline(actor, reason, this.clock.now());
    return this.persistAndPublish(mission, "mission.declined", before, actor.userId);
  }

  /** Le destinataire franchit un jalon d'exécution. */
  async milestone(id: string, actor: MissionActor, key: MissionMilestoneKey): Promise<MissionSnapshot> {
    const { mission, before } = await this.load(id);
    mission.reachMilestone(actor, key, this.clock.now());
    return this.persistAndPublish(mission, "mission.milestone", before, actor.userId);
  }

  /** Le destinataire clôt la boucle. */
  async complete(id: string, actor: MissionActor): Promise<MissionSnapshot> {
    const { mission, before } = await this.load(id);
    mission.complete(actor, this.clock.now());
    return this.persistAndPublish(mission, "mission.completed", before, actor.userId);
  }

  /** L'émetteur annule, motif obligatoire. */
  async cancel(id: string, actor: MissionActor, reason: string): Promise<MissionSnapshot> {
    const { mission, before } = await this.load(id);
    mission.cancel(actor, reason, this.clock.now());
    return this.persistAndPublish(mission, "mission.cancelled", before, actor.userId);
  }

  /** Missions correspondant aux critères. */
  async list(query: MissionQuery = {}): Promise<MissionSnapshot[]> {
    return this.repo.findAll(query);
  }

  /** Une mission par son identifiant. Lève si elle n'existe pas. */
  async byId(id: string): Promise<MissionSnapshot> {
    const s = await this.repo.findById(id);
    if (!s) throw new MissionNotFoundError(id);
    return s;
  }

  /**
   * Boucles ouvertes ATTENDANT un geste de cet acteur — ce que l'écran
   * « Ordres reçus » affiche, et ce que compte la pastille de la barre haute.
   */
  async inbox(actor: MissionActor): Promise<MissionSnapshot[]> {
    const open = await this.repo.findAll({ openOnly: true });
    return open.filter((s) => Mission.restore(s).isFor(actor));
  }

  /** Boucles ouvertes ÉMISES par cet acteur — le suivi de ce qu'il a demandé. */
  async outbox(actor: MissionActor): Promise<MissionSnapshot[]> {
    const open = await this.repo.findAll({ openOnly: true });
    return open.filter((s) => Mission.restore(s).isFrom(actor));
  }

  /**
   * Annule en masse les boucles d'un incident (suppression de l'incident par
   * le superadmin — lot G2). Le geste est systémique : il contourne la règle
   * d'acteur mais respecte la machine d'états (une mission close le reste).
   */
  async cancelAllForIncident(incidentId: string, reason: string, actor?: string): Promise<number> {
    const open = await this.repo.findAll({ incidentId, openOnly: true });
    for (const s of open) {
      const mission = Mission.restore(s);
      mission.cancelBySystem(reason, this.clock.now());
      await this.persistAndPublish(mission, "mission.cancelled", s.state, actor);
    }
    return open.length;
  }

  /** Purge définitive des missions d'un incident supprimé (cascade G2). */
  async purgeIncident(incidentId: string): Promise<number> {
    return this.repo.removeByIncident(incidentId);
  }

  /** Charge un agrégat et retient son état d'avant, pour l'événement. */
  private async load(id: string): Promise<{ mission: Mission; before: MissionSnapshot["state"] }> {
    const snapshot = await this.repo.findById(id);
    if (!snapshot) throw new MissionNotFoundError(id);
    return { mission: Mission.restore(snapshot), before: snapshot.state };
  }

  /**
   * Persiste PUIS publie : l'ordre compte. Un abonné ne doit jamais observer
   * un événement dont l'effet n'est pas encore enregistré.
   */
  private async persistAndPublish(
    mission: Mission,
    type: MissionEvent["type"],
    from: MissionSnapshot["state"] | undefined,
    actor: string | undefined,
  ): Promise<MissionSnapshot> {
    const snapshot = mission.snapshot();
    await this.repo.save(snapshot);
    await this.events.publish({
      type,
      mission: snapshot,
      ...(from ? { from } : {}),
      ...(actor ? { actor } : {}),
      at: this.clock.now().toISOString(),
    });
    return snapshot;
  }
}
