// ============================================================================
// ARGOS — adaptateur HTTP des missions
//
// Rôle unique : traduire HTTP ↔ cas d'usage. Il valide la forme (DTO), appelle
// `MissionService`, et convertit les erreurs de DOMAINE en codes HTTP. Aucune
// règle métier ici : si une condition d'acceptation se décidait dans ce
// fichier, elle serait à la mauvaise place.
//
// DEUX GARDES DISTINCTES, et c'est voulu :
//  1. `@RequirePermission` — le RBAC dit si ce RÔLE peut toucher aux missions
//     (default-deny, appliqué côté serveur) ;
//  2. le domaine — la règle de boucle dit si CET ACTEUR peut faire CE geste
//     sur CETTE mission (seul le destinataire accepte, seul l'émetteur annule).
//     Elle rend 403, comme un refus d'autorisation, car c'en est un.
//
// Les mutations sont journalisées par l'intercepteur d'audit global.
// ============================================================================

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { responsibilityOfRole } from "@/shared/responsibilities";
import { MissionService } from "@/modules/missions/application/mission.service";
import {
  isMissionKind,
  isMissionState,
  type MissionActor,
} from "@/modules/missions/domain/mission";
import {
  MissionActorError,
  MissionNotFoundError,
  MissionTransitionError,
  MissionValidationError,
} from "@/modules/missions/domain/mission-errors";
import { IssueMissionDto, MilestoneDto, ReasonDto } from "@/modules/missions/http/dto";

/**
 * Construit l'acteur du domaine depuis la session. L'entité vient de la portée
 * ABAC résolue côté serveur à chaque requête — jamais du corps de la requête :
 * un client ne peut pas revendiquer être le destinataire d'une mission.
 */
function actorOf(user: AuthUser): MissionActor {
  const kind = responsibilityOfRole(user.role);
  return {
    userId: user.username,
    role: user.role,
    ...(kind && user.scope?.[kind] ? { entity: user.scope[kind] } : {}),
  };
}

@ApiTags("missions")
@ApiBearerAuth()
@Controller("missions")
export class MissionsController {
  constructor(private readonly missions: MissionService) {}

  @Get()
  @RequirePermission("missions:view")
  @ApiOperation({ summary: "Missions filtrées (incident, nature, état, boucles ouvertes)." })
  @ApiQuery({ name: "incidentId", required: false })
  @ApiQuery({ name: "kind", required: false, description: "order · resource_request · transfer" })
  @ApiQuery({ name: "state", required: false })
  @ApiQuery({ name: "openOnly", required: false, type: Boolean })
  async list(
    @Query("incidentId") incidentId?: string,
    @Query("kind") kind?: string,
    @Query("state") state?: string,
    @Query("openOnly") openOnly?: string,
  ) {
    return {
      missions: await this.missions.list({
        ...(incidentId ? { incidentId } : {}),
        ...(isMissionKind(kind) ? { kind } : {}),
        ...(isMissionState(state) ? { state } : {}),
        ...(openOnly === "true" ? { openOnly: true } : {}),
      }),
    };
  }

  @Get("inbox")
  @RequirePermission("missions:view")
  @ApiOperation({
    summary: "Boucles ouvertes attendant un geste de moi.",
    description:
      "Ce que l'écran « Ordres reçus » affiche et ce que compte la pastille de la barre haute. " +
      "Le destinataire est résolu depuis la session (rôle + entité affectée), jamais depuis la requête.",
  })
  async inbox(@CurrentUser() user: AuthUser) {
    return { missions: await this.missions.inbox(actorOf(user)) };
  }

  @Get("outbox")
  @RequirePermission("missions:view")
  @ApiOperation({ summary: "Boucles ouvertes que j'ai émises — le suivi de mes demandes." })
  async outbox(@CurrentUser() user: AuthUser) {
    return { missions: await this.missions.outbox(actorOf(user)) };
  }

