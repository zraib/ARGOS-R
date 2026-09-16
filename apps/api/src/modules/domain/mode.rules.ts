// ============================================================================
// ARGOS — ce que le MODE de la station autorise (ADR 0016), règles PURES
//
// La matrice RBAC dit le maximum qu'un rôle peut faire ; le mode le RESSERRE :
//   - démonstration et exercice : l'OPCOM et les cellules créent, modifient et
//     retirent des unités (pour jouer le scénario) ;
//   - opérationnel : les unités — civiles et militaires — sont créées par le
//     Super Administrateur seul ; les chefs d'entité tiennent leurs ressources.
// ============================================================================

import type { AppMode } from "@/common/app-mode";
import type { Role } from "@/shared/permissions";

const EXERCISE_UNIT_MAKERS: readonly Role[] = ["admin", "opcom", "bluecell", "greencell", "orangecell"];

/** Créer une unité. */
export function canCreateUnit(role: Role, mode: AppMode): boolean {
  if (role === "superadmin") return true;
  return mode !== "operational" && EXERCISE_UNIT_MAKERS.includes(role);
}

/** Modifier une unité ; `own` : le compte en est le responsable (portée déjà vérifiée par la garde). */
export function canEditUnit(role: Role, mode: AppMode, own: boolean): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (role === "resp_unit") return own;
  return mode !== "operational" && EXERCISE_UNIT_MAKERS.includes(role);
}

/**
 * Retirer une unité. La doctrine du dépôt réserve `delete` au Super
 * Administrateur ; en démonstration et en exercice, l'OPCOM et les cellules
 * retirent les unités qu'ils ont créées pour le scénario — dérogation
 * documentée (ADR 0016), qui ne vaut pas en opérationnel.
 */
export function canDeleteUnit(role: Role, mode: AppMode): boolean {
  if (role === "superadmin") return true;
  return mode !== "operational" && ["opcom", "bluecell", "greencell", "orangecell"].includes(role);
}
