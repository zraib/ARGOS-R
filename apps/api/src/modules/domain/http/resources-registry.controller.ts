// ============================================================================
// ARGOS — adaptateur HTTP · registre des ressources (ADR 0016)
//
// Personnes, équipes, véhicules, logistique et équipements d'une entité
// (unité, hôpital, abri). La permission de route (`resources:*`) dit le
// maximum du rôle ; qui tient QUELLE ressource sur QUELLE entité, dans quel
// MODE, est tranché par `resources.rules.ts` — un responsable ne tient que la
// sienne, une cellule tient selon sa fonction, l'opérationnel resserre.
// ============================================================================

import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { DomainService } from "@/modules/domain/domain.service";
import { ResourcesService } from "@/modules/domain/resources.service";
import { ModeService } from "@/modules/mode/mode.service";
import { canManageResource, refusalReason } from "@/modules/domain/resources.rules";
import { RESOURCE_OWNER_KINDS, type ResourceKind, type ResourceOwner } from "@/modules/domain/resources.types";
import {
  CreateOwnedEquipDto, CreatePersonDto, CreateSupplyDto, CreateTeamDto, CreateVehicleDto,
  UpdateOwnedEquipDto, UpdatePersonDto, UpdateSupplyDto, UpdateTeamDto, UpdateVehicleDto,
} from "@/modules/domain/dto";

@ApiTags("resources")
@ApiBearerAuth()
@Controller("resources")
export class ResourcesRegistryController {
  constructor(
    private readonly domain: DomainService,
    private readonly resources: ResourcesService,
    private readonly mode: ModeService,
  ) {}

  @Get()
  @RequirePermission("resources:view")
  @ApiOperation({
    summary: "Les ressources d'une entité (personnes, équipes, véhicules, logistique, équipements), ou le registre entier.",
    description: "Avec `ownerKind` et `ownerId` : tout ce que l'entité tient ; sans : le registre entier, pour la conduite. La réponse dit aussi ce que l'appelant peut y tenir.",
  })
  @ApiQuery({ name: "ownerKind", required: false, enum: RESOURCE_OWNER_KINDS })
  @ApiQuery({ name: "ownerId", required: false })
  list(@Query("ownerKind") ownerKind: string | undefined, @Query("ownerId") ownerId: string | undefined, @CurrentUser() user: AuthUser) {
    if (!ownerKind && !ownerId) return { ...this.resources.listAll(), mode: this.mode.current() };
    const owner = this.owner(ownerKind, ownerId);
    const res = this.resources.listFor(owner);
    if (!res) throw new NotFoundException(`Détenteur introuvable : ${owner.kind} ${owner.id}`);
    const corps = this.domain.resourceOwner(owner)?.corps;
    const can = (kind: ResourceKind) => canManageResource({ role: user.role, mode: this.mode.current(), scope: user.scope, owner, ownerCorps: corps, kind });
    return {
      ...res,
      mode: this.mode.current(),
      canManage: { persons: can("persons"), teams: can("teams"), vehicles: can("vehicles"), supplies: can("supplies"), equipment: can("equipment") },
    };
  }

  // --- personnes -------------------------------------------------------------

  @Post("persons")
  @RequirePermission("resources:create")
  @ApiOperation({ summary: "Inscrire une personne au registre d'une entité" })
  @ApiResponse({ status: 403, description: "Le rôle ne tient pas cette ressource sur cette entité dans ce mode." })
  addPerson(@Body() dto: CreatePersonDto, @CurrentUser() user: AuthUser) {
    const owner = this.assertOwner(dto.owner, user, "persons");
    const { owner: _o, ...input } = dto;
    return this.resources.addPerson(owner, { ...input, status: input.status ?? "present" }, user.username);
  }

  @Patch("persons/:id")
  @RequirePermission("resources:update")
  @ApiOperation({ summary: "Mettre à jour une personne" })
  updatePerson(@Param("id") id: string, @Body() dto: UpdatePersonDto, @CurrentUser() user: AuthUser) {
    const p = this.resources.findPerson(id);
    if (!p) throw new NotFoundException(`Personne introuvable : ${id}`);
    this.assertOwner(p.owner, user, "persons");
    return this.resources.updatePerson(id, { ...dto, teamId: dto.teamId === "" ? undefined : dto.teamId });
  }

