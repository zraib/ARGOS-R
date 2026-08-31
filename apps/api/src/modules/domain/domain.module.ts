import { Module } from "@nestjs/common";
import { IamModule } from "@/modules/iam/iam.module";
import { DomainService } from "@/modules/domain/domain.service";
import { VisibilityService } from "@/modules/domain/visibility.service";
import { RiskService } from "@/modules/domain/risk.service";
import { CatalogService } from "@/modules/domain/catalog.service";
import { CommsService } from "@/modules/domain/comms.service";
import { IncidentTypesService } from "@/modules/domain/incident-types.service";
import { SubIncidentTypesService } from "@/modules/domain/sub-incident-types.service";
import { SeismicService } from "@/modules/domain/seismic.service";
import { SeismicAlertsService } from "@/modules/domain/seismic-alerts.service";
import { WeatherService } from "@/modules/domain/weather.service";
import { DeploymentService } from "@/modules/domain/deployment.service";
import { DomainController } from "@/modules/domain/domain.controller";

@Module({
  // Le déploiement écrit dans le REGISTRE DES COMPTES : le domaine a donc besoin
  // de l'IAM. Le sens inverse n'existe pas (`IamModule` n'importe pas le
  // domaine), donc pas de cycle et pas de `forwardRef`.
  imports: [IamModule],
  controllers: [DomainController],
  providers: [DomainService, VisibilityService, DeploymentService, RiskService, CatalogService, CommsService, IncidentTypesService, SubIncidentTypesService, SeismicService, SeismicAlertsService, WeatherService],
  exports: [DomainService, VisibilityService, DeploymentService, RiskService, CatalogService, CommsService, IncidentTypesService, SubIncidentTypesService, SeismicService, SeismicAlertsService, WeatherService],
})
export class DomainModule {}
