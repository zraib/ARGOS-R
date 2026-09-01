import { Module } from "@nestjs/common";
import { TrackingService } from "@/modules/tracking/tracking.service";
import { TrackingController } from "@/modules/tracking/http/tracking.controller";
import { TRACKER_REGISTRY } from "@/modules/tracking/ports/tracker-registry.port";
import { InMemoryTrackerRepository } from "@/modules/tracking/infrastructure/in-memory-tracker.repository";
import { Fmc920TcpServer } from "@/modules/tracking/infrastructure/fmc920.tcp-server";

// ============================================================================
// ARGOS — module de suivi des traceurs FMC920 (lot N-2)
//
// Le `useClass` est le SEUL endroit à changer pour passer du dépôt in-memory à
// une implémentation Drizzle/Postgres : ni le service, ni le contrôleur, ni
// l'écouteur TCP n'en sauront rien (ADR 0004).
// ============================================================================

@Module({
  controllers: [TrackingController],
  providers: [
    TrackingService,
    { provide: TRACKER_REGISTRY, useClass: InMemoryTrackerRepository },
    Fmc920TcpServer,
  ],
  exports: [TrackingService],
})
export class TrackingModule {}
