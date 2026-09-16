// ============================================================================
// ARGOS — affectation et déploiement des unités (ADR 0016), règles PURES
//
// L'OPCOM (PC état-major incident) regroupe des walis, des commandants de
// place d'armes, des représentants de la Gendarmerie Royale, de l'État-Major
// des FAR et du ministère de l'Intérieur. Chacun affecte les unités de SON
// corps à l'opération ; le TACOM les reçoit selon leur destination — PC
// opérationnel (PCO) ou PC tactique (PCT) — et les déploie ; les cellules les
// déploient sur le terrain ou les retirent.
//
// Ce fichier ne connaît ni NestJS ni la persistance : il dit qui peut affecter
// quoi, vers où, et qui peut déployer. Le service applique.
// ============================================================================

import type { Role } from "@/shared/permissions";
import { CIVIL_CORPS, type Destination, type UnitCorps } from "@/modules/domain/domain.types";

/** Corps qu'un rôle peut affecter ; `"*"` : tous (chef de l'OPCOM, administration). */
export function assignableCorps(role: Role): readonly UnitCorps[] | "*" {
  switch (role) {
    case "superadmin":
    case "admin":
    case "opcom":
      return "*";
    case "wali":
    case "interieur":
      return CIVIL_CORPS;
    case "gendarmerie":
      return ["gendarmerie"];
    case "etat_major":
    case "place_arme":
      return ["far"];
    default:
      return [];
  }
}

export function canAssignCorps(role: Role, corps: UnitCorps): boolean {
  const allowed = assignableCorps(role);
  return allowed === "*" || allowed.includes(corps);
}

/**
 * Destination effective d'une unité : la gendarmerie et les unités civiles
 * rejoignent le PCO (qui regroupe les cellules et les unités civiles) ; une
 * unité des FAR va au PCO ou au PCT, au choix de qui l'affecte.
 */
export function destinationFor(corps: UnitCorps, requested?: Destination): Destination {
  if (corps === "far") return requested ?? "pct";
  return "pco";
}

/** Qui déploie et retire sur le terrain : le TACOM, ses PC, et les cellules. */
export function canDeploy(role: Role): boolean {
  return ["superadmin", "admin", "tacom", "pco", "pct", "bluecell", "greencell", "orangecell"].includes(role);
}

/** Libellés français des corps (journal, fil d'événements). */
export const CORPS_LABELS: Record<UnitCorps, string> = {
  far: "FAR",
  gendarmerie: "Gendarmerie Royale",
  dgsn: "DGSN",
  dgpc: "Protection Civile",
  fa: "Forces Auxiliaires",
};

export function isCivilCorps(corps: UnitCorps): boolean {
  return CIVIL_CORPS.includes(corps);
}
