import { Module } from "@nestjs/common";
import { DomainModule } from "@/modules/domain/domain.module";
import { MissionsModule } from "@/modules/missions/missions.module";
import { IncidentDashboardService } from "@/modules/incident-dashboard/incident-dashboard.service";
import { IncidentDashboardController } from "@/modules/incident-dashboard/incident-dashboard.controller";

/**
 * Module de LECTURE du tableau de bord d'une opération (lot V-3).
 *
 * Il dépend du domaine ET des missions, et personne ne dépend de lui : c'est
 * précisément ce qui évite le cycle. `MissionsModule` importe déjà
 * `DomainModule` (pour enregistrer sa cascade de suppression), donc injecter
 * `MissionService` dans le domaine l'aurait refermé.
 *
 * N'exporte rien et n'écrit rien — un agrégat de lecture ne doit pas devenir un
 * point d'entrée d'écriture par commodité.
 */
@Module({
  imports: [DomainModule, MissionsModule],
  controllers: [IncidentDashboardController],
  providers: [IncidentDashboardService],
})
export class IncidentDashboardModule {}
