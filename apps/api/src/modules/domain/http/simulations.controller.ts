// ============================================================================
// ARGOS — simulations PARTAGÉES sur la carte (ADR 0029)
//
// « Si quelqu'un effectue une simulation sur la carte, tout le monde doit la
// voir — sauf si elle est supprimée. » Ce qui se partage est le SCÉNARIO (la
// nature, le point de départ, les réglages), pas les images : chaque poste le
// rejoue sur le même relief et obtient le même front, pour quelques centaines
// d'octets échangés — et une station hors ligne s'en accommode.
//
// Qui publie : qui a le simulateur (`simFire` / `simFlood`, la matrice décide,
// ADR 0018) — la route demande `map:view`, la boîte à outils du poste ne
// propose « Partager » qu'à qui simule. Qui retire : l'AUTEUR ou le Super
// Administrateur, comme pour les croquis (ADR 0024) — une simulation affichée
// sur toutes les cartes n'est pas un objet personnel, mais elle reste sous la
// main de celui qui l'a lancée.
// ============================================================================
import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuditMeta, type AuditMetaSetter } from "@/common/decorators/audit-meta.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { PublishSimulationDto } from "@/modules/domain/dto";
import { DomainService } from "@/modules/domain/domain.service";
import { RealtimeService } from "@/modules/realtime/realtime.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class SimulationsController {
  constructor(
    private readonly domain: DomainService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get("simulations")
  @RequirePermission("map:view")
  @ApiOperation({
    summary: "Les simulations partagées — le scénario de chacune, à rejouer sur le poste",
    description: "Nature (feu, crue), point de départ, réglages, auteur et date. Les images ne transitent pas : chaque poste recalcule.",
  })
  list() {
    return this.domain.listSimulations();
  }

  @Post("simulations")
  @RequirePermission("map:view")
  @ApiOperation({
    summary: "Partager une simulation (audité) — tous les postes la rejouent",
    description: "Une même nature ne garde qu'une simulation par auteur : republier remplace la sienne.",
  })
  publish(@Body() dto: PublishSimulationDto, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    const sim = this.domain.publishSimulation(
      { kind: dto.kind, label: dto.label, seed: dto.seed, params: dto.params, ...(dto.incidentId ? { incidentId: dto.incidentId } : {}) },
      user.username,
    );
    audit({ simulation: sim.id, kind: sim.kind, label: sim.label });
    this.realtime.emit({ kind: "simulations" });
    return sim;
  }

  @Delete("simulations/:id")
  @RequirePermission("map:view")
  @ApiOperation({ summary: "Retirer une simulation partagée (audité) — son auteur ou le Super Administrateur" })
  @ApiResponse({ status: 403, description: "Simulation d'un autre compte." })
  @ApiResponse({ status: 404, description: "Simulation inconnue." })
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    const sim = this.domain.findSimulation(id);
    if (!sim) throw new NotFoundException(`Simulation inconnue : ${id}`);
    if (user.role !== "superadmin" && sim.createdBy.toLowerCase() !== user.username.toLowerCase()) {
      throw new ForbiddenException("Cette simulation a été lancée par un autre compte : son auteur ou le Super Administrateur la retire.");
    }
    this.domain.removeSimulation(id);
    audit({ simulation: id, kind: sim.kind });
    this.realtime.emit({ kind: "simulations" });
    return { removed: id };
  }
}
