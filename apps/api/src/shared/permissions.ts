// ============================================================================
// ARGOS — catalogue de permissions et rôles (RBAC)
// Une permission est une chaîne `module:action:qualifier` (MASTER_PLAN §3.7).
// Les rôles sont des données de départ (seed), pas du code figé : le moteur RBAC
// permet de créer des rôles personnalisés. Ce fichier a vocation à migrer vers
// `packages/shared` pour être partagé avec le frontend (client généré).
// ============================================================================

export const PERMISSIONS = [
  // Administration / gouvernance
  "iam:users:read",
  "iam:users:create",
  "iam:users:update",
  "iam:users:delete",
  "iam:users:activate",
  "iam:roles:read",
  "iam:roles:create",
  "iam:roles:assign",
  "iam:roles:features",
  "iam:permissions:read",
  "admin:feature_flags:read",
  "admin:feature_flags:toggle",
  "admin:settings:read",
  "admin:settings:update",
  "audit:log:read",
  "audit:log:verify",
  // Structure organisationnelle
  "org:zones:read",
  "org:zones:manage",
  "org:units:read",
  "org:units:manage",
  "org:hospitals:read",
  "org:hospitals:manage",
  // Opérations (aperçu — étendu aux phases suivantes)
  "incidents:read",
  "incidents:create",
  "incidents:update",
  "map:tracking:view_all",
  "dispatch:assign",
  "hospinet:beds:update",
  // Bons de travail (module orders — logistique / maintenance)
  "workorders:read",
  "workorders:create",
  "workorders:update",
  "workorders:assign",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  "superadmin",
  "admin",
  "strategic",
  "tacom",
  "bluecell",
  "greencell",
  "orangecell",
  "resp_hospital",
  "resp_shelter",
  "resp_morgue",
  "resp_unit",
  "resp_equipment",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Anciens rôles (avant la refonte) → rôle de reprise. Utilisé pour MIGRER les
 * comptes persistés en dev sans invalider les sessions/données existantes.
 */
export const LEGACY_ROLE_MAP: Record<string, Role> = {
  auditor: "strategic",
  command: "tacom",
  dispatcher: "bluecell",
  unit_commander: "resp_unit",
  field_agent: "resp_unit",
};

/** Libellés français des rôles (organisation cible). */
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Administrateur",
  admin: "Administrateur",
  strategic: "Utilisateur Stratégique",
  tacom: "TACOM",
  bluecell: "Cellule Bleue — Opérations",
  greencell: "Cellule Verte — Logistique",
  orangecell: "Cellule Orange — Sécurité",
  resp_hospital: "Responsable Hôpital",
  resp_shelter: "Responsable Abri",
  resp_morgue: "Responsable Morgue",
  resp_unit: "Responsable Unité",
  resp_equipment: "Responsable Équipement",
};

/**
 * Attribution des permissions par rôle. `"*"` = toutes les permissions.
 * Tout ce qui n'est pas explicitement accordé est refusé (default-deny).
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[] | "*"> = {
  superadmin: "*",
  admin: [
    "iam:users:read", "iam:users:create", "iam:users:update", "iam:users:delete",
    "iam:roles:read", "iam:roles:create", "iam:roles:assign", "iam:permissions:read",
    "admin:feature_flags:read", "admin:feature_flags:toggle", "admin:settings:read", "admin:settings:update",
    "org:zones:read", "org:zones:manage", "org:units:read", "org:units:manage", "org:hospitals:read", "org:hospitals:manage",
    "incidents:read", "map:tracking:view_all",
    "workorders:read",
  ],
  // NB : dotations PROVISOIRES — l'attribution fine se fera via la matrice
  // rôles × fonctionnalités (voir docs/matrice-roles-fonctionnalites.xlsx).
  strategic: [
    "org:zones:read", "org:units:read", "org:hospitals:read",
    "incidents:read", "map:tracking:view_all", "audit:log:read",
  ],
  tacom: [
    "org:zones:read", "org:units:read", "org:hospitals:read",
    "incidents:read", "incidents:create", "incidents:update",
    "map:tracking:view_all", "dispatch:assign",
  ],
  bluecell: [
    "org:units:read", "org:hospitals:read",
    "incidents:read", "incidents:create", "incidents:update",
    "map:tracking:view_all", "dispatch:assign",
  ],
  // Cellule Verte (logistique) : pilote la file des bons de travail.
  greencell: [
    "org:units:read", "incidents:read", "map:tracking:view_all",
    "workorders:read", "workorders:create", "workorders:update", "workorders:assign",
  ],
  orangecell: ["org:zones:read", "incidents:read", "map:tracking:view_all"],
  resp_hospital: ["org:hospitals:read", "org:hospitals:manage", "hospinet:beds:update", "incidents:read"],
  resp_shelter: ["org:zones:read", "incidents:read"],
  resp_morgue: ["incidents:read"],
  resp_unit: ["org:units:read", "org:units:manage", "incidents:read"],
  resp_equipment: [
    "org:units:read", "incidents:read",
    "workorders:read", "workorders:create", "workorders:update", "workorders:assign",
  ],
};

/** Résout la liste effective des permissions d'un rôle. */
export function permissionsForRole(role: Role): Permission[] {
  const grant = ROLE_PERMISSIONS[role];
  return grant === "*" ? [...PERMISSIONS] : grant;
}

