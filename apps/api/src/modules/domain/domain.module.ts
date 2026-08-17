import { Module } from "@nestjs/common";
import { DomainService } from "@/modules/domain/domain.service";
import { RiskService } from "@/modules/domain/risk.service";
import { CatalogService } from "@/modules/domain/catalog.service";
import { CommsService } from "@/modules/domain/comms.service";
import { IncidentTypesService } from "@/modules/domain/incident-types.service";
import { SubIncidentTypesService } from "@/modules/domain/sub-incident-types.service";
import { SeismicService } from "@/modules/domain/seismic.service";
import { SeismicAlertsService } from "@/modules/domain/seismic-alerts.service";
import { WeatherService } from "@/modules/domain/weather.service";
import { DomainController } from "@/modules/domain/domain.controller";

@Module({
  controllers: [DomainController],
  providers: [DomainService, RiskService, CatalogService, CommsService, IncidentTypesService, SubIncidentTypesService, SeismicService, SeismicAlertsService, WeatherService],
  exports: [DomainService, RiskService, CatalogService, CommsService, IncidentTypesService, SubIncidentTypesService, SeismicService, SeismicAlertsService, WeatherService],
})
export class DomainModule {}
