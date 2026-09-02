// ============================================================================
// ARGOS — adaptateur HTTP du domaine · réseau hospitalier Hospinet — établissements, services, hôpitaux de campagne
//
// Issu de la découpe de l'ancien `domain.controller.ts` (60 routes, 12 services
// injectés, un seul fichier). Chaque contrôleur n'injecte que ce qu'il emploie ;
// les permissions et portées de chaque route sont INCHANGÉES — la suite de tests
// et `authz-coverage.spec.ts` en font foi.
// ============================================================================

import { Body, Delete, Get, NotFoundException, Param, Patch, Post, Controller } from "@nestjs/common";
import { ApiOperation, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { CreateHospitalDto, CreateWardDto, UpdateHospitalDto, UpdateWardDto } from "@/modules/domain/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { RequireScope } from "@/common/decorators/require-scope.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { DomainService } from "@/modules/domain/domain.service";
import { VisibilityService } from "@/modules/domain/visibility.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class HospitalsController {
  constructor(
    private readonly domain: DomainService,
    private readonly visibility: VisibilityService,
  ) {}

  @Get("hospitals")
  @RequirePermission("hospinet:view")
  @ApiOperation({ summary: "Liste des hôpitaux" })
  hospitals() {
    return this.domain.listHospitals();
  }

  @Post("hospitals")
  @RequirePermission("hospinet:create")
  @ApiOperation({ summary: "Créer un hôpital (audité)" })
  createHospital(@Body() dto: CreateHospitalDto) {
    return this.domain.createHospital(dto);
  }

  @Patch("hospitals/:id")
  @RequirePermission("hospinet:update")
  @RequireScope("hospital")
  @ApiOperation({ summary: "Mettre à jour un établissement — un responsable ne peut agir que sur le sien" })
  updateHospital(@Param("id") id: string, @Body() dto: UpdateHospitalDto) {
    const h = this.domain.updateHospital(id, dto);
    if (!h) throw new NotFoundException(`Établissement introuvable : ${id}`);
    return h;
  }

  // --- services de soins d'un établissement --------------------------------
  // Lecture ouverte à qui peut lire le réseau ; toute ÉCRITURE est cantonnée
  // à l'établissement dont le compte a la responsabilité (@RequireScope).

  @Get("hospitals/:id/wards")
  @RequirePermission("hospinet:view")
  @ApiOperation({ summary: "Services de soins d'un établissement" })
  listWards(@Param("id") id: string) {
    if (!this.domain.findHospital(id)) throw new NotFoundException(`Établissement introuvable : ${id}`);
    return this.domain.listWards(id);
  }

  @Post("hospitals/:id/wards")
  @RequirePermission("hospinet:create")
  @RequireScope("hospital")
  @ApiOperation({ summary: "Ouvrir un service de soins — dans SON établissement uniquement" })
  createWard(@Param("id") id: string, @Body() dto: CreateWardDto) {
    if (!this.domain.findHospital(id)) throw new NotFoundException(`Établissement introuvable : ${id}`);
    return this.domain.createWard(id, dto);
  }

  @Patch("hospitals/:id/wards/:wid")
  @RequirePermission("hospinet:update")
  @RequireScope("hospital")
  @ApiOperation({ summary: "Modifier un service de soins — dans SON établissement uniquement" })
  updateWard(@Param("id") id: string, @Param("wid") wid: string, @Body() dto: UpdateWardDto) {
    const w = this.domain.updateWard(id, wid, dto);
    if (!w) throw new NotFoundException(`Service introuvable dans ${id} : ${wid}`);
    return w;
  }

  @Delete("hospitals/:id/wards/:wid")
  @RequirePermission("hospinet:archive")
  @RequireScope("hospital")
  @ApiOperation({ summary: "Fermer un service de soins — dans SON établissement uniquement" })
  deleteWard(@Param("id") id: string, @Param("wid") wid: string) {
    if (!this.domain.deleteWard(id, wid)) throw new NotFoundException(`Service introuvable dans ${id} : ${wid}`);
    return { ok: true };
  }

  @Get("field-hospitals")
  @RequirePermission("hospinet:view")
  @ApiOperation({
    summary: "Hôpitaux de campagne visibles.",
    description: "Seule la place d'armes est restreinte — à sa zone de compétence.",
  })
  fieldHospitals(@CurrentUser() user: AuthUser) {
    return this.visibility.filterFieldHospitals(this.domain.listFieldHospitals(), this.scopeFor(user));
  }

  /**
   * Portée du compte courant — doctrine de visibilité (lot V-1).
   *
   * Résolue à CHAQUE requête depuis le rôle et les affectations de la session,
   * jamais depuis la requête : un client ne peut pas revendiquer une portée.
   */
  private scopeFor(user: AuthUser) {
    return this.visibility.scopeOfUser(user.role, user.scope);
  }
}
