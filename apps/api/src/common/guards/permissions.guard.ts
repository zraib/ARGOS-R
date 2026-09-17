import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_PERMISSION_KEY } from "@/common/decorators/require-permission.decorator";
import { REQUIRE_SCOPE_KEY, type ScopeRequirement } from "@/common/decorators/require-scope.decorator";
import { FEATURE_GATE, type FeatureGate } from "@/common/ports/feature-gate.port";
import { moduleOfPermission, type ModuleKey, type Permission } from "@/shared/permissions";
import { ROLE_RESPONSIBILITY } from "@/shared/responsibilities";
import type { AuthUser } from "@/common/types/auth-user";

/**
 * Garde RBAC (default-deny). Si une route déclare `@RequirePermission(p)`,
 * l'utilisateur doit détenir `p` (résolue côté serveur depuis son rôle), sinon
 * 403. S'exécute après la garde JWT, qui a déjà posé `req.user`.
 *
 * Depuis l'ADR 0015, la garde honore aussi les BASCULES d'administration : un
 * module coupé par un drapeau global l'est pour tout le monde, joker compris
 * (c'est un interrupteur, pas un droit) ; un module coupé pour un rôle par la
 * matrice rôle → modules retire à ce rôle toutes les fonctionnalités du module.
 * Le cœur (comptes, paramètres, audit) ne se coupe pas — c'est par lui qu'on
 * rallume le reste.
 *
 * « Gestion de mon entité » (ADR 0017) : pour un RESPONSABLE d'entité, toute
 * écriture cantonnée à son entité (`@RequireScope` + action autre que `view`)
 * relève aussi du module `myrespManage` — le couper lui retire la main sur son
 * hôpital, son unité, son abri, sa morgue ou son parc, sans toucher aux autres
 * rôles qui passent par la même route.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    // Optionnel : sans fournisseur, la garde ne connaît que la matrice statique
    // (tests unitaires de la garde, démarrage minimal).
    @Optional() @Inject(FEATURE_GATE) private readonly gate?: FeatureGate,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRE_PERMISSION_KEY, targets);
    if (!required) return true; // pas d'exigence de permission sur cette route

    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Non authentifié");

    const ok = user.permissions === "*" || user.permissions.includes(required);
    if (!ok) throw new ForbiddenException(`Permission requise : ${required}`);

    const module = moduleOfPermission(required);
    if (module) await this.assertModuleOpen(user, module);

    const scope = this.reflector.getAllAndOverride<ScopeRequirement | undefined>(REQUIRE_SCOPE_KEY, targets);
    if (scope && ROLE_RESPONSIBILITY[user.role] === scope.kind && !required.endsWith(":view")) {
      await this.assertModuleOpen(user, "myrespManage");
    }
    return true;
  }

  /** Le module est-il ouvert pour ce compte : drapeau global, puis bascule du compte, puis matrice du rôle. */
  private async assertModuleOpen(user: AuthUser, module: ModuleKey): Promise<void> {
    if (!this.gate) return;
    if (await this.gate.moduleDisabled(module)) throw new ForbiddenException(`Module désactivé : ${module}`);
    // Le Super Administrateur n'est coupé que par un drapeau global (la garde
    // JWT lui développe le joker en liste : on lit son rôle, pas la liste).
    if (user.role === "superadmin") return;
    // Le compte d'abord (ADR 0016) : sa bascule propre tranche avant le rôle.
    const own = this.gate.userModuleOverride(user.username, module);
    if (own === false) throw new ForbiddenException(`Module coupé pour le compte ${user.username} : ${module}`);
    if (own === undefined && this.gate.roleModuleDisabled(user.role, module)) {
      throw new ForbiddenException(`Module coupé pour le rôle ${user.role} : ${module}`);
    }
  }
}
