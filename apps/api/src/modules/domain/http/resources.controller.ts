// ============================================================================
// ARGOS — adaptateur HTTP du domaine · unités, abris, parcs d'équipement, morgues
//
// Issu de la découpe de l'ancien `domain.controller.ts` (60 routes, 12 services
// injectés, un seul fichier). Chaque contrôleur n'injecte que ce qu'il emploie ;
// les permissions et portées de chaque route sont INCHANGÉES — la suite de tests
// et `authz-coverage.spec.ts` en font foi.
// ============================================================================

import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import { entityDeleteConflict, isForced } from "@/modules/domain/http/entity-delete";
import { canCreateUnit, canDeleteUnit, canEditUnit } from "@/modules/domain/mode.rules";
import { ModeService } from "@/modules/mode/mode.service";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AdmitBodyDto, CreateEquipDto, CreateMorgueDto, CreateUnitDto, DeployMobileMorgueDto, TransferBodyDto, UpdateEquipDto, UpdateMorgueDto, UpdateMortuaryRecordDto, CreateShelterDto, UpdateShelterDto, UpdateUnitDto } from "@/modules/domain/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { RequireScope } from "@/common/decorators/require-scope.decorator";
import { DomainChangeInterceptor } from "@/modules/domain/http/domain-change.interceptor";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { DomainService } from "@/modules/domain/domain.service";
import { assignableCorps } from "@/modules/domain/assignment.rules";
import { VisibilityService, unitVisibleTo } from "@/modules/domain/visibility.service";
import { UsersService } from "@/modules/iam/users.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
// Toute écriture qui réussit pousse un événement `domain` : les autres postes relisent (ADR 0029).
@UseInterceptors(DomainChangeInterceptor)
export class ResourcesController {
  constructor(
    private readonly domain: DomainService,
    private readonly visibility: VisibilityService,
    private readonly users: UsersService,
    private readonly mode: ModeService,
  ) {}

  @Get("units")
  @RequirePermission("teams:view")
  @ApiOperation({
    summary: "Liste des unités visibles (ADR 0020).",
    description:
      "Chacun voit les unités qu'il a inscrites et celles qui le concernent : la sienne, celles de sa région (wali, place d'armes), " +
      "celles affectées ou intervenantes sur son opération (conduite déployée). L'administration et le stratégique voient tout.",
  })
  units(@CurrentUser() user: AuthUser) {
    return this.visibleUnits(user).map((u) => this.withCommander(u));
  }

  /**
   * Le commandant d'une unité est le compte qui la tient (ADR 0027 rév.) : dès
   * qu'un « Commandant d'unité » est rattaché à l'unité, son nom — grade
   * compris — remplace le nom saisi à la création dans `cmdt`, partout où
   * l'unité s'affiche (tuiles, fiche, carte, répartiteur). Sans compte
   * rattaché, le nom saisi reste. Plusieurs comptes : le premier servi, comme
   * la légende de la fiche.
   */
  private withCommander<T extends { id: string; cmdt: string }>(unit: T): T {
    const holder = this.users.listResponsibles().find((r) => r.kind === "unit" && r.entityId === unit.id);
    if (!holder) return unit;
    return { ...unit, cmdt: holder.grade ? `${holder.grade} ${holder.nom}` : holder.nom };
  }

