import { Module } from "@nestjs/common";
import { DomainService } from "@/modules/domain/domain.service";
import { CatalogService } from "@/modules/domain/catalog.service";
import { CommsService } from "@/modules/domain/comms.service";
import { IncidentTypesService } from "@/modules/domain/incident-types.service";
import { DomainController } from "@/modules/domain/domain.controller";

@Module({
  controllers: [DomainController],
  providers: [DomainService, CatalogService, CommsService, IncidentTypesService],
  exports: [DomainService, CatalogService, CommsService, IncidentTypesService],
})
export class DomainModule {}
