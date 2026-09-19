// ============================================================================
// ARGOS — adaptateur HTTP du domaine · réseau hospitalier Hospinet — établissements, services, hôpitaux de campagne
//
// Issu de la découpe de l'ancien `domain.controller.ts` (60 routes, 12 services
// injectés, un seul fichier). Chaque contrôleur n'injecte que ce qu'il emploie ;
// les permissions et portées de chaque route sont INCHANGÉES — la suite de tests
// et `authz-coverage.spec.ts` en font foi.
// ============================================================================

import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { entityDeleteConflict, isForced } from "@/modules/domain/http/entity-delete";
import { UsersService } from "@/modules/iam/users.service";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { CreateHospitalDto, CreateWardDto, HospitalDeathDto, UpdateHospitalDto, UpdateWardDto, DeployFieldHospitalDto } from "@/modules/domain/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { RequireScope } from "@/common/decorators/require-scope.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { DomainService } from "@/modules/domain/domain.service";
import { RealtimeService } from "@/modules/realtime/realtime.service";
import { VisibilityService } from "@/modules/domain/visibility.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class HospitalsController {
  constructor(
    private readonly domain: DomainService,
    private readonly visibility: VisibilityService,
    private readonly users: UsersService,
    private readonly realtime: RealtimeService,
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

  @ApiOperation({
    summary: "Retirer définitivement un établissement du réseau — SUPERADMIN uniquement.",
    description:
      "La matrice n'accorde `hospinet:delete` à personne : seul le joker du Super Administrateur la détient. " +
      "Refusé (409) tant que l'établissement est engagé sur une opération active, porte des morgues rattachées ou des " +
      "hôpitaux de campagne, ou qu'un compte en a la responsabilité ; `?force=true` passe outre — ses services et ses " +
      "hôpitaux de campagne partent alors avec lui, les morgues rattachées sont détachées.",
  })
  @Delete("hospitals/:id")
  @RequirePermission("hospinet:delete")
  @ApiQuery({ name: "force", required: false, description: "Passer outre les garde-fous (engagements, rattachements, responsables)." })
  @ApiResponse({ status: 403, description: "Réservé au Super Administrateur." })
  @ApiResponse({ status: 404, description: "Établissement inconnu." })
  @ApiResponse({ status: 409, description: "L'établissement est encore engagé, rattaché ou tenu par un compte." })
  deleteHospital(@Param("id") id: string, @Query("force") force: string | undefined, @CurrentUser() user: AuthUser) {
    const responsibles = this.users.listResponsibles().filter((r) => r.kind === "hospital" && r.entityId === id).map((r) => r.matricule);
    const res = this.domain.deleteEntity("hospital", id, user.username, isForced(force), responsibles);
    if (res.missing) throw new NotFoundException(`Établissement introuvable : ${id}`);
    if (res.blockers) throw entityDeleteConflict(res.blockers);
    return { deleted: id, removed: res.removed };
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

  @Post("hospitals/:id/deceased")
  @RequirePermission("hospinet:update")
  @RequireScope("hospital")
  @ApiOperation({ summary: "Décès en établissement : annoncer le transfert du corps vers un site mortuaire — depuis SON établissement uniquement" })
  declareDeath(@Param("id") id: string, @Body() dto: HospitalDeathDto, @CurrentUser() user: AuthUser) {
    const res = this.domain.declareHospitalDeath(id, dto, user.username);
    if (res.missing === "hospital") throw new NotFoundException(`Établissement introuvable : ${id}`);
    if (res.missing === "morgue") throw new NotFoundException(`Site mortuaire introuvable : ${dto.mid}`);
    if (res.error) throw new ConflictException(res.error);
    return res.record;
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

  @Post("field-hospitals")
  @RequirePermission("hospinet:create")
  @ApiOperation({
    summary: "Déployer un hôpital de campagne à un point choisi sur la carte (audité).",
    description: "Le détachement hérite du réseau de son établissement (HMC / HCC), se dessine à sa position et, si une opération est désignée, en fait un intervenant.",
  })
  @ApiResponse({ status: 400, description: "Établissement ou opération inconnus." })
  deployFieldHospital(@Body() dto: DeployFieldHospitalDto, @CurrentUser() user: AuthUser) {
    const res = this.domain.deployFieldHospital(dto, user.username);
    if (res.error) throw new BadRequestException(res.error);
    this.realtime.emit({ kind: "domain", what: "hospitals" });
    return res.field;
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
