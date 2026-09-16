// ============================================================================
// ARGOS — modèle de navigation
// Reprend la barre latérale du design : items simples + trois groupes dépliables
// (Ressources, Gestion de désastres, Commandement). `key` choisit l'icône et le
// libellé i18n ; `href` est la vraie route Next.js.
// ============================================================================

import type { Dict } from "@/lib/i18n/translations";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { AI_ENABLED } from "@/lib/ai/config";
import type { Role } from "@/lib/roles";
import type { ModuleFeature } from "@/lib/api-client";

export type NavKey =
  | "dashboard" | "incidents" | "map" | "seismic" | "dispatch" | "triage"
  | "equip" | "units" | "personnel" | "workorders"
  | "hospitals" | "ics" | "damage" | "shelters"
  | "orsec" | "plans" | "comms" | "reports" | "analytics" | "assistant" | "simulation"
  | "users" | "settings"
  | "myresp" | "myrespManage" | "supervision"
  // Bibliothèque de substances dangereuses (lot N-3).
  | "chemlib"
  // Traceurs GPS FMC920 (lot N-2).
  | "trackers"
  // Réseau opérationnel : unités + abris (lot OPSnet).
  | "opsnet"
  | "morgue";

export type GroupKey = "res" | "dis" | "cmd";

export interface NavItem {
  kind: "item";
  key: NavKey;
  href: string;
  icon: string;
  /** si présent, item visible seulement pour ces rôles (filtré dans la Sidebar) */
  roles?: Role[];
}

