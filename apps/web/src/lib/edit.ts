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

import type { ProfileId, Role } from "@/lib/roles";
import type { PlaceableKind, PostKind } from "@/lib/types";
import { POST_KINDS, postKindInProfile } from "@/lib/posts";

const TACOM_ROLES: readonly Role[] = ["tacom", "pco", "pct"];
const CELL_ROLES: readonly Role[] = ["bluecell", "greencell", "orangecell"];
// Profil « direx » (ADR 0022) : qui pose des moyens sur le terrain — l'animation,
// les OPS des PC opératifs, les chefs et les cellules des PC tactiques.
const DIREX_FIELD_ROLES: readonly Role[] = [
  "direx_anim", "pcfar_ops", "pcfar_log", "pcf_ops", "pcf_log",
  "pct_chef", "pct_ops", "pct_log", "pct_rens", "pco_chef", "pco_ops", "pco_log", "pco_rens_com",
];

/** Les natures de postes que le rôle pose sur la carte (miroir du trait `placePosts`) — celles du mode en service seulement. */
export function placeablePostKinds(role: Role, profile?: ProfileId): readonly PostKind[] {
  const kinds = (() => {
    if (role === "superadmin") return POST_KINDS;
    if (role === "strategic") return ["opcom"] as const;
    if (role === "opcom") return ["tacom", "pco", "pct", "bluecell", "greencell", "orangecell"] as const;
    if (role === "direx_chef") return ["pcfar", "pcf"] as const;
    if (role === "direx_anim") return ["pcfar", "pcf", "pct", "pco"] as const;
    if (role === "pcfar_chef" || role === "pcfar_ops" || role === "pcf_chef" || role === "pcf_ops") return ["pct", "pco"] as const;
    return [] as const;
  })() as readonly PostKind[];
  return profile ? kinds.filter((k) => postKindInProfile(k, profile)) : kinds;
}

/** Les natures de ressources que le rôle pose sur le terrain (miroir du trait `placeResources`). */
export function placeableResourceKinds(role: Role): readonly PlaceableKind[] {
  if (role === "superadmin") return ["teams", "vehicles", "equipment"];
  if (TACOM_ROLES.includes(role) || CELL_ROLES.includes(role) || DIREX_FIELD_ROLES.includes(role)) return ["teams", "equipment", "vehicles"];
  return [];
}

/** Le rôle a-t-il un mode édition — quelque chose à poser ? */
export function canEditMap(role: Role, profile?: ProfileId): boolean {
  return placeablePostKinds(role, profile).length > 0 || placeableResourceKinds(role).length > 0;
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
