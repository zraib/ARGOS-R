import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_SCOPE_KEY, type ScopeRequirement } from "@/common/decorators/require-scope.decorator";
import { responsibilityOfRole } from "@/shared/responsibilities";
import type { AuthUser } from "@/common/types/auth-user";

/**
 * Garde ABAC : cantonne un responsable à l'entité qui lui est AFFECTÉE.
 *
 * Troisième maillon de la chaîne, après l'authentification (JwtAuthGuard) et
 * l'autorisation par rôle (PermissionsGuard). Le RBAC dit « ce rôle peut
 * modifier un hôpital » ; cette garde dit « mais seulement CELUI-CI ».
 *
 * Elle ne s'applique qu'aux rôles rattachés à la nature d'entité visée. Un
 * administrateur ou un TACOM n'est responsable d'aucun établissement en
 * particulier : son accès reste gouverné par le seul RBAC.
 *
 * Un responsable SANS entité affectée est refusé (default-deny) : un compte mal
 * configuré ne doit jamais valoir passe-partout.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ScopeRequirement | undefined>(REQUIRE_SCOPE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true; // route non cantonnée

    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser; params?: Record<string, string> }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Non authentifié");

    // Ce rôle n'est pas responsable de cette nature d'entité : le cantonnement
    // ne le concerne pas, le RBAC a déjà tranché.
    if (responsibilityOfRole(user.role) !== required.kind) return true;

    const owned = user.scope?.[required.kind];
    if (!owned) {
      throw new ForbiddenException(
        `Aucune entité de type « ${required.kind} » n'est affectée à ce compte : contactez l'administrateur.`,
      );
    }

    const target = req.params?.[required.param];
    if (!target) throw new ForbiddenException("Entité cible absente de la requête");
    if (target !== owned) {
      throw new ForbiddenException("Hors périmètre : cette entité n'est pas celle dont vous avez la responsabilité.");
    }
    return true;
  }
}
