// ============================================================================
// ARGOS — modèle de gestion des utilisateurs (couche de données simulée)
// Frontière lib/data/ : ces comptes et la matrice rôle→fonctionnalités seront
// remplacés par les endpoints IAM de l'API (Phase 2). L'application réelle du
// RBAC reste côté serveur ; cet écran n'est que la couche de gestion.
// ============================================================================

import type { Role } from "@/lib/roles";
import { ROLES } from "@/lib/roles";
import { MODULE_KEYS, type ModuleKey } from "@/lib/nav";

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

/** Initiales pour l'avatar (2 lettres). */
export function initials(nom: string): string {
  const parts = nom.replace(/^[A-Za-zÀ-ÿ]+\.?\s*/, "").split(/\s+/).filter(Boolean);
  const src = parts.length ? parts : nom.split(/\s+/);
  return src.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || nom.slice(0, 2).toUpperCase();
}

// --- Matrice rôle → fonctionnalités ----------------------------------------
const ALL_ON = (): Record<string, boolean> => Object.fromEntries(MODULE_KEYS.map((k) => [k, true]));

/**
 * Ouverts à tout rôle sans qu'on les cite : le tableau de bord national (vue
 * du navigateur) et la simulation (écran d'exercice). « Ma responsabilité »
 * et « Gestion de mon entité » vont d'office aux cinq responsables d'entité,
 * OPSnet à qui lit les unités ou les abris (ADR 0017).
 */
const OPEN_TO_ALL: readonly ModuleKey[] = ["dashboard", "simulation"];
const RESPONSIBLE: readonly ModuleKey[] = ["myresp", "myrespManage"];
/** Les trois simulations de la carte (ADR 0018) : la conduite les a, les cellules et les responsables non. */
const SIMS: readonly ModuleKey[] = ["simFlood", "simFire", "simNrbc"];

/** Construit un jeu de modules à partir de la liste des modules ouverts. */
function featuresFrom(allowed: ModuleKey[]): Record<string, boolean> {
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, allowed.includes(k) || OPEN_TO_ALL.includes(k)]));
}

/** Idem pour la conduite (stratégique, OPCOM, TACOM et leurs dérivés) : les simulations en plus. */
function conductFrom(allowed: ModuleKey[]): Record<string, boolean> {
  return featuresFrom([...allowed, ...SIMS]);
}

/** Idem pour un responsable d'entité : sa responsabilité et sa gestion en plus. */
function responsibleFrom(allowed: ModuleKey[]): Record<string, boolean> {
  return featuresFrom([...allowed, ...RESPONSIBLE]);
}

