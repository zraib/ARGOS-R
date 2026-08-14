// ============================================================================
// ARGOS — modèle de gestion des utilisateurs (couche de données simulée)
// Frontière lib/data/ : ces comptes et la matrice rôle→fonctionnalités seront
// remplacés par les endpoints IAM de l'API (Phase 2). L'application réelle du
// RBAC reste côté serveur ; cet écran n'est que la couche de gestion.
// ============================================================================

import type { Role } from "@/lib/roles";
import { ROLES } from "@/lib/roles";
import type { NavKey } from "@/lib/nav";

/**
 * Compte utilisateur géré.
 * Cycle de vie : créé « inactif » avec un code temporaire → au 1er login,
 * l'utilisateur change son mot de passe → « actif ». Un Super Administrateur
 * peut forcer l'activation sans changement (activatedByAdmin). Le code
 * temporaire reste consultable par les administrateurs tant qu'il n'est pas
 * remplacé (mis à null dès que passwordChanged devient vrai).
 */
export interface ManagedUser {
  id: string;
  /** identifiant de connexion (matricule militaire) */
  matricule: string;
  nom: string;
  grade?: string;
  roles: Role[];
  /** l'utilisateur a-t-il posé son propre mot de passe ? */
  passwordChanged: boolean;
  /** mot de passe posé par l'utilisateur (démo ; côté API : haché et jamais lisible) */
  password?: string;
  /** code temporaire généré à la création — consultable par les admins jusqu'au changement */
  tempPassword: string | null;
  /** activation forcée par un Super Administrateur malgré un mot de passe temporaire */
  activatedByAdmin: boolean;
  /** compte suspendu par un administrateur (prime sur l'activation) */
  disabled?: boolean;
  /** indicateur de présence (vert = connecté, rouge = déconnecté) */
  online: boolean;
  /** compte système (Super Admin fondateur) — non supprimable, login démo */
  builtin?: boolean;
  createdBy: string;
  createdAt: string;
  lastLogin: string | null;
}

/**
 * Statut effectif : un compte est actif dès que l'utilisateur a changé son
 * mot de passe OU qu'un Super Administrateur l'a activé manuellement.
 */
export function userActive(u: ManagedUser): boolean {
  if (u.disabled) return false;
  return u.passwordChanged || u.activatedByAdmin;
}

/** Initiales pour l'avatar (2 lettres). */
export function initials(nom: string): string {
  const parts = nom.replace(/^[A-Za-zÀ-ÿ]+\.?\s*/, "").split(/\s+/).filter(Boolean);
  const src = parts.length ? parts : nom.split(/\s+/);
  return src.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || nom.slice(0, 2).toUpperCase();
}

// --- Génération de code temporaire -----------------------------------------

// Alphabet sans caractères ambigus (0/O, 1/I/L) pour la lecture à voix haute.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Code temporaire de la forme « A7X2-K9D3 » (deux groupes de 4). */
export function generateTempPassword(): string {
  const group = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  return `${group()}-${group()}`;
}

// --- Matrice rôle → fonctionnalités ----------------------------------------

/**
 * Fonctionnalités (modules) dont l'accès est pilotable par rôle. Le Super
 * Administrateur peut activer/désactiver ces cases par rôle ; chaque rôle a un
 * jeu autorisé par défaut (ci-dessous). superadmin/admin ont tout (verrouillé).
 */
export const MODULE_FEATURES: NavKey[] = [
  "dashboard", "incidents", "map", "dispatch", "triage",
  "equip", "units", "personnel", "workorders",
  "hospitals", "ics", "damage", "shelters",
  "orsec", "plans", "comms", "reports", "analytics", "assistant",
];

const ALL_ON = (): Record<string, boolean> => Object.fromEntries(MODULE_FEATURES.map((k) => [k, true]));

/** Construit un jeu de fonctionnalités à partir de la liste des modules autorisés. */
function featuresFrom(allowed: NavKey[]): Record<string, boolean> {
  return Object.fromEntries(MODULE_FEATURES.map((k) => [k, allowed.includes(k)]));
}

