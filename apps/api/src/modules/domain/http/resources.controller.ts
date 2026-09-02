// ============================================================================
// ARGOS — adaptateur HTTP du domaine · unités, abris, parcs d'équipement, morgues
//
// Issu de la découpe de l'ancien `domain.controller.ts` (60 routes, 12 services
// injectés, un seul fichier). Chaque contrôleur n'injecte que ce qu'il emploie ;
// les permissions et portées de chaque route sont INCHANGÉES — la suite de tests
// et `authz-coverage.spec.ts` en font foi.
// ============================================================================

import { Body, ConflictException, Delete, Get, NotFoundException, Param, Patch, Post, Controller } from "@nestjs/common";
import { ApiOperation, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { AdmitBodyDto, CreateEquipDto, CreateUnitDto, UpdateEquipDto, UpdateMorgueDto, UpdateMortuaryRecordDto, CreateShelterDto, UpdateShelterDto, UpdateUnitDto } from "@/modules/domain/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { RequireScope } from "@/common/decorators/require-scope.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { DomainService } from "@/modules/domain/domain.service";
import { VisibilityService } from "@/modules/domain/visibility.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class ResourcesController {
  constructor(
    private readonly domain: DomainService,
    private readonly visibility: VisibilityService,
  ) {}

  @Get("units")
  @RequirePermission("teams:view")
  @ApiOperation({
    summary: "Liste des unités visibles.",
    description: "Seule la place d'armes est restreinte — à sa zone de compétence.",
  })
  units(@CurrentUser() user: AuthUser) {
    return this.visibility.filterUnits(this.domain.listUnits(), this.scopeFor(user));
  }

  @Post("units")
  @RequirePermission("teams:create")
  @ApiOperation({ summary: "Créer une unité (audité)" })
  createUnit(@Body() dto: CreateUnitDto) {
    return this.domain.createUnit(dto);
  }

  @Patch("units/:id")
  @RequirePermission("units:update")
  @RequireScope("unit")
  @ApiOperation({ summary: "Mettre à jour une unité — un responsable ne peut agir que sur la sienne" })
  updateUnit(@Param("id") id: string, @Body() dto: UpdateUnitDto) {
    const u = this.domain.updateUnit(id, dto);
    if (!u) throw new NotFoundException(`Unité introuvable : ${id}`);
    return u;
  }

  // --- abris ----------------------------------------------------------------

  @Get("shelters")
  @RequirePermission("shelters:view")
  @ApiOperation({ summary: "Liste des abris d'hébergement" })
  shelters() {
    return this.domain.listShelters();
  }

  @Post("shelters")
  @RequirePermission("shelters:create")
  @ApiOperation({
    summary: "Ouvrir un abri (audité).",
    description:
      "Comme pour les unités, la création d'une entité revient à son administrateur ou à son " +
      "responsable — pas à la conduite opérative, qui la CONSULTE et l'emploie. Les répartitions " +
      "par âge partent à zéro : un abri qu'on ouvre n'a pas encore de recensement.",
  })
  createShelter(@Body() dto: CreateShelterDto) {
    return this.domain.createShelter(dto);
  }

  @Patch("shelters/:id")
  @RequirePermission("shelters:update")
  @RequireScope("shelter")
  @ApiOperation({ summary: "Mettre à jour un abri — un responsable ne peut agir que sur le sien" })
  updateShelter(@Param("id") id: string, @Body() dto: UpdateShelterDto) {
    const sh = this.domain.updateShelter(id, dto);
    if (!sh) throw new NotFoundException(`Abri introuvable : ${id}`);
    return sh;
  }

  // --- parc d'équipement -----------------------------------------------------
  // La route porte l'identifiant de l'UNITÉ détentrice (et non celui de
  // l'article) : le ScopeGuard peut ainsi cantonner sans connaître la ressource,
  // exactement comme pour les services de soins d'un hôpital.

  @Get("equipment-parks/:id/items")
  @RequirePermission("equipment:view")
  @ApiOperation({ summary: "Parc d'équipement d'une unité" })
  parkItems(@Param("id") id: string) {
    if (!this.domain.findUnit(id)) throw new NotFoundException(`Unité introuvable : ${id}`);
    return this.domain.listEquipment(id);
  }

  @Post("equipment-parks/:id/items")
  @RequirePermission("equipment:create")
  @RequireScope("equipment")
  @ApiOperation({ summary: "Ajouter un article — dans SON parc uniquement" })
  addParkItem(@Param("id") id: string, @Body() dto: CreateEquipDto) {
    const unit = this.domain.findUnit(id);
    if (!unit) throw new NotFoundException(`Unité introuvable : ${id}`);
    // Le libellé affiché reste celui de l'unité : jamais saisi par le client.
    return this.domain.addEquipment(id, unit.nom, dto);
  }

  @Patch("equipment-parks/:id/items/:eid")
  @RequirePermission("equipment:update")
  @RequireScope("equipment")
  @ApiOperation({ summary: "Modifier un article — dans SON parc uniquement" })
  updateParkItem(@Param("id") id: string, @Param("eid") eid: string, @Body() dto: UpdateEquipDto) {
    const e = this.domain.updateEquipment(id, eid, dto);
    if (!e) throw new NotFoundException(`Article introuvable dans le parc ${id} : ${eid}`);
    return e;
  }

  @Delete("equipment-parks/:id/items/:eid")
  @RequirePermission("equipment:archive")
  @RequireScope("equipment")
  @ApiOperation({ summary: "Sortir un article du parc — dans SON parc uniquement" })
  removeParkItem(@Param("id") id: string, @Param("eid") eid: string) {
    if (!this.domain.removeEquipment(id, eid)) {
      throw new NotFoundException(`Article introuvable dans le parc ${id} : ${eid}`);
    }
    return { ok: true };
  }

  // --- morgue / registre DVI -------------------------------------------------
  // Lecture réservée au commandement et au responsable ; toute ÉCRITURE est
  // cantonnée au site dont le compte a la responsabilité.

  @Get("morgues")
  @RequirePermission("morgue:view")
  @ApiOperation({ summary: "Sites mortuaires" })
  morgues() {
    return this.domain.listMorgues();
  }

  @Patch("morgues/:id")
  @RequirePermission("morgue:update")
  @RequireScope("morgue")
  @ApiOperation({ summary: "Mettre à jour un site mortuaire — le sien uniquement" })
  updateMorgue(@Param("id") id: string, @Body() dto: UpdateMorgueDto) {
    const m = this.domain.updateMorgue(id, dto);
    if (!m) throw new NotFoundException(`Site mortuaire introuvable : ${id}`);
    return m;
  }

  @Get("morgues/:id/records")
  @RequirePermission("morgue:view")
  @ApiOperation({ summary: "Registre d'identification d'un site mortuaire" })
  mortuaryRecords(@Param("id") id: string) {
    if (!this.domain.findMorgue(id)) throw new NotFoundException(`Site mortuaire introuvable : ${id}`);
    return this.domain.listMortuaryRecords(id);
  }

  @Post("morgues/:id/records")
  @RequirePermission("morgue:create")
  @RequireScope("morgue")
  @ApiOperation({ summary: "Admettre un corps sous référence provisoire — dans SON site uniquement" })
  admitBody(@Param("id") id: string, @Body() dto: AdmitBodyDto) {
    if (!this.domain.findMorgue(id)) throw new NotFoundException(`Site mortuaire introuvable : ${id}`);
    return this.domain.admitBody(id, dto);
  }

  @Patch("morgues/:id/records/:rid")
  @RequirePermission("morgue:update")
  @RequireScope("morgue")
  @ApiOperation({ summary: "Faire évoluer un dossier d'identification — dans SON site uniquement" })
  updateMortuaryRecord(@Param("id") id: string, @Param("rid") rid: string, @Body() dto: UpdateMortuaryRecordDto) {
    const res = this.domain.updateMortuaryRecord(id, rid, dto);
    if (res.missing) throw new NotFoundException(`Dossier introuvable dans ${id} : ${rid}`);
    // Violation d'un invariant du parcours DVI → 409 (règle métier, pas saisie).
    if (res.error) throw new ConflictException(res.error);
    return res.record;
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
