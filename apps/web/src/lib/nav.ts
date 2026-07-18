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

export type NavKey =
  | "dashboard" | "incidents" | "map" | "dispatch" | "triage"
  | "equip" | "units" | "personnel" | "workorders"
  | "hospitals" | "ics" | "damage" | "shelters"
  | "orsec" | "plans" | "comms" | "reports" | "analytics" | "assistant"
  | "users" | "settings";

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
  users: "/utilisateurs",
  settings: "/parametres",
};

export const NAV: NavEntry[] = [
  item("dashboard", HREF.dashboard),
  item("incidents", HREF.incidents),
  item("map", HREF.map),
  item("dispatch", HREF.dispatch),
  item("triage", HREF.triage),
  {
    kind: "group",
    key: "res",
    icon: NAV_ICONS.res,
    children: [item("equip", HREF.equip), item("units", HREF.units), item("personnel", HREF.personnel), item("workorders", HREF.workorders)],
  },
  item("hospitals", HREF.hospitals),
  { kind: "group", key: "dis", icon: NAV_ICONS.dis, children: [item("ics", HREF.ics)] },
  item("damage", HREF.damage),
  item("shelters", HREF.shelters),
  { kind: "group", key: "cmd", icon: NAV_ICONS.cmd, children: [item("orsec", HREF.orsec)] },
  item("plans", HREF.plans),
  item("comms", HREF.comms),
  item("reports", HREF.reports),
  item("analytics", HREF.analytics),
  // Assistant IA — affiché uniquement si le feature flag est actif (§6.17 Couche 2).
  ...(AI_ENABLED ? [item("assistant", HREF.assistant)] : []),
  // Gestion des utilisateurs — Super Administrateur et Administrateur.
  { kind: "item", key: "users", href: HREF.users, icon: UI_ICONS.users, roles: ["superadmin", "admin"] },
  // Paramètres — réservé au Super Administrateur (filtré dans la Sidebar).
  { kind: "item", key: "settings", href: HREF.settings, icon: NAV_ICONS.settings, roles: ["superadmin"] },
];

/** Écrans encore rendus en « module en préparation » (aucun restant). */
export const STUB_KEYS: NavKey[] = [];

/**
 * Modules pilotables par feature flag (§6.15). Le tableau de bord et les
 * Paramètres restent toujours actifs. `assistant` suit le flag de build AI_ENABLED.
 */
export const FLAGGABLE_KEYS: NavKey[] = [
  "incidents", "map", "dispatch", "triage",
  "equip", "units", "personnel", "workorders",
  "hospitals", "ics", "damage", "shelters",
  "orsec", "plans", "comms", "reports", "analytics", "assistant",
];

export const DEFAULT_FLAGS: Record<string, boolean> = Object.fromEntries(
  FLAGGABLE_KEYS.map((k) => [k, k === "assistant" ? AI_ENABLED : true]),
);

/** Résout un chemin vers la clé de module courante (pour la garde de route). */
export function keyForPath(pathname: string): NavKey | null {
  const entry = (Object.entries(HREF) as [NavKey, string][]).find(([, href]) => pathname === href || pathname.startsWith(href + "/"));
  return entry ? entry[0] : null;
}

const LABEL_KEYS: Record<NavKey | GroupKey, keyof Dict> = {
  dashboard: "nav_dash", incidents: "nav_inc", map: "nav_map", dispatch: "nav_dispatch", triage: "nav_triage",
  equip: "nav_equip", units: "nav_units", personnel: "nav_pers", workorders: "nav_wo",
  hospitals: "nav_hosp", ics: "nav_ics", damage: "nav_damage", shelters: "nav_shelters",
  orsec: "nav_orsec", plans: "nav_plans", comms: "nav_comms", reports: "nav_reports", analytics: "nav_analytics", assistant: "nav_assistant", users: "nav_users", settings: "nav_settings",
  res: "nav_res", dis: "nav_dis", cmd: "nav_cmd",
};

export function navLabel(key: NavKey | GroupKey, t: Dict): string {
  return t[LABEL_KEYS[key]];
}

/** Résout un chemin vers le libellé de l'écran courant (pour l'en-tête). */
export function screenTitle(pathname: string, t: Dict): string {
  if (pathname === "/profil" || pathname.startsWith("/profil/")) return t.pr_title;
  const entry = (Object.entries(HREF) as [NavKey, string][]).find(([, href]) => pathname === href || pathname.startsWith(href + "/"));
  return entry ? navLabel(entry[0], t) : t.nav_dash;
}
