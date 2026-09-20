// ============================================================================
// ARGOS — profils de rôles (ADR 0022) : « classique » et « direx »
//
// Deux organisations vivent dans la même application, sur les mêmes données :
//   - `classique` : l'organisation d'origine (stratégique, autorités, OPCOM et
//     ses représentants, TACOM et ses PC, cellules, chefs d'entité) ;
//   - `direx`     : la direction d'exercice (DIREX) et ses postes de commandement
//     par fonctions (PC FAR, PCF, PCT, PCO), avec les mêmes chefs d'entité.
// Le mode se choisit à la connexion ; un compte appartient à un seul profil,
// sauf les rôles techniques (`superadmin`, `admin`) et les chefs d'entité,
// communs aux deux.
//
// Chaque rôle porte ses TRAITS : ce que les règles du domaine testent. Avant
// ce fichier, les règles comparaient des noms de rôles (`role === "opcom"`) ;
// elles lisent désormais un trait, si bien qu'un rôle du second profil obtient
// la même conduite en le déclarant ici — sans toucher aux règles. Les traits
// des rôles classiques reproduisent EXACTEMENT les listes qu'ils remplacent :
// les suites de tests existantes en sont la preuve.
// ============================================================================
import type { PostKind, UnitCorps } from "@/modules/domain/domain.types";

export const PROFILE_IDS = ["classique", "direx"] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

/** Libellés du choix de mode à la connexion. */
export const PROFILE_LABELS: Record<ProfileId, string> = {
  classique: "Mode classique",
  direx: "Mode Direx",
};

export function isProfileId(v: unknown): v is ProfileId {
  return typeof v === "string" && (PROFILE_IDS as readonly string[]).includes(v);
}

/** Les vingt rôles de l'organisation d'origine, dans leur ordre historique. */
export const CLASSIC_ROLES = [
  "superadmin",
  "admin",
  "strategic",
  "place_arme",
  "wali",
  "opcom",
  "gendarmerie",
  "etat_major",
  "interieur",
  "tacom",
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
] as const;

/** Les rôles propres au profil « direx » (les chefs d'entité sont ceux de `CLASSIC_ROLES`). */
export const DIREX_ONLY_ROLES = [
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
] as const;

export const ALL_ROLES = [...CLASSIC_ROLES, ...DIREX_ONLY_ROLES] as const;
export type Role = (typeof ALL_ROLES)[number];

/** À quel(s) profil(s) un rôle appartient : technique (`core`), l'un des deux, ou les deux. */
export type RoleProfile = "core" | ProfileId | "both";

/** Échelon : où le rôle se situe dans l'organisation (sert au regroupement des écrans). */
export type Echelon =
  | "admin"
  | "strategic"
  | "authority"
  | "opcom"
  | "tacom"
  | "cell"
  | "entity"
  | "direx"
  | "pcfar"
  | "pcf"
  | "pct"
  | "pco";

/** Fonction tenue dans l'échelon. */
export type Fonction =
  | "technique"
  | "supervision"
  | "authority"
  | "chef"
  | "member"
  | "ops"
  | "log"
  | "rens"
  | "rens_com"
  | "planif_rens"
  | "synth"
  | "eval"
  | "anim"
  | "rls"
  | "security"
  | "responsible";

/** Ce que le rôle VOIT (doctrine de visibilité, `visibility.service.ts`). */
export type VisibilityKind = "global" | "region" | "incident" | "entity" | "entity_multi";

/** Ce que le rôle TIENT comme ressources (`resources.rules.ts`). */
export type ResourceHolding =
  | "all"          // administration : tout, en tout mode
  | "animation"    // direction d'exercice : tout, hors mode opérationnel
  | "own_unit"     // le commandant : son unité
  | "own_hospital" // le directeur : son hôpital
  | "own_shelter"  // le chef d'abri : son abri
  | "park"         // le responsable de parc : équipements, véhicules, logistique de l'unité de son parc
  | "logistics"    // cellule logistique : la logistique en tout mode, le reste hors opérationnel
  | "ops"          // cellule opérations : tout sauf la logistique, hors opérationnel
  | "security"     // cellule sécurité / renseignement : les unités des forces de l'ordre, hors opérationnel
  | "none";

