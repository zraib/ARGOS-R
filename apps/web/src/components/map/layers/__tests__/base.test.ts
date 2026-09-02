import { describe, expect, it, vi } from "vitest";
import type maplibregl from "maplibre-gl";
import { apply3d, applyBase } from "@/components/map/layers/base";

// ============================================================================
// Bascules du fond et du terrain — une demande faite pendant le chargement des
// tuiles n'est plus perdue : elle est rejouée au prochain repos de la carte.
// ============================================================================

/** Une carte factice : juste ce que les bascules touchent. */
function fausseCarte(styleLoaded: boolean) {
  const handlers: Record<string, (() => void)[]> = {};
  const carte = {
    isStyleLoaded: () => styleLoaded,
    once: (ev: string, cb: () => void) => {
      (handlers[ev] ??= []).push(cb);
    },
    setLayoutProperty: vi.fn(),
    getTerrain: () => null,
    setTerrain: vi.fn(),
    easeTo: vi.fn(),
  };
  const idle = () => {
    for (const cb of handlers.idle ?? []) cb();
    handlers.idle = [];
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

  it("style pas prêt : rien n'est perdu, la bascule est rejouée au repos", () => {
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

  it("sans carte, aucun appel", () => {
    expect(() => apply3d(null, true)).not.toThrow();
  });
});
