// ============================================================================
// ARGOS — rôles de la plateforme (source unique)
// Le type Role et le catalogue des rôles vivent ici pour être partagés par le
// store, la navigation, la gestion des utilisateurs et le sélecteur de rôle,
// sans cycle d'import. Aligné sur l'API/Keycloak (§4.3) : en production, les
// rôles proviennent des claims OIDC.
// ============================================================================

import { NAV_ICONS, FLUX_ICONS, KPI_ICONS, UI_ICONS } from "@/lib/icons";

/** Les deux profils de rôles (ADR 0022) : le mode se choisit à la connexion. */
export const PROFILE_IDS = ["classique", "direx"] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];
export function isProfileId(v: unknown): v is ProfileId {
  return typeof v === "string" && (PROFILE_IDS as readonly string[]).includes(v);
}

/** Rôle de session (identique à ROLE_PERMISSIONS côté API — les deux profils, ADR 0022). */
export type Role =
  | "superadmin"
  | "admin"
  | "strategic"
  | "place_arme"
  | "wali"
  | "opcom"
  | "gendarmerie"
  | "etat_major"
  | "interieur"
  | "tacom"
  | "pco"
  | "pct"
  | "bluecell"
  | "greencell"
  | "orangecell"
  | "resp_hospital"
  | "resp_shelter"
  | "resp_morgue"
  | "resp_unit"
  | "resp_equipment"
  // Profil « direx » (ADR 0022) : direction d'exercice et PC par fonctions.
  | "direx_chef"
  | "direx_eval"
  | "direx_anim"
  | "direx_rls"
  | "pcfar_chef"
  | "pcfar_ops"
  | "pcfar_log"
  | "pcfar_planif_rens"
  | "pcfar_synth"
  | "pcf_chef"
  | "pcf_ops"
  | "pcf_log"
  | "pcf_planif_rens"
  | "pcf_synth"
  | "pct_chef"
  | "pct_ops"
  | "pct_log"
  | "pct_rens"
  | "pco_chef"
  | "pco_ops"
  | "pco_log"
  | "pco_rens_com";

/** Ordre hiérarchique d'affichage (du plus privilégié au moins privilégié). */
export const ROLES: Role[] = [
  "superadmin",
  "admin",
  "strategic",
  "place_arme",
  "wali",
  "opcom",
  // Membres de l'OPCOM (ADR 0016) : chacun affecte les unités de son corps.
  "gendarmerie",
  "etat_major",
  "interieur",
  "tacom",
  // Postes de commandement du TACOM (ADR 0016).
  "pco",
  "pct",
  "bluecell",
  "greencell",
  "orangecell",
  "resp_hospital",
  "resp_shelter",
  "resp_morgue",
  "resp_unit",
  "resp_equipment",
  "direx_chef",
  "direx_eval",
  "direx_anim",
  "direx_rls",
  "pcfar_chef",
  "pcfar_ops",
  "pcfar_log",
  "pcfar_planif_rens",
  "pcfar_synth",
  "pcf_chef",
  "pcf_ops",
  "pcf_log",
  "pcf_planif_rens",
  "pcf_synth",
  "pct_chef",
  "pct_ops",
  "pct_log",
  "pct_rens",
  "pco_chef",
  "pco_ops",
  "pco_log",
  "pco_rens_com",
];

/**
 * À quel profil chaque rôle appartient (miroir de `ROLE_TRAITS[].profile` de
 * l'API) : `core` (technique, dans les deux modes), `both` (les chefs d'entité,
 * communs), ou l'un des deux profils.
 */
