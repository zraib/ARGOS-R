import { Module } from "@nestjs/common";
import { DomainModule } from "@/modules/domain/domain.module";
import { NrbcService } from "@/modules/nrbc/nrbc.service";
import { NrbcController } from "@/modules/nrbc/http/nrbc.controller";
import { SUBSTANCE_CATALOG } from "@/modules/nrbc/ports/substance-catalog.port";
import { InMemorySubstancesRepository } from "@/modules/nrbc/infrastructure/in-memory-substances.repository";

// ============================================================================
// ARGOS — module NRBC : le SEUL endroit qui câble les adaptateurs
//
// Même architecture que le suivi aérien (ADR 0004) : le catalogue de
// substances vit derrière un port — remplacer le tableau seedé par une table
// Postgres tenue par l'état-major ne touchera pas une ligne du service.
// Le vent et les incidents viennent du DomainModule. Voir docs/adr/0005.
// ============================================================================

@Module({
  imports: [DomainModule],
  controllers: [NrbcController],
  providers: [NrbcService, { provide: SUBSTANCE_CATALOG, useClass: InMemorySubstancesRepository }],
  exports: [NrbcService],
})
export class NrbcModule {}
