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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  "superadmin",
  "admin",
  "auditor",
  "command",
  "dispatcher",
  "unit_commander",
  "field_agent",
] as const;

export type Role = (typeof ROLES)[number];

/** Libellés français des rôles (MASTER_PLAN §3). */
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Administrateur",
  admin: "Administrateur",
  auditor: "Auditeur",
  command: "Commandement Stratégique",
  dispatcher: "Répartiteur",
  unit_commander: "Chef d'Unité",
  field_agent: "Agent de Terrain",
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
  ],
  auditor: [
    "iam:users:read", "iam:roles:read", "iam:permissions:read",
    "admin:feature_flags:read", "admin:settings:read",
    "audit:log:read", "audit:log:verify",
    "org:zones:read", "org:units:read", "org:hospitals:read",
    "incidents:read",
  ],
  command: [
    "org:zones:read", "org:units:read", "org:hospitals:read",
    "incidents:read", "incidents:create", "incidents:update",
    "map:tracking:view_all", "dispatch:assign",
  ],
  dispatcher: ["org:units:read", "org:hospitals:read", "incidents:read", "map:tracking:view_all", "dispatch:assign"],
  unit_commander: ["org:units:read", "org:units:manage", "incidents:read"],
  field_agent: ["incidents:read", "incidents:create"],
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
  auditor: featuresFrom(["dashboard", "incidents", "map", "orsec", "reports", "analytics"]),
  command: featuresFrom(["dashboard", "incidents", "map", "dispatch", "hospitals", "orsec", "plans", "comms", "reports", "analytics", "damage", "shelters"]),
  dispatcher: featuresFrom(["dashboard", "incidents", "map", "dispatch", "triage", "equip", "units", "personnel", "workorders", "comms"]),
  unit_commander: featuresFrom(["dashboard", "incidents", "map", "units", "personnel", "workorders", "comms"]),
  field_agent: featuresFrom(["dashboard", "incidents", "triage", "damage", "shelters", "comms"]),
};

/** Copie profonde des défauts (état initial modifiable). */
export function defaultRoleFeatures(): Record<Role, Record<string, boolean>> {
  return Object.fromEntries(ROLES.map((r) => [r, { ...DEFAULT_ROLE_FEATURES[r] }])) as Record<Role, Record<string, boolean>>;
}
