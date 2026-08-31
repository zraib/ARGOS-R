// ============================================================================
// ARGOS — responsabilités opérationnelles et rattachement (ABAC)
//
// Le RBAC répond à « CE rôle a-t-il le droit de faire CETTE action ? ».
// Il ne répond pas à « SUR QUELLE entité ? ». C'est l'objet de ce fichier :
// rattacher un compte de responsable à l'entité précise dont il répond
// (SON hôpital, SON unité, SON abri, SA morgue, SON parc d'équipement).
//
// Sans ce rattachement, « Responsable Hôpital » signifierait « peut modifier
// n'importe lequel des hôpitaux » — inacceptable sur une plateforme de
// commandement. Les deux contrôles se composent :
//   RBAC   (PermissionsGuard) : le rôle détient-il la permission ?
//   ABAC   (ScopeGuard)       : l'entité visée est-elle bien la sienne ?
// ============================================================================

import type { Role } from "@/shared/permissions";

/** Natures d'entité qu'un responsable peut piloter. */
export const RESPONSIBILITY_KINDS = ["hospital", "unit", "shelter", "morgue", "equipment"] as const;

export type ResponsibilityKind = (typeof RESPONSIBILITY_KINDS)[number];

/** Libellés français (interface d'administration). */
export const RESPONSIBILITY_LABELS: Record<ResponsibilityKind, string> = {
  hospital: "Hôpital militaire",
  unit: "Unité",
  shelter: "Abri",
  morgue: "Morgue",
  equipment: "Parc d'équipement",
};

/**
 * Rôle → nature d'entité dont il est responsable. Un rôle absent de cette
 * table (superadmin, admin, TACOM, cellules…) n'est rattaché à rien : son accès
 * est gouverné par le seul RBAC, sans restriction de périmètre.
 */
export const ROLE_RESPONSIBILITY: Partial<Record<Role, ResponsibilityKind>> = {
  resp_hospital: "hospital",
  resp_unit: "unit",
  resp_shelter: "shelter",
  resp_morgue: "morgue",
  resp_equipment: "equipment",
};

/**
 * Entités affectées à un compte, une par nature au plus.
 * Exemple : `{ hospital: "H4", unit: "U2" }` pour un compte cumulant deux
 * responsabilités.
 *
 * TROIS RATTACHEMENTS NON-ENTITÉ (lot V-1) s'y ajoutent, parce que tous les
 * rôles ne répondent pas d'une entité :
 *
 *  • `region`   — le wali répond d'un TERRITOIRE, pas d'un établissement ;
 *  • `city`     — la place d'armes répond d'une ZONE (sa ville et ses environs) ;
 *  • `incident` — la conduite déployée (OPCOM, TACOM, cellules) répond d'UNE
 *                 OPÉRATION. Un seul incident à la fois : réaffecter remplace.
 *
 * Ils vivent ici et non dans une table à part parce qu'ils répondent à la même
 * question que les autres — « de quoi ce compte répond-il ? » — et qu'ils sont
 * résolus par le même chemin (`resolveScope`), à chaque requête.
 */
export type Assignments = Partial<Record<ResponsibilityKind, string>> & {
  /** Région administrative (wali) — valeur canonique de `REGIONS_MA`. */
  region?: string;
  /** Ville de rattachement (place d'armes) — le périmètre est un rayon autour. */
  city?: string;
  /** Incident sur lequel le compte est déployé (conduite). Un seul. */
  incident?: string;
};

/**
 * Rayon de la zone de compétence d'une place d'armes, en kilomètres.
 *
 * La zone n'est pas une frontière administrative mais un cercle autour de la
 * ville de rattachement : une place d'armes commande ce qu'elle peut atteindre,
 * pas ce qui relève de sa préfecture.
 */
export const PLACE_ARME_RADIUS_KM = 40;

// --- RATTACHEMENTS DE PORTÉE (lot V-1) --------------------------------------
// Une entité se commande ; un territoire, une zone ou une opération se COUVRE.
// Ces trois clés répondent donc à la même question que les natures ci-dessus —
// « de quoi ce compte répond-il ? » — mais ne désignent pas un établissement.
// Elles sont traitées à part parce qu'elles n'obéissent pas à `ScopeGuard`
// (qui compare une entité visée) mais au `VisibilityService` (qui filtre une
// liste).

