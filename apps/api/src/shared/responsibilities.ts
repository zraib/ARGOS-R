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
import { ALL_ROLES, ROLE_TRAITS } from "@/shared/profiles";

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
export const ROLE_RESPONSIBILITY: Partial<Record<Role, ResponsibilityKind>> = Object.fromEntries(
  ALL_ROLES.flatMap((r) => (ROLE_TRAITS[r].responsibility ? [[r, ROLE_TRAITS[r].responsibility]] : [])),
) as Partial<Record<Role, ResponsibilityKind>>;

/**
 * Entités affectées à un compte, une par nature au plus.
 * Exemple : `{ hospital: "H4", unit: "U2" }` pour un compte cumulant deux
 * responsabilités.
 *
 * DEUX RATTACHEMENTS NON-ENTITÉ (lot V-1) s'y ajoutent, parce que tous les
 * rôles ne répondent pas d'une entité :
 *
 *  • `region`   — le wali ET le commandant de place d'armes répondent d'un
 *                 TERRITOIRE, pas d'un établissement. La place d'armes était
 *                 rattachée à une ville avec un rayon de 40 km ; l'état-major a
 *                 tranché pour la région, comme le wali — un seul rattachement,
 *                 un seul titulaire par région, et une visibilité qui suit le
 *                 découpage administratif plutôt qu'un cercle sur la carte ;
 *  • `incident` — la conduite déployée (OPCOM, TACOM, cellules) répond d'UNE
 *                 OPÉRATION. Un seul incident à la fois : réaffecter remplace.
 *
 * Ils vivent ici et non dans une table à part parce qu'ils répondent à la même
 * question que les autres — « de quoi ce compte répond-il ? » — et qu'ils sont
 * résolus par le même chemin (`resolveScope`), à chaque requête.
 */
export type Assignments = Partial<Record<ResponsibilityKind, string>> & {
  /** Région administrative (wali, place d'armes) — valeur canonique de `REGIONS_MA`. */
  region?: string;
  /** Incident sur lequel le compte est déployé (conduite). Un seul. */
  incident?: string;
};

/**
 * Rôles dont le titulaire est UNIQUE sur son territoire : une région n'a qu'un
 * wali et qu'un commandant de place d'armes. Affecter un second est une erreur
 * de saisie, pas une nuance — l'API la refuse.
 */
/**
 * Les autorités d'une région : le wali et le commandant de place d'armes.
 * Prévenues à la déclaration de tout incident sur leur territoire.
 */
export const REGIONAL_AUTHORITY_ROLES: readonly Role[] = ALL_ROLES.filter((r) => ROLE_TRAITS[r].regionalAuthority);
export const UNIQUE_PER_REGION_ROLES: readonly Role[] = REGIONAL_AUTHORITY_ROLES;

/**
 * Autorités CIVILES : elles n'ont pas de grade militaire. Un grade saisi pour
 * un wali est une erreur ; le compte le refuse plutôt que de l'afficher.
 */
export const CIVIL_ROLES: readonly Role[] = ALL_ROLES.filter((r) => ROLE_TRAITS[r].civil);

// --- RATTACHEMENTS DE PORTÉE (lot V-1) --------------------------------------
// Une entité se commande ; un territoire ou une opération se COUVRE. Ces deux
// clés répondent donc à la même question que les natures ci-dessus —
// « de quoi ce compte répond-il ? » — mais ne désignent pas un établissement.
// Elles sont traitées à part parce qu'elles n'obéissent pas à `ScopeGuard`
// (qui compare une entité visée) mais au `VisibilityService` (qui filtre une
// liste).

/** Clés de rattachement qui définissent un PÉRIMÈTRE, non une entité. */
export const SCOPE_KEYS = ["region", "incident"] as const;

export type ScopeKey = (typeof SCOPE_KEYS)[number];

/** Libellés français (interface d'administration). */
export const SCOPE_LABELS: Record<ScopeKey, string> = {
  region: "Région administrative",
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
export const ROLE_SCOPE_KEY: Partial<Record<Role, ScopeKey>> = Object.fromEntries(
  // Le trait `scopeKey` du profil (ADR 0022) : les autorités portent une
  // région ; les postes déployés — membres de l'OPCOM, TACOM et ses PC,
  // cellules, chefs d'abri et de parc, et les PC du profil « direx » — une opération.
  ALL_ROLES.flatMap((r) => (ROLE_TRAITS[r].scopeKey ? [[r, ROLE_TRAITS[r].scopeKey]] : [])),
) as Partial<Record<Role, ScopeKey>>;

/**
 * Périmètres EXIGÉS dès la création du compte.
 *
 * La région en fait partie : un wali ou une place d'armes sans région ne voit
 * RIEN (règle du default-deny), ce qui se lit comme une panne plutôt que comme
 * un oubli d'administration. Mieux vaut refuser le compte que livrer un écran
 * vide.
 *
 * L'incident n'en fait PAS partie : on crée un OPCOM bien avant de le déployer,
 * et le déploiement est un acte distinct, tracé (lot V-2).
 */
const MANDATORY_SCOPE_KEYS: readonly ScopeKey[] = ["region"];

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

/**
 * Rôles cantonnés à UN incident — les « postes déployables ».
 *
 * DÉRIVÉE de `ROLE_SCOPE_KEY`, jamais recopiée. Une seconde liste tenue à la
 * main finirait par diverger, et la divergence serait silencieuse ET grave :
 * un rôle déployable absent de la liste de visibilité pourrait être affecté à
 * un incident sans être cantonné à lui — l'inverse exact de ce que le
 * déploiement doit garantir.
 */
export const DEPLOYABLE_ROLES: readonly Role[] = (Object.keys(ROLE_SCOPE_KEY) as Role[]).filter(
  (r) => ROLE_SCOPE_KEY[r] === "incident",
);

/** Ce rôle occupe-t-il un poste qu'on déploie sur une opération ? */
export function isDeployableRole(role: Role): boolean {
  return ROLE_SCOPE_KEY[role] === "incident";
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

/**
 * Qui tient quoi : le titulaire d'une entité affectée (hôpital, unité, abri,
 * morgue, parc) ou d'un poste déployé sur un incident (`kind: "incident"`,
 * `entityId` = identifiant de l'incident). Sert la fiche d'une entité et la
 * carte, qui montrent le titulaire et son état de connexion — l'état, lui,
 * vient du flux de présence, jamais d'ici.
 */
export interface Responsible {
  kind: ResponsibilityKind | "incident";
  entityId: string;
  role: Role;
  matricule: string;
  nom: string;
  grade?: string;
}