export const ROLE_PROFILE: Record<Role, "core" | "both" | ProfileId> = {
  superadmin: "core",
  admin: "core",
  strategic: "classique",
  place_arme: "classique",
  wali: "classique",
  opcom: "classique",
  gendarmerie: "classique",
  etat_major: "classique",
  interieur: "classique",
  tacom: "classique",
  pco: "classique",
  pct: "classique",
  bluecell: "classique",
  greencell: "classique",
  orangecell: "classique",
  resp_hospital: "both",
  resp_shelter: "both",
  resp_morgue: "both",
  resp_unit: "both",
  resp_equipment: "classique",
  direx_chef: "direx",
  direx_eval: "direx",
  direx_anim: "direx",
  direx_rls: "direx",
  pcfar_chef: "direx",
  pcfar_ops: "direx",
  pcfar_log: "direx",
  pcfar_planif_rens: "direx",
  pcfar_synth: "direx",
  pcf_chef: "direx",
  pcf_ops: "direx",
  pcf_log: "direx",
  pcf_planif_rens: "direx",
  pcf_synth: "direx",
  pct_chef: "direx",
  pct_ops: "direx",
  pct_log: "direx",
  pct_rens: "direx",
  pco_chef: "direx",
  pco_ops: "direx",
  pco_log: "direx",
  pco_rens_com: "direx",
};

/** Le rôle est-il utilisable dans ce mode ? */
export function roleInProfile(role: Role, profile: ProfileId): boolean {
  const p = ROLE_PROFILE[role];
  return p === "core" || p === "both" || p === profile;
}

/** Les rôles d'un mode, dans l'ordre du catalogue. */
export function rolesOfProfile(profile: ProfileId): Role[] {
  return ROLES.filter((r) => roleInProfile(r, profile));
}

/** Le profil propre d'un jeu de rôles ; `null` s'il n'a que des rôles techniques ou communs. */
export function profileOfRoles(roles: readonly Role[]): ProfileId | null {
  for (const r of roles) {
    const p = ROLE_PROFILE[r];
    if (p === "classique" || p === "direx") return p;
  }
  return null;
}

/** Échelon d'un rôle — sert à grouper le sélecteur (DIREX, PC FAR, PCF, PCT, PCO, entités). */
export type Echelon = "admin" | "direx" | "pcfar" | "pcf" | "pct" | "pco" | "entity" | "classique";
export function echelonOf(role: Role): Echelon {
  if (role === "superadmin" || role === "admin") return "admin";
  if (role.startsWith("direx_")) return "direx";
  if (role.startsWith("pcfar_")) return "pcfar";
  if (role.startsWith("pcf_")) return "pcf";
  if (role.startsWith("pct_")) return "pct";
  if (role.startsWith("pco_")) return "pco";
  if (role.startsWith("resp_")) return "entity";
  return "classique";
}

/** Icône (tracé SVG) associée à chaque rôle — sert au sélecteur en tuiles. */
export const ROLE_ICONS: Record<Role, string> = {
  place_arme: UI_ICONS.shield,
  wali: UI_ICONS.users,
  opcom: KPI_ICONS.units,
  superadmin: UI_ICONS.shield,
  admin: NAV_ICONS.settings,
  strategic: NAV_ICONS.cmd,
  gendarmerie: UI_ICONS.shield,
  etat_major: NAV_ICONS.cmd,
  interieur: UI_ICONS.users,
  tacom: NAV_ICONS.dispatch,
  pco: NAV_ICONS.dispatch,
  pct: NAV_ICONS.dispatch,
  bluecell: FLUX_ICONS.activity,
  greencell: NAV_ICONS.res,
  orangecell: UI_ICONS.key,
  resp_hospital: NAV_ICONS.hospitals,
  resp_shelter: NAV_ICONS.shelters,
  resp_morgue: KPI_ICONS.beds,
  resp_unit: NAV_ICONS.units,
  resp_equipment: NAV_ICONS.dis,
  direx_chef: NAV_ICONS.cmd,
  direx_eval: UI_ICONS.eye,
  direx_anim: FLUX_ICONS.activity,
  direx_rls: UI_ICONS.key,
  pcfar_chef: KPI_ICONS.units,
  pcfar_ops: FLUX_ICONS.activity,
  pcfar_log: NAV_ICONS.res,
  pcfar_planif_rens: NAV_ICONS.plans,
  pcfar_synth: NAV_ICONS.reports,
  pcf_chef: UI_ICONS.users,
  pcf_ops: FLUX_ICONS.activity,
  pcf_log: NAV_ICONS.res,
  pcf_planif_rens: NAV_ICONS.plans,
  pcf_synth: NAV_ICONS.reports,
  pct_chef: NAV_ICONS.dispatch,
  pct_ops: FLUX_ICONS.activity,
  pct_log: NAV_ICONS.res,
  pct_rens: UI_ICONS.key,
  pco_chef: NAV_ICONS.dispatch,
  pco_ops: FLUX_ICONS.activity,
  pco_log: NAV_ICONS.res,
  pco_rens_com: UI_ICONS.key,
};

