import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { TrackingService } from "@/modules/tracking/tracking.service";
import { DeclareTrackerDto, SharePositionDto, UpdateTrackerDto } from "@/modules/tracking/http/tracking.dto";
import { SelfService } from "@/common/decorators/self-service.decorator";

// ============================================================================
// ARGOS — adaptateur HTTP du suivi de traceurs FMC920 (lot N-2)
//
// Traduit HTTP ↔ cas d'usage, rien d'autre. Le RBAC est appliqué ICI, côté
// serveur (default-deny) : le masquage côté navigateur n'est pas un contrôle de
// sécurité. La suppression définitive exige `tracking:delete`, que la matrice
// n'accorde à personne — donc au seul superadmin (joker `*`).
//
// L'INGESTION DES BOÎTIERS N'A PAS D'ENTRÉE HTTP, et c'est délibéré : leurs
// positions n'entrent que par l'écouteur TCP, où l'IMEI est confronté au
// registre. Une route qui accepterait une position sur simple jeton
// permettrait à n'importe quel compte de faire mentir la carte sur la
// position d'une unité. La seule entrée HTTP est le PARTAGE PAR L'APPLICATION
// (ADR 0008, révision) : un compte ne verse que sur SON partage, déclaré au
// registre — il ne peut dire que sa propre position.
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

  @Get("trackers/mine")
  @SelfService()
  @ApiOperation({ summary: "Le partage de position de MON compte (null si aucun n'est déclaré)." })
  async mine(@CurrentUser() user: AuthUser) {
    return { tracker: await this.tracking.mine(user.username) };
  }

  @Post("trackers/:id/position")
  @SelfService()
  @ApiOperation({ summary: "Verser la position de mon téléphone sur MON partage (application) — seul le compte du partage peut verser, et seulement sur un partage actif : un compte ne dit que sa propre position." })
  @ApiResponse({ status: 403, description: "Ce partage n'est pas celui du compte connecté." })
  @ApiResponse({ status: 409, description: "Boîtier (positions par le réseau seulement) ou partage archivé." })
  share(@Param("id") id: string, @Body() dto: SharePositionDto, @CurrentUser() user: AuthUser) {
    return this.tracking.sharePosition(id, user.username, dto);
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
  @ApiResponse({ status: 400, description: "IMEI mal formé ou déjà déclaré ; compte partageant déjà sa position." })
  declare(@Body() dto: DeclareTrackerDto, @CurrentUser() user: AuthUser) {
    return this.tracking.declare({
      source: dto.source,
      imei: dto.imei,
      account: dto.account,
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
