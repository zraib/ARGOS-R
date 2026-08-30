// ============================================================================
// ARGOS — adaptateur d'événements ACTIF : la boucle devient visible
//
// Remplace le publieur passif du lot S1. C'est la SEULE pièce qui relie les
// missions au reste de la plateforme, et elle vit dans l'infrastructure —
// couche la plus externe. Le service et le domaine ne savent toujours rien
// du fil d'événements, des canaux ni des unités.
//
// Trois effets, tous secondaires au sens strict : la mission est déjà
// persistée quand ils se produisent.
//   1. une ligne dans le FIL d'événements du poste de commandement ;
//   2. un message SYSTÈME dans le canal de l'incident ;
//   3. la POSTURE de l'unité, dérivée des jalons (fin de la double saisie).
//
// Robustesse : `publish` n'échoue jamais. Un incident de diffusion ne doit pas
// faire échouer une transition déjà enregistrée.
// ============================================================================

import { Injectable, Logger } from "@nestjs/common";
import { CommsService } from "@/modules/domain/comms.service";
import { DomainService } from "@/modules/domain/domain.service";
import type { MissionEvent, MissionEventPublisher } from "@/modules/missions/ports/mission-events.port";

/** Libellé lisible de la transition, pour le fil et le canal. */
const LABEL: Record<MissionEvent["type"], string> = {
  "mission.issued": "ORDRE ÉMIS",
  "mission.accepted": "ACCUSÉ RÉCEPTION",
  "mission.declined": "REFUSÉE",
  "mission.milestone": "JALON",
  "mission.completed": "TERMINÉE",
  "mission.cancelled": "ANNULÉE",
};

/** Couleur de pastille du fil, alignée sur la gravité de la transition. */
const TINT: Record<MissionEvent["type"], string> = {
  "mission.issued": "bg-or-500",
  "mission.accepted": "bg-green-500",
  "mission.declined": "bg-danger-500",
  "mission.milestone": "bg-blue-500",
  "mission.completed": "bg-green-500",
  "mission.cancelled": "bg-danger-500",
};

@Injectable()
export class OperationalMissionEventPublisher implements MissionEventPublisher {
  private readonly logger = new Logger("MissionEvents");

  constructor(
    private readonly domain: DomainService,
    private readonly comms: CommsService,
  ) {}

  async publish(event: MissionEvent): Promise<void> {
    try {
      const { mission } = event;
      const last = mission.milestones[mission.milestones.length - 1];
      const detail = event.type === "mission.milestone" && last ? ` · ${last.key}` : "";
      const reason = mission.reason ? ` — ${mission.reason}` : "";
      const txt = `${mission.id} · ${LABEL[event.type]}${detail} — ${mission.label}${reason}`;

      this.domain.pushFeed(txt, TINT[event.type]);
      this.comms.postSystem(mission.incidentId, txt);
      this.syncUnitPosture(event);
    } catch (e) {
      // La diffusion ne fait jamais échouer le métier — mais elle se signale.
      this.logger.warn(`Diffusion de ${event.type} impossible : ${(e as Error).message}`);
    }
  }

  /**
   * Posture de l'unité dérivée des jalons.
   *
   * Avant, un responsable devait passer son unité en « déployée » à la main
   * alors qu'il venait de déclarer « en route » : deux saisies pour un seul
   * fait. La posture suit désormais la boucle. Elle reste modifiable
   * manuellement — le terrain prime sur le modèle — mais un jalon la réaligne.
   */
  private syncUnitPosture(event: MissionEvent): void {
    const { mission } = event;
    if (mission.payload.kind !== "order") return;
    const unitId = mission.payload.unitId;
    if (!unitId) return;

    const dispo =
      event.type === "mission.milestone" ? "deployed" :
      event.type === "mission.accepted" ? "standby" :
      event.type === "mission.completed" || event.type === "mission.declined" || event.type === "mission.cancelled"
        ? "ready"
        : null;
    if (dispo) this.domain.updateUnit(unitId, { dispo });
  }
}
