// ============================================================================
// ARGOS — module « missions » : RACINE DE COMPOSITION
//
// Le SEUL endroit du module qui connaît à la fois les abstractions et leurs
// implémentations. Tout le reste ne manipule que des ports.
//
// À ce stade (lot S1 du plan d'exécution), le module est AUTONOME : il
// n'importe aucun autre module métier et n'est importé par aucun. L'adaptateur
// d'événements est volontairement passif — brancher les missions ne change
// donc aucun comportement existant. La phase P1 remplacera cette seule ligne
// par un adaptateur qui écrit dans le fil et dans le canal de l'incident.
// ============================================================================

import { Module } from "@nestjs/common";
import { MissionService } from "@/modules/missions/application/mission.service";
import { MissionsController } from "@/modules/missions/http/missions.controller";
import { MISSION_REPOSITORY } from "@/modules/missions/ports/mission-repository.port";
import { MISSION_CLOCK } from "@/modules/missions/ports/clock.port";
import { MISSION_ID_GENERATOR } from "@/modules/missions/ports/mission-id.port";
import { MISSION_EVENT_PUBLISHER } from "@/modules/missions/ports/mission-events.port";
import { InMemoryMissionRepository } from "@/modules/missions/infrastructure/in-memory-mission.repository";
import { SystemClock } from "@/modules/missions/infrastructure/system-clock";
import { SequentialMissionIdGenerator } from "@/modules/missions/infrastructure/sequential-mission-id.generator";
import { LoggingMissionEventPublisher } from "@/modules/missions/infrastructure/logging-mission-event.publisher";

@Module({
  controllers: [MissionsController],
  providers: [
    MissionService,
    { provide: MISSION_REPOSITORY, useClass: InMemoryMissionRepository },
    { provide: MISSION_CLOCK, useClass: SystemClock },
    { provide: MISSION_ID_GENERATOR, useClass: SequentialMissionIdGenerator },
    { provide: MISSION_EVENT_PUBLISHER, useClass: LoggingMissionEventPublisher },
  ],
  exports: [MissionService],
})
export class MissionsModule {}