/** Fonctionnalités autorisées par défaut pour chaque rôle. */
export const DEFAULT_ROLE_FEATURES: Record<Role, Record<string, boolean>> = {
  superadmin: ALL_ON(),
  admin: ALL_ON(),
  strategic: featuresFrom(["dashboard", "incidents", "map", "orsec", "plans", "reports", "analytics"]),
  // Rôles issus de la matrice : lecture large de la situation nationale.
  place_arme: featuresFrom(["dashboard", "incidents", "map", "comms", "reports", "analytics"]),
  wali: featuresFrom(["dashboard", "incidents", "map", "comms", "reports", "analytics"]),
  opcom: featuresFrom(["dashboard", "incidents", "map", "dispatch", "hospitals", "shelters", "orsec", "plans", "comms", "reports", "analytics"]),
  tacom: featuresFrom(["dashboard", "incidents", "map", "dispatch", "hospitals", "orsec", "plans", "comms", "reports"]),
  bluecell: featuresFrom(["dashboard", "incidents", "map", "dispatch", "triage", "ics", "comms"]),
  greencell: featuresFrom(["dashboard", "incidents", "map", "equip", "units", "personnel", "workorders", "comms"]),
  orangecell: featuresFrom(["dashboard", "incidents", "map", "comms", "reports"]),
  resp_hospital: featuresFrom(["dashboard", "incidents", "map", "hospitals", "comms"]),
  resp_shelter: featuresFrom(["dashboard", "incidents", "map", "shelters", "comms"]),
  resp_morgue: featuresFrom(["dashboard", "incidents", "map", "triage", "comms"]),
  resp_unit: featuresFrom(["dashboard", "incidents", "map", "units", "personnel", "comms"]),
  resp_equipment: featuresFrom(["dashboard", "incidents", "map", "equip", "workorders", "comms"]),
};

/** Copie profonde des défauts (état initial modifiable dans le store). */
export function defaultRoleFeatures(): Record<Role, Record<string, boolean>> {
  return Object.fromEntries(
    ROLES.map((r) => [r, { ...DEFAULT_ROLE_FEATURES[r] }]),
  ) as Record<Role, Record<string, boolean>>;
}

// --- Comptes de démonstration ----------------------------------------------
// Illustrent chaque état du cycle de vie : actif, inactif avec code temp,
// multi-rôles, activé par le Super Admin malgré un code temporaire.

export const SEED_USERS: ManagedUser[] = [
  {
    id: "u-benjelloun",
    matricule: "k.benjelloun",
    nom: "Col. K. Benjelloun",
    grade: "Colonel",
    roles: ["superadmin"],
    passwordChanged: true,
    tempPassword: null,
    activatedByAdmin: false,
    online: true,
    builtin: true,
    createdBy: "système",
    createdAt: "2026-01-04T08:00:00Z",
    lastLogin: "2026-07-14T00:52:00Z",
  },
  {
    id: "u-alami",
    matricule: "h.alami",
    nom: "Cdt. H. Alami",
    grade: "Commandant",
    roles: ["admin"],
    passwordChanged: true,
    password: "argos",
    tempPassword: null,
    activatedByAdmin: false,
    online: false,
    createdBy: "k.benjelloun",
    createdAt: "2026-02-11T09:20:00Z",
    lastLogin: "2026-07-13T18:40:00Z",
  },
  {
    id: "u-tazi",
    matricule: "y.tazi",
    nom: "Cne. Y. Tazi",
    grade: "Capitaine",
    roles: ["bluecell"],
    passwordChanged: true,
    password: "argos",
    tempPassword: null,
    activatedByAdmin: false,
    online: true,
    createdBy: "h.alami",
    createdAt: "2026-03-02T14:05:00Z",
    lastLogin: "2026-07-14T00:10:00Z",
  },
  {
    id: "u-fassi",
    matricule: "n.fassi",
    nom: "Lt. N. Fassi",
    grade: "Lieutenant",
    roles: ["resp_unit"],
    // Créé récemment, jamais connecté → inactif, code temporaire visible.
    passwordChanged: false,
    tempPassword: "A7X2-K9D3",
    activatedByAdmin: false,
    online: false,
    createdBy: "h.alami",
    createdAt: "2026-07-12T11:30:00Z",
    lastLogin: null,
  },
  {
    id: "u-bennani",
    matricule: "s.bennani",
    nom: "Cdt. S. Bennani",
    grade: "Commandant",
    // Multi-rôles (créé par le Super Admin) → sélecteur de rôle après login.
    roles: ["tacom", "bluecell", "resp_unit"],
    passwordChanged: false,
    tempPassword: "Q4M8-P2L6",
    activatedByAdmin: false,
    online: false,
    createdBy: "k.benjelloun",
    createdAt: "2026-07-13T16:45:00Z",
    lastLogin: null,
  },
  {
    id: "u-idrissi",
    matricule: "r.idrissi",
    nom: "Cne. R. Idrissi",
    grade: "Capitaine",
    roles: ["strategic"],
    // Activé par le Super Admin malgré un code temporaire encore en vigueur.
    passwordChanged: false,
    tempPassword: "Z9C1-H5R7",
    activatedByAdmin: true,
    online: false,
    createdBy: "k.benjelloun",
    createdAt: "2026-07-10T10:15:00Z",
    lastLogin: null,
  },
];
