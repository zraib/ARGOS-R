// ============================================================================
// ARGOS — croquis dessinés sur la carte (mode dessin) : points, cercles,
// polygones nommés. Tout le monde voit et DESSINE (`map:view` — les deux
// profils de rôles) ; un croquis ne se modifie et ne se retire que par son
// auteur ou par le Super Administrateur (décision du 20 septembre 2026,
// ADR 0024).
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
  @RequirePermission("map:view")
  @ApiOperation({ summary: "Dessiner un croquis (audité) : un point, un cercle (centre + rayon) ou un polygone, avec son nom — ouvert à qui voit la carte" })
  @ApiResponse({ status: 400, description: "Géométrie incohérente avec la nature." })
  create(@Body() dto: CreateDrawingDto, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    const d = this.domain.createDrawing(dto, user.username);
    audit({ drawing: d.id, kind: d.kind, label: d.label });
    this.realtime.emit({ kind: "drawings" });
    return d;
  }

  /** Le croquis existe et le compte peut y toucher : son auteur, ou le Super Administrateur. */
  private assertOwner(id: string, user: AuthUser) {
    const d = this.domain.findDrawing(id);
    if (!d) throw new NotFoundException(`Croquis inconnu : ${id}`);
    if (d.createdBy !== user.username && user.role !== "superadmin") {
      throw new ForbiddenException(`Ce croquis a été dessiné par ${d.createdBy} : seul lui ou le Super Administrateur le modifie ou le retire.`);
    }
    return d;
  }

  @Patch("drawings/:id")
  @RequirePermission("map:view")
  @ApiOperation({ summary: "Modifier un croquis (audité) : nom, sommets, rayon, emplacement de l'étiquette, couleur, note — son auteur ou le Super Administrateur" })
  @ApiResponse({ status: 403, description: "Le croquis est à quelqu'un d'autre." })
  @ApiResponse({ status: 404, description: "Croquis inconnu." })
  update(@Param("id") id: string, @Body() dto: UpdateDrawingDto, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    this.assertOwner(id, user);
    const d = this.domain.updateDrawing(id, dto, user.username);
    if (!d) throw new NotFoundException(`Croquis inconnu : ${id}`);
    audit({ drawing: id, fields: Object.keys(dto) });
    this.realtime.emit({ kind: "drawings" });
    return d;
  }

  @Delete("drawings/:id")
  @RequirePermission("map:view")
  @ApiOperation({ summary: "Retirer un croquis (audité) — son auteur, ou le Super Administrateur" })
  @ApiResponse({ status: 403, description: "Le croquis est à quelqu'un d'autre." })
  @ApiResponse({ status: 404, description: "Croquis inconnu." })
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    const d = this.assertOwner(id, user);
    this.domain.deleteDrawing(id);
    audit({ drawing: id, kind: d.kind, label: d.label });
    this.realtime.emit({ kind: "drawings" });
    return { deleted: id };
  }
}
