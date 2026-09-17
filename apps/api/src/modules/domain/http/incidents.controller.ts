// ============================================================================
// ARGOS — adaptateur HTTP du domaine · incidents, sous-incidents, déploiements, comptes rendus, niveau d'alerte, types
//
// Issu de la découpe de l'ancien `domain.controller.ts` (60 routes, 12 services
// injectés, un seul fichier). Chaque contrôleur n'injecte que ce qu'il emploie ;
// les permissions et portées de chaque route sont INCHANGÉES — la suite de tests
// et `authz-coverage.spec.ts` en font foi.
// ============================================================================

import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { AlertLevelDto, AssignMorgueDto, AssignUnitDto, CreateVictimDto, PublishSitrepDto, CreateIncidentDto, CreateSubIncidentDto, RegisterIncidentTypeDto, UpdateIncidentDto, UpdateVictimDto, DeployPostDto } from "@/modules/domain/dto";
import { ForbiddenException } from "@nestjs/common";
import { assignableCorps, canDeploy } from "@/modules/domain/assignment.rules";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { AuditMeta, type AuditMetaSetter } from "@/common/decorators/audit-meta.decorator";
import { DomainService } from "@/modules/domain/domain.service";
import { VisibilityService } from "@/modules/domain/visibility.service";
import { DeploymentService } from "@/modules/domain/deployment.service";
import { CommsService } from "@/modules/domain/comms.service";
import { IncidentTypesService } from "@/modules/domain/incident-types.service";
import { SubIncidentTypesService } from "@/modules/domain/sub-incident-types.service";
import { NoticesService } from "@/modules/realtime/notices.service";
import { UsersService } from "@/modules/iam/users.service";
import { REGIONAL_AUTHORITY_ROLES } from "@/shared/responsibilities";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class IncidentsController {
  constructor(
    private readonly domain: DomainService,
    private readonly visibility: VisibilityService,
    private readonly deployment: DeploymentService,
    private readonly comms: CommsService,
    private readonly incidentTypes: IncidentTypesService,
    private readonly subIncidentTypes: SubIncidentTypesService,
    private readonly users: UsersService,
    private readonly notices: NoticesService,
  ) {}

  @Get("incident-types")
  @RequirePermission("incidents:view")
  @ApiOperation({ summary: "Catalogue paramétrable des types d'incident (libellés FR/AR/EN + icônes)" })
  incidentTypesList() {
    return this.incidentTypes.list();
  }

  @Post("incident-types")
  @RequirePermission("settings:update")
  @ApiOperation({ summary: "Enregistrer un nouveau type d'incident (Super Admin, audité)" })
  registerIncidentType(@Body() dto: RegisterIncidentTypeDto) {
    return this.incidentTypes.register(dto);
  }

  @Get("incidents/map")
  @RequirePermission("map:view")
  @ApiOperation({
    summary: "Tous les incidents actifs, pour la carte de chacun (ADR 0020).",
    description:
      "Décision produit : « tout le monde doit voir l'incident sur la carte ». La liste et la fiche restent gardées par la " +
      "doctrine de visibilité ; la carte, elle, montre chaque incident actif à quiconque lit la carte — non archivés seulement.",
  })
  mapIncidents() {
    return this.domain.listIncidents().filter((i) => !i.archived);
  }

  @Get("incidents")
  @RequirePermission("incidents:view")
  @ApiOperation({
    summary: "Liste des incidents VISIBLES par le compte.",
    description:
      "Filtrée par la doctrine de visibilité (lot V-1) : globale pour l'état-major, la région pour un wali, " +
      "la zone de 40 km pour une place d'armes, l'incident de déploiement pour la conduite, les incidents " +
      "servis pour un responsable d'entité. Un rôle cantonné SANS affectation ne voit rien.",
  })
  incidents(@CurrentUser() user: AuthUser) {
    return this.visibility.filterIncidents(this.domain.listIncidents(), this.scopeFor(user), this.entitiesOn);
  }

  @Get("sitreps")
  // Le compte rendu est le volet « rendre compte » de la BOUCLE (ADR 0007),
  // pas un rapport d'incident : la ligne `reports` de la matrice ne comprend
  // aucun responsable d'entité, or ce sont précisément eux qui rendent compte.
  // Il suit donc la permission des missions.
  @RequirePermission("missions:view")
  @ApiOperation({ summary: "Comptes rendus de situation, du plus récent au plus ancien." })
  @ApiQuery({ name: "entityId", required: false })
  sitreps(@Query("entityId") entityId?: string) {
    return { sitreps: this.domain.listSitreps(entityId), cadenceMin: this.domain.sitrepCadence() };
  }

  @Get("sitreps/missing")
  @RequirePermission("missions:view")
  @ApiOperation({
    summary: "Entités EN RETARD de compte rendu.",
    description:
      "Le silence devient un signal : une entité sans compte rendu depuis plus que la cadence attendue " +
      "apparaît ici, ainsi que celles qui n'en ont jamais rendu (`overdueMin: -1`). La cadence découle du " +
      "niveau d'alerte national — N1 quotidien, N2 8 h, N3 4 h, N4 horaire.",
  })
  missingSitreps() {
    return { missing: this.domain.missingSitreps(), cadenceMin: this.domain.sitrepCadence() };
  }

  @Post("sitreps")
  @RequirePermission("missions:create")
  @ApiOperation({
    summary: "Publier un compte rendu — IMMUABLE et numéroté une fois publié.",
    description: "Trois champs saisis ; les chiffres de l'entité sont photographiés automatiquement.",
  })
  publishSitrep(@Body() dto: PublishSitrepDto, @CurrentUser() user: AuthUser) {
    return this.domain.publishSitrep({ ...dto, author: user.username });
  }

  /**
   * Entités servant un incident : intervenants déclarés. Les boucles ouvertes
   * y seront ajoutées quand le rattachement par mission sera branché — le
   * service de visibilité reçoit cette réponse plutôt que d'importer missions,
   * ce qui éviterait un cycle de modules.
   */
  private entitiesOn = (id: string): string[] => this.domain.entitiesOnIncident(id);

  @Get("alert-level")
  // Lue par TOUS les postes : le niveau s'affiche dans la barre haute quel que
  // soit le rôle, et il cadence les comptes rendus de chaque entité.
  @RequirePermission("missions:view")
  @ApiOperation({ summary: "Niveau d'alerte national courant (1 à 4)." })
  alertLevel() {
    return { level: this.domain.getAlertLevel() };
  }

  @Patch("alert-level")
  @RequirePermission("orsec:update")
  @ApiOperation({
    summary: "Changer le niveau d'alerte national — décision de commandement.",
    description:
      "Le niveau cadence les comptes rendus attendus (SITREP) : N1 quotidien, N2 8 h, N3 4 h, N4 horaire. " +
      "Le changement est journalisé dans le fil et dans le journal d'audit.",
  })
  setAlertLevel(@Body() dto: AlertLevelDto, @CurrentUser() user: AuthUser) {
    return { level: this.domain.setAlertLevel(dto.level, user.username) };
  }

  @Delete("incidents/:id")
  @RequirePermission("incidents:delete")
  @ApiOperation({
    summary: "Supprimer définitivement un incident — SUPERADMIN uniquement.",
    description:
      "La matrice n'accorde `incidents:delete` à personne : seul le joker du Super Administrateur la détient. " +
      "L'archivage reste le geste par défaut de tous les autres rôles. La suppression cascade sur les " +
      "sous-incidents, les boucles (annulées avec motif puis purgées) et le canal de l'incident.",
  })
  @ApiResponse({ status: 403, description: "Réservé au Super Administrateur." })
  @ApiResponse({ status: 404, description: "Incident inconnu." })
  async deleteIncident(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const inc = this.domain.listIncidents().find((i) => i.id === id);
    if (!inc) throw new NotFoundException(`Incident inconnu : ${id}`);
    const res = await this.domain.deleteIncident(id, user.username);
    // Le canal part avec son incident : le garder orphelin ne servirait
    // personne, et la conversation n'a plus d'objet.
    const chan = this.comms.findChannel(`c-${id.toLowerCase()}`);
    if (chan) this.comms.deleteChannel(chan.id, () => false);
    return { deleted: res.id, cascades: res.cascades };
  }

  @Post("incidents")
  @RequirePermission("incidents:create")
  @ApiOperation({ summary: "Déclarer un incident (audité) — type validé contre le catalogue" })
  createIncident(@Body() dto: CreateIncidentDto) {
    if (!this.incidentTypes.isValid(dto.type)) {
      throw new BadRequestException(`Type d'incident inconnu : ${dto.type}`);
    }
    const inc = this.domain.createIncident(dto);
    // Tout incident naît avec son canal de coordination (ADR 0007, P1-a) : les
    // intervenants ont un lieu pour se parler dès la déclaration, et les jalons
    // de boucle viendront s'y inscrire tout seuls. Le canal porte le TITRE de
    // l'opération — c'est sous ce nom que l'état-major la désigne à l'oral.
    this.comms.channelForIncident(inc.id, inc.titre);
    // Le wali et le commandant de place d'armes de la région sont prévenus à
    // la déclaration — eux, et eux seuls : l'alerte est adressée, pas diffusée.
    // Elle porte le point de l'incident, pour que leur carte s'y centre.
    // …et, avec eux, les commandants d'unité, directeurs d'hôpital, responsables
    // de morgue et d'abri dont l'établissement est dans la région : l'incident
    // les concerne, ils le verront (même règle de région que la visibilité).
    const autorites = this.users.listByRegion(inc.region, REGIONAL_AUTHORITY_ROLES).map((u) => u.matricule);
    const responsables = this.users
      .listResponsibles()
      .filter((r) => r.kind !== "incident" && this.domain.regionOfEntity(r.kind, r.entityId) === inc.region)
      .map((r) => r.matricule);
    const destinataires = [...new Set([...autorites, ...responsables].map((m) => m.toLowerCase()))];
    if (destinataires.length > 0) {
      this.notices.push(destinataires, { kind: "incident_declared", incidentId: inc.id, titre: inc.titre, region: inc.region, ll: inc.ll, sev: inc.sev, type: inc.type });
    }
    return inc;
  }

  @Patch("incidents/:id")
  @RequirePermission("incidents:update")
  @ApiOperation({ summary: "Modifier ou archiver un incident (audité)" })
  updateIncident(@Param("id") id: string, @Body() dto: UpdateIncidentDto) {
    if (dto.type && !this.incidentTypes.isValid(dto.type)) {
      throw new BadRequestException(`Type d'incident inconnu : ${dto.type}`);
    }
    const inc = this.domain.updateIncident(id, dto);
    if (!inc) throw new NotFoundException(`Incident inconnu : ${id}`);
    return inc;
  }

  // --- bilan des victimes : décédés (identification préliminaire), blessés, disparus ---
  // Les intervenants affinent ce que la déclaration n'a compté qu'en nombre ;
  // un décédé affecté à une morgue y ouvre son dossier, réception à confirmer.
  // Le RBAC dit QUI peut affiner ; la visibilité (`assertCanSee`) dit SUR
  // QUEL incident — une cellule déployée n'affine que le sien, un responsable
  // d'hôpital ceux qui l'engagent. Des identités et des CNI sont en jeu.

  @Get("incidents/:id/victims")
  @RequirePermission("victims:view")
  @ApiOperation({ summary: "Victimes nommées d'un incident — dans son périmètre de visibilité" })
  victims(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    return this.domain.listVictims(id);
  }

  @Post("incidents/:id/victims")
  @RequirePermission("victims:create")
  @ApiOperation({ summary: "Ajouter une victime nommée (décédé, blessé, disparu) — dans son périmètre" })
  addVictim(@Param("id") id: string, @Body() dto: CreateVictimDto, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    const v = this.domain.addVictim(id, dto, user.username);
    if (!v) throw new NotFoundException(`Incident inconnu : ${id}`);
    return v;
  }

  @Patch("incidents/:id/victims/:vid")
  @RequirePermission("victims:update")
  @ApiOperation({ summary: "Corriger une victime nommée — dans son périmètre" })
  updateVictim(@Param("id") id: string, @Param("vid") vid: string, @Body() dto: UpdateVictimDto, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    const res = this.domain.updateVictim(id, vid, dto, user.username);
    if (res.missing) throw new NotFoundException(`Victime introuvable : ${vid}`);
    if (res.error) throw new ConflictException(res.error);
    return res.victim;
  }

  @Delete("incidents/:id/victims/:vid")
  @RequirePermission("victims:update")
  @ApiOperation({ summary: "Retirer une victime nommée — tant qu'elle n'est pas affectée à une morgue, dans son périmètre" })
  removeVictim(@Param("id") id: string, @Param("vid") vid: string, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    const res = this.domain.removeVictim(id, vid);
    if (res.missing) throw new NotFoundException(`Victime introuvable : ${vid}`);
    if (res.error) throw new ConflictException(res.error);
    return { ok: true };
  }

  @Post("incidents/:id/victims/:vid/morgue")
  @RequirePermission("victims:update")
  @ApiOperation({ summary: "Affecter un décédé à une morgue : le dossier s'ouvre là-bas, réception à confirmer — dans son périmètre" })
  assignVictimMorgue(@Param("id") id: string, @Param("vid") vid: string, @Body() dto: AssignMorgueDto, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    const res = this.domain.assignVictimMorgue(id, vid, dto.mid, user.username);
    if (res.missing) throw new NotFoundException(`Victime introuvable : ${vid}`);
    if (res.error) throw new ConflictException(res.error);
    return res.victim;
  }

  @Get("sub-incident-types")
  @RequirePermission("subincidents:view")
  @ApiOperation({ summary: "Catalogue des sous-types + mapping par type d'incident principal" })
  subIncidentTypesList() {
    return this.subIncidentTypes.list();
  }

  @Post("incidents/:id/sub-incidents")
  @RequirePermission("subincidents:create")
  @ApiOperation({ summary: "Rattacher un sous-incident (aléa secondaire) à un incident (audité)" })
  addSubIncident(@Param("id") id: string, @Body() dto: CreateSubIncidentDto) {
    if (!this.subIncidentTypes.isValid(dto.type)) {
      throw new BadRequestException(`Sous-type inconnu : ${dto.type}`);
    }
    const inc = this.domain.addSubIncident(id, dto);
    if (!inc) throw new NotFoundException(`Incident inconnu : ${id}`);
    return inc;
  }

  @Delete("incidents/:id/sub-incidents/:subId")
  @RequirePermission("subincidents:archive")
  @ApiOperation({ summary: "Détacher un sous-incident (audité)" })
  removeSubIncident(@Param("id") id: string, @Param("subId") subId: string) {
    const inc = this.domain.removeSubIncident(id, subId);
    if (!inc) throw new NotFoundException(`Incident inconnu : ${id}`);
    return inc;
  }

  // --- DÉPLOIEMENT DES POSTES (lot V-2) -------------------------------------
  //
  // Armer une opération est un acte de commandement, pas une modification de
  // fiche : il a un auteur, il retire l'officier de l'opération précédente, et
  // il décide de ce que cet officier VERRA (doctrine V-1). D'où trois routes
  // dédiées plutôt qu'un champ noyé dans `PATCH /iam/users/:id`.
  //
  // Double contrôle : `incidents:update` (le RBAC — admin, OPCOM, TACOM) PUIS
  // la visibilité de l'incident. Sans le second, un OPCOM déployé sur une
  // opération pourrait armer celle d'un autre en devinant son identifiant. Avec
  // lui, un OPCOM non déployé ne voit aucune opération et ne peut donc s'auto-
  // déployer nulle part : le geste vient toujours d'en haut.

  // --- chaîne de commandement : affectation et déploiement des unités (ADR 0016) ---

  @Get("incidents/:id/assignments")
  @RequirePermission("assign:view")
  @ApiOperation({
    summary: "Unités affectées à l'opération, avec leur destination (PCO / PCT) et leur déploiement.",
    description: "Visible par qui voit déjà l'incident. Le TACOM y lit ce que l'OPCOM lui a affecté.",
  })
  listAssignments(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    return { assignments: this.domain.listAssignments(id), assignableCorps: assignableCorps(user.role), canDeploy: canDeploy(user.role) };
  }

  @Post("incidents/:id/assignments")
  @RequirePermission("assign:create")
  @ApiOperation({
    summary: "Affecter une unité à l'opération (OPCOM).",
    description:
      "Chaque membre de l'OPCOM affecte les unités de SON corps : wali et Intérieur → DGSN, DGPC, FA ; gendarmerie → " +
      "Gendarmerie Royale (vers le PCO) ; état-major et place d'armes → FAR (vers le PCO ou le PCT) ; le chef de l'OPCOM, tout. " +
      "Une unité n'est affectée qu'à une opération à la fois.",
  })
  @ApiResponse({ status: 403, description: "Le rôle n'affecte pas les unités de ce corps." })
  @ApiResponse({ status: 409, description: "L'unité est déjà affectée à une autre opération, ou déployée." })
  assignUnit(@Param("id") id: string, @Body() dto: AssignUnitDto, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    const res = this.domain.assignUnit(id, dto.unitId, user.username, user.role, dto.destination);
    if (res.missing === "incident") throw new NotFoundException(`Incident inconnu : ${id}`);
    if (res.missing === "unit") throw new NotFoundException(`Unité inconnue : ${dto.unitId}`);
    if (res.conflict) throw new ConflictException(res.error);
    if (res.error) throw new ForbiddenException(res.error);
    return res.assignment;
  }

  @Delete("incidents/:id/assignments/:unitId")
  @RequirePermission("assign:update")
  @ApiOperation({ summary: "Retirer une unité de l'opération (OPCOM) — retirée du terrain si elle y était" })
  unassignUnit(@Param("id") id: string, @Param("unitId") unitId: string, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    const res = this.domain.unassignUnit(id, unitId, user.username);
    if (res.missing) throw new NotFoundException(`Affectation inconnue : ${unitId} sur ${id}`);
    return { removed: unitId };
  }

  @Post("incidents/:id/assignments/:unitId/deploy")
  @RequirePermission("deploy:update")
  @ApiOperation({ summary: "Déployer sur le terrain une unité affectée (TACOM, PCO, PCT, cellules)" })
  deployUnit(@Param("id") id: string, @Param("unitId") unitId: string, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    if (!canDeploy(user.role)) throw new ForbiddenException("Le déploiement revient au TACOM, à ses PC et aux cellules.");
    const res = this.domain.setDeployed(id, unitId, true, user.username);
    if (res.missing) throw new NotFoundException(`Affectation inconnue : ${unitId} sur ${id}`);
    return res.assignment;
  }

  @Post("incidents/:id/assignments/:unitId/withdraw")
  @RequirePermission("deploy:update")
  @ApiOperation({ summary: "Retirer du terrain une unité déployée — elle reste affectée au PC" })
  withdrawUnit(@Param("id") id: string, @Param("unitId") unitId: string, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    if (!canDeploy(user.role)) throw new ForbiddenException("Le retrait du terrain revient au TACOM, à ses PC et aux cellules.");
    const res = this.domain.setDeployed(id, unitId, false, user.username);
    if (res.missing) throw new NotFoundException(`Affectation inconnue : ${unitId} sur ${id}`);
    return res.assignment;
  }

  @Get("incidents/:id/deployments")
  @RequirePermission("incidents:view")
  @ApiOperation({
    summary: "Postes déployés sur cette opération.",
    description: "Visible par qui voit déjà l'incident — la section « Postes déployés » de la fiche.",
  })
  @ApiResponse({ status: 404, description: "Incident inconnu ou hors de la portée du compte." })
  listDeployments(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    this.assertCanSee(id, user);
    return this.deployment.listDeployed(id, user.role);
  }

  @Get("deployable-posts")
  // `incidents:view` et non `incidents:update` (ADR 0018) : l'utilisateur
  // stratégique, qui pose les OPCOM sur la carte, doit lire qui peut l'être —
  // un annuaire des comptes déployables, rien que le commandement ne sache déjà.
  @RequirePermission("incidents:view")
  @ApiOperation({
    summary: "Comptes déployables, avec leur affectation courante.",
    description:
      "Renvoie AUSSI l'opération que chaque compte sert déjà : le commandement doit voir qui il " +
      "s'apprête à retirer d'ailleurs avant de cliquer, et non le découvrir après.",
  })
  listDeployablePosts(@CurrentUser() user: AuthUser) {
    return this.deployment.listDeployable(user.role);
  }

  @Post("incidents/:id/deployments")
  @RequirePermission("incidents:update")
  @ApiOperation({
    summary: "Déployer un poste sur l'opération.",
    description:
      "UN SEUL incident à la fois : le compte est retiré de l'opération qu'il servait, et ce retrait " +
      "figure dans le fil et dans le journal d'audit. Refusé si l'opération est close ou archivée, ou " +
      "si le compte n'occupe pas un poste déployable.",
  })
  @ApiResponse({ status: 400, description: "Le compte n'occupe pas un poste déployable." })
  @ApiResponse({ status: 404, description: "Incident ou compte inconnu." })
  @ApiResponse({ status: 409, description: "Opération close ou archivée." })
  deployPost(
    @Param("id") id: string,
    @Body() dto: DeployPostDto,
    @CurrentUser() user: AuthUser,
    @AuditMeta() audit: AuditMetaSetter,
  ) {
    this.assertCanSee(id, user);
    const res = this.deployment.deploy(id, dto.matricule, user.username);
    audit({ deployed: res.matricule, onto: res.incidentId, withdrawnFrom: res.previousIncidentId, changed: res.changed });
    return res;
  }

  @Delete("incidents/:id/deployments/:matricule")
  @RequirePermission("incidents:update")
  @ApiOperation({
    summary: "Retirer un poste de l'opération.",
    description: "Le compte perd sa portée : il ne voit plus aucun incident tant qu'il n'est pas redéployé.",
  })
  @ApiResponse({ status: 404, description: "Incident ou compte inconnu." })
  @ApiResponse({ status: 409, description: "Ce compte n'est pas déployé sur cette opération." })
  withdrawPost(
    @Param("id") id: string,
    @Param("matricule") matricule: string,
    @CurrentUser() user: AuthUser,
    @AuditMeta() audit: AuditMetaSetter,
  ) {
    this.assertCanSee(id, user);
    const res = this.deployment.withdraw(id, matricule, user.username);
    audit({ withdrawn: res.matricule, from: res.incidentId });
    return res;
  }

  /**
   * Portée du compte courant — doctrine de visibilité (lot V-1).
   *
   * Résolue à CHAQUE requête depuis le rôle et les affectations de la session,
   * jamais depuis la requête : un client ne peut pas revendiquer une portée.
   */
  private scopeFor(user: AuthUser) {
    return this.visibility.scopeOfUser(user.role, user.scope, (kind, id) => this.domain.regionOfEntity(kind, id));
  }

  /**
   * L'incident est-il dans la portée de ce compte ? Renvoie 404 et non 403 :
   * répondre « interdit » confirmerait l'existence d'une opération que le compte
   * n'a pas à connaître.
   */
  private assertCanSee(id: string, user: AuthUser): void {
    const inc = this.domain.listIncidents().find((i) => i.id === id);
    if (!inc) throw new NotFoundException(`Incident inconnu : ${id}`);
    if (!this.visibility.canSeeIncident(inc, this.scopeFor(user), this.entitiesOn)) {
      throw new NotFoundException(`Incident inconnu : ${id}`);
    }
  }
}
