import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RiskService } from "@/modules/domain/risk.service";
import { DeploymentService } from "@/modules/domain/deployment.service";
import { DomainService } from "@/modules/domain/domain.service";
import { VisibilityService } from "@/modules/domain/visibility.service";
import { CITIES_MA } from "@/modules/domain/cities.data";
import { CatalogService } from "@/modules/domain/catalog.service";
import { CommsService } from "@/modules/domain/comms.service";
import { IncidentTypesService } from "@/modules/domain/incident-types.service";
import { SubIncidentTypesService } from "@/modules/domain/sub-incident-types.service";
import { SeismicService } from "@/modules/domain/seismic.service";
import { SeismicAlertsService } from "@/modules/domain/seismic-alerts.service";
import { WeatherService } from "@/modules/domain/weather.service";
import {
  CreateCategoryDto,
  CreateChannelDto,
  UpdateChannelDto,
  AlertLevelDto,
  PublishSitrepDto,
  ChannelMembersDto,
  CreateHospitalDto,
  CreateIncidentDto,
  CreateSubIncidentDto,
  AdmitBodyDto,
  CreateEquipDto,
  CreateWardDto,
  CreateUnitDto,
  RegisterIncidentTypeDto,
  SendMessageDto,
  UpdateHospitalDto,
  UpdateIncidentDto,
  UpdateEquipDto,
  UpdateMorgueDto,
  UpdateMortuaryRecordDto,
  UpdateShelterDto,
  UpdateUnitDto,
  UpdateWardDto,
  UpdateSeismicAlertConfigDto,
  DeployPostDto,
} from "@/modules/domain/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { RequireScope } from "@/common/decorators/require-scope.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { AuditMeta, type AuditMetaSetter } from "@/common/decorators/audit-meta.decorator";

/**
 * Entités opérationnelles (Phase 2). Lecture protégée par le RBAC ; la création
 * d'incident est auditée (interceptor). En production, adossé à PostgreSQL/PostGIS.
 */