/**
 * Rôles qu'un créateur a le droit d'attribuer (§ gestion des utilisateurs) :
 * - le Super Administrateur peut créer tous les rôles, y compris superadmin/admin ;
 * - l'Administrateur peut créer tous les rôles SAUF superadmin et admin.
 * Tout autre rôle ne peut créer personne.
 */
/** Les rôles qu'un créateur peut attribuer — dans le mode demandé, s'il est donné (ADR 0022). */
export function assignableRoles(creator: Role, profile?: ProfileId): Role[] {
  const pool = profile ? rolesOfProfile(profile) : ROLES;
  if (creator === "superadmin") return pool;
  if (creator === "admin") return pool.filter((r) => r !== "superadmin" && r !== "admin");
  return [];
}

/** Un créateur peut-il gérer des utilisateurs (ouvrir l'écran de gestion) ? */
export function canManageUsers(role: Role): boolean {
  return role === "superadmin" || role === "admin";
}

/**
 * Un Super Administrateur peut cocher plusieurs rôles ; un Administrateur ne
 * peut en attribuer qu'un seul à l'utilisateur créé.
 */
export function canAssignMultipleRoles(creator: Role): boolean {
  return creator === "superadmin";
}

/** Seul le Super Administrateur peut forcer l'activation / gérer les rôles-fonctionnalités. */
export function isSuperAdmin(role: Role): boolean {
  return role === "superadmin";
}

/**
 * Rôles autorisés à déclarer un incident — miroir de la permission serveur
 * `incidents:create` (l'API reste l'autorité ; ceci ne fait que masquer l'UI).
 */
export function canReportIncident(role: Role): boolean {
  return (
    role === "superadmin" || role === "tacom" || role === "pco" || role === "pct" || role === "bluecell" ||
    // Profil « direx » : la DIREX déclare (Chef, Anim), les chefs de PC tactiques et leurs cellules Ops rendent compte.
    role === "direx_chef" || role === "direx_anim" || role === "pct_chef" || role === "pco_chef" || role === "pct_ops" || role === "pco_ops"
  );
}

/**
 * Rôles autorisés à DÉPLOYER un poste sur une opération — miroir de la
 * permission serveur `incidents:update`. L'API reste l'autorité : elle vérifie
 * en plus que l'incident est dans la portée de l'appelant. Ceci ne fait que
 * masquer un geste qui serait de toute façon refusé.
 */
export function canDeployPosts(role: Role): boolean {
  return (
    role === "superadmin" || role === "admin" || role === "opcom" || role === "tacom" || role === "pco" || role === "pct" ||
    role === "direx_chef" || role === "direx_anim" || role === "pcfar_chef" || role === "pcfar_ops" || role === "pcf_chef" || role === "pcf_ops" || role === "pct_chef" || role === "pco_chef"
  );
}

/**
 * Mode édition de la carte — par rôle depuis l'ADR 0018 : chacun pose ce que
 * la doctrine lui donne (`lib/edit.ts`). Réexporté ici pour les écrans qui ne
 * demandent que « a-t-il un mode édition ? ».
 */
export { canEditMap } from "@/lib/edit";

// ---------------------------------------------------------------------------
// Responsabilités opérationnelles (miroir de shared/responsibilities.ts côté API)
// Sert UNIQUEMENT à composer l'interface d'affectation. Le cantonnement réel
// est appliqué par l'API (ScopeGuard) — jamais par le frontend.
// ---------------------------------------------------------------------------