/** Modules ouverts par défaut pour chaque rôle — miroir de `DEFAULT_ROLE_FEATURES` de l'API (ADR 0016, 0017). */
export const DEFAULT_ROLE_FEATURES: Record<Role, Record<string, boolean>> = {
  superadmin: ALL_ON(),
  // L'Administrateur n'a ni la supervision (Super Administrateur seul) ni de mode édition (rien à poser).
  admin: { ...ALL_ON(), supervision: false, mapEdit: false },
  strategic: conductFrom(["incidents", "map", "seismic", "units", "opsnet", "resources", "hospitals", "shelters", "morgue", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation", "mapEdit", "trackers", "chemlib"]),
  place_arme: featuresFrom(["incidents", "map", "seismic", "equip", "units", "opsnet", "resources", "hospitals", "shelters", "morgue", "comms", "reports", "analytics", "assistant", "simulation", "trackers", "chemlib"]),
  wali: featuresFrom(["incidents", "map", "seismic", "units", "opsnet", "resources", "hospitals", "shelters", "morgue", "comms", "reports", "analytics", "assistant", "simulation", "trackers", "chemlib"]),
  opcom: conductFrom(["incidents", "map", "seismic", "dispatch", "equip", "units", "opsnet", "resources", "hospitals", "shelters", "morgue", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation", "mapEdit", "trackers", "chemlib"]),
  gendarmerie: conductFrom(["incidents", "map", "seismic", "dispatch", "equip", "units", "opsnet", "resources", "hospitals", "shelters", "morgue", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation", "trackers", "chemlib"]),
  etat_major: conductFrom(["incidents", "map", "seismic", "dispatch", "equip", "units", "opsnet", "resources", "hospitals", "shelters", "morgue", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation", "trackers", "chemlib"]),
  interieur: conductFrom(["incidents", "map", "seismic", "dispatch", "equip", "units", "opsnet", "resources", "hospitals", "shelters", "morgue", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation", "trackers", "chemlib"]),
  tacom: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "equip", "units", "opsnet", "resources", "hospitals", "ics", "damage", "shelters", "morgue", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation", "mapEdit", "trackers", "chemlib"]),
  pco: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "equip", "units", "opsnet", "resources", "hospitals", "ics", "damage", "shelters", "morgue", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation", "mapEdit", "trackers", "chemlib"]),
  pct: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "equip", "units", "opsnet", "resources", "hospitals", "ics", "damage", "shelters", "morgue", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation", "mapEdit", "trackers", "chemlib"]),
  bluecell: featuresFrom(["incidents", "map", "seismic", "dispatch", "triage", "equip", "units", "opsnet", "resources", "hospitals", "ics", "damage", "shelters", "morgue", "comms", "reports", "analytics", "assistant", "simulation", "mapEdit", "trackers", "chemlib"]),
  greencell: featuresFrom(["incidents", "map", "equip", "units", "opsnet", "workorders", "resources", "hospitals", "shelters", "morgue", "comms", "reports", "analytics", "assistant", "simulation", "mapEdit", "trackers", "chemlib"]),
  orangecell: featuresFrom(["incidents", "map", "equip", "units", "opsnet", "resources", "hospitals", "shelters", "morgue", "comms", "reports", "analytics", "assistant", "simulation", "mapEdit", "trackers", "chemlib"]),
  resp_hospital: responsibleFrom(["incidents", "map", "resources", "hospitals", "morgue", "comms", "assistant", "simulation", "trackers"]),
  resp_shelter: responsibleFrom(["incidents", "map", "resources", "shelters", "opsnet", "comms", "assistant", "simulation", "trackers"]),
  resp_morgue: responsibleFrom(["incidents", "map", "triage", "resources", "morgue", "comms", "assistant", "simulation", "trackers"]),
  resp_unit: responsibleFrom(["incidents", "map", "equip", "units", "opsnet", "resources", "comms", "analytics", "assistant", "simulation", "trackers"]),
  resp_equipment: responsibleFrom(["map", "equip", "workorders", "resources", "comms", "simulation", "trackers"]),
  // --- profil « direx » (ADR 0022) — relevé de `/iam/role-features/defaults` ----
  direx_chef: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  direx_eval: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant"]),
  direx_anim: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  direx_rls: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pcfar_chef: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pcfar_ops: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pcfar_log: featuresFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant"]),
  pcfar_planif_rens: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pcfar_synth: featuresFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simNrbc"]),
  pcf_chef: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pcf_ops: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pcf_log: featuresFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant"]),
  pcf_planif_rens: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pcf_synth: featuresFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "simNrbc"]),
  pct_chef: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pct_ops: featuresFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pct_log: featuresFrom(["incidents", "map", "dispatch", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "shelters", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pct_rens: featuresFrom(["incidents", "map", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "comms", "reports", "analytics", "assistant", "mapEdit", "simNrbc"]),
  pco_chef: conductFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "orsec", "plans", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pco_ops: featuresFrom(["incidents", "map", "seismic", "dispatch", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pco_log: featuresFrom(["incidents", "map", "dispatch", "trackers", "chemlib", "equip", "units", "resources", "workorders", "hospitals", "opsnet", "morgue", "shelters", "comms", "reports", "analytics", "assistant", "mapEdit"]),
  pco_rens_com: featuresFrom(["incidents", "map", "triage", "trackers", "chemlib", "equip", "units", "resources", "hospitals", "opsnet", "morgue", "ics", "damage", "shelters", "comms", "reports", "analytics", "assistant", "mapEdit", "simNrbc"]),
};

/** Copie profonde des défauts (état initial modifiable dans le store). */
export function defaultRoleFeatures(): Record<Role, Record<string, boolean>> {
  return Object.fromEntries(
    ROLES.map((r) => [r, { ...DEFAULT_ROLE_FEATURES[r] }]),
  ) as Record<Role, Record<string, boolean>>;
}