export type ResponsibilityKind = "hospital" | "unit" | "shelter" | "morgue" | "equipment";

export interface RoleTraits {
  profile: RoleProfile;
  echelon: Echelon;
  fonction: Fonction;
  /** Libellé français (colonne de la matrice, sélecteur de rôle). */
  label: string;
  visibility: VisibilityKind;
  /** Clé de rattachement qui définit un périmètre : la région (autorités) ou l'incident (postes déployés). */
  scopeKey?: "region" | "incident";
  /** Nature d'entité dont le rôle répond (chefs d'entité). */
  responsibility?: ResponsibilityKind;
  /** Corps d'unité que le rôle AFFECTE à une opération (`*` : tous). */
  assignCorps: readonly UnitCorps[] | "*";
  /** Déploie les unités affectées sur le terrain. */
  deploy: boolean;
  /** Crée et modifie des unités hors mode opérationnel (le jeu d'exercice). */
  unitMaker: boolean;
  /** Retire des unités hors mode opérationnel. */
  unitRemover: boolean;
  resources: ResourceHolding;
  /** Natures de poste que le rôle pose sur la carte. */
  placePosts: readonly PostKind[];
  /** Pose équipes, équipements et véhicules sur le terrain. */
  placeResources: boolean;
  /** Conduit les simulations de la carte (crues, feux de forêt). */
  simulate: boolean;
  /** Autorité régionale : unique par région, prévenue à la déclaration. */
  regionalAuthority: boolean;
  /** Autorité civile : sans grade militaire. */
  civil: boolean;
  /** Nature du poste que le compte tient sur la carte, s'il en tient un. */
  postKind?: PostKind;
}

const ALL_POST_KINDS: readonly PostKind[] = ["opcom", "tacom", "pco", "pct", "bluecell", "greencell", "orangecell", "shelter", "equipment", "pcfar", "pcf"];

/**
 * Les natures de poste de chaque mode de l'application : le mode édition de
 * la carte ne propose — et la carte ne montre — que celles-là. Le PCT et le
 * PCO existent dans les deux organisations ; les abris et les parcs aussi.
 */
export const PROFILE_POST_KINDS: Record<ProfileId, readonly PostKind[]> = {
  classique: ["opcom", "tacom", "pco", "pct", "bluecell", "greencell", "orangecell", "shelter", "equipment"],
  direx: ["pcfar", "pcf", "pct", "pco", "shelter", "equipment"],
};

export function postKindInProfile(kind: PostKind, profile: ProfileId): boolean {
  return PROFILE_POST_KINDS[profile].includes(kind);
}
const CIVIL: readonly UnitCorps[] = ["dgsn", "dgpc", "fa"];
const NON_FAR: readonly UnitCorps[] = ["dgsn", "dgpc", "fa", "gendarmerie"];

const none = {
  assignCorps: [] as readonly UnitCorps[],
  deploy: false,
  unitMaker: false,
  unitRemover: false,
  resources: "none" as ResourceHolding,
  placePosts: [] as readonly PostKind[],
  placeResources: false,
  simulate: false,
  regionalAuthority: false,
  civil: false,
};

/**
 * Une cellule de PC (profil direx) : ce que faisait la cellule de même couleur,
 * plus le déploiement. Les OPS et LOG affectent aussi les unités à l'opération,
 * tous corps confondus (ADR 0027 — « pour le moment, tout le monde voit tout »).
 */
function cell(echelon: "pct" | "pco", fonction: "ops" | "log" | "rens" | "rens_com", label: string, resources: ResourceHolding): RoleTraits {
  const assignCorps = fonction === "ops" || fonction === "log" ? "*" : none.assignCorps;
  return { ...none, profile: "direx", echelon, fonction, label, visibility: "incident", scopeKey: "incident", assignCorps, deploy: true, unitMaker: true, unitRemover: true, resources, placeResources: true };
}

