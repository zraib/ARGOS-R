// ============================================================================
// ARGOS — adaptateur d'événements : journalisation
//
// Implémentation par défaut du port `MissionEventPublisher` : elle trace, sans
// rien produire d'observable ailleurs. C'est délibéré — brancher le module
// « missions » ne doit modifier aucun comportement existant tant que la
// phase P1 n'a pas branché la boucle sur le fil d'événements et sur le canal
// de l'incident.
//
// Diffuser réellement se fait en écrivant un autre adaptateur et en changeant
// UNE ligne de `missions.module.ts`. Ni le service ni le domaine ne bougent.
//
// Robustesse : `publish` n'échoue jamais. Un incident de diffusion ne doit pas
// faire échouer une transition déjà persistée.
// ============================================================================

import { Injectable, Logger } from "@nestjs/common";
import type { MissionEvent, MissionEventPublisher } from "@/modules/missions/ports/mission-events.port";

@Injectable()
export class LoggingMissionEventPublisher implements MissionEventPublisher {
  private readonly logger = new Logger("MissionEvents");

  async publish(event: MissionEvent): Promise<void> {
    try {
      const { id, kind, incidentId, state } = event.mission;
      this.logger.log(
        `${event.type} · ${id} (${kind}) · ${incidentId} · ${event.from ?? "—"} → ${state}` +
          (event.actor ? ` · par ${event.actor}` : ""),
      );
    } catch {
      /* la diffusion ne fait jamais échouer le métier */
    }
  }
}
