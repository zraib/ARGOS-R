import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { SkipAudit } from "@/common/decorators/skip-audit.decorator";
import { PlanRouteDto, RoutePlanDto } from "@/modules/routing/http/routing.dto";
import { RoutingService } from "@/modules/routing/routing.service";

// ============================================================================
// ARGOS — adaptateur HTTP du routage sûr (ADR 0039)
//
// Ouvert à qui voit la carte (`map:view`) : un itinéraire sûr ne se réserve pas.
// Les zones NRBC sont évitées même pour un compte qui n'affiche pas le panache —
// la sécurité d'un trajet ne dépend pas de ce que l'écran montre. Un calcul
// n'écrit rien : il reste hors du journal d'audit, comme la lecture.
// ============================================================================

@ApiTags("routing")
@ApiBearerAuth()
@Controller("routing")
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Post("plan")
  @HttpCode(200)
  @SkipAudit()
  @RequirePermission("map:view")
  @ApiOperation({
    summary: "Itinéraire routier sûr : contourne les obstacles posés sur la carte et les zones des panaches NRBC en cours.",
    description:
      "Départ dans une zone NRBC : la sortie la plus rapide précède le trajet. Étape ou arrivée dans une zone : " +
      "remplacée par le point d'approche sûr le plus proche. Les zones évitées couvrent toute la durée du trajet. " +
      "Moteur injoignable : ligne droite (`road: false`) ; aucun chemin sûr : le plus court, `safe: false`.",
  })
  @ApiResponse({ status: 200, type: RoutePlanDto })
  @ApiResponse({ status: 400, description: "Étapes invalides (1 à 10 points [longitude, latitude])." })
  plan(@Body() dto: PlanRouteDto) {
    return this.routing.plan(dto);
  }
}