/** Clés de rattachement qui définissent un PÉRIMÈTRE, non une entité. */
export const SCOPE_KEYS = ["region", "city", "incident"] as const;

export type ScopeKey = (typeof SCOPE_KEYS)[number];

/** Libellés français (interface d'administration). */
export const SCOPE_LABELS: Record<ScopeKey, string> = {
  region: "Région administrative",
  city: "Ville de rattachement",
  incident: "Incident de déploiement",
};

/**
 * Rôle → périmètre qu'il peut porter. Un rôle absent voit selon les seules
 * règles de son rôle (global pour l'état-major, par entité pour les
 * responsables d'hôpital, d'unité et de morgue).
 *
 * `resp_shelter` et `resp_equipment` y figurent AVEC un incident : contrairement
 * à l'hôpital ou l'unité qui servent plusieurs opérations à la fois, l'abri et
 * le parc sont armés pour une opération donnée. Ils cumulent donc les deux
 * rattachements — leur entité ET leur déploiement.
 */
export const ROLE_SCOPE_KEY: Partial<Record<Role, ScopeKey>> = {
  wali: "region",
  place_arme: "city",
  opcom: "incident",
  tacom: "incident",
  bluecell: "incident",
  greencell: "incident",
  orangecell: "incident",
  resp_shelter: "incident",
  resp_equipment: "incident",
};

/**
 * Périmètres EXIGÉS dès la création du compte.
 *
 * Région et ville en font partie : un wali sans région ne voit RIEN (règle du
 * default-deny), ce qui se lit comme une panne plutôt que comme un oubli
 * d'administration. Mieux vaut refuser le compte que livrer un écran vide.
 *
 * L'incident n'en fait PAS partie : on crée un OPCOM bien avant de le déployer,
 * et le déploiement est un acte distinct, tracé (lot V-2).
 */
const MANDATORY_SCOPE_KEYS: readonly ScopeKey[] = ["region", "city"];

/** Périmètres que cet ensemble de rôles peut porter (sans doublon). */
export function scopeKeysOf(roles: readonly Role[]): ScopeKey[] {
  const keys = new Set<ScopeKey>();
  for (const r of roles) {
    const k = ROLE_SCOPE_KEY[r];
    if (k) keys.add(k);
  }
  return [...keys];
}

/** Parmi eux, ceux sans lesquels le compte serait aveugle. */
export function mandatoryScopeKeysOf(roles: readonly Role[]): ScopeKey[] {
  return scopeKeysOf(roles).filter((k) => MANDATORY_SCOPE_KEYS.includes(k));
}

/** Garde de type : la valeur est-elle une clé de périmètre connue ? */
export function isScopeKey(v: unknown): v is ScopeKey {
  return typeof v === "string" && (SCOPE_KEYS as readonly string[]).includes(v);
}

/** Nature d'entité pilotée par ce rôle, ou `undefined` s'il n'est pas responsable. */
export function responsibilityOfRole(role: Role): ResponsibilityKind | undefined {
  return ROLE_RESPONSIBILITY[role];
}

/** Le rôle exige-t-il qu'une entité lui soit affectée ? */
export function roleRequiresAssignment(role: Role): boolean {
  return ROLE_RESPONSIBILITY[role] !== undefined;
}

/** Natures d'entité à affecter pour cet ensemble de rôles (sans doublon). */
export function requiredAssignments(roles: readonly Role[]): ResponsibilityKind[] {
  const kinds = new Set<ResponsibilityKind>();
  for (const r of roles) {
    const kind = ROLE_RESPONSIBILITY[r];
    if (kind) kinds.add(kind);
  }
  return [...kinds];
}

/** Garde de type : la valeur est-elle une nature de responsabilité connue ? */
export function isResponsibilityKind(v: unknown): v is ResponsibilityKind {
  return typeof v === "string" && (RESPONSIBILITY_KINDS as readonly string[]).includes(v);
}
