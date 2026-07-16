import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@/shared/permissions";

export const REQUIRE_PERMISSION_KEY = "requirePermission";

/**
 * Exige une permission RBAC sur une route. En son absence sur une route non
 * publique, l'accès reste protégé par l'authentification (défense par défaut) ;
 * avec elle, l'utilisateur doit détenir la permission, sinon 403 (default-deny).
 */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRE_PERMISSION_KEY, permission);