/** Un poste de commandement de niveau opératif (profil direx) : PC FAR ou PCF. */
function pc(echelon: "pcfar" | "pcf", fonction: Fonction, label: string, _corps: readonly UnitCorps[]): RoleTraits {
  const base: RoleTraits = { ...none, profile: "direx", echelon, fonction, label, visibility: "incident", scopeKey: "incident" };
  // ADR 0027 : le chef, les OPS et le LOG affectent les unités de TOUS les corps —
  // « pour le moment, tout le monde voit tout ». Le corps propre du PC (`_corps`)
  // reste documenté ici pour le jour où la doctrine se resserre.
  switch (fonction) {
    case "chef":
      return { ...base, assignCorps: "*", deploy: true, placePosts: ["pct", "pco"], simulate: true, postKind: echelon };
    case "ops":
      return { ...base, assignCorps: "*", deploy: true, unitMaker: true, unitRemover: true, resources: "ops", placePosts: ["pct", "pco"], placeResources: true, simulate: true };
    case "log":
      // Les LOG des PC opératifs déploient, tiennent aussi les unités (décision du 19 septembre 2026) et les affectent (ADR 0027).
      return { ...base, assignCorps: "*", resources: "logistics", deploy: true, unitMaker: true, unitRemover: true, placeResources: true };
    case "planif_rens":
      return { ...base, simulate: true };
    default:
      return base;
  }
}

