import type { Permission, Role } from "@/shared/permissions";

/** Identité authentifiée résolue depuis le jeton (claims Keycloak ou dev). */
export interface AuthUser {
  sub: string;
  username: string;
  role: Role;
  /** Permissions effectives, résolues côté serveur depuis le rôle (RBAC). */
  permissions: Permission[] | "*";
  /** Portée ABAC (unité/hôpital/incident) — étendue aux phases suivantes. */
  scope?: { unitId?: string; hospitalId?: string; incidentId?: string };
}