export interface NavGroup {
  kind: "group";
  key: GroupKey;
  icon: string;
  children: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

const item = (key: NavKey, href: string): NavItem => ({ kind: "item", key, href, icon: NAV_ICONS[key as keyof typeof NAV_ICONS] ?? "" });

export const HREF: Record<NavKey, string> = {
  dashboard: "/dashboard",
  incidents: "/incidents",
  map: "/map",
  seismic: "/seismologie",
  dispatch: "/repartition",
  triage: "/triage",
  equip: "/inventaire",
  units: "/equipes",
  personnel: "/personnel",
  workorders: "/bons-de-travail",
  hospitals: "/hospinet",
  ics: "/ics",
  damage: "/dommages",
  shelters: "/abris",
  orsec: "/orsec",
  plans: "/plans",
  comms: "/communication",
  reports: "/rapports",
  analytics: "/analytique",
  assistant: "/assistant",
  simulation: "/simulation",
  users: "/utilisateurs",
  settings: "/parametres",
  myresp: "/ma-responsabilite",
  myrespManage: "/ma-responsabilite/gestion",
  supervision: "/responsabilites",
  chemlib: "/substances",
  trackers: "/traceurs",
  opsnet: "/opsnet",
  morgue: "/morgue",
};

export const NAV: NavEntry[] = [
  item("dashboard", HREF.dashboard),
  // « Ma responsabilité » — visible des seuls rôles rattachés à une entité.
  { kind: "item", key: "myresp", href: HREF.myresp, icon: UI_ICONS.shield, roles: ["resp_hospital", "resp_unit", "resp_shelter", "resp_morgue", "resp_equipment"] },
  { kind: "item", key: "myrespManage", href: HREF.myrespManage, icon: UI_ICONS.edit, roles: ["resp_hospital", "resp_unit", "resp_shelter", "resp_morgue", "resp_equipment"] },
  item("incidents", HREF.incidents),
  item("map", HREF.map),
  item("seismic", HREF.seismic),
  item("dispatch", HREF.dispatch),
  item("triage", HREF.triage),
  // Bibliothèque des substances dangereuses. SORTIE du groupe « Ressources »
  // (lot N-5) : ce n'est pas un stock à gérer mais un référentiel qu'on
  // consulte en intervention, et l'enfouir sous un groupe replié coûtait deux
  // gestes au moment où l'on en a le moins. Posée juste au-dessus de son
  // ancien emplacement, pour que ceux qui l'y connaissaient la retrouvent.
  //
  // Restreinte aux rôles détenant `nrbc:view` côté API — les cinq responsables
  // d'entité ne l'ont pas, et l'écran leur renverrait 403 puis une liste vide.
  // L'API reste l'autorité ; ceci ne fait que masquer un cul-de-sac.
  // Traceurs GPS et positions partagées. Ouvert à TOUS les rôles depuis
  // l'ADR 0015 : chacun détient `tracking:view` côté API (une position
  // partagée doit apparaître sur la carte de quiconque la voit) ; déclarer un
  // boîtier reste réservé à la conduite, et l'API le refuse aux autres.
  // Posé juste avant les substances : deux référentiels que l'on consulte en
  // intervention, dans le même bloc de l'œil.
  item("trackers", HREF.trackers),
  {
    kind: "item",
    key: "chemlib",
    href: HREF.chemlib,
    icon: NAV_ICONS.chemlib,
    roles: ["superadmin", "admin", "strategic", "place_arme", "wali", "opcom", "tacom", "bluecell", "greencell", "orangecell"],
  },
  {
    kind: "group",
    key: "res",
    icon: NAV_ICONS.res,
    children: [item("equip", HREF.equip), item("units", HREF.units), item("personnel", HREF.personnel), item("workorders", HREF.workorders)],
  },
  item("hospitals", HREF.hospitals),
  // OPSnet — pendant d'Hospinet pour les moyens d'action et d'accueil. Posé
  // juste après lui : un état-major lit ses deux réseaux d'affilée.
  item("opsnet", HREF.opsnet),
  // Service morgue — sites, morgues mobiles, registre des corps. Restreint
  // aux rôles détenant `morgue:view` côté API (l'API reste l'autorité).
  {
    kind: "item",
    key: "morgue",
    href: HREF.morgue,
    icon: NAV_ICONS.morgue,
    roles: ["superadmin", "admin", "strategic", "place_arme", "wali", "opcom", "tacom", "bluecell", "greencell", "orangecell", "resp_morgue", "resp_hospital"],
  },
  { kind: "group", key: "dis", icon: NAV_ICONS.dis, children: [item("ics", HREF.ics)] },
  item("damage", HREF.damage),
  item("shelters", HREF.shelters),
  { kind: "group", key: "cmd", icon: NAV_ICONS.cmd, children: [item("orsec", HREF.orsec)] },
  item("plans", HREF.plans),
  item("comms", HREF.comms),
  item("reports", HREF.reports),
  item("analytics", HREF.analytics),
  { kind: "item", key: "simulation", href: HREF.simulation, icon: NAV_ICONS.seismic, roles: ["superadmin", "admin", "strategic", "tacom"] },
  // Gestion des utilisateurs — Super Administrateur et Administrateur.
  { kind: "item", key: "users", href: HREF.users, icon: UI_ICONS.users, roles: ["superadmin", "admin"] },
  // Paramètres — réservé au Super Administrateur (filtré dans la Sidebar).
  // Supervision des responsabilités — réservée au Super Administrateur.
  { kind: "item", key: "supervision", href: HREF.supervision, icon: UI_ICONS.shield, roles: ["superadmin"] },
  { kind: "item", key: "settings", href: HREF.settings, icon: NAV_ICONS.settings, roles: ["superadmin"] },
];

/** Écrans encore rendus en « module en préparation » (aucun restant). */
export const STUB_KEYS: NavKey[] = [];

// ---------------------------------------------------------------------------
// Modules : ce que l'administrateur BASCULE (ADR 0015).
//
// Le vocabulaire est celui de l'API (`MODULE_KEYS`, porté par le contrat sous
// le nom `ModuleFeature`) : un drapeau global (Paramètres) ou la matrice
// rôle → modules (Utilisateurs › Rôles) coupent un MODULE, et l'API refuse
// alors toutes ses routes. Ici, on ne fait que MASQUER ce qu'elle refuse.
// Chaque clé de module est aussi une clé de navigation : le même mot désigne
// la même chose des deux côtés.
// ---------------------------------------------------------------------------

export type ModuleKey = ModuleFeature;

/** Tous les modules, dans l'ordre d'affichage des écrans d'administration. */
export const MODULE_KEYS = [
  "incidents", "map", "seismic", "dispatch", "triage",
  "equip", "units", "personnel", "workorders",
  "hospitals", "ics", "damage", "shelters", "morgue",
  "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation",
  "trackers", "chemlib",
] as const satisfies readonly ModuleKey[];

// Garde de complétude : si l'API ajoute un module au contrat, cette ligne
// refuse de compiler tant que la liste ci-dessus ne le porte pas.
const MODULE_KEYS_COMPLETE: Exclude<ModuleKey, (typeof MODULE_KEYS)[number]> extends never ? true : never = true;
void MODULE_KEYS_COMPLETE;

/**
 * Module qui gouverne chaque écran ; `null` pour le cœur, qui ne se coupe
 * jamais (tableau de bord, comptes, paramètres, « ma responsabilité »).
 */
export const NAV_MODULE: Record<NavKey, ModuleKey | null> = {
  dashboard: null,
  incidents: "incidents",
  map: "map",
  seismic: "seismic",
  dispatch: "dispatch",
  triage: "triage",
  equip: "equip",
  units: "units",
  personnel: "personnel",
  workorders: "workorders",
  hospitals: "hospitals",
  ics: "ics",
  damage: "damage",
  shelters: "shelters",
  orsec: "orsec",
  plans: "plans",
  comms: "comms",
  reports: "reports",
  analytics: "analytics",
  assistant: "assistant",
  simulation: "simulation",
  users: null,
  settings: null,
  myresp: null,
  myrespManage: null,
  supervision: null,
  chemlib: "chemlib",
  trackers: "trackers",
  // Le réseau opérationnel (unités + abris) suit le module des unités.
  opsnet: "units",
  morgue: "morgue",
};

/**
 * Un écran est ouvert si son module n'est coupé ni globalement (drapeaux) ni
 * pour le rôle (matrice rôle → modules). Le cœur est toujours ouvert.
 */
export function moduleOpen(key: NavKey, flags: Record<string, boolean>, roleFeatures: Record<string, boolean> | undefined): boolean {
  const m = NAV_MODULE[key];
  if (m === null) return true;
  return flags[m] !== false && roleFeatures?.[m] !== false;
}

/** Modules pilotables par drapeau global (§6.15) — tous. `assistant` et `simulation` suivent le flag de build AI_ENABLED. */
export const FLAGGABLE_KEYS: readonly ModuleKey[] = MODULE_KEYS;

export const DEFAULT_FLAGS: Record<string, boolean> = Object.fromEntries(
  MODULE_KEYS.map((k) => [k, (k === "assistant" || k === "simulation") ? AI_ENABLED : true]),
);

/** Résout un chemin vers la clé de module courante (pour la garde de route). */
/**
 * Clé de navigation d'un chemin.
 *
 * Le chemin le plus LONG l'emporte : « /ma-responsabilite/gestion » appartient à
 * `myrespManage`, pas à `myresp`, même si ce dernier en est un préfixe. Avec le
 * premier trouvé, l'en-tête titrait « Ma responsabilité » sur l'écran de gestion.
 */
export function keyForPath(pathname: string): NavKey | null {
  let meilleur: [NavKey, string] | null = null;
  for (const e of Object.entries(HREF) as [NavKey, string][]) {
    const [, href] = e;
    if ((pathname === href || pathname.startsWith(href + "/")) && (!meilleur || href.length > meilleur[1].length)) meilleur = e;
  }
  return meilleur ? meilleur[0] : null;
}

const LABEL_KEYS: Record<NavKey | GroupKey, keyof Dict> = {
  dashboard: "nav_dash", incidents: "nav_inc", map: "nav_map", seismic: "nav_seismic", dispatch: "nav_dispatch", triage: "nav_triage",
  equip: "nav_equip", units: "nav_units", personnel: "nav_pers", workorders: "nav_wo",
  hospitals: "nav_hosp", ics: "nav_ics", damage: "nav_damage", shelters: "nav_shelters",
  orsec: "nav_orsec", plans: "nav_plans", comms: "nav_comms", reports: "nav_reports", analytics: "nav_analytics", assistant: "nav_assistant", simulation: "nav_simulation", users: "nav_users", settings: "nav_settings", myresp: "nav_myresp", myrespManage: "nav_myresp_manage", supervision: "nav_supervision",
  res: "nav_res", dis: "nav_dis", cmd: "nav_cmd", chemlib: "nav_chemlib", trackers: "nav_trackers", opsnet: "nav_opsnet", morgue: "nav_morgue",
};

export function navLabel(key: NavKey | GroupKey, t: Dict): string {
  return t[LABEL_KEYS[key]];
}

/** Résout un chemin vers le libellé de l'écran courant (pour l'en-tête). */
export function screenTitle(pathname: string, t: Dict): string {
  if (pathname === "/profil" || pathname.startsWith("/profil/")) return t.pr_title;
  const key = keyForPath(pathname);
  return key ? navLabel(key, t) : t.nav_dash;
}
