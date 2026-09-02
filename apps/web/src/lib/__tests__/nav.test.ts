import { describe, expect, it } from "vitest";
import { HREF, NAV, keyForPath, screenTitle, type NavEntry } from "@/lib/nav";
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

  it("les écrans gardés par `nrbc:view` / `tracking:view` sont masqués aux responsables d'entité", () => {
    // Ces cinq rôles n'ont pas la permission côté API : leur montrer l'entrée
    // serait un cul-de-sac (403 puis liste vide).
    const responsables = ["resp_hospital", "resp_unit", "resp_shelter", "resp_morgue", "resp_equipment"];
    for (const key of ["chemlib", "trackers"] as const) {
      const it = items(NAV).find((e) => e.key === key)!;
      expect(it.roles, key).toBeDefined();
      for (const r of responsables) expect(it.roles).not.toContain(r);
    }
  });

  it("les substances et les traceurs sont des entrées de PREMIER niveau", () => {
    const premierNiveau = NAV.filter((e) => e.kind === "item").map((e) => (e as { key: string }).key);
    expect(premierNiveau).toContain("chemlib");
    expect(premierNiveau).toContain("trackers");
    expect(premierNiveau).toContain("opsnet");
  });
});