export const RESPONSIBILITY_KINDS = ["hospital", "unit", "shelter", "morgue", "equipment"] as const;

export type ResponsibilityKind = (typeof RESPONSIBILITY_KINDS)[number];

/** Entités affectées à un compte, une par nature de responsabilité. */
export type Assignments = Partial<Record<ResponsibilityKind, string>>;

/** Rôle → nature d'entité dont il répond. Absent = rôle non rattaché. */
export const RESPONSIBILITY_OF_ROLE: Partial<Record<Role, ResponsibilityKind>> = {
  resp_hospital: "hospital",
  resp_unit: "unit",
  resp_shelter: "shelter",
  resp_morgue: "morgue",
  resp_equipment: "equipment",
};

// ---------------------------------------------------------------------------
// Rattachements de PORTÉE (miroir de SCOPE_KEYS / ROLE_SCOPE_KEY côté API).
// Le formulaire de compte ne pouvait pas proposer de région : ce miroir ne
// connaissait que les entités, si bien que l'API refusait chaque wali créé
// depuis l'écran — faute de région — sans que l'écran ait pu la demander.
// ---------------------------------------------------------------------------

/** Clés de rattachement qui définissent un périmètre, non une entité. */
export const SCOPE_KEYS = ["region", "incident"] as const;

export type ScopeKey = (typeof SCOPE_KEYS)[number];

/** Rôle → périmètre qu'il porte. Absent = aucun périmètre à saisir. */
export const ROLE_SCOPE_KEY: Partial<Record<Role, ScopeKey>> = {
  wali: "region",
  place_arme: "region",
  opcom: "incident",
  gendarmerie: "incident",
  etat_major: "incident",
  interieur: "incident",
  tacom: "incident",
  pco: "incident",
  pct: "incident",
  bluecell: "incident",
  greencell: "incident",
  orangecell: "incident",
  resp_shelter: "incident",
  resp_equipment: "incident",
  // Profil « direx » : les PC et leurs cellules sont déployés sur une opération ; la DIREX est globale.
  pcfar_chef: "incident",
  pcfar_ops: "incident",
  pcfar_log: "incident",
  pcfar_planif_rens: "incident",
  pcfar_synth: "incident",
  pcf_chef: "incident",
  pcf_ops: "incident",
  pcf_log: "incident",
  pcf_planif_rens: "incident",
  pcf_synth: "incident",
  pct_chef: "incident",
  pct_ops: "incident",
  pct_log: "incident",
  pct_rens: "incident",
  pco_chef: "incident",
  pco_ops: "incident",
  pco_log: "incident",
  pco_rens_com: "incident",
};

/**
 * Périmètres exigés DÈS la création : la région. L'incident, lui, vient du
 * déploiement, geste distinct et tracé — on ne le saisit pas au formulaire.
 */
export function mandatoryScopeKeysOf(roles: readonly Role[]): ScopeKey[] {
  const keys = new Set<ScopeKey>();
  for (const r of roles) if (ROLE_SCOPE_KEY[r] === "region") keys.add("region");
  return [...keys];
}

/**
 * Autorités CIVILES : pas de grade militaire. Le formulaire masque le champ et
 * l'API refuse la valeur — le masquage n'est qu'un confort.
 */
export const CIVIL_ROLES: readonly Role[] = ["wali"];

export function isCivil(roles: readonly Role[]): boolean {
  return roles.some((r) => CIVIL_ROLES.includes(r));
}

/** Entités affectées à un compte, une par nature de responsabilité — et sa région s'il en porte une. */
export type ScopedAssignments = Assignments & { region?: string; incident?: string };

/** Natures d'entité à affecter pour cet ensemble de rôles (sans doublon). */
export function requiredAssignments(roles: readonly Role[]): ResponsibilityKind[] {
  const kinds: ResponsibilityKind[] = [];
  for (const r of roles) {
    const kind = RESPONSIBILITY_OF_ROLE[r];
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}
