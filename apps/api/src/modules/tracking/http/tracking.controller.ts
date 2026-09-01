import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { TrackingService } from "@/modules/tracking/tracking.service";
import { DeclareTrackerDto, UpdateTrackerDto } from "@/modules/tracking/http/tracking.dto";

// ============================================================================
// ARGOS — adaptateur HTTP du suivi de traceurs FMC920 (lot N-2)
//
// Traduit HTTP ↔ cas d'usage, rien d'autre. Le RBAC est appliqué ICI, côté
// serveur (default-deny) : le masquage côté navigateur n'est pas un contrôle de
// sécurité. La suppression définitive exige `tracking:delete`, que la matrice
// n'accorde à personne — donc au seul superadmin (joker `*`).
//
// L'INGESTION N'A PAS D'ENTRÉE HTTP, et c'est délibéré : les positions
// n'entrent que par l'écouteur TCP, où l'IMEI est confronté au registre. Une
// route qui accepterait une position sur simple jeton permettrait à n'importe
// quel compte de faire mentir la carte sur la position d'une unité.
// ============================================================================

@ApiTags("tracking")
@ApiBearerAuth()
@Controller("tracking")
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get("trackers")
  @RequirePermission("tracking:view")
  @ApiOperation({
    summary: "Traceurs déclarés, avec leur dernière position connue.",
    description:
      "`last` est la dernière position EXPLOITABLE ; `lastSeenAt` le dernier contact, fix ou non. " +
      "Les deux sont distincts à dessein : un boîtier peut émettre fidèlement depuis un sous-sol " +
      "sans jamais se localiser, et le confondre avec un boîtier muet enverrait chercher une panne " +
      "qui n'existe pas.",
  })
  @ApiQuery({ name: "includeArchived", required: false, type: Boolean })
  list(@Query("includeArchived") includeArchived?: string) {
    return this.tracking.list(includeArchived === "true");
  }

  @Get("trackers/:id")
  @RequirePermission("tracking:view")
  @ApiOperation({ summary: "Un traceur et sa trace récente." })
  @ApiResponse({ status: 404, description: "Traceur inconnu." })
  get(@Param("id") id: string) {
    return this.tracking.get(id);
  }

  @Post("trackers")
  @RequirePermission("tracking:create")
  @ApiOperation({
    summary: "Déclarer un traceur — sans quoi le boîtier n'est pas admis.",
    description:
      "Le registre EST la liste blanche de l'écouteur TCP. Déclarer un traceur n'est pas un " +
      "rangement : c'est l'acte qui autorise un boîtier à parler à ARGOS.",
  })
  @ApiResponse({ status: 400, description: "IMEI mal formé ou déjà déclaré." })
  declare(@Body() dto: DeclareTrackerDto, @CurrentUser() user: AuthUser) {
    return this.tracking.declare({
      imei: dto.imei,
      label: dto.label,
      target: dto.target ?? null,
      incidentId: dto.incidentId ?? null,
      actor: user.username,
    });
  }

  @Patch("trackers/:id")
  @RequirePermission("tracking:update")
  @ApiOperation({
    summary: "Modifier le libellé, le rattachement, l'engagement, ou archiver.",
    description:
      "Archiver retire le boîtier du service : il cesse d'être admis à la poignée de main et " +
      "sort des cartes, mais son historique reste lisible. C'est le geste attendu pour un boîtier " +
      "volé, réformé ou rendu.",
  })
  @ApiResponse({ status: 404, description: "Traceur inconnu." })
  update(@Param("id") id: string, @Body() dto: UpdateTrackerDto) {
    return this.tracking.update(id, dto);
  }

  @Delete("trackers/:id")
  @RequirePermission("tracking:delete")
  @ApiOperation({
    summary: "Supprimer définitivement un traceur — SUPERADMIN uniquement.",
    description: "L'archivage reste le geste par défaut : il conserve la trace passée du moyen.",
  })
  @ApiResponse({ status: 403, description: "Réservé au Super Administrateur." })
  @ApiResponse({ status: 404, description: "Traceur inconnu." })
  async remove(@Param("id") id: string) {
    await this.tracking.remove(id);
    return { deleted: id };
  }
}