/** Contrôle RBAC : le rôle possède-t-il la permission demandée ? */
export function roleHasPermission(role: Role, perm: Permission): boolean {
  const grant = ROLE_PERMISSIONS[role];
  return grant === "*" || grant.includes(perm);
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Règles d'attribution de rôles à la création/modification d'un utilisateur.
// Appliquées côté serveur (frontière de sécurité) : le frontend ne fait que
// refléter ces règles.
// ---------------------------------------------------------------------------

/**
 * Rôles qu'un créateur a le droit d'attribuer :
 * - le Super Administrateur peut attribuer tous les rôles (dont superadmin/admin) ;
 * - l'Administrateur peut attribuer tous les rôles SAUF superadmin et admin ;
 * - tout autre rôle ne peut attribuer aucun rôle.
 */
export function assignableRoles(creator: Role): Role[] {
  if (creator === "superadmin") return [...ROLES];
  if (creator === "admin") return ROLES.filter((r) => r !== "superadmin" && r !== "admin");
  return [];
}

/** Un Super Administrateur peut attribuer plusieurs rôles ; un Admin un seul. */
export function canAssignMultipleRoles(creator: Role): boolean {
  return creator === "superadmin";
}

// ---------------------------------------------------------------------------
// Matrice rôle → fonctionnalités (modules accessibles). Pilotable par le Super
// Administrateur ; complète l'application des permissions RBAC côté API.
// ---------------------------------------------------------------------------

/** Modules dont l'accès est pilotable par rôle (aligné sur la nav du frontend). */
export const MODULE_FEATURES = [
  "dashboard", "incidents", "map", "dispatch", "triage",
  "equip", "units", "personnel", "workorders",
  "hospitals", "ics", "damage", "shelters",
  "orsec", "plans", "comms", "reports", "analytics", "assistant",
] as const;

export type ModuleFeature = (typeof MODULE_FEATURES)[number];

const allOn = (): Record<string, boolean> => Object.fromEntries(MODULE_FEATURES.map((k) => [k, true]));
const featuresFrom = (allowed: readonly ModuleFeature[]): Record<string, boolean> =>
  Object.fromEntries(MODULE_FEATURES.map((k) => [k, allowed.includes(k)]));

/** Fonctionnalités autorisées par défaut pour chaque rôle. */
export const DEFAULT_ROLE_FEATURES: Record<Role, Record<string, boolean>> = {
  superadmin: allOn(),
  admin: allOn(),
  strategic: featuresFrom(["dashboard", "incidents", "map", "orsec", "plans", "reports", "analytics"]),
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

/** Copie profonde des défauts (état initial modifiable). */
export function defaultRoleFeatures(): Record<Role, Record<string, boolean>> {
  return Object.fromEntries(ROLES.map((r) => [r, { ...DEFAULT_ROLE_FEATURES[r] }])) as Record<Role, Record<string, boolean>>;
}
