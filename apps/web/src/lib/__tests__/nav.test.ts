import { describe, expect, it } from "vitest";
import { HREF, MODULE_KEYS, NAV, NAV_MODULE, keyForPath, moduleOpen, screenTitle, type NavEntry, type NavKey } from "@/lib/nav";
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

  it("chaque écran connaît son module, et chaque module est un écran", () => {
    for (const key of Object.keys(HREF) as NavKey[]) expect(key in NAV_MODULE, key).toBe(true);
    for (const m of MODULE_KEYS) expect(HREF[m], m).toBeDefined();
  });

  it("moduleOpen : le cœur reste ouvert, un module coupé (drapeau ou rôle) ferme son écran", () => {
    expect(moduleOpen("dashboard", { incidents: false }, { incidents: false })).toBe(true);
    expect(moduleOpen("settings", {}, undefined)).toBe(true);
    expect(moduleOpen("hospitals", {}, undefined)).toBe(true);
    expect(moduleOpen("hospitals", { hospitals: false }, undefined)).toBe(false);
    expect(moduleOpen("hospitals", {}, { hospitals: false })).toBe(false);
    // Le réseau opérationnel suit le module des unités.
    expect(moduleOpen("opsnet", { units: false }, undefined)).toBe(false);
    expect(moduleOpen("morgue", {}, { morgue: false })).toBe(false);
  });

  it("les substances et les traceurs sont des entrées de PREMIER niveau", () => {
    const premierNiveau = NAV.filter((e) => e.kind === "item").map((e) => (e as { key: string }).key);
    expect(premierNiveau).toContain("chemlib");
    expect(premierNiveau).toContain("trackers");
    expect(premierNiveau).toContain("opsnet");
  });
});
