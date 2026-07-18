import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UsersService } from "@/modules/iam/users.service";
import { CreateUserDto, SetActiveDto, ToggleRoleFeatureDto, UpdateUserDto } from "@/modules/iam/dto";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
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
  @RequirePermission("iam:users:read")
  @ApiOperation({ summary: "Lister les utilisateurs (Admin/Super Admin)" })
  list() {
    return this.users.list();
  }

  @Post("users")
  @RequirePermission("iam:users:create")
  @ApiOperation({ summary: "Créer un utilisateur (règles d'attribution appliquées côté serveur)" })
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor.role, actor.username, dto);
  }

  @Patch("users/:id")
  @RequirePermission("iam:users:update")
  @ApiOperation({ summary: "Modifier un utilisateur (nom, grade, rôles)" })
  update(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor.role, id, dto);
  }

  @Delete("users/:id")
  @RequirePermission("iam:users:delete")
  @ApiOperation({ summary: "Supprimer un utilisateur" })
  remove(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    this.users.remove(actor.role, actor.username, id);
    return { deleted: true };
  }

  @Post("users/:id/active")
  @RequirePermission("iam:users:activate")
  @ApiOperation({ summary: "Activer/suspendre un compte (Super Admin) — activation forcée possible" })
  setActive(@Param("id") id: string, @Body() dto: SetActiveDto) {
    return this.users.setActive(id, dto.active);
  }

  @Post("users/:id/reset-code")
  @RequirePermission("iam:users:update")
  @ApiOperation({ summary: "Régénérer le code temporaire d'un compte" })
  resetCode(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.users.resetCode(actor.role, id);
  }

  @Get("users/:id/temp-code")
  @RequirePermission("iam:users:read")
  @ApiOperation({ summary: "Consulter le code temporaire (Admin/Super Admin)" })
  tempCode(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.users.revealCode(actor.role, id);
  }

  @Get("role-features")
  @RequirePermission("iam:roles:read")
  @ApiOperation({ summary: "Matrice rôle → fonctionnalités" })
  roleFeatures() {
    return this.users.getRoleFeatures();
  }

  @Patch("role-features/:role")
  @RequirePermission("iam:roles:features")
  @ApiOperation({ summary: "Activer/désactiver une fonctionnalité pour un rôle (Super Admin)" })
  setRoleFeature(@Param("role") role: string, @Body() dto: ToggleRoleFeatureDto) {
    if (!isRole(role)) throw new BadRequestException(`Rôle inconnu : ${role}`);
    return this.users.setRoleFeature(role as Role, dto.feature, dto.enabled);
  }
}