  @Post("units")
  @RequirePermission("teams:create")
  @ApiOperation({
    summary: "Créer une unité (audité).",
    description:
      "Le MODE de la station resserre la matrice (ADR 0016) : en démonstration et en exercice, l'OPCOM et les cellules " +
      "créent des unités pour le scénario ; en opérationnel, le Super Administrateur seul. Le profil direx tient ses unités " +
      "en tout mode : la DIREX (Chef, Anim, RLS) et, dans chaque PC, le chef, les OPS, les LOG et les Rens (ADR 0030).",
  })
  @ApiResponse({ status: 403, description: "Le mode de la station ne le permet pas à ce rôle." })
  createUnit(@Body() dto: CreateUnitDto, @CurrentUser() user: AuthUser) {
    if (!canCreateUnit(user.role, this.mode.current())) throw new ForbiddenException(`Mode ${this.mode.current()} : la création d'unités n'est pas ouverte au rôle ${user.role}.`);
    // L'unité porte son auteur (ADR 0020) : il la verra toujours. Inscrite par
    // un compte déployé (cellule, OPCOM, TACOM en exercice), elle rejoint son
    // opération aussitôt — l'OPCOM et le TACOM de l'opération la voient.
    const unit = this.domain.createUnit(dto, user.username, user.profile);
    if (user.scope?.incident) this.domain.attachUnitToOperation(unit.id, user.scope.incident, user.username);
    return this.withCommander(this.domain.findUnit(unit.id) ?? unit);
  }

  @Patch("units/:id")
  @RequirePermission("units:update")
  @RequireScope("unit")
  @ApiOperation({ summary: "Mettre à jour une unité — un responsable ne peut agir que sur la sienne ; l'OPCOM et les cellules en démonstration et en exercice" })
  updateUnit(@Param("id") id: string, @Body() dto: UpdateUnitDto, @CurrentUser() user: AuthUser) {
    // Ce qu'on ne voit pas ne se modifie pas — et n'existe pas (404).
    if (!this.visibleUnits(user).some((u) => u.id === id)) throw new NotFoundException(`Unité introuvable : ${id}`);
    if (!canEditUnit(user.role, this.mode.current(), user.scope?.unit === id)) throw new ForbiddenException(`Mode ${this.mode.current()} : la modification d'unités n'est pas ouverte au rôle ${user.role}.`);
    const u = this.domain.updateUnit(id, dto);
    if (!u) throw new NotFoundException(`Unité introuvable : ${id}`);
    return this.withCommander(u);
  }

