// ============================================================================
// ARGOS — ce que le MODE de la station autorise (ADR 0016), règles PURES
//
// La matrice RBAC dit le maximum qu'un rôle peut faire ; le mode le RESSERRE :
//   - démonstration et exercice : l'OPCOM et les cellules créent, modifient et
//     retirent des unités (pour jouer le scénario) ;
//   - opérationnel : les unités — civiles et militaires — sont créées par le
//     Super Administrateur seul ; les chefs d'entité tiennent leurs ressources.
//
// Le profil « direx » (ADR 0022, lot 6) est une direction d'EXERCICE : ses
// rôles qui tiennent les unités (LOG et OPS des PC, Anim / DIREX, Chef /
// DIREX) les créent, modifient et retirent quel que soit le mode de la
// station — la station de démonstration tourne en opérationnel, et la
// décision du 19 septembre 2026 leur ouvre ces gestes sans condition.
// ============================================================================

import type { AppMode } from "@/common/app-mode";
import type { Role } from "@/shared/permissions";
import { ROLE_TRAITS } from "@/shared/profiles";

// Les listes de rôles sont devenues des traits du profil (ADR 0022) :
// `unitMaker` (crée et modifie hors opérationnel), `unitRemover` (retire hors
// opérationnel), `responsibility: "unit"` (le commandant, sur la sienne).

/** Le mode resserre-t-il ce rôle ? Le profil direx tient ses unités en tout mode. */
function modeAllows(role: Role, mode: AppMode): boolean {
  return mode !== "operational" || ROLE_TRAITS[role].profile === "direx";
}

/** Créer une unité. */
export function canCreateUnit(role: Role, mode: AppMode): boolean {
  if (role === "superadmin") return true;
  return modeAllows(role, mode) && ROLE_TRAITS[role].unitMaker;
}

/** Modifier une unité ; `own` : le compte en est le responsable (portée déjà vérifiée par la garde). */
export function canEditUnit(role: Role, mode: AppMode, own: boolean): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (ROLE_TRAITS[role].responsibility === "unit") return own;
  return modeAllows(role, mode) && ROLE_TRAITS[role].unitMaker;
}

/**
 * Retirer une unité. La doctrine du dépôt réserve `delete` au Super
 * Administrateur ; en démonstration et en exercice, l'OPCOM et les cellules
 * retirent les unités qu'ils ont créées pour le scénario — dérogation
 * documentée (ADR 0016), qui ne vaut pas en opérationnel.
 */
export function canDeleteUnit(role: Role, mode: AppMode): boolean {
  if (role === "superadmin") return true;
  return modeAllows(role, mode) && ROLE_TRAITS[role].unitRemover;
}
