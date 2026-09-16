// ============================================================================
// ARGOS — corps d'appartenance des unités et des personnes (ADR 0016)
// ============================================================================

import type { Dict } from "@/lib/i18n/translations";
import { CIVIL_CORPS, type UnitCorps } from "@/lib/types";

/** Libellé traduit d'un corps d'unité ou de personne (`civil` pour le personnel civil). */
export function corpsLabel(corps: UnitCorps | "civil" | undefined, t: Dict): string {
  switch (corps) {
    case "gendarmerie": return t.corps_gendarmerie;
    case "dgsn": return t.corps_dgsn;
    case "dgpc": return t.corps_dgpc;
    case "fa": return t.corps_fa;
    case "civil": return t.corps_civil;
    case "far":
    default:
      return t.corps_far;
  }
}

/** Sigle court pour les listes denses. */
export function corpsShort(corps: UnitCorps | undefined): string {
  switch (corps) {
    case "gendarmerie": return "GR";
    case "dgsn": return "DGSN";
    case "dgpc": return "DGPC";
    case "fa": return "FA";
    default: return "FAR";
  }
}

export function isCivilCorps(corps: UnitCorps | undefined): boolean {
  return corps !== undefined && CIVIL_CORPS.includes(corps);
}

/** Les corps en uniforme portent un grade ; le personnel civil, une fonction. */
export function corpsHasGrade(corps: UnitCorps | "civil"): boolean {
  return corps !== "civil" && corps !== "dgpc";
}