  @Delete("persons/:id")
  @RequirePermission("resources:archive")
  @ApiOperation({ summary: "Retirer une personne du registre" })
  removePerson(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const p = this.resources.findPerson(id);
    if (!p) throw new NotFoundException(`Personne introuvable : ${id}`);
    this.assertOwner(p.owner, user, "persons");
    this.resources.removePerson(id);
    return { removed: id };
  }

  // --- équipes ----------------------------------------------------------------

  @Post("teams")
  @RequirePermission("resources:create")
  @ApiOperation({ summary: "Constituer une équipe de personnes d'une entité" })
  addTeam(@Body() dto: CreateTeamDto, @CurrentUser() user: AuthUser) {
    const owner = this.assertOwner(dto.owner, user, "teams");
    const { owner: _o, ...input } = dto;
    return this.resources.addTeam(owner, { ...input, memberIds: input.memberIds ?? [] }, user.username);
  }

  @Patch("teams/:id")
  @RequirePermission("resources:update")
  @ApiOperation({ summary: "Mettre à jour une équipe (nom, mission, chef, membres)" })
  updateTeam(@Param("id") id: string, @Body() dto: UpdateTeamDto, @CurrentUser() user: AuthUser) {
    const t = this.resources.findTeam(id);
    if (!t) throw new NotFoundException(`Équipe introuvable : ${id}`);
    this.assertOwner(t.owner, user, "teams");
    return this.resources.updateTeam(id, dto);
  }

  @Delete("teams/:id")
  @RequirePermission("resources:archive")
  @ApiOperation({ summary: "Dissoudre une équipe — ses membres restent au registre" })
  removeTeam(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const t = this.resources.findTeam(id);
    if (!t) throw new NotFoundException(`Équipe introuvable : ${id}`);
    this.assertOwner(t.owner, user, "teams");
    this.resources.removeTeam(id);
    return { removed: id };
  }

  // --- véhicules --------------------------------------------------------------

  @Post("vehicles")
  @RequirePermission("resources:create")
  @ApiOperation({ summary: "Inscrire un véhicule (ou une flotte comptée) au registre d'une entité" })
  addVehicle(@Body() dto: CreateVehicleDto, @CurrentUser() user: AuthUser) {
    const owner = this.assertOwner(dto.owner, user, "vehicles");
    const { owner: _o, ...input } = dto;
    return this.resources.addVehicle(owner, { ...input, plate: input.plate ?? "", qty: input.qty ?? 1, state: input.state ?? "ok" }, user.username);
  }

  @Patch("vehicles/:id")
  @RequirePermission("resources:update")
  @ApiOperation({ summary: "Mettre à jour un véhicule" })
  updateVehicle(@Param("id") id: string, @Body() dto: UpdateVehicleDto, @CurrentUser() user: AuthUser) {
    const v = this.resources.findVehicle(id);
    if (!v) throw new NotFoundException(`Véhicule introuvable : ${id}`);
    this.assertOwner(v.owner, user, "vehicles");
    return this.resources.updateVehicle(id, dto);
  }

  @Delete("vehicles/:id")
  @RequirePermission("resources:archive")
  @ApiOperation({ summary: "Retirer un véhicule du registre" })
  removeVehicle(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const v = this.resources.findVehicle(id);
    if (!v) throw new NotFoundException(`Véhicule introuvable : ${id}`);
    this.assertOwner(v.owner, user, "vehicles");
    this.resources.removeVehicle(id);
    return { removed: id };
  }

  // --- logistique -------------------------------------------------------------

  @Post("supplies")
  @RequirePermission("resources:create")
  @ApiOperation({ summary: "Inscrire une ressource logistique (carburant, vivres, couchage, campement)" })
  addSupply(@Body() dto: CreateSupplyDto, @CurrentUser() user: AuthUser) {
    const owner = this.assertOwner(dto.owner, user, "supplies");
    const { owner: _o, ...input } = dto;
    return this.resources.addSupply(owner, input, user.username);
  }

