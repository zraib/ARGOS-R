import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_PERMISSION_KEY } from "@/common/decorators/require-permission.decorator";
import type { Permission } from "@/shared/permissions";
import type { AuthUser } from "@/common/types/auth-user";

/**
 * Garde RBAC (default-deny). Si une route déclare `@RequirePermission(p)`,
 * l'utilisateur doit détenir `p` (résolue côté serveur depuis son rôle), sinon
 * 403. S'exécute après la garde JWT, qui a déjà posé `req.user`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRE_PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required) return true; // pas d'exigence de permission sur cette route

    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Non authentifié");

    const ok = user.permissions === "*" || user.permissions.includes(required);
    if (!ok) throw new ForbiddenException(`Permission requise : ${required}`);
    return true;
  }
}
