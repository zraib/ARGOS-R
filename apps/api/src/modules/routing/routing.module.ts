import { Module } from "@nestjs/common";
import { DomainModule } from "@/modules/domain/domain.module";
import { NrbcModule } from "@/modules/nrbc/nrbc.module";
import { RoutingController } from "@/modules/routing/http/routing.controller";
import { ValhallaEngine } from "@/modules/routing/infrastructure/valhalla.engine";
import { ROUTING_ENGINE } from "@/modules/routing/ports/routing-engine.port";
import { RoutingService } from "@/modules/routing/routing.service";

// ============================================================================
// ARGOS — module de routage sûr : le SEUL endroit qui câble le moteur
//
// Les obstacles viennent du domaine (croquis marqués « obstacle »), les zones
// du module NRBC (panaches), l'itinéraire du moteur auto-hébergé derrière son
// port. Voir docs/adr/0039.
// ============================================================================

@Module({
  imports: [DomainModule, NrbcModule],
  controllers: [RoutingController],
  providers: [RoutingService, { provide: ROUTING_ENGINE, useClass: ValhallaEngine }],
})
export class RoutingModule {}
