import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_PERMISSION_KEY } from "@/common/decorators/require-permission.decorator";
import { FEATURE_GATE, type FeatureGate } from "@/common/ports/feature-gate.port";
import { moduleOfPermission, type Permission } from "@/shared/permissions";
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
 * Le cœur (tableau de bord, comptes, paramètres, audit) ne se coupe pas — c'est
 * par lui qu'on rallume le reste.
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
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRE_PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required) return true; // pas d'exigence de permission sur cette route

    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Non authentifié");

    const ok = user.permissions === "*" || user.permissions.includes(required);
    if (!ok) throw new ForbiddenException(`Permission requise : ${required}`);

    const module = moduleOfPermission(required);
    if (module && this.gate) {
      if (await this.gate.moduleDisabled(module)) throw new ForbiddenException(`Module désactivé : ${module}`);
      if (user.permissions !== "*" && this.gate.roleModuleDisabled(user.role, module)) {
        throw new ForbiddenException(`Module coupé pour le rôle ${user.role} : ${module}`);
      }
    }
    return true;
  }
}
