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
import { RiskService } from "@/modules/domain/risk.service";
import { DomainService } from "@/modules/domain/domain.service";
import { CatalogService } from "@/modules/domain/catalog.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(
    private readonly risk: RiskService,
    private readonly domain: DomainService,
    private readonly catalog: CatalogService,
  ) {}

  @Get("catalog")
  @RequirePermission("dashboard:view")
  @ApiOperation({ summary: "Catalogue des modules opérationnels (inventaire, triage, ORSEC, …)" })
  catalogAll() {
    return this.catalog.all();
  }

  @Get("dashboard/stats")
  @RequirePermission("dashboard:view")
  @ApiOperation({ summary: "Statistiques de commandement : évolution 30 j, gravité, bilan humain, saturation hospitalière, posture des unités" })
  dashboardStats() {
    return this.domain.stats();
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
  @ApiOperation({ summary: "Fil des événements" })
  feed() {
    return this.domain.listFeed();
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