  @ApiOperation({
    summary: "Supprimer définitivement une unité — qui la crée la retire (ADR 0016, ADR 0030).",
    description:
      "Route gardée par `teams:update`, puis par la règle de mode : le Super Administrateur toujours ; hors mode " +
      "opérationnel l'OPCOM et les cellules du profil classique ; au profil direx, en tout mode, la DIREX (Chef, Anim, RLS) " +
      "et, dans chaque PC, le chef, les OPS, les LOG et les Rens. Refusé (409) tant que l'unité est engagée sur une opération active ou qu'un compte en a la responsabilité ; " +
      "`?force=true` passe outre. Son parc et ses postes partent avec elle ; une graine supprimée ne revient pas au redémarrage.",
  })
  @Delete("units/:id")
  @RequirePermission("teams:update")
  @ApiQuery({ name: "force", required: false, description: "Passer outre les garde-fous (engagements, responsables)." })
  @ApiResponse({ status: 403, description: "Le rôle ne retire pas d'unité dans ce mode." })
  @ApiResponse({ status: 404, description: "Unité inconnue." })
  @ApiResponse({ status: 409, description: "L'unité est encore engagée ou tenue par un compte." })
  deleteUnit(@Param("id") id: string, @Query("force") force: string | undefined, @CurrentUser() user: AuthUser) {
    // La permission de route est `teams:update` ; la règle de mode fait le tri
    // (trait `unitRemover` : ADR 0016 pour le profil classique, ADR 0030 pour
    // le profil direx — qui crée une unité la retire).
    if (!canDeleteUnit(user.role, this.mode.current())) throw new ForbiddenException("Ce rôle ne retire pas d'unité dans le mode en service (ADR 0016, ADR 0030).");
    return this.deleteEntity("unit", id, force, user);
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

  @ApiOperation({
    summary: "Fermer définitivement un abri (audité) — `shelters:delete`.",
    description:
      "Refusé (409) tant que l'abri héberge des occupants ou qu'un compte en a la responsabilité ; `?force=true` passe outre. " +
      "Ses postes sur la carte partent avec lui.",
  })
  @Delete("shelters/:id")
  @RequirePermission("shelters:delete")
  @ApiQuery({ name: "force", required: false, description: "Passer outre les garde-fous (occupants, responsables)." })
  @ApiResponse({ status: 403, description: "Le rôle ne détient pas la permission de suppression." })
  @ApiResponse({ status: 404, description: "Abri inconnu." })
  @ApiResponse({ status: 409, description: "L'abri héberge encore ou est tenu par un compte." })
  deleteShelter(@Param("id") id: string, @Query("force") force: string | undefined, @CurrentUser() user: AuthUser) {
    return this.deleteEntity("shelter", id, force, user);
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
  admitBody(@Param("id") id: string, @Body() dto: AdmitBodyDto, @CurrentUser() user: AuthUser) {
    if (!this.domain.findMorgue(id)) throw new NotFoundException(`Site mortuaire introuvable : ${id}`);
    return this.domain.admitBody(id, dto, user.username);
  }

  @Patch("morgues/:id/records/:rid")
  @RequirePermission("morgue:update")
  @RequireScope("morgue")
  @ApiOperation({ summary: "Faire évoluer un dossier d'identification — dans SON site uniquement, mot de passe exigé (step-up)" })
  @ApiResponse({ status: 403, description: "Mot de passe absent ou incorrect : le geste n'est pas signé." })
  updateMortuaryRecord(@Param("id") id: string, @Param("rid") rid: string, @Body() dto: UpdateMortuaryRecordDto, @CurrentUser() user: AuthUser) {
    // Identifier, corriger ou restituer engage la responsabilité de qui le
    // fait : le geste est signé par le mot de passe du compte, ici, côté
    // serveur — le masquage côté navigateur n'est pas un contrôle.
    const { password, ...patch } = dto;
    if (!this.users.verifyPassword(user.username, password)) throw new ForbiddenException("Mot de passe incorrect : la modification du dossier n'est pas signée.");
    const res = this.domain.updateMortuaryRecord(id, rid, patch, user.username);
    if (res.missing) throw new NotFoundException(`Dossier introuvable dans ${id} : ${rid}`);
    // Violation d'un invariant du parcours DVI → 409 (règle métier, pas saisie).
    if (res.error) throw new ConflictException(res.error);
    return res.record;
  }

  // --- service morgue : registre de tous les sites, morgues mobiles, chaîne de garde ---

  @Get("morgues/registry")
  @RequirePermission("morgue:view")
  @ApiOperation({ summary: "Registre mortuaire de tous les sites — par incident au besoin" })
  @ApiQuery({ name: "incidentId", required: false })
  mortuaryRegistry(@Query("incidentId") incidentId?: string) {
    return this.domain.listMortuaryRegistry(incidentId || undefined);
  }

  @Post("morgues")
  @RequirePermission("morgue:create")
  @ApiOperation({ summary: "Créer un site mortuaire fixe — de ville ou régional, rattaché à un établissement" })
  createMorgue(@Body() dto: CreateMorgueDto) {
    const res = this.domain.createMorgue(dto);
    if (res.error) throw new NotFoundException(res.error);
    return res.site;
  }

  @Post("morgues/mobile")
  @RequirePermission("morgue:create")
  @ApiOperation({ summary: "Déployer une morgue mobile (conteneur réfrigéré) sur le terrain" })
  deployMobileMorgue(@Body() dto: DeployMobileMorgueDto, @CurrentUser() user: AuthUser) {
    return this.domain.deployMobileMorgue(dto, user.username);
  }

  @Post("morgues/:id/recall")
  @RequirePermission("morgue:update")
  @RequireScope("morgue")
  @ApiOperation({ summary: "Replier une morgue mobile — vide de tout corps" })
  recallMorgue(@Param("id") id: string) {
    const res = this.domain.recallMorgue(id);
    if (res.missing) throw new NotFoundException(`Site mortuaire introuvable : ${id}`);
    if (res.error) throw new ConflictException(res.error);
    return res.site;
  }

  @ApiOperation({
    summary: "Supprimer définitivement un site mortuaire ou une morgue mobile (audité) — `morgue:delete`.",
    description:
      "Refusé (409) tant que des corps figurent au registre du site, qu'il est affecté à une opération active ou qu'un compte " +
      "en a la responsabilité ; `?force=true` passe outre — les dossiers du site partent alors avec lui.",
  })
  @Delete("morgues/:id")
  @RequirePermission("morgue:delete")
  @ApiQuery({ name: "force", required: false, description: "Passer outre les garde-fous (registre, affectations, responsables)." })
  @ApiResponse({ status: 403, description: "Le rôle ne détient pas la permission de suppression." })
  @ApiResponse({ status: 404, description: "Site inconnu." })
  @ApiResponse({ status: 409, description: "Le site a encore un registre, une affectation ou un responsable." })
  deleteMorgue(@Param("id") id: string, @Query("force") force: string | undefined, @CurrentUser() user: AuthUser) {
    return this.deleteEntity("morgue", id, force, user);
  }

  @Post("morgues/:id/records/:rid/receive")
  @RequirePermission("morgue:update")
  @RequireScope("morgue")
  @ApiOperation({ summary: "Confirmer la réception d'un corps transféré — dans SON site uniquement" })
  receiveBody(@Param("id") id: string, @Param("rid") rid: string, @CurrentUser() user: AuthUser) {
    const res = this.domain.receiveBody(id, rid, user.username);
    if (res.missing) throw new NotFoundException(`Dossier introuvable dans ${id} : ${rid}`);
    if (res.error) throw new ConflictException(res.error);
    return res.record;
  }

  @Post("morgues/:id/records/:rid/transfer")
  @RequirePermission("morgue:update")
  @RequireScope("morgue")
  @ApiOperation({ summary: "Transférer un corps vers un autre site mortuaire — depuis SON site uniquement" })
  transferBody(@Param("id") id: string, @Param("rid") rid: string, @Body() dto: TransferBodyDto, @CurrentUser() user: AuthUser) {
    const res = this.domain.transferBody(id, rid, dto.toMid, user.username, dto.note);
    if (res.missing) throw new NotFoundException(`Dossier introuvable dans ${id} : ${rid}`);
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

  /** Les unités que ce compte voit (ADR 0020). */
  private visibleUnits(user: AuthUser) {
    // Les unités de l'autre mode de l'application n'existent pas ici (ADR 0022) — sauf pour le Super Administrateur, qui voit tout (ADR 0027).
    const duMode = this.domain.listUnits().filter((u) => unitVisibleTo(u, user));
    return this.visibility.filterUnits(duMode, this.scopeFor(user), {
      matricule: user.username,
      assignments: user.scope,
      regionOf: (id) => this.domain.regionOfEntity("unit", id),
      ownersOnIncident: (id) => this.domain.resourceOwnersOnIncident(id),
      assigns: assignableCorps(user.role) === "*" || assignableCorps(user.role).length > 0,
      regionOfIncident: (id) => this.domain.listIncidents().find((i) => i.id === id)?.region,
    });
  }
  /** Suppression commune aux trois entités : garde-fous du domaine + responsables IAM, puis retrait. */
  private deleteEntity(kind: "unit" | "shelter" | "morgue", id: string, force: string | undefined, user: AuthUser) {
    const responsibles = this.users.listResponsibles().filter((r) => r.kind === kind && r.entityId === id).map((r) => r.matricule);
    const res = this.domain.deleteEntity(kind, id, user.username, isForced(force), responsibles);
    if (res.missing) throw new NotFoundException(`Entité introuvable : ${id}`);
    if (res.blockers) throw entityDeleteConflict(res.blockers);
    return { deleted: id, removed: res.removed };
  }
}
