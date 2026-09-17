// ============================================================================
// ARGOS — adaptateur HTTP du domaine · catalogue, statistiques de commandement, fil, répartition, référentiel géographique
//
// Issu de la découpe de l'ancien `domain.controller.ts` (60 routes, 12 services
// injectés, un seul fichier). Chaque contrôleur n'injecte que ce qu'il emploie ;
// les permissions et portées de chaque route sont INCHANGÉES — la suite de tests
// et `authz-coverage.spec.ts` en font foi.
// ============================================================================

import { Get, Controller } from "@nestjs/common";
import { SelfService } from "@/common/decorators/self-service.decorator";
import { ApiOperation, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { RiskService } from "@/modules/domain/risk.service";
import { DomainService } from "@/modules/domain/domain.service";
import { assignableCorps } from "@/modules/domain/assignment.rules";
import { CatalogService } from "@/modules/domain/catalog.service";
import { VisibilityService } from "@/modules/domain/visibility.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(
    private readonly risk: RiskService,
    private readonly domain: DomainService,
    private readonly catalog: CatalogService,
    private readonly visibility: VisibilityService,
  ) {}

  /** Ce que le compte voit (ADR 0020) : les incidents et les unités de sa portée — le tableau de bord se calcule dessus. */
  private view(user: AuthUser) {
    const scope = this.visibility.scopeOfUser(user.role, user.scope, (kind, id) => this.domain.regionOfEntity(kind, id));
    const incidents = this.visibility.filterIncidents(this.domain.listIncidents(), scope, (id) => this.domain.entitiesOnIncident(id));
    const units = this.visibility.filterUnits(this.domain.listUnits(), scope, {
      matricule: user.username,
      assignments: user.scope,
      regionOf: (id) => this.domain.regionOfEntity("unit", id),
      ownersOnIncident: (id) => this.domain.resourceOwnersOnIncident(id),
      assigns: assignableCorps(user.role) === "*" || assignableCorps(user.role).length > 0,
      regionOfIncident: (id) => this.domain.listIncidents().find((i) => i.id === id)?.region,
    });
    return { incidents, units };
  }

  @Get("catalog")
  @RequirePermission("dashboard:view")
  @ApiOperation({ summary: "Catalogue des modules opérationnels (inventaire, triage, ORSEC, …)" })
  catalogAll() {
    return this.catalog.all();
  }

  @Get("dashboard/stats")
  @RequirePermission("dashboard:view")
  @ApiOperation({
    summary: "Statistiques de commandement : évolution 30 j, gravité, bilan humain, saturation hospitalière, posture des unités",
    description: "Comptées sur les DONNÉES INTRODUITES (ADR 0020) — incidents déclarés et clôturés par jour, bilans des incidents actifs — et sur ce que le compte voit : ses incidents, ses unités.",
  })
  dashboardStats(@CurrentUser() user: AuthUser) {
    return this.domain.stats(this.view(user));
  }

  @Get("dashboard/risk")
  @RequirePermission("dashboard:view")
  @ApiOperation({
    summary: "Prédictions de risques (moteur déterministe, calculé côté serveur)",
    description:
      "Le moteur tourne UNE fois sur les données faisant foi de l'API (mémo 5 s) au lieu de N fois " +
      "dans N navigateurs. L'enveloppe expose computeMs et cached pour rendre le coût observable.",
  })
  dashboardRisk() {
    return this.risk.predictions();
  }

  @Get("feed")
  @RequirePermission("dashboard:view")
  @ApiOperation({ summary: "Fil des événements — ceux des incidents que le compte voit, et les lignes sans incident" })
  feed(@CurrentUser() user: AuthUser) {
    const visible = new Set(this.view(user).incidents.map((i) => i.id));
    return this.domain.listFeed().filter((f) => !f.incidentId || visible.has(f.incidentId));
  }

  @Get("dispatch/queue")
  @RequirePermission("dispatch:view")
  @ApiOperation({ summary: "File de dispatching (besoins entrants)" })
  queue() {
    return this.domain.listQueue();
  }

  @Get("dispatch/movements")
  @RequirePermission("dispatch:view")
  @ApiOperation({ summary: "Mouvements de transport en cours" })
  movements() {
    return this.domain.listMovements();
  }

  @Get("reference")
  @SelfService()
  @ApiOperation({ summary: "Données de référence : provinces, routes d'animation carte" })
  reference() {
    return this.domain.reference();
  }
}