@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class DomainController {
  constructor(
    private readonly risk: RiskService,
    private readonly domain: DomainService,
    private readonly visibility: VisibilityService,
    private readonly deployment: DeploymentService,
    private readonly catalog: CatalogService,
    private readonly comms: CommsService,
    private readonly incidentTypes: IncidentTypesService,
    private readonly subIncidentTypes: SubIncidentTypesService,
    private readonly seismic: SeismicService,
    private readonly seismicAlerts: SeismicAlertsService,
    private readonly weather: WeatherService,
  ) {}

  @Get("catalog")
  @RequirePermission("dashboard:view")
  @ApiOperation({ summary: "Catalogue des modules opérationnels (inventaire, triage, ORSEC, …)" })
  catalogAll() {
    return this.catalog.all();
  }

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

  @Get("dashboard/stats")
  @RequirePermission("dashboard:view")
  @ApiOperation({ summary: "Statistiques de commandement : évolution 30 j, gravité, bilan humain, saturation hospitalière, posture des unités" })
  dashboardStats() {
    return this.domain.stats();
  }

  @Get("dashboard/risk")
  @RequirePermission("dashboard:view")
  @ApiOperation({
    summary: "Prédictions de risques (moteur déterministe, calculé côté serveur)",
    description:
      "Le moteur tourne UNE fois sur les données faisant foi de l'API (mémo 5 s) au lieu de N fois " +
      "dans N navigateurs. L'enveloppe expose computeMs et cached pour rendre le coût observable.",
  })
  dashboardRisk() {
    return this.risk.predictions();
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
   * Portée du compte courant — doctrine de visibilité (lot V-1).
   *
   * Résolue à CHAQUE requête depuis le rôle et les affectations de la session,
   * jamais depuis la requête : un client ne peut pas revendiquer une portée.
   */
  private scopeFor(user: AuthUser) {
    return this.visibility.scopeOfUser(user.role, user.scope);
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

  @Patch("comms/channels/:id")
  @RequirePermission("comms:update")
  @ApiOperation({ summary: "Renommer un canal / changer son sujet." })
  @ApiResponse({ status: 404, description: "Canal inconnu." })
  updateChannel(@Param("id") id: string, @Body() dto: UpdateChannelDto) {
    return this.comms.updateChannel(id, dto);
  }

  @Post("comms/channels/:id/members")
  @RequirePermission("comms:update")
  @ApiOperation({
    summary: "Ajouter des membres à un canal.",
    description: "Un canal OUVERT devient restreint dès son premier membre — le geste est explicite.",
  })
  addChannelMembers(@Param("id") id: string, @Body() dto: ChannelMembersDto) {
    return this.comms.addMembers(id, dto.matricules);
  }

  @Delete("comms/channels/:id/members/:matricule")
  @RequirePermission("comms:update")
  @ApiOperation({ summary: "Retirer un membre d'un canal." })
  removeChannelMember(@Param("id") id: string, @Param("matricule") matricule: string) {
    return this.comms.removeMember(id, matricule);
  }

  @Delete("comms/channels/:id")
  @RequirePermission("comms:delete")
  @ApiOperation({
    summary: "Supprimer définitivement un canal — SUPERADMIN uniquement.",
    description:
      "Refusé tant que l'incident porteur est actif : effacer la conversation d'une opération en cours " +
      "détruirait la trace au moment où elle sert le plus. Archiver l'incident d'abord.",
  })
  @ApiResponse({ status: 400, description: "L'incident porteur est encore actif." })
  @ApiResponse({ status: 403, description: "Réservé au Super Administrateur." })
  deleteChannel(@Param("id") id: string) {
    this.comms.deleteChannel(id, (incidentId) => this.domain.isIncidentActive(incidentId));
    return { deleted: id };
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
    // de boucle viendront s'y inscrire tout seuls.
    this.comms.channelForIncident(inc.id);
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

  @Get("feed")
  @RequirePermission("dashboard:view")
  @ApiOperation({ summary: "Fil des événements" })
  feed() {
    return this.domain.listFeed();
  }

  @Get("dispatch/queue")
  @RequirePermission("dispatch:view")
  @ApiOperation({ summary: "File de dispatching (besoins entrants)" })
  queue() {
    return this.domain.listQueue();
  }

  @Get("dispatch/movements")
  @RequirePermission("dispatch:view")
  @ApiOperation({ summary: "Mouvements de transport en cours" })
  movements() {
    return this.domain.listMovements();
  }

  @Get("comms")
  @ApiOperation({ summary: "Centre de communication : canaux, messages, présence" })
  commsAll() {
    return this.comms.all();
  }

  @Post("comms/messages")
  @ApiOperation({ summary: "Envoyer un message dans un canal (audité)" })
  sendMessage(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    const initials = user.username.slice(0, 2).toUpperCase();
    return this.comms.addMessage(dto.channelId, {
      who: user.username,
      initials,
      av: "bg-or-500 text-rdia-600",
      txt: dto.txt,
    });
  }

  @Post("comms/categories")
  @ApiOperation({ summary: "Créer un groupe de canaux (audité)" })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.comms.addCategory(dto.name);
  }

  @Post("comms/channels")
  @ApiOperation({ summary: "Créer un canal texte dans un groupe (audité)" })
  createChannel(@Body() dto: CreateChannelDto) {
    return this.comms.addChannel(dto.categoryId, dto.name);
  }

  @Get("reference")
  @ApiOperation({ summary: "Données de référence : provinces, routes d'animation carte" })
  reference() {
    return this.domain.reference();
  }

  @Get("seismic/events")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Séismes récents (CSEM/EMSC, proxy souverain) — minmag & region (morocco|world)" })
  seismicEvents(@Query("minmag") minmag?: string, @Query("region") region?: string) {
    const mag = minmag ? Number(minmag) : 2.5;
    const reg = region === "morocco" ? "morocco" : "world";
    return this.seismic.recent(Number.isFinite(mag) ? mag : 2.5, reg);
  }

  @Get("seismic/alert-config")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Configuration des alertes sismiques (seuils national/mondial, autorités notifiées)" })
  seismicAlertConfig() {
    return this.seismicAlerts.getConfig();
  }

  @Patch("seismic/alert-config")
  @RequirePermission("settings:update")
  @ApiOperation({ summary: "Mettre à jour la configuration des alertes sismiques (audité)" })
  updateSeismicAlertConfig(@Body() dto: UpdateSeismicAlertConfigDto) {
    return this.seismicAlerts.updateConfig(dto);
  }

  @Get("seismic/notifications")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Historique des notifications SMS/e-mail envoyées aux autorités" })
  seismicNotifications() {
    return this.seismicAlerts.listNotifications();
  }

  @Get("weather/cities")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Villes disponibles pour la météo" })
  weatherCities() {
    return this.weather.cities();
  }

  @Get("weather/grid")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Grille de conditions actuelles (carte météo, proxy souverain)" })
  weatherGrid() {
    return this.weather.grid();
  }

  @Get("weather/grid-world")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Grille météo mondiale grossière (pas 10°, couverture planétaire de la carte)" })
  weatherGridWorld() {
    return this.weather.gridWorld();
  }

  @Get("weather/forecast")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Prévisions météo (Open-Meteo, proxy souverain) pour lat/lon" })
  weatherForecast(@Query("lat") lat: string, @Query("lon") lon: string) {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) throw new BadRequestException("lat/lon requis");
    return this.weather.forecast(la, lo);
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
  @RequirePermission("incidents:update")
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
