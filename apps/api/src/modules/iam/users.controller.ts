import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UsersService } from "@/modules/iam/users.service";
import { CreateUserDto, SetActiveDto, ToggleRoleFeatureDto, UpdateUserDto } from "@/modules/iam/dto";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { SelfService } from "@/common/decorators/self-service.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { isRole, type Role } from "@/shared/permissions";

/**
 * Gestion des utilisateurs (Phase 2). Toutes les routes sont protégées par le
 * RBAC (default-deny) ; les règles d'attribution de rôles et de gestion des
 * comptes privilégiés sont appliquées côté serveur (frontière de sécurité).
 * Les mutations sont automatiquement journalisées (audit chaîné).
 */
@ApiTags("iam")
@ApiBearerAuth()
@Controller("iam")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("users")
  @RequirePermission("users:view")
  @ApiOperation({ summary: "Lister les utilisateurs (Admin/Super Admin)" })
  list(@CurrentUser() actor: AuthUser) {
    // Filtrage côté serveur : un Administrateur ne voit aucun Super Admin.
    return this.users.list(actor.role);
  }

  @Post("users")
  @RequirePermission("users:create")
  @ApiOperation({ summary: "Créer un utilisateur (règles d'attribution appliquées côté serveur)" })
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor.role, actor.username, dto);
  }

  @Patch("users/:id")
  @RequirePermission("users:update")
  @ApiOperation({ summary: "Modifier un utilisateur (nom, grade, rôles)" })
  update(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor.role, id, dto);
  }

  @Delete("users/:id")
  @RequirePermission("users:delete")
  @ApiOperation({ summary: "Supprimer un utilisateur" })
  remove(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    this.users.remove(actor.role, actor.username, id);
    return { deleted: true };
  }

  @Post("users/:id/active")
  @RequirePermission("users:update")
  @ApiOperation({ summary: "Activer/suspendre un compte (Super Admin) — activation forcée possible" })
  setActive(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: SetActiveDto) {
    return this.users.setActive(actor.role, id, dto.active);
  }

  @Post("users/:id/reset-code")
  @RequirePermission("users:update")
  @ApiOperation({ summary: "Régénérer le code temporaire d'un compte" })
  resetCode(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.users.resetCode(actor.role, id);
  }

  @Get("users/:id/temp-code")
  @RequirePermission("users:view")
  @ApiOperation({ summary: "Consulter le code temporaire (Admin/Super Admin)" })
  tempCode(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.users.revealCode(actor.role, id);
  }

  @ApiOperation({
    summary: "Matrice rôle → modules.",
    description:
      "Lisible par tout compte authentifié : le navigateur en a besoin pour masquer ce que l'API refuse déjà. " +
      "Rien de sensible — quels modules chaque rôle voit. (Avant l'ADR 0015 elle exigeait `users:view`, si bien qu'aucun rôle non administrateur ne la recevait.)",
  })
  @Get("role-features")
  @SelfService()
  roleFeatures() {
    return this.users.getRoleFeatures();
  }

  @Get("role-features/defaults")
  @SelfService()
  @ApiOperation({ summary: "Matrice rôle → modules PAR DÉFAUT (dérivée de la matrice RBAC) — ce que « réinitialiser » restaure" })
  defaultRoleFeatures() {
    return this.users.getDefaultRoleFeatures();
  }

  @Patch("role-features/:role")
  @RequirePermission("users:update")
  @ApiOperation({ summary: "Ouvrir/couper un module pour un rôle (Super Admin) — effectif côté API dès la requête suivante" })
  setRoleFeature(@Param("role") role: string, @Body() dto: ToggleRoleFeatureDto) {
    if (!isRole(role)) throw new BadRequestException(`Rôle inconnu : ${role}`);
    return this.users.setRoleFeature(role as Role, dto.feature, dto.enabled);
  }

  @Post("role-features/:role/reset")
  @RequirePermission("users:update")
  @ApiOperation({ summary: "Remettre un rôle à ses modules par défaut (Super Admin)" })
  resetRoleFeatures(@Param("role") role: string) {
    if (!isRole(role)) throw new BadRequestException(`Rôle inconnu : ${role}`);
    return this.users.resetRoleFeatures(role as Role);
  }
}
