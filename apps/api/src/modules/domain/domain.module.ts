import { Module } from "@nestjs/common";
import { NOTIFICATION_GATEWAY } from "@/common/ports/notification-gateway.port";
import { LogNotificationGateway } from "@/common/notifications/log-notification.gateway";
import { SmtpNotificationGateway, smtpConfigFromEnv } from "@/common/notifications/smtp-notification.gateway";
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
import { IncidentsController } from "@/modules/domain/http/incidents.controller";
import { CommsController } from "@/modules/domain/http/comms.controller";
import { ResourcesController } from "@/modules/domain/http/resources.controller";
import { HospitalsController } from "@/modules/domain/http/hospitals.controller";
import { DashboardController } from "@/modules/domain/http/dashboard.controller";
import { EnvironmentController } from "@/modules/domain/http/environment.controller";
import { NoticesService } from "@/modules/domain/notices.service";

@Module({
  // Le déploiement écrit dans le REGISTRE DES COMPTES : le domaine a donc besoin
  // de l'IAM. Le sens inverse n'existe pas (`IamModule` n'importe pas le
  // domaine), donc pas de cycle et pas de `forwardRef`.
  imports: [IamModule],
  controllers: [IncidentsController, CommsController, ResourcesController, HospitalsController, DashboardController, EnvironmentController],
  providers: [
    NoticesService,
    // La passerelle de notification : SMTP dès que `SMTP_HOST` est défini
    // (mailpit en développement, relais de l'organisme en production), sinon la
    // journalisation — qui DIT qu'elle n'envoie rien (registre R-5).
    {
      provide: NOTIFICATION_GATEWAY,
      useFactory: () => {
        const smtp = smtpConfigFromEnv();
        return smtp ? new SmtpNotificationGateway(smtp) : new LogNotificationGateway();
      },
    },
    DomainService, VisibilityService, DeploymentService, RiskService, CatalogService, CommsService, IncidentTypesService, SubIncidentTypesService, SeismicService, SeismicAlertsService, WeatherService],
  exports: [NOTIFICATION_GATEWAY, DomainService, VisibilityService, DeploymentService, RiskService, CatalogService, CommsService, IncidentTypesService, SubIncidentTypesService, SeismicService, SeismicAlertsService, WeatherService],
})
export class DomainModule {}
