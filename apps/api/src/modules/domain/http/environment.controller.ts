// ============================================================================
// ARGOS — adaptateur HTTP du domaine · sismologie et météo
//
// Issu de la découpe de l'ancien `domain.controller.ts` (60 routes, 12 services
// injectés, un seul fichier). Chaque contrôleur n'injecte que ce qu'il emploie ;
// les permissions et portées de chaque route sont INCHANGÉES — la suite de tests
// et `authz-coverage.spec.ts` en font foi.
// ============================================================================

import { BadRequestException, Body, Get, Param, Patch, Query, Controller } from "@nestjs/common";
import { ApiOperation, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { UpdateSeismicAlertConfigDto } from "@/modules/domain/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { SeismicService } from "@/modules/domain/seismic.service";
import { SeismicAlertsService } from "@/modules/domain/seismic-alerts.service";
import { WeatherService } from "@/modules/domain/weather.service";
import { FloodService } from "@/modules/domain/flood.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class EnvironmentController {
  constructor(
    private readonly seismic: SeismicService,
    private readonly seismicAlerts: SeismicAlertsService,
    private readonly weather: WeatherService,
    private readonly floods: FloodService,
  ) {}

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

  // --- crues : Google Flood Hub, par le courtier de l'API (ADR 0010) ---------

  @Get("floods/status")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "État du flux des crues (clé configurée, dernière relecture, dégradation, attribution)" })
  floodStatus() {
    return this.floods.status();
  }

  @Get("floods/gauges")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Jauges du Maroc et leur dernier statut de crue (Flood Hub, proxy souverain, cache 15 min)" })
  floodGauges() {
    return this.floods.gauges();
  }

  @Get("floods/gauges/:id/forecast")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Dernière prévision émise pour une jauge, avec ses seuils d'alerte" })
  floodForecast(@Param("id") id: string) {
    return this.floods.forecast(id);
  }

  @Get("floods/polygons/:id")
  @RequirePermission("seismic:view")
  @ApiOperation({ summary: "Polygone d'inondation de Flood Hub (KML converti en GeoJSON)" })
  floodPolygon(@Param("id") id: string) {
    return this.floods.polygon(id);
  }
}
