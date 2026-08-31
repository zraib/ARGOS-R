import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { DomainService } from "@/modules/domain/domain.service";
import { VisibilityService } from "@/modules/domain/visibility.service";
import { IncidentDashboardService } from "@/modules/incident-dashboard/incident-dashboard.service";
import type { AuthUser } from "@/common/types/auth-user";

@ApiTags("incident-dashboard")
@ApiBearerAuth()
@Controller()
export class IncidentDashboardController {
  constructor(
    private readonly dashboard: IncidentDashboardService,
    private readonly domain: DomainService,
    private readonly visibility: VisibilityService,
  ) {}

  @Get("incidents/:id/dashboard")
  @RequirePermission("dash_incident:view")
  @ApiOperation({
    summary: "Tableau de bord d'UNE opération.",
    description:
      "Double garde : la permission `dash_incident:view` (le rôle peut-il lire un tableau de bord " +
      "d'incident ?) ET la portée de visibilité (celui-CI est-il le sien ?). La première seule " +
      "laisserait un OPCOM ouvrir le tableau de bord d'une autre opération en devinant son identifiant.",
  })
  @ApiResponse({ status: 404, description: "Incident inconnu — ou hors de la portée du compte." })
  async incidentDashboard(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const inc = this.domain.listIncidents().find((i) => i.id === id);
    // 404 dans les DEUX cas, et volontairement : distinguer « inconnu » de
    // « interdit » apprendrait à un compte hors portée qu'une opération existe.
    if (!inc) throw new NotFoundException(`Incident inconnu : ${id}`);

    const scope = this.visibility.scopeOfUser(user.role, user.scope);
    if (!this.visibility.canSeeIncident(inc, scope, (x) => this.domain.entitiesOnIncident(x))) {
      throw new NotFoundException(`Incident inconnu : ${id}`);
    }

    return this.dashboard.build(id, user.role);
  }
}
