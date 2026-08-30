// ============================================================================
// ARGOS — module « missions » : RACINE DE COMPOSITION
//
// Le SEUL endroit du module qui connaît à la fois les abstractions et leurs
// implémentations. Tout le reste ne manipule que des ports.
//
// Depuis le lot P1-a, l'adaptateur d'événements est ACTIF : chaque transition
// s'inscrit dans le fil du poste de commandement et dans le canal de
// l'incident, et la posture de l'unité suit ses jalons. C'est UNE seule ligne
// de cette racine qui a changé (`MISSION_EVENT_PUBLISHER`) — ni le service, ni
// le domaine, ni le contrôleur n'ont bougé. C'était tout l'intérêt du port.
//
// La dépendance va missions → domain, jamais l'inverse : le module domaine
// ignore les missions, ce qui évite le cycle.
// ============================================================================

import { Module } from "@nestjs/common";
import { DomainModule } from "@/modules/domain/domain.module";
import { MissionService } from "@/modules/missions/application/mission.service";
import { MissionsController } from "@/modules/missions/http/missions.controller";
import { MISSION_REPOSITORY } from "@/modules/missions/ports/mission-repository.port";
import { MISSION_CLOCK } from "@/modules/missions/ports/clock.port";
import { MISSION_ID_GENERATOR } from "@/modules/missions/ports/mission-id.port";
import { MISSION_EVENT_PUBLISHER } from "@/modules/missions/ports/mission-events.port";
import { InMemoryMissionRepository } from "@/modules/missions/infrastructure/in-memory-mission.repository";
import { SystemClock } from "@/modules/missions/infrastructure/system-clock";
import { SequentialMissionIdGenerator } from "@/modules/missions/infrastructure/sequential-mission-id.generator";
import { OperationalMissionEventPublisher } from "@/modules/missions/infrastructure/operational-mission-event.publisher";

@Module({
  imports: [DomainModule],
  controllers: [MissionsController],
  providers: [
    MissionService,
    { provide: MISSION_REPOSITORY, useClass: InMemoryMissionRepository },
    { provide: MISSION_CLOCK, useClass: SystemClock },
    { provide: MISSION_ID_GENERATOR, useClass: SequentialMissionIdGenerator },
    { provide: MISSION_EVENT_PUBLISHER, useClass: OperationalMissionEventPublisher },
  ],
  exports: [MissionService],
})
export class MissionsModule {}
