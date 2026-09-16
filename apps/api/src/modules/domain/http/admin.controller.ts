// ============================================================================
// ARGOS — adaptateur HTTP du domaine · administration : profil de données, purge
//
// Ce qui fait d'une station de démonstration une station vide (ADR 0015).
// La purge retire tout le domaine opérationnel SAUF le réseau hospitalier ;
// les comptes et la base (audit, drapeaux, bons de travail) ne sont pas
// touchés. Réservée au Super Administrateur, signée par son mot de passe.
// ============================================================================

import { Body, Controller, ForbiddenException, Get, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { DATA_PROFILE } from "@/common/data-profile";
import { PurgeDomainDto } from "@/modules/domain/dto";
import { DomainService } from "@/modules/domain/domain.service";
import { UsersService } from "@/modules/iam/users.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller("domain")
export class AdminController {
  constructor(
    private readonly domain: DomainService,
    private readonly users: UsersService,
  ) {}

  @ApiOperation({
    summary: "Profil de données de la station et volume du domaine opérationnel.",
    description: "« demo » : le jeu de démonstration est reconstruit au démarrage ; « empty » : seuls restent les référentiels et ce que les opérateurs créent.",
  })
  @Get("profile")
  @RequirePermission("settings:view")
  profile() {
    return { profile: DATA_PROFILE, ...this.domain.volume() };
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
