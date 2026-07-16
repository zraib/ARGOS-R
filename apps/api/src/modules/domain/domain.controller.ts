import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DomainService } from "@/modules/domain/domain.service";
import { CatalogService } from "@/modules/domain/catalog.service";
import { CommsService } from "@/modules/domain/comms.service";
import {
  CreateCategoryDto,
  CreateChannelDto,
  CreateHospitalDto,
  CreateIncidentDto,
  CreateUnitDto,
  SendMessageDto,
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
  ) {}

  @Get("catalog")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Catalogue des modules opérationnels (inventaire, triage, ORSEC, …)" })
  catalogAll() {
    return this.catalog.all();
  }

  @Get("incidents")
  @RequirePermission("incidents:read")
  @ApiOperation({ summary: "Liste des incidents" })
  incidents() {
    return this.domain.listIncidents();
  }

  @Post("incidents")
  @RequirePermission("incidents:create")
  @ApiOperation({ summary: "Déclarer un incident (audité)" })
  createIncident(@Body() dto: CreateIncidentDto) {
    return this.domain.createIncident(dto);
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
}
