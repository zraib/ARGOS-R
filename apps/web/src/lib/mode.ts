// ============================================================================
// ARGOS — ce que le MODE de la station autorise, miroir de `mode.rules.ts`
// (ADR 0016) et de la portée des abris. Sert à ne pas proposer un bouton que
// l'API refuserait ; l'API reste l'autorité.
// ============================================================================

import type { Role } from "@/lib/roles";
import type { AppMode } from "@/lib/api-client";

// Miroir du trait `unitMaker` des profils (ADR 0022) : l'OPCOM et les cellules classiques,
// la DIREX (Chef, Anim) et les cellules des PC tactiques du profil « direx ».
const EXERCISE_UNIT_MAKERS: readonly Role[] = [
  "admin", "opcom", "bluecell", "greencell", "orangecell",
  "direx_chef", "direx_anim", "pct_ops", "pct_log", "pct_rens", "pco_ops", "pco_log", "pco_rens_com",
];

/** Modifier une unité ; `own` : le compte en est le commandant. */
export function canEditUnit(role: Role, mode: AppMode | null, own: boolean): boolean {
  if (role === "superadmin" || role === "admin") return true;
  if (role === "resp_unit") return own;
  return mode !== "operational" && EXERCISE_UNIT_MAKERS.includes(role);
}

/** Modifier un abri : l'administration, et son responsable sur le sien (`shelters:update` + portée). */
export function canEditShelter(role: Role, own: boolean): boolean {
  if (role === "superadmin" || role === "admin") return true;
  return role === "resp_shelter" && own;
}
