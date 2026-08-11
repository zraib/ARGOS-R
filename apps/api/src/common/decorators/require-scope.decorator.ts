import { SetMetadata } from "@nestjs/common";
import type { ResponsibilityKind } from "@/shared/responsibilities";

export const REQUIRE_SCOPE_KEY = "argos:require_scope";

export interface ScopeRequirement {
  /** Nature d'entité concernée par la route. */
  kind: ResponsibilityKind;
  /** Paramètre de route portant l'identifiant de l'entité visée (défaut : `id`). */
  param: string;
}

/**
 * Restreint une route à l'entité AFFECTÉE au responsable connecté.
 *
 * S'applique uniquement aux rôles rattachés à cette nature d'entité
 * (`ROLE_RESPONSIBILITY`) : un Responsable Hôpital sur une route
 * `@RequireScope("hospital")` ne peut agir que sur SON hôpital. Les autres
 * rôles (superadmin, admin, TACOM…) ne sont pas rattachés et restent gouvernés
 * par le seul RBAC.
 *
 * ```ts
 * @Patch("hospitals/:id")
 * @RequirePermission("org:hospitals:manage")   // RBAC : a-t-il le droit ?
 * @RequireScope("hospital")                    // ABAC : est-ce bien le sien ?
 * ```
 */
export const RequireScope = (kind: ResponsibilityKind, param = "id") =>
  SetMetadata<string, ScopeRequirement>(REQUIRE_SCOPE_KEY, { kind, param });
