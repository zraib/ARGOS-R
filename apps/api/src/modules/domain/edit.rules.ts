// ============================================================================
// ARGOS — mode édition de la carte PAR RÔLE (ADR 0018), règles PURES
//
// Le mode édition n'a pas le même contenu pour tout le monde :
//   - le Super Administrateur pose tout : chaque nature de poste, et les
//     ressources de n'importe quelle entité ;
//   - l'utilisateur stratégique pose les OPCOM — et eux seuls ;
//   - le chef de l'OPCOM pose son dispositif tactique : les TACOM (PC, PCO,
//     PCT) et les cellules ;
//   - le TACOM (et ses PC, PCO et PCT) pose SES équipes, SES équipements et
//     SES véhicules sur le terrain — jamais un poste, jamais un parc ;
//   - les cellules bleue, verte et orange posent de même leurs équipes, leurs
//     équipements et leurs véhicules — et ne voient ni OPCOM, ni TACOM, ni
//     les autres cellules dans leur boîte à outils.
//
// « Ses » : en mode opérationnel, les ressources des unités AFFECTÉES à
// l'opération que le compte sert ; en démonstration et en exercice, celles de
// toute entité — on joue le scénario.
// ============================================================================

import type { AppMode } from "@/common/app-mode";
import type { Role } from "@/shared/permissions";
import { ROLE_TRAITS, postKindInProfile, type ProfileId } from "@/shared/profiles";
import type { Assignments } from "@/shared/responsibilities";
import type { PostKind } from "@/modules/domain/domain.types";
import { PLACEABLE_KINDS, type PlaceableKind, type ResourceOwnerKind } from "@/modules/domain/resources.types";

// Qui pose quoi est un trait du profil (ADR 0022) : `placePosts` (les natures
// de poste) et `placeResources` (équipes, équipements, véhicules).

/** Les natures de postes qu'un rôle pose sur la carte — celles de son mode seulement (ADR 0022). */
export function placeablePostKinds(role: Role, profile?: ProfileId): readonly PostKind[] {
  const kinds = ROLE_TRAITS[role].placePosts;
  return profile ? kinds.filter((k) => postKindInProfile(k, profile)) : kinds;
}

/** Les natures de ressources qu'un rôle pose sur le terrain. */
export function placeableResourceKinds(role: Role): readonly PlaceableKind[] {
  if (role === "superadmin") return PLACEABLE_KINDS;
  return ROLE_TRAITS[role].placeResources ? ["teams", "equipment", "vehicles"] : [];
}

/** Le rôle a-t-il un mode édition — quelque chose à poser ? */
export function canEditMap(role: Role, profile?: ProfileId): boolean {
  return placeablePostKinds(role, profile).length > 0 || placeableResourceKinds(role).length > 0;
}

export function canPlacePost(role: Role, kind: PostKind, profile?: ProfileId): boolean {
  return placeablePostKinds(role, profile).includes(kind);
}

export interface PlaceContext {
  role: Role;
  mode: AppMode;
  scope?: Assignments;
  kind: PlaceableKind;
  ownerKind: ResourceOwnerKind;
  /** Opération à laquelle l'unité détentrice est affectée, s'il y en a une. */
  unitIncidentId?: string | null;
}

/** Le compte peut-il poser cette ressource sur le terrain ? */
export function canPlaceResource(c: PlaceContext): boolean {
  if (c.role === "superadmin") return true;
  if (!placeableResourceKinds(c.role).includes(c.kind)) return false;
  if (c.mode !== "operational") return true;
  // Opérationnel : la ressource d'une unité affectée à l'opération que le
  // compte sert — c'est le dispositif qu'il exploite, rien d'autre.
  return c.ownerKind === "unit" && !!c.scope?.incident && c.unitIncidentId === c.scope.incident;
}

/** Libellé de refus, pour que l'opérateur sache pourquoi. */
export function placeRefusal(c: PlaceContext): string {
  if (!placeableResourceKinds(c.role).includes(c.kind)) return `Le rôle ${c.role} ne pose pas de ${KIND_LABEL[c.kind]} sur le terrain.`;
  if (c.ownerKind !== "unit") return "En mode opérationnel, seules les ressources des unités affectées à l'opération se posent sur le terrain.";
  if (!c.scope?.incident) return "Mode opérationnel : le compte n'est déployé sur aucune opération.";
  return "Mode opérationnel : cette unité n'est pas affectée à l'opération que vous servez.";
}

const KIND_LABEL: Record<PlaceableKind, string> = { teams: "équipes", vehicles: "véhicules", equipment: "équipements" };
