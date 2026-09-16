// ============================================================================
// ARGOS — adaptateur HTTP du domaine · administration : profil de données, purge
//
// Ce qui fait d'une station de démonstration une station vide (ADR 0015).
// La purge retire tout le domaine opérationnel SAUF le réseau hospitalier ;
// les comptes et la base (audit, drapeaux, bons de travail) ne sont pas
// touchés. Réservée au Super Administrateur, signée par son mot de passe.
// ============================================================================

import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { DATA_PROFILE } from "@/common/data-profile";
import { PurgeDomainDto, SetModeDto } from "@/modules/domain/dto";
import { ModeService } from "@/modules/mode/mode.service";
import { isAppMode } from "@/common/app-mode";
import { DomainService } from "@/modules/domain/domain.service";
import { UsersService } from "@/modules/iam/users.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller("domain")
export class AdminController {
  constructor(
    private readonly domain: DomainService,
    private readonly users: UsersService,
    private readonly mode: ModeService,
  ) {}

  @ApiOperation({
    summary: "Profil de données de la station et volume du domaine opérationnel.",
    description: "« demo » : le jeu de démonstration est reconstruit au démarrage ; « empty » : seuls restent les référentiels et ce que les opérateurs créent.",
  })
  @Get("profile")
  @RequirePermission("settings:view")
  profile() {
    return { profile: DATA_PROFILE, ...this.mode.describe(), ...this.domain.volume() };
  }

  @ApiOperation({
    summary: "Changer le mode de la station — SUPERADMIN, mot de passe exigé (ADR 0016).",
    description:
      "demo : jeu de démonstration ; exercise : station vide, l'OPCOM et les cellules créent unités et ressources ; " +
      "operational : station en service. Le réglage est persisté ; sur la station l'API redémarre d'elle-même pour " +
      "l'appliquer (`restarting: true`), en développement il faut la relancer.",
  })
  @Patch("mode")
  @RequirePermission("settings:update")
  @ApiResponse({ status: 403, description: "Réservé au Super Administrateur, ou mot de passe incorrect." })
  setMode(@Body() dto: SetModeDto, @CurrentUser() user: AuthUser) {
    // Le joker est développé en liste par la garde JWT : c'est le RÔLE qui dit le Super Administrateur.
    if (user.role !== "superadmin") throw new ForbiddenException("Le mode de la station se change au niveau Super Administrateur.");
    if (!isAppMode(dto.mode)) throw new BadRequestException(`Mode inconnu : ${dto.mode}`);
    if (!this.users.verifyPassword(user.username, dto.password)) throw new ForbiddenException("Mot de passe incorrect : le changement de mode n'est pas signé.");
    return this.mode.set(dto.mode, user.username);
  }

  @ApiOperation({
    summary: "Remettre le domaine à zéro — SUPERADMIN uniquement, mot de passe exigé (step-up).",
    description:
      "Retire incidents, unités, abris, morgues, dossiers, victimes, parcs, postes et fil d'événements. " +
      "Conserve le réseau hospitalier et ses services, les comptes et la base. Les cascades d'incident " +
      "(missions, déploiements) courent pour chaque incident retiré. Les graines de démonstration ne reviennent pas au redémarrage.",
  })
  @Post("purge")
  @HttpCode(200)
  @RequirePermission("settings:delete")
  @ApiResponse({ status: 403, description: "Réservé au Super Administrateur, ou mot de passe incorrect." })
  async purge(@Body() dto: PurgeDomainDto, @CurrentUser() user: AuthUser) {
    if (!this.users.verifyPassword(user.username, dto.password)) throw new ForbiddenException("Mot de passe incorrect : la remise à zéro n'est pas signée.");
    return this.domain.purgeDemo(user.username);
  }
}
