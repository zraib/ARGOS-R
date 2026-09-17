import { describe, expect, it } from "vitest";
import { CAPABILITY_MODULES, CORE_MODULES, FLAGGABLE_KEYS, HREF, MODULE_KEYS, NAV, NAV_MODULE, firstOpenHref, isCapabilityModule, keyForPath, moduleKeyOpen, moduleLabel, moduleOpen, navLabel, screenTitle, type NavEntry, type NavKey } from "@/lib/nav";
import { ROLES } from "@/lib/roles";
import { FR_DICT } from "@/lib/i18n/translations.fr";

// ============================================================================
// Navigation — les règles qui décident QUI voit QUOI dans le menu.
// Le masquage n'est pas une sécurité (l'API refuse), mais un menu qui montre
// un cul-de-sac à un rôle est un défaut d'ergonomie qu'un test attrape.
// ============================================================================

const items = (entries: NavEntry[]): Extract<NavEntry, { kind: "item" }>[] =>
  entries.flatMap((e) => (e.kind === "item" ? [e] : e.children));

describe("navigation", () => {
  it("chaque chemin est unique", () => {
    const hrefs = Object.values(HREF);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keyForPath retrouve la clé d'un chemin et de ses sous-chemins", () => {
    expect(keyForPath("/substances")).toBe("chemlib");
    expect(keyForPath("/traceurs")).toBe("trackers");
    expect(keyForPath("/opsnet")).toBe("opsnet");
    expect(keyForPath("/ma-responsabilite/gestion")).toBe("myrespManage");
    expect(keyForPath("/inconnu")).toBeNull();
  });

  it("screenTitle retombe sur le tableau de bord pour un chemin inconnu", () => {
    expect(screenTitle("/nulle-part", FR_DICT)).toBe(FR_DICT.nav_dash);
    expect(screenTitle("/opsnet", FR_DICT)).toBe(FR_DICT.nav_opsnet);
  });

  it("les restrictions de rôle ne citent que des rôles existants", () => {
    for (const it of items(NAV)) for (const r of it.roles ?? []) expect(ROLES).toContain(r);
  });

  it("l'écran gardé par `nrbc:view` est masqué aux responsables d'entité ; les traceurs sont ouverts à tous", () => {
    // Les cinq responsables n'ont pas `nrbc:view` côté API : leur montrer
    // l'entrée serait un cul-de-sac (403 puis liste vide). Ils ont en revanche
    // `tracking:view` depuis l'ADR 0015 — l'entrée n'est plus restreinte.
    const responsables = ["resp_hospital", "resp_unit", "resp_shelter", "resp_morgue", "resp_equipment"];
    const chem = items(NAV).find((e) => e.key === "chemlib")!;
    expect(chem.roles).toBeDefined();
    for (const r of responsables) expect(chem.roles).not.toContain(r);
    expect(items(NAV).find((e) => e.key === "trackers")!.roles).toBeUndefined();
  });

  it("chaque écran connaît son module, et chaque module est un écran ou une capacité de la carte", () => {
    for (const key of Object.keys(HREF) as NavKey[]) expect(key in NAV_MODULE, key).toBe(true);
    for (const m of MODULE_KEYS) expect(isCapabilityModule(m) || m in HREF, m).toBe(true);
    for (const c of CAPABILITY_MODULES) expect(moduleLabel(c, FR_DICT)).not.toBe("");
    expect(moduleLabel("mapEdit", FR_DICT)).toBe(FR_DICT.mod_map_edit);
    expect(moduleLabel("myrespManage", FR_DICT, "resp_unit")).toBe(FR_DICT.nav_manage_unit);
  });

  it("tout le menu figure dans la matrice rôle → modules, dans l'ordre du menu (ADR 0017)", () => {
    // Chaque entrée de la barre latérale a son module — plus aucun écran qui
    // suit celui d'un autre ni qui échappe à la matrice.
    for (const it of items(NAV)) expect(NAV_MODULE[it.key], it.key).toBe(it.key);
    // L'assistant n'est pas une entrée du menu (tiroir ouvert depuis l'en-tête)
    // mais reste un module ; le menu, lui, est repris tel quel, dans son ordre.
    const menu = items(NAV).map((it) => it.key);
    expect(MODULE_KEYS.filter((k) => (menu as string[]).includes(k))).toEqual(menu);
    // Le cœur n'est pas proposé aux drapeaux globaux : on ne s'enferme pas dehors.
    for (const c of CORE_MODULES) expect(FLAGGABLE_KEYS).not.toContain(c);
    expect(FLAGGABLE_KEYS).toContain("dashboard");
  });

  it("moduleOpen : le cœur reste ouvert, un module coupé (drapeau, rôle ou compte) ferme son écran", () => {
    expect(moduleOpen("settings", { settings: false }, { settings: false }, { settings: false })).toBe(true);
    expect(moduleOpen("users", {}, undefined)).toBe(true);
    expect(moduleOpen("hospitals", {}, undefined)).toBe(true);
    expect(moduleOpen("hospitals", { hospitals: false }, undefined)).toBe(false);
    expect(moduleOpen("hospitals", {}, { hospitals: false })).toBe(false);
    // Le tableau de bord, « ma responsabilité », sa gestion et l'OPSnet se coupent désormais par eux-mêmes.
    expect(moduleOpen("dashboard", {}, { dashboard: false })).toBe(false);
    expect(moduleOpen("myrespManage", {}, undefined, { myrespManage: false })).toBe(false);
    expect(moduleOpen("opsnet", { units: false }, undefined)).toBe(true);
    expect(moduleOpen("opsnet", { opsnet: false }, undefined)).toBe(false);
    expect(moduleOpen("morgue", {}, { morgue: false })).toBe(false);
    // Les capacités de la carte se coupent comme les écrans.
    expect(moduleKeyOpen("simFlood", {}, { simFlood: false })).toBe(false);
    expect(moduleKeyOpen("mapEdit", {}, undefined, { mapEdit: false })).toBe(false);
    expect(moduleKeyOpen("simNrbc", {}, undefined)).toBe(true);
  });

  it("firstOpenHref : l'accueil de repli est le premier écran ouvert du menu pour le rôle", () => {
    expect(firstOpenHref("wali", {}, { dashboard: false })).toBe(HREF.incidents);
    expect(firstOpenHref("resp_unit", {}, { dashboard: false, myresp: false })).toBe(HREF.myrespManage);
    expect(firstOpenHref("wali", {}, undefined)).toBe(HREF.dashboard);
  });

  it("« Gestion de mon entité » se nomme par l'entité du rôle", () => {
    expect(navLabel("myrespManage", FR_DICT)).toBe(FR_DICT.nav_myresp_manage);
    expect(navLabel("myrespManage", FR_DICT, "resp_unit")).toBe(FR_DICT.nav_manage_unit);
    expect(navLabel("myrespManage", FR_DICT, "resp_hospital")).toBe(FR_DICT.nav_manage_hospital);
    expect(navLabel("myrespManage", FR_DICT, "wali")).toBe(FR_DICT.nav_myresp_manage);
    expect(screenTitle("/ma-responsabilite/gestion", FR_DICT, "resp_unit")).toBe(FR_DICT.nav_manage_unit);
  });

  it("les substances et les traceurs sont des entrées de PREMIER niveau", () => {
    const premierNiveau = NAV.filter((e) => e.kind === "item").map((e) => (e as { key: string }).key);
    expect(premierNiveau).toContain("chemlib");
    expect(premierNiveau).toContain("trackers");
    expect(premierNiveau).toContain("opsnet");
  });
});
