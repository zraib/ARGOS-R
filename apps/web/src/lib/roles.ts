// ============================================================================
// ARGOS — rôles de la plateforme (source unique)
// Le type Role et le catalogue des rôles vivent ici pour être partagés par le
// store, la navigation, la gestion des utilisateurs et le sélecteur de rôle,
// sans cycle d'import. Aligné sur l'API/Keycloak (§4.3) : en production, les
// rôles proviennent des claims OIDC.
// ============================================================================

import { NAV_ICONS, KPI_ICONS, UI_ICONS } from "@/lib/icons";

/** Rôle de session (identique à ROLE_PERMISSIONS côté API). */
export type Role =
  | "superadmin"
  | "admin"
  | "auditor"
  | "command"
  | "dispatcher"
  | "unit_commander"
  | "field_agent";

/** Ordre hiérarchique d'affichage (du plus privilégié au moins privilégié). */
export const ROLES: Role[] = [
  "superadmin",
  "admin",
  "auditor",
  "command",
  "dispatcher",
  "unit_commander",
  "field_agent",
];

/** Icône (tracé SVG) associée à chaque rôle — sert au sélecteur en tuiles. */
export const ROLE_ICONS: Record<Role, string> = {
  superadmin: UI_ICONS.shield,
  admin: NAV_ICONS.settings,
  auditor: NAV_ICONS.reports,
  command: NAV_ICONS.cmd,
  dispatcher: NAV_ICONS.dispatch,
  unit_commander: NAV_ICONS.units,
  field_agent: KPI_ICONS.personnel,
};

/**
 * Rôles qu'un créateur a le droit d'attribuer (§ gestion des utilisateurs) :
 * - le Super Administrateur peut créer tous les rôles, y compris superadmin/admin ;
 * - l'Administrateur peut créer tous les rôles SAUF superadmin et admin.
 * Tout autre rôle ne peut créer personne.
 */
export function assignableRoles(creator: Role): Role[] {
  if (creator === "superadmin") return ROLES;
  if (creator === "admin") return ROLES.filter((r) => r !== "superadmin" && r !== "admin");
  return [];
}

/** Un créateur peut-il gérer des utilisateurs (ouvrir l'écran de gestion) ? */
export function canManageUsers(role: Role): boolean {
  return role === "superadmin" || role === "admin";
}

/**
 * Un Super Administrateur peut cocher plusieurs rôles ; un Administrateur ne
 * peut en attribuer qu'un seul à l'utilisateur créé.
 */
export function canAssignMultipleRoles(creator: Role): boolean {
  return creator === "superadmin";
}

/** Seul le Super Administrateur peut forcer l'activation / gérer les rôles-fonctionnalités. */
export function isSuperAdmin(role: Role): boolean {
  return role === "superadmin";
}

/**
 * Rôles autorisés à déclarer un incident — miroir de la permission serveur
 * `incidents:create` (l'API reste l'autorité ; ceci ne fait que masquer l'UI).
 */
export function canReportIncident(role: Role): boolean {
  return role === "superadmin" || role === "command" || role === "field_agent";
}
