import type { Permission, Role } from "@/shared/permissions";
import type { ProfileId } from "@/shared/profiles";
import type { Assignments } from "@/shared/responsibilities";

/** Identité authentifiée résolue depuis le jeton (claims Keycloak ou dev). */
export interface AuthUser {
  sub: string;
  username: string;
  role: Role;
  /** Mode de l'application en service (ADR 0022) : « classique » ou « direx ». */
  profile: ProfileId;
  /** Permissions effectives, résolues côté serveur depuis le rôle (RBAC). */
  permissions: Permission[] | "*";
  /**
   * Portée ABAC : entité affectée par nature de responsabilité
   * (ex. `{ hospital: "H4" }`). Résolue côté serveur depuis le registre des
   * comptes à CHAQUE requête — jamais lue dans le jeton, pour qu'une
   * réaffectation prenne effet immédiatement et qu'aucune portée ne puisse
   * être revendiquée par le client. Absente pour les rôles non rattachés
   * (superadmin, admin, TACOM, cellules).
   */
  scope?: Assignments;
}