  @Get(":id")
  @RequirePermission("missions:view")
  @ApiOperation({ summary: "Une mission par son identifiant." })
  @ApiResponse({ status: 404, description: "Mission introuvable." })
  async byId(@Param("id") id: string) {
    return this.run(() => this.missions.byId(id));
  }

  @Post()
  @RequirePermission("missions:create")
  @ApiOperation({
    summary: "Émettre une mission (ordre, demande de moyen, transfert).",
    description: "Ouvre une boucle : le destinataire devra l'accepter ou la refuser avec motif.",
  })
  @ApiResponse({ status: 400, description: "Corps invalide ou nature de mission inconnue." })
  async issue(@Body() dto: IssueMissionDto, @CurrentUser() user: AuthUser) {
    const me = actorOf(user);
    return this.run(() =>
      this.missions.issue(
        {
          incidentId: dto.incidentId,
          label: dto.label,
          to: dto.to,
          // Émetteur déduit de la session par défaut : on ne laisse pas un
          // client se déclarer émetteur d'une boucle qu'il n'ouvre pas.
          from: dto.from ?? { role: me.role, userId: me.userId, ...(me.entity ? { entity: me.entity } : {}) },
          payload: dto.payload as never,
        },
        me.userId,
      ),
    );
  }

  @Post(":id/accept")
  @RequirePermission("missions:update")
  @ApiOperation({ summary: "Accuser réception — réservé au destinataire." })
  @ApiResponse({ status: 403, description: "Vous n'êtes pas le destinataire de cette mission." })
  @ApiResponse({ status: 409, description: "Transition impossible dans l'état courant." })
  async accept(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.run(() => this.missions.accept(id, actorOf(user)));
  }

  @Post(":id/decline")
  @RequirePermission("missions:update")
  @ApiOperation({ summary: "Refuser avec motif — réservé au destinataire." })
  @ApiResponse({ status: 400, description: "Motif manquant." })
  @ApiResponse({ status: 403, description: "Vous n'êtes pas le destinataire de cette mission." })
  async decline(@Param("id") id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.run(() => this.missions.decline(id, actorOf(user), dto.reason));
  }

  @Post(":id/milestone")
  @RequirePermission("missions:update")
  @ApiOperation({ summary: "Franchir un jalon (en route, sur zone, relève) — réservé au destinataire." })
  @ApiResponse({ status: 403, description: "Vous n'êtes pas le destinataire de cette mission." })
  @ApiResponse({ status: 409, description: "La mission doit d'abord être acceptée." })
  async milestone(@Param("id") id: string, @Body() dto: MilestoneDto, @CurrentUser() user: AuthUser) {
    return this.run(() => this.missions.milestone(id, actorOf(user), dto.key));
  }

  @Post(":id/complete")
  @RequirePermission("missions:update")
  @ApiOperation({ summary: "Clore la boucle — réservé au destinataire." })
  @ApiResponse({ status: 403, description: "Vous n'êtes pas le destinataire de cette mission." })
  async complete(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.run(() => this.missions.complete(id, actorOf(user)));
  }

  @Post(":id/cancel")
  @RequirePermission("missions:update")
  @ApiOperation({ summary: "Annuler avec motif — réservé à l'émetteur." })
  @ApiResponse({ status: 400, description: "Motif manquant." })
  @ApiResponse({ status: 403, description: "Seul l'émetteur peut annuler." })
  async cancel(@Param("id") id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.run(() => this.missions.cancel(id, actorOf(user), dto.reason));
  }

  /**
   * Traduit les erreurs de domaine en réponses HTTP. C'est la SEULE frontière
   * où le métier devient du protocole — le service et l'agrégat ignorent tout
   * de HTTP.
   */
  private async run<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      if (e instanceof MissionNotFoundError) throw new NotFoundException(e.message);
      if (e instanceof MissionActorError) throw new ForbiddenException(e.message);
      if (e instanceof MissionTransitionError) throw new ConflictException(e.message);
      if (e instanceof MissionValidationError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
