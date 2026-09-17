// ============================================================================
// ARGOS — mode édition de la carte PAR RÔLE (ADR 0018), miroir de
// `edit.rules.ts` côté API. Sert à composer la boîte à outils : ce que le rôle
// pose, et rien d'autre. L'API reste l'autorité — elle refuse le reste.
//
//   superadmin  → tous les postes, toutes les ressources
//   strategic   → les OPCOM
//   opcom       → le dispositif tactique : TACOM, PCO, PCT, cellules
//   tacom/pco/pct → ses équipes, ses équipements, ses véhicules
//   cellules    → leurs équipes, leurs équipements, leurs véhicules
//   (ni le TACOM ni les cellules ne voient un poste ou un parc à poser)
// ============================================================================

import type { Role } from "@/lib/roles";
import type { PlaceableKind, PostKind } from "@/lib/types";
import { POST_KINDS } from "@/lib/posts";

const TACOM_ROLES: readonly Role[] = ["tacom", "pco", "pct"];
const CELL_ROLES: readonly Role[] = ["bluecell", "greencell", "orangecell"];

/** Les natures de postes que le rôle pose sur la carte. */
export function placeablePostKinds(role: Role): readonly PostKind[] {
  if (role === "superadmin") return POST_KINDS;
  if (role === "strategic") return ["opcom"];
  if (role === "opcom") return ["tacom", "pco", "pct", "bluecell", "greencell", "orangecell"];
  return [];
}

/** Les natures de ressources que le rôle pose sur le terrain. */
export function placeableResourceKinds(role: Role): readonly PlaceableKind[] {
  if (role === "superadmin") return ["teams", "vehicles", "equipment"];
  if (TACOM_ROLES.includes(role) || CELL_ROLES.includes(role)) return ["teams", "equipment", "vehicles"];
  return [];
}

/** Le rôle a-t-il un mode édition — quelque chose à poser ? */
export function canEditMap(role: Role): boolean {
  return placeablePostKinds(role).length > 0 || placeableResourceKinds(role).length > 0;
}

/** Type MIME du glisser-déposer d'une ressource de la boîte à outils vers la carte. */
export const RESOURCE_DRAG_MIME = "application/x-argos-resource";

/** Ce que l'opérateur a choisi de poser sur le terrain. */
export interface ResourcePick {
  kind: PlaceableKind;
  id: string;
  title: string;
}

export function parseResourcePick(raw: string): ResourcePick | null {
  try {
    const v = JSON.parse(raw) as Partial<ResourcePick> | null;
    if (!v || typeof v.id !== "string" || typeof v.title !== "string") return null;
    if (v.kind !== "teams" && v.kind !== "vehicles" && v.kind !== "equipment") return null;
    return { kind: v.kind, id: v.id, title: v.title };
  } catch {
    return null;
  }
}

/** Couleur et code du marqueur d'une ressource posée — distincts des postes. */
export const PLACED_FILL: Record<PlaceableKind, string> = { teams: "#0EA5E9", vehicles: "#A855F7", equipment: "#64748B" };
