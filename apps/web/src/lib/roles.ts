// ============================================================================
// ARGOS — rôles de la plateforme (source unique)
// Le type Role et le catalogue des rôles vivent ici pour être partagés par le
// store, la navigation, la gestion des utilisateurs et le sélecteur de rôle,
// sans cycle d'import. Aligné sur l'API/Keycloak (§4.3) : en production, les
// rôles proviennent des claims OIDC.
// ============================================================================

import { NAV_ICONS, FLUX_ICONS, KPI_ICONS, UI_ICONS } from "@/lib/icons";

/** Rôle de session (identique à ROLE_PERMISSIONS côté API — organisation cible). */
export type Role =
  | "superadmin"
  | "admin"
  | "strategic"
  | "place_arme"
  | "wali"
  | "opcom"
  | "tacom"
  | "bluecell"
  | "greencell"
  | "orangecell"
  | "resp_hospital"
  | "resp_shelter"
  | "resp_morgue"
  | "resp_unit"
  | "resp_equipment";

/** Ordre hiérarchique d'affichage (du plus privilégié au moins privilégié). */
export const ROLES: Role[] = [
  "superadmin",
  "admin",
  "strategic",
  "place_arme",
  "wali",
  "opcom",
  "tacom",
  "bluecell",
  "greencell",
  "orangecell",
  "resp_hospital",
  "resp_shelter",
  "resp_morgue",
  "resp_unit",
  "resp_equipment",
];

/** Icône (tracé SVG) associée à chaque rôle — sert au sélecteur en tuiles. */
export const ROLE_ICONS: Record<Role, string> = {
  place_arme: UI_ICONS.shield,
  wali: UI_ICONS.users,
  opcom: KPI_ICONS.units,
  superadmin: UI_ICONS.shield,
  admin: NAV_ICONS.settings,
  strategic: NAV_ICONS.cmd,
  tacom: NAV_ICONS.dispatch,
  bluecell: FLUX_ICONS.activity,
  greencell: NAV_ICONS.res,
  orangecell: UI_ICONS.key,
  resp_hospital: NAV_ICONS.hospitals,
  resp_shelter: NAV_ICONS.shelters,
  resp_morgue: KPI_ICONS.beds,
  resp_unit: NAV_ICONS.units,
  resp_equipment: NAV_ICONS.dis,
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
  return role === "superadmin" || role === "tacom" || role === "bluecell";
}

// ---------------------------------------------------------------------------
// Responsabilités opérationnelles (miroir de shared/responsibilities.ts côté API)
// Sert UNIQUEMENT à composer l'interface d'affectation. Le cantonnement réel
// est appliqué par l'API (ScopeGuard) — jamais par le frontend.
// ---------------------------------------------------------------------------

export const RESPONSIBILITY_KINDS = ["hospital", "unit", "shelter", "morgue", "equipment"] as const;

export type ResponsibilityKind = (typeof RESPONSIBILITY_KINDS)[number];

/** Entités affectées à un compte, une par nature de responsabilité. */
export type Assignments = Partial<Record<ResponsibilityKind, string>>;

/** Rôle → nature d'entité dont il répond. Absent = rôle non rattaché. */
export const RESPONSIBILITY_OF_ROLE: Partial<Record<Role, ResponsibilityKind>> = {
  resp_hospital: "hospital",
  resp_unit: "unit",
  resp_shelter: "shelter",
  resp_morgue: "morgue",
  resp_equipment: "equipment",
};

/** Natures d'entité à affecter pour cet ensemble de rôles (sans doublon). */
export function requiredAssignments(roles: readonly Role[]): ResponsibilityKind[] {
  const kinds: ResponsibilityKind[] = [];
  for (const r of roles) {
    const kind = RESPONSIBILITY_OF_ROLE[r];
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}
