import { describe, expect, it, vi } from "vitest";
import type maplibregl from "maplibre-gl";
import { apply3d, applyBase } from "@/components/map/layers/base";

// ============================================================================
// Bascules du fond et du terrain — elles ne dépendent que du style, pas des
// tuiles ; une demande faite avant l'analyse du style est rejouée, jamais perdue.
// ============================================================================

/** Une carte factice : juste ce que les bascules touchent. */
function fausseCarte(stylePret: boolean) {
  const handlers: Record<string, (() => void)[]> = {};
  const carte = {
    getStyle: () => (stylePret ? { version: 8 } : undefined),
    once: (ev: string, cb: () => void) => {
      (handlers[ev] ??= []).push(cb);
    },
    setLayoutProperty: vi.fn(),
    getTerrain: () => null,
    getPitch: () => 0,
    getSource: (id: string) => (id === "dem" ? {} : undefined),
    setTerrain: vi.fn(),
    easeTo: vi.fn(),
  };
  const idle = () => {
    for (const cb of handlers.styledata ?? []) cb();
    handlers.styledata = [];
  };
  return { carte: carte as unknown as maplibregl.Map, idle, setLayoutProperty: carte.setLayoutProperty, setTerrain: carte.setTerrain };
}

describe("bascules pendant le chargement", () => {
  it("style prêt : la bascule s'applique tout de suite", () => {
    const { carte, setLayoutProperty } = fausseCarte(true);
    applyBase(carte, false);
    expect(setLayoutProperty).toHaveBeenCalledWith("plan", "visibility", "visible");
    expect(setLayoutProperty).toHaveBeenCalledWith("sat", "visibility", "none");
  });

  it("style pas encore analysé : rien n'est perdu, la bascule est rejouée à styledata", () => {
    const { carte, idle, setLayoutProperty, setTerrain } = fausseCarte(false);
    applyBase(carte, true);
    apply3d(carte, true);
    expect(setLayoutProperty).not.toHaveBeenCalled();
    expect(setTerrain).not.toHaveBeenCalled();
    idle();
    expect(setLayoutProperty).toHaveBeenCalledWith("sat", "visibility", "visible");
    expect(setTerrain).toHaveBeenCalledWith({ source: "dem", exaggeration: 1.4 });
  });

  it("deux demandes contradictoires : la dernière gagne", () => {
    const { carte, idle, setLayoutProperty } = fausseCarte(false);
    applyBase(carte, true);
    applyBase(carte, false);
    idle();
    const derniers = setLayoutProperty.mock.calls.filter((c) => c[0] === "sat").map((c) => c[2]);
    expect(derniers[derniers.length - 1]).toBe("none");
  });

  it("idempotente : à plat sans relief, revenir en 2D ne touche à rien (pas de mise à jour de style en boucle)", () => {
    const { carte, setTerrain } = fausseCarte(true);
    const easeTo = (carte as unknown as { easeTo: ReturnType<typeof vi.fn> }).easeTo;
    apply3d(carte, false);
    expect(setTerrain).not.toHaveBeenCalled();
    expect(easeTo).not.toHaveBeenCalled();
  });

  it("sans carte, aucun appel", () => {
    expect(() => apply3d(null, true)).not.toThrow();
  });
});
