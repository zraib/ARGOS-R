import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { AviationService } from "@/modules/aviation/aviation.service";
import { AddAircraftDto, UpdateAircraftDto } from "@/modules/aviation/http/aviation.dto";

// ============================================================================
// ARGOS — adaptateur HTTP du suivi aérien
//
// Traduit HTTP ↔ cas d'usage, rien d'autre. Le RBAC est appliqué ici côté
// serveur (default-deny) : le masquage côté navigateur n'est PAS un contrôle de
// sécurité. La suppression définitive exige `aviation:delete`, que la matrice
// n'accorde à personne — donc au seul superadmin (`*`).
// ============================================================================

@ApiTags("aviation")
@ApiBearerAuth()
@Controller("aviation")
export class AviationController {
  constructor(private readonly aviation: AviationService) {}

  @Get("aircraft")
  @RequirePermission("aviation:view")
  @ApiOperation({ summary: "Aéronefs inscrits à la surveillance." })
  @ApiQuery({ name: "includeArchived", required: false, type: Boolean })
  async list(@Query("includeArchived") includeArchived?: string) {
    return this.aviation.list(includeArchived === "true");
  }

  @Get("states")
  @RequirePermission("aviation:view")
  @ApiOperation({
    summary: "Positions courantes des seuls aéronefs inscrits.",
    description:
      "Le flux externe est interrogé sur l'emprise nationale puis croisé avec la liste de suivi " +
      "côté serveur : le trafic non inscrit ne sort jamais de l'API, et la liste de suivi n'est " +
      "jamais transmise au fournisseur.",
  })
  @ApiQuery({ name: "incidentId", required: false })
  async states(@Query("incidentId") incidentId?: string) {
    return {
      /** Fournisseur en service — un opérateur doit savoir si le flux est réel ou d'exercice. */
      feed: this.aviation.feedName,
      at: new Date().toISOString(),
      aircraft: await this.aviation.states(incidentId),
    };
  }

  @Post("aircraft")
  @RequirePermission("aviation:create")
  @ApiOperation({ summary: "Inscrire un aéronef à la surveillance." })
  // Réponses d'échec déclarées explicitement : sans elles, le client généré
  // type `error` comme `never` et l'écran ne peut pas afficher le motif du refus.
  @ApiResponse({ status: 400, description: "Code ou libellé invalide." })
  @ApiResponse({ status: 409, description: "Aéronef déjà suivi." })
  async add(@Body() dto: AddAircraftDto, @CurrentUser() user: AuthUser) {
    return this.aviation.add(dto, user.username);
  }

  @Patch("aircraft/:id")
  @RequirePermission("aviation:update")
  @ApiOperation({ summary: "Modifier un aéronef inscrit." })
  async update(@Param("id") id: string, @Body() dto: UpdateAircraftDto) {
    return this.aviation.update(id, dto);
  }

  @Post("aircraft/:id/archive")
  @RequirePermission("aviation:archive")
  @ApiOperation({ summary: "Archiver un aéronef (geste par défaut, réversible)." })
  async archive(@Param("id") id: string) {
    return this.aviation.archive(id);
  }

  @Post("aircraft/:id/restore")
  @RequirePermission("aviation:archive")
  @ApiOperation({ summary: "Réactiver un aéronef archivé." })
  async restore(@Param("id") id: string) {
    return this.aviation.restore(id);
  }

  @Delete("aircraft/:id")
  @RequirePermission("aviation:delete")
  @ApiOperation({ summary: "Supprimer définitivement (superadmin uniquement)." })
  async remove(@Param("id") id: string) {
    await this.aviation.remove(id);
    return { ok: true };
  }
}