  @Patch("supplies/:id")
  @RequirePermission("resources:update")
  @ApiOperation({ summary: "Mettre à jour une ressource logistique" })
  updateSupply(@Param("id") id: string, @Body() dto: UpdateSupplyDto, @CurrentUser() user: AuthUser) {
    const s = this.resources.findSupply(id);
    if (!s) throw new NotFoundException(`Ressource introuvable : ${id}`);
    this.assertOwner(s.owner, user, "supplies");
    return this.resources.updateSupply(id, dto);
  }

  @Delete("supplies/:id")
  @RequirePermission("resources:archive")
  @ApiOperation({ summary: "Retirer une ressource logistique du registre" })
  removeSupply(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const s = this.resources.findSupply(id);
    if (!s) throw new NotFoundException(`Ressource introuvable : ${id}`);
    this.assertOwner(s.owner, user, "supplies");
    this.resources.removeSupply(id);
    return { removed: id };
  }

  // --- équipements (parc d'un détenteur quel qu'il soit) ------------------------

  @Post("equipment")
  @RequirePermission("resources:create")
  @ApiOperation({ summary: "Ajouter un article au parc d'une entité (unité, hôpital, abri)" })
  addEquipment(@Body() dto: CreateOwnedEquipDto, @CurrentUser() user: AuthUser) {
    const owner = this.assertOwner(dto.owner, user, "equipment");
    const label = this.domain.resourceOwner(owner)?.label ?? owner.id;
    const { owner: _o, ...input } = dto;
    return this.domain.addEquipmentFor(owner, label, input);
  }

  @Patch("equipment/:id")
  @RequirePermission("resources:update")
  @ApiOperation({ summary: "Mettre à jour un article du parc" })
  updateEquipment(@Param("id") id: string, @Body() dto: UpdateOwnedEquipDto, @CurrentUser() user: AuthUser) {
    const owner = this.equipmentOwner(id);
    this.assertOwner(owner, user, "equipment");
    const e = this.domain.updateEquipmentOf(owner, id, dto);
    if (!e) throw new NotFoundException(`Article introuvable : ${id}`);
    return e;
  }

  @Delete("equipment/:id")
  @RequirePermission("resources:archive")
  @ApiOperation({ summary: "Sortir un article du parc" })
  removeEquipment(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const owner = this.equipmentOwner(id);
    this.assertOwner(owner, user, "equipment");
    if (!this.domain.removeEquipmentOf(owner, id)) throw new NotFoundException(`Article introuvable : ${id}`);
    return { removed: id };
  }

  // --- communs -----------------------------------------------------------------

  private owner(kind: string | undefined, id: string | undefined): ResourceOwner {
    if (!kind || !id || !(RESOURCE_OWNER_KINDS as readonly string[]).includes(kind)) {
      throw new ConflictException("Détenteur à préciser : ownerKind (unit, hospital, shelter) et ownerId.");
    }
    return { kind: kind as ResourceOwner["kind"], id };
  }

  private equipmentOwner(eid: string): ResourceOwner {
    const e = this.domain.listEquipment().find((x) => x.id === eid);
    if (!e) throw new NotFoundException(`Article introuvable : ${eid}`);
    return { kind: e.ownerKind ?? "unit", id: e.unitId };
  }

  /** Le détenteur existe, et l'appelant tient cette ressource dessus — sinon 404 / 403. */
  private assertOwner(owner: ResourceOwner, user: AuthUser, kind: ResourceKind): ResourceOwner {
    const o = this.domain.resourceOwner(owner);
    if (!o) throw new NotFoundException(`Détenteur introuvable : ${owner.kind} ${owner.id}`);
    const ctx = { role: user.role, mode: this.mode.current(), scope: user.scope, owner, ownerCorps: o.corps, kind };
    if (!canManageResource(ctx)) throw new ForbiddenException(refusalReason(ctx));
    return { kind: owner.kind, id: owner.id };
  }
}