export const ROLE_TRAITS: Record<Role, RoleTraits> = {
  // --- techniques : présents dans les deux modes -----------------------------
  superadmin: { ...none, profile: "core", echelon: "admin", fonction: "technique", label: "Super Administrateur", visibility: "global", assignCorps: "*", deploy: true, unitMaker: true, unitRemover: true, resources: "all", placePosts: ALL_POST_KINDS, placeResources: true, simulate: true },
  admin: { ...none, profile: "core", echelon: "admin", fonction: "technique", label: "Administrateur", visibility: "global", assignCorps: "*", deploy: true, unitMaker: true, resources: "all", simulate: true },

  // --- profil classique ------------------------------------------------------
  strategic: { ...none, profile: "classique", echelon: "strategic", fonction: "supervision", label: "Utilisateur Stratégique", visibility: "global", placePosts: ["opcom"], simulate: true },
  place_arme: { ...none, profile: "classique", echelon: "authority", fonction: "authority", label: "Place d'Armes", visibility: "region", scopeKey: "region", assignCorps: ["far"], regionalAuthority: true },
  wali: { ...none, profile: "classique", echelon: "authority", fonction: "authority", label: "Wali / Gouverneur", visibility: "region", scopeKey: "region", assignCorps: CIVIL, regionalAuthority: true, civil: true },
  opcom: { ...none, profile: "classique", echelon: "opcom", fonction: "chef", label: "OPCOM — PC état-major incident", visibility: "incident", scopeKey: "incident", assignCorps: "*", unitMaker: true, unitRemover: true, placePosts: ["tacom", "pco", "pct", "bluecell", "greencell", "orangecell"], simulate: true, postKind: "opcom" },
  gendarmerie: { ...none, profile: "classique", echelon: "opcom", fonction: "member", label: "Représentant Gendarmerie Royale (OPCOM)", visibility: "incident", scopeKey: "incident", assignCorps: ["gendarmerie"], simulate: true },
  etat_major: { ...none, profile: "classique", echelon: "opcom", fonction: "member", label: "Représentant État-Major des FAR (OPCOM)", visibility: "incident", scopeKey: "incident", assignCorps: ["far"], simulate: true },
  interieur: { ...none, profile: "classique", echelon: "opcom", fonction: "member", label: "Représentant Ministère de l'Intérieur (OPCOM)", visibility: "incident", scopeKey: "incident", assignCorps: CIVIL, simulate: true },
  tacom: { ...none, profile: "classique", echelon: "tacom", fonction: "chef", label: "TACOM — PC tactique", visibility: "incident", scopeKey: "incident", deploy: true, placeResources: true, simulate: true, postKind: "tacom" },
  pco: { ...none, profile: "classique", echelon: "tacom", fonction: "chef", label: "Chef du PC Opérationnel (PCO)", visibility: "incident", scopeKey: "incident", deploy: true, placeResources: true, simulate: true, postKind: "pco" },
  pct: { ...none, profile: "classique", echelon: "tacom", fonction: "chef", label: "Chef du PC Tactique (PCT)", visibility: "incident", scopeKey: "incident", deploy: true, placeResources: true, simulate: true, postKind: "pct" },
  bluecell: { ...none, profile: "classique", echelon: "cell", fonction: "ops", label: "Cellule Bleue — Opérations", visibility: "incident", scopeKey: "incident", deploy: true, unitMaker: true, unitRemover: true, resources: "ops", placeResources: true, postKind: "bluecell" },
  greencell: { ...none, profile: "classique", echelon: "cell", fonction: "log", label: "Cellule Verte — Logistique", visibility: "incident", scopeKey: "incident", deploy: true, unitMaker: true, unitRemover: true, resources: "logistics", placeResources: true, postKind: "greencell" },
  orangecell: { ...none, profile: "classique", echelon: "cell", fonction: "security", label: "Cellule Orange — Sécurité", visibility: "incident", scopeKey: "incident", deploy: true, unitMaker: true, unitRemover: true, resources: "security", placeResources: true, postKind: "orangecell" },

  // --- chefs d'entité : communs aux deux profils ------------------------------
  resp_hospital: { ...none, profile: "both", echelon: "entity", fonction: "responsible", label: "Directeur d'hôpital", visibility: "entity_multi", responsibility: "hospital", resources: "own_hospital" },
  resp_shelter: { ...none, profile: "both", echelon: "entity", fonction: "responsible", label: "Chef d'abri", visibility: "entity", scopeKey: "incident", responsibility: "shelter", resources: "own_shelter" },
  resp_morgue: { ...none, profile: "both", echelon: "entity", fonction: "responsible", label: "Directeur de morgue", visibility: "entity_multi", responsibility: "morgue" },
  resp_unit: { ...none, profile: "both", echelon: "entity", fonction: "responsible", label: "Commandant d'unité", visibility: "entity_multi", responsibility: "unit", resources: "own_unit" },
  resp_equipment: { ...none, profile: "classique", echelon: "entity", fonction: "responsible", label: "Responsable Équipement", visibility: "incident", scopeKey: "incident", responsibility: "equipment", resources: "park" },

  // --- profil direx : la direction d'exercice ---------------------------------
  direx_chef: { ...none, profile: "direx", echelon: "direx", fonction: "chef", label: "Chef / DIREX", visibility: "global", unitMaker: true, unitRemover: true, placePosts: ["pcfar", "pcf"], simulate: true },
  direx_eval: { ...none, profile: "direx", echelon: "direx", fonction: "eval", label: "Eval / DIREX", visibility: "global", simulate: true },
  direx_anim: { ...none, profile: "direx", echelon: "direx", fonction: "anim", label: "Anim / DIREX", visibility: "global", assignCorps: "*", unitMaker: true, unitRemover: true, resources: "animation", placePosts: ["pcfar", "pcf", "pct", "pco"], placeResources: true, simulate: true },
  direx_rls: { ...none, profile: "direx", echelon: "direx", fonction: "rls", label: "RLS / DIREX", visibility: "global", resources: "logistics", simulate: true },

  // --- profil direx : les postes de commandement ------------------------------
  pcfar_chef: pc("pcfar", "chef", "Chef / PC FAR", ["far"]),
  pcfar_ops: pc("pcfar", "ops", "OPS / PC FAR", ["far"]),
  pcfar_log: pc("pcfar", "log", "LOG / PC FAR", ["far"]),
  pcfar_planif_rens: pc("pcfar", "planif_rens", "Planif & Rens / PC FAR", ["far"]),
  pcfar_synth: pc("pcfar", "synth", "SYNTH / PC FAR", ["far"]),
  pcf_chef: pc("pcf", "chef", "Chef / PCF", NON_FAR),
  pcf_ops: pc("pcf", "ops", "OPS / PCF", NON_FAR),
  pcf_log: pc("pcf", "log", "LOG / PCF", NON_FAR),
  pcf_planif_rens: pc("pcf", "planif_rens", "Planif & Rens / PCF", NON_FAR),
  pcf_synth: pc("pcf", "synth", "SYNTH / PCF", NON_FAR),
  pct_chef: { ...none, profile: "direx", echelon: "pct", fonction: "chef", label: "Chef / PCT", visibility: "incident", scopeKey: "incident", assignCorps: "*", deploy: true, placeResources: true, simulate: true, postKind: "pct" },
  pct_ops: cell("pct", "ops", "Ops / PCT", "ops"),
  pct_log: cell("pct", "log", "LOG / PCT", "logistics"),
  pct_rens: cell("pct", "rens", "Rens / PCT", "security"),
  pco_chef: { ...none, profile: "direx", echelon: "pco", fonction: "chef", label: "Chef / PCO", visibility: "incident", scopeKey: "incident", assignCorps: "*", deploy: true, placeResources: true, simulate: true, postKind: "pco" },
  pco_ops: cell("pco", "ops", "Ops / PCO", "ops"),
  pco_log: cell("pco", "log", "LOG / PCO", "logistics"),
  pco_rens_com: cell("pco", "rens_com", "Rens & Com / PCO", "security"),
};

