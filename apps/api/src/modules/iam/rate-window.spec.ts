import { RateWindow } from "@/modules/iam/rate-window";

// ============================================================================
// Borne de débit — ce qui compte est la FENÊTRE GLISSANTE : un passage sorti
// de la fenêtre rend sa place, un passage refusé ne consomme rien.
// ============================================================================

describe("RateWindow — fenêtre glissante", () => {
  it("laisse passer `limit` fois puis refuse, par clé", () => {
    const w = new RateWindow(2, 1_000);
    expect(w.allow("a", 0)).toBe(true);
    expect(w.allow("a", 10)).toBe(true);
    expect(w.allow("a", 20)).toBe(false);
    // Une autre clé a sa propre fenêtre.
    expect(w.allow("b", 20)).toBe(true);
  });

  it("rend la place quand le passage le plus ancien sort de la fenêtre", () => {
    const w = new RateWindow(1, 1_000);
    expect(w.allow("a", 0)).toBe(true);
    expect(w.allow("a", 999)).toBe(false);
    expect(w.allow("a", 1_000)).toBe(true);
  });

  it("un passage refusé ne prolonge pas le blocage", () => {
    const w = new RateWindow(1, 1_000);
    expect(w.allow("a", 0)).toBe(true);
    expect(w.allow("a", 500)).toBe(false);
    // Le refus à 500 ms n'a pas « rechargé » la fenêtre : à 1 000 ms, c'est libre.
    expect(w.allow("a", 1_000)).toBe(true);
  });
});
