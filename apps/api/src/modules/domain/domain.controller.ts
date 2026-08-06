import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DomainService } from "@/modules/domain/domain.service";
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
  CreateHospitalDto,
  CreateIncidentDto,
  CreateSubIncidentDto,
  CreateUnitDto,
  RegisterIncidentTypeDto,
  SendMessageDto,
  UpdateIncidentDto,
  UpdateSeismicAlertConfigDto,
} from "@/modules/domain/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";

/**
 * Entités opérationnelles (Phase 2). Lecture protégée par le RBAC ; la création
 * d'incident est auditée (interceptor). En production, adossé à PostgreSQL/PostGIS.
 */
@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class DomainController {
  constructor(
    private readonly domain: DomainService,
    private readonly catalog: CatalogService,
    private readonly comms: CommsService,
    private readonly incidentTypes: IncidentTypesService,
    private readonly subIncidentTypes: SubIncidentTypesService,
    private readonly seismic: SeismicService,
    private readonly seismicAlerts: SeismicAlertsService,
    private readonly weather: WeatherService,
  ) {}

  @Get("catalog")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Catalogue des modules opérationnels (inventaire, triage, ORSEC, …)" })
  catalogAll() {
    return this.catalog.all();
  }

  @Get("incident-types")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Catalogue paramétrable des types d'incident (libellés FR/AR/EN + icônes)" })
  incidentTypesList() {
    return this.incidentTypes.list();
  }

  @Post("incident-types")
  @RequirePermission("admin:settings:update")
  @ApiOperation({ summary: "Enregistrer un nouveau type d'incident (Super Admin, audité)" })
  registerIncidentType(@Body() dto: RegisterIncidentTypeDto) {
    return this.incidentTypes.register(dto);
  }

  @Get("dashboard/stats")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Statistiques de commandement : évolution 30 j, gravité, bilan humain, saturation hospitalière, posture des unités" })
  dashboardStats() {
    return this.domain.stats();
  }

  @Get("incidents")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Liste des incidents" })
  incidents() {
    return this.domain.listIncidents();
  }

  @Post("incidents")
  @RequirePermission("incidents:create")
  @ApiOperation({ summary: "Déclarer un incident (audité) — type validé contre le catalogue" })
  createIncident(@Body() dto: CreateIncidentDto) {
    if (!this.incidentTypes.isValid(dto.type)) {
      throw new BadRequestException(`Type d'incident inconnu : ${dto.type}`);
    }
    return this.domain.createIncident(dto);
  }

  @Patch("incidents/:id")
  @RequirePermission("incidents:create")
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
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Catalogue des sous-types + mapping par type d'incident principal" })
  subIncidentTypesList() {
    return this.subIncidentTypes.list();
  }

  @Post("incidents/:id/sub-incidents")
  @RequirePermission("incidents:create")
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
  @RequirePermission("incidents:create")
  @ApiOperation({ summary: "Détacher un sous-incident (audité)" })
  removeSubIncident(@Param("id") id: string, @Param("subId") subId: string) {
    const inc = this.domain.removeSubIncident(id, subId);
    if (!inc) throw new NotFoundException(`Incident inconnu : ${id}`);
    return inc;
  }

  @Get("units")
  @RequirePermission("org:units:read")
  @ApiOperation({ summary: "Liste des unités" })
  units() {
    return this.domain.listUnits();
  }

  @Post("units")
  @RequirePermission("org:units:manage")
  @ApiOperation({ summary: "Créer une unité (audité)" })
  createUnit(@Body() dto: CreateUnitDto) {
    return this.domain.createUnit(dto);
  }

  @Get("hospitals")
  @RequirePermission("org:hospitals:read")
  @ApiOperation({ summary: "Liste des hôpitaux" })
  hospitals() {
    return this.domain.listHospitals();
  }

  @Post("hospitals")
  @RequirePermission("org:hospitals:manage")
  @ApiOperation({ summary: "Créer un hôpital (audité)" })
  createHospital(@Body() dto: CreateHospitalDto) {
    return this.domain.createHospital(dto);
  }

  @Get("field-hospitals")
  @RequirePermission("org:hospitals:read")
  @ApiOperation({ summary: "Hôpitaux de campagne déployés" })
  fieldHospitals() {
    return this.domain.listFieldHospitals();
  }

  @Get("feed")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Fil des événements" })
  feed() {
    return this.domain.listFeed();
  }

  @Get("dispatch/queue")
  @RequirePermission("dispatch:assign")
  @ApiOperation({ summary: "File de dispatching (besoins entrants)" })
  queue() {
    return this.domain.listQueue();
  }

  @Get("dispatch/movements")
  @RequirePermission("dispatch:assign")
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
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Séismes récents (CSEM/EMSC, proxy souverain) — minmag & region (morocco|world)" })
  seismicEvents(@Query("minmag") minmag?: string, @Query("region") region?: string) {
    const mag = minmag ? Number(minmag) : 2.5;
    const reg = region === "morocco" ? "morocco" : "world";
    return this.seismic.recent(Number.isFinite(mag) ? mag : 2.5, reg);
  }

  @Get("seismic/alert-config")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Configuration des alertes sismiques (seuils national/mondial, autorités notifiées)" })
  seismicAlertConfig() {
    return this.seismicAlerts.getConfig();
  }

  @Patch("seismic/alert-config")
  @RequirePermission("admin:settings:update")
  @ApiOperation({ summary: "Mettre à jour la configuration des alertes sismiques (audité)" })
  updateSeismicAlertConfig(@Body() dto: UpdateSeismicAlertConfigDto) {
    return this.seismicAlerts.updateConfig(dto);
  }

  @Get("seismic/notifications")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Historique des notifications SMS/e-mail envoyées aux autorités" })
  seismicNotifications() {
    return this.seismicAlerts.listNotifications();
  }

  @Get("weather/cities")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Villes disponibles pour la météo" })
  weatherCities() {
    return this.weather.cities();
  }

  @Get("weather/grid")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Grille de conditions actuelles (carte météo, proxy souverain)" })
  weatherGrid() {
    return this.weather.grid();
  }

  @Get("weather/grid-world")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Grille météo mondiale grossière (pas 10°, couverture planétaire de la carte)" })
  weatherGridWorld() {
    return this.weather.gridWorld();
  }

  @Get("weather/forecast")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Prévisions météo (Open-Meteo, proxy souverain) pour lat/lon" })
  weatherForecast(@Query("lat") lat: string, @Query("lon") lon: string) {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) throw new BadRequestException("lat/lon requis");
    return this.weather.forecast(la, lo);
  }
}