export function traitsOf(role: Role): RoleTraits {
  return ROLE_TRAITS[role];
}

/** Le rôle est-il utilisable dans ce mode ? Les rôles techniques et communs le sont dans les deux. */
export function roleInProfile(role: Role, profile: ProfileId): boolean {
  const p = ROLE_TRAITS[role].profile;
  return p === "core" || p === "both" || p === profile;
}

/** Les rôles d'un mode, dans l'ordre du catalogue. */
export function rolesOfProfile(profile: ProfileId): Role[] {
  return ALL_ROLES.filter((r) => roleInProfile(r, profile));
}

/**
 * Le profil PROPRE d'un jeu de rôles : celui de son premier rôle qui en a un ;
 * `null` si le compte ne porte que des rôles techniques ou communs — il se
 * connecte alors dans l'un ou l'autre mode.
 */
export function profileOfRoles(roles: readonly Role[]): ProfileId | null {
  for (const r of roles) {
    const p = ROLE_TRAITS[r]?.profile;
    if (p === "classique" || p === "direx") return p;
  }
  return null;
}

/** Un compte peut-il se connecter dans ce mode ? */
export function accountFitsProfile(roles: readonly Role[], profile: ProfileId): boolean {
  const own = profileOfRoles(roles);
  return own === null || own === profile;
}

/** Un jeu de rôles est-il cohérent : d'un seul profil ? (Deux organisations ne se mêlent pas sur un compte.) */
export function rolesShareProfile(roles: readonly Role[]): boolean {
  const owned = new Set(roles.map((r) => ROLE_TRAITS[r]?.profile).filter((p) => p === "classique" || p === "direx"));
  return owned.size <= 1;
}

/** Les rôles qui tiennent un poste de cette nature sur la carte (un PC, une cellule). */
export function rolesHoldingPost(kind: PostKind): Role[] {
  return ALL_ROLES.filter((r) => ROLE_TRAITS[r].postKind === kind);
}

/** Catalogue servi au web (`GET /iam/profiles`). */
export function describeProfiles() {
  return PROFILE_IDS.map((id) => ({
    id,
    label: PROFILE_LABELS[id],
    roles: rolesOfProfile(id).map((r) => {
      const t = ROLE_TRAITS[r];
      return { id: r, label: t.label, echelon: t.echelon, fonction: t.fonction, profile: t.profile };
    }),
  }));
}
