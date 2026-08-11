// ============================================================================
// ARGOS — responsabilités opérationnelles et rattachement (ABAC)
//
// Le RBAC répond à « CE rôle a-t-il le droit de faire CETTE action ? ».
// Il ne répond pas à « SUR QUELLE entité ? ». C'est l'objet de ce fichier :
// rattacher un compte de responsable à l'entité précise dont il répond
// (SON hôpital, SON unité, SON abri, SA morgue, SON parc d'équipement).
//
// Sans ce rattachement, « Responsable Hôpital » signifierait « peut modifier
// n'importe lequel des hôpitaux » — inacceptable sur une plateforme de
// commandement. Les deux contrôles se composent :
//   RBAC   (PermissionsGuard) : le rôle détient-il la permission ?
//   ABAC   (ScopeGuard)       : l'entité visée est-elle bien la sienne ?
// ============================================================================

import type { Role } from "@/shared/permissions";

/** Natures d'entité qu'un responsable peut piloter. */
export const RESPONSIBILITY_KINDS = ["hospital", "unit", "shelter", "morgue", "equipment"] as const;

export type ResponsibilityKind = (typeof RESPONSIBILITY_KINDS)[number];

/** Libellés français (interface d'administration). */
export const RESPONSIBILITY_LABELS: Record<ResponsibilityKind, string> = {
  hospital: "Hôpital militaire",
  unit: "Unité",
  shelter: "Abri",
  morgue: "Morgue",
  equipment: "Parc d'équipement",
};

/**
 * Rôle → nature d'entité dont il est responsable. Un rôle absent de cette
 * table (superadmin, admin, TACOM, cellules…) n'est rattaché à rien : son accès
 * est gouverné par le seul RBAC, sans restriction de périmètre.
 */
export const ROLE_RESPONSIBILITY: Partial<Record<Role, ResponsibilityKind>> = {
  resp_hospital: "hospital",
  resp_unit: "unit",
  resp_shelter: "shelter",
  resp_morgue: "morgue",
  resp_equipment: "equipment",
};

/**
 * Entités affectées à un compte, une par nature au plus.
 * Exemple : `{ hospital: "H4", unit: "U2" }` pour un compte cumulant deux
 * responsabilités.
 */
export type Assignments = Partial<Record<ResponsibilityKind, string>>;

/** Nature d'entité pilotée par ce rôle, ou `undefined` s'il n'est pas responsable. */
export function responsibilityOfRole(role: Role): ResponsibilityKind | undefined {
  return ROLE_RESPONSIBILITY[role];
}

/** Le rôle exige-t-il qu'une entité lui soit affectée ? */
export function roleRequiresAssignment(role: Role): boolean {
  return ROLE_RESPONSIBILITY[role] !== undefined;
}

/** Natures d'entité à affecter pour cet ensemble de rôles (sans doublon). */
export function requiredAssignments(roles: readonly Role[]): ResponsibilityKind[] {
  const kinds = new Set<ResponsibilityKind>();
  for (const r of roles) {
    const kind = ROLE_RESPONSIBILITY[r];
    if (kind) kinds.add(kind);
  }
  return [...kinds];
}

/** Garde de type : la valeur est-elle une nature de responsabilité connue ? */
export function isResponsibilityKind(v: unknown): v is ResponsibilityKind {
  return typeof v === "string" && (RESPONSIBILITY_KINDS as readonly string[]).includes(v);
}
