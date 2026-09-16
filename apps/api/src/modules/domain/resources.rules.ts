// ============================================================================
// ARGOS — qui tient quelles ressources, sur quelle entité, dans quel mode
// (ADR 0016), règles PURES
//
//   - le chef d'une entité (responsable d'unité, d'hôpital, d'abri) tient les
//     ressources de SON entité, dans tous les modes ; le responsable de parc
//     tient le matériel (équipements, véhicules, logistique) de son unité ;
//   - la cellule bleue (opérations) tient personnes, équipes, équipements et
//     véhicules ; la cellule verte (logistique) tient en plus carburant,
//     vivres, couchage, campement — en tout mode, c'est sa fonction ; la
//     cellule orange (sécurité) tient les mêmes ressources que la bleue mais
//     sur les seules forces de l'ordre (FAR, DGSN, Gendarmerie, FA) ;
//   - en mode OPÉRATIONNEL, les personnes, équipes, équipements et véhicules
//     sont tenus par les chefs d'entité : les cellules déploient, elles ne
//     tiennent plus les registres ;
//   - l'administration tient tout.
// ============================================================================

import type { AppMode } from "@/common/app-mode";
import type { Role } from "@/shared/permissions";
import type { Assignments } from "@/shared/responsibilities";
import type { UnitCorps } from "@/modules/domain/domain.types";
import type { ResourceKind, ResourceOwner } from "@/modules/domain/resources.types";

/** Les corps que la cellule orange (sécurité) tient : les forces de l'ordre. */
const SECURITY_CORPS: readonly UnitCorps[] = ["far", "dgsn", "gendarmerie", "fa"];

export interface ResourceContext {
  role: Role;
  mode: AppMode;
  scope?: Assignments;
  owner: ResourceOwner;
  /** Corps de l'unité détentrice (sans objet pour un hôpital ou un abri). */
  ownerCorps?: UnitCorps;
  kind: ResourceKind;
}

/** Le compte tient-il cette ressource sur cette entité ? */
export function canManageResource(c: ResourceContext): boolean {
  const { role, mode, scope, owner, kind } = c;
  if (role === "superadmin" || role === "admin") return true;
  switch (role) {
    case "resp_unit":
      return owner.kind === "unit" && scope?.unit === owner.id;
    case "resp_hospital":
      return owner.kind === "hospital" && scope?.hospital === owner.id;
    case "resp_shelter":
      return owner.kind === "shelter" && scope?.shelter === owner.id;
    case "resp_equipment":
      return owner.kind === "unit" && scope?.equipment === owner.id && (kind === "equipment" || kind === "vehicles" || kind === "supplies");
    case "greencell":
      // La logistique est sa fonction en tout mode ; le reste hors opérationnel.
      return kind === "supplies" || mode !== "operational";
    case "bluecell":
      return mode !== "operational" && kind !== "supplies";
    case "orangecell":
      return mode !== "operational" && kind !== "supplies" && owner.kind === "unit" && !!c.ownerCorps && SECURITY_CORPS.includes(c.ownerCorps);
    default:
      return false;
  }
}

/** Libellé de refus, pour que l'opérateur sache pourquoi. */
export function refusalReason(c: ResourceContext): string {
  if (c.mode === "operational" && ["bluecell", "orangecell"].includes(c.role)) {
    return "Mode opérationnel : les ressources sont tenues par les chefs d'entité ; les cellules déploient.";
  }
  if (c.role === "orangecell") return "La cellule orange tient les ressources des forces de l'ordre (FAR, DGSN, Gendarmerie, FA).";
  if (c.role.startsWith("resp_")) return "Un responsable ne tient que les ressources de sa propre entité.";
  return `Le rôle ${c.role} ne tient pas les ressources.`;
}
