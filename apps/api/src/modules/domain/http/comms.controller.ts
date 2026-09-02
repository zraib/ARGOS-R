// ============================================================================
// ARGOS — adaptateur HTTP du domaine · centre de communication — canaux, messages, membres (les écritures poussent le temps réel)
//
// Issu de la découpe de l'ancien `domain.controller.ts` (60 routes, 12 services
// injectés, un seul fichier). Chaque contrôleur n'injecte que ce qu'il emploie ;
// les permissions et portées de chaque route sont INCHANGÉES — la suite de tests
// et `authz-coverage.spec.ts` en font foi.
// ============================================================================

import { Body, Delete, Get, Param, Patch, Post, Controller } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { CreateCategoryDto, CreateChannelDto, UpdateChannelDto, ChannelMembersDto, SendMessageDto } from "@/modules/domain/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { DomainService } from "@/modules/domain/domain.service";
import { CommsService } from "@/modules/domain/comms.service";
import { RealtimeService } from "@/modules/realtime/realtime.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class CommsController {
  constructor(
    private readonly domain: DomainService,
    private readonly comms: CommsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Patch("comms/channels/:id")
  // ADMINISTRATION, pas participation : un canal renommé sous les pieds d'une
  // conduite en cours ne se rattrape pas. `comms:update` reste ce qui gouverne
  // la gestion des MEMBRES, geste opérationnel ordinaire.
  @RequirePermission("comms_admin:update")
  @ApiOperation({ summary: "Renommer un canal / changer son sujet." })
  @ApiResponse({ status: 404, description: "Canal inconnu." })
  updateChannel(@Param("id") id: string, @Body() dto: UpdateChannelDto) {
    const chan = this.comms.updateChannel(id, dto);
    this.realtime.emit({ kind: "channel", action: "updated", channelId: id, payload: chan });
    return chan;
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
  @RequirePermission("comms_admin:delete")
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
    this.realtime.emit({ kind: "channel", action: "deleted", channelId: id });
    return { deleted: id };
  }

  // CES QUATRE ROUTES ÉTAIENT OUVERTES. La garde RBAC laisse passer toute route
  // qui ne déclare pas de permission : n'importe quel compte authentifié pouvait
  // donc écrire dans n'importe quel canal et créer des groupes. Elles sont
  // refermées ici (lot COMMS).
  @Get("comms")
  @RequirePermission("comms:view")
  @ApiOperation({ summary: "Centre de communication : canaux, messages, présence" })
  commsAll() {
    return this.comms.all();
  }

  @Post("comms/messages")
  // `comms:view` et non `comms:create` : la matrice réserve `create` à
  // l'administration, et un centre de communication où l'on peut lire sans
  // répondre n'est pas un centre de communication. Prendre la parole fait
  // partie de la participation, pas de l'administration.
  @RequirePermission("comms:view")
  @ApiOperation({ summary: "Envoyer un message dans un canal (audité)" })
  sendMessage(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    const initials = user.username.slice(0, 2).toUpperCase();
    const msg = this.comms.addMessage(dto.channelId, {
      who: user.username,
      initials,
      av: "bg-or-500 text-rdia-600",
      txt: dto.txt,
      attachment: dto.attachment,
    });
    // Poussé APRÈS l'enregistrement : ce qui est diffusé est ce qui est gardé.
    this.realtime.emit({ kind: "message", channelId: dto.channelId, message: msg });
    return msg;
  }

  @Post("comms/categories")
  @RequirePermission("comms_admin:create")
  @ApiOperation({ summary: "Créer un groupe de canaux — ADMINISTRATION (audité)" })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.comms.addCategory(dto.name);
  }

  @Post("comms/channels")
  @RequirePermission("comms_admin:create")
  @ApiOperation({
    summary: "Créer un canal texte dans un groupe — ADMINISTRATION (audité).",
    description:
      "Créer, renommer et supprimer un canal relèvent de `comms_admin`, ligne séparée de `comms` : " +
      "participer n'est pas administrer la structure du centre.",
  })
  createChannel(@Body() dto: CreateChannelDto) {
    const chan = this.comms.addChannel(dto.categoryId, dto.name);
    this.realtime.emit({ kind: "channel", action: "created", channelId: chan.id, payload: chan });
    return chan;
  }
}
