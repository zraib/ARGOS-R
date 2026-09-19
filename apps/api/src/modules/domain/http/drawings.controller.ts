// ============================================================================
// ARGOS — croquis dessinés sur la carte (mode dessin) : points, cercles,
// polygones nommés. Vus par qui voit la carte (`map:view`) ; dessinés,
// modifiés et retirés par qui édite la carte (`map_edit:*`, ADR 0018) — un
// croquis se retire par qui l'a dessiné, ou par un administrateur.
// ============================================================================
import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuditMeta, type AuditMetaSetter } from "@/common/decorators/audit-meta.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { CreateDrawingDto, UpdateDrawingDto } from "@/modules/domain/dto";
import { DomainService } from "@/modules/domain/domain.service";
import { RealtimeService } from "@/modules/realtime/realtime.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class DrawingsController {
  constructor(
    private readonly domain: DomainService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get("drawings")
  @RequirePermission("map:view")
  @ApiOperation({ summary: "Les croquis dessinés sur la carte — points, cercles, polygones nommés" })
  list() {
    return this.domain.listDrawings();
  }

  @Post("drawings")
  @RequirePermission("map_edit:create")
  @ApiOperation({ summary: "Dessiner un croquis (audité) : un point, un cercle (centre + rayon) ou un polygone, avec son nom" })
  @ApiResponse({ status: 400, description: "Géométrie incohérente avec la nature." })
  create(@Body() dto: CreateDrawingDto, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    const d = this.domain.createDrawing(dto, user.username);
    audit({ drawing: d.id, kind: d.kind, label: d.label });
    this.realtime.emit({ kind: "drawings" });
    return d;
  }

  @Patch("drawings/:id")
  @RequirePermission("map_edit:update")
  @ApiOperation({ summary: "Modifier un croquis (audité) : nom, sommets, rayon, emplacement de l'étiquette, couleur, note" })
  @ApiResponse({ status: 404, description: "Croquis inconnu." })
  update(@Param("id") id: string, @Body() dto: UpdateDrawingDto, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    const d = this.domain.updateDrawing(id, dto, user.username);
    if (!d) throw new NotFoundException(`Croquis inconnu : ${id}`);
    audit({ drawing: id, fields: Object.keys(dto) });
    this.realtime.emit({ kind: "drawings" });
    return d;
  }

  @Delete("drawings/:id")
  @RequirePermission("map_edit:update")
  @ApiOperation({ summary: "Retirer un croquis (audité) — son auteur, ou un administrateur" })
  @ApiResponse({ status: 403, description: "Le croquis est à quelqu'un d'autre." })
  @ApiResponse({ status: 404, description: "Croquis inconnu." })
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    const d = this.domain.findDrawing(id);
    if (!d) throw new NotFoundException(`Croquis inconnu : ${id}`);
    // La matrice n'accorde `delete` sur la carte à personne : l'auteur retire le
    // sien, l'administration retire tout.
    if (d.createdBy !== user.username && user.role !== "superadmin" && user.role !== "admin") {
      throw new ForbiddenException(`Ce croquis a été dessiné par ${d.createdBy} : seul lui ou un administrateur le retire.`);
    }
    this.domain.deleteDrawing(id);
    audit({ drawing: id, kind: d.kind, label: d.label });
    this.realtime.emit({ kind: "drawings" });
    return { deleted: id };
  }
}
