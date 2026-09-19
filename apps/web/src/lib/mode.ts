// ============================================================================
// ARGOS — ce que le MODE de la station autorise, miroir de `mode.rules.ts`
// (ADR 0016) et de la portée des abris. Sert à ne pas proposer un bouton que
// l'API refuserait ; l'API reste l'autorité.
// ============================================================================

import { ROLE_PROFILE, type Role } from "@/lib/roles";
import type { AppMode } from "@/lib/api-client";

// Miroir du trait `unitMaker` des profils (ADR 0022) : l'OPCOM et les cellules classiques,
// la DIREX (Chef, Anim) et les cellules des PC du profil « direx ».
const EXERCISE_UNIT_MAKERS: readonly Role[] = [
  "admin", "opcom", "bluecell", "greencell", "orangecell",
  "direx_chef", "direx_anim", "pcfar_ops", "pcfar_log", "pcf_ops", "pcf_log",
  "pct_ops", "pct_log", "pct_rens", "pco_ops", "pco_log", "pco_rens_com",
];
// Miroir du trait `unitRemover` : les mêmes, sans l'Administrateur.
const EXERCISE_UNIT_REMOVERS: readonly Role[] = EXERCISE_UNIT_MAKERS.filter((r) => r !== "admin");
// Le profil direx tient ses unités en tout mode (direction d'exercice, ADR 0022 lot 6) ;
// le mode opérationnel ne resserre que les rôles classiques (ADR 0016).
const modeAllows = (role: Role, mode: AppMode | null): boolean => mode !== "operational" || ROLE_PROFILE[role] === "direx";

/** Créer une unité : la permission servie (`teams:create`) resserrée par le mode — l'API est l'autorité. */
export function canCreateUnit(role: Role, mode: AppMode | null, can: (perm: string) => boolean): boolean {
  if (role === "superadmin") return true;
  return can("teams:create") && modeAllows(role, mode) && EXERCISE_UNIT_MAKERS.includes(role);
}

/** Retirer une unité : miroir de `canDeleteUnit` (le trait `unitRemover`, hors opérationnel) sur la route `teams:update`. */
export function canDeleteUnit(role: Role, mode: AppMode | null, can: (perm: string) => boolean): boolean {
  if (role === "superadmin") return true;
  return can("teams:update") && modeAllows(role, mode) && EXERCISE_UNIT_REMOVERS.includes(role);
}

/** Modifier une unité ; `own` : le compte en est le commandant. */
export function canEditUnit(role: Role, mode: AppMode | null, own: boolean): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (role === "resp_unit") return own;
  return modeAllows(role, mode) && EXERCISE_UNIT_MAKERS.includes(role);
}

/**
 * Modifier un abri : la permission servie (`shelters:update` — administration,
 * LOG / OPS des PC et Anim du profil direx…) ; son responsable sur le sien.
 */
export function canEditShelter(role: Role, own: boolean, can?: (perm: string) => boolean): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (role === "resp_shelter") return own;
  return !!can && can("shelters:update");
}
