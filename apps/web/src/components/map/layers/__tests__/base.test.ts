import { describe, expect, it, vi } from "vitest";
import type maplibregl from "maplibre-gl";
import { apply3d, applyBase } from "@/components/map/layers/base";

// ============================================================================
// Bascules du fond et du terrain — elles ne dépendent que du style, pas des
// tuiles ; une demande faite avant l'analyse du style est rejouée, jamais perdue.
// ============================================================================

/**
 * Une carte factice : juste ce que les bascules touchent. Ses couches : les
 * raster `sat`/`plan`/`lbl` (mode souverain) et deux couches du fond
 * vectoriel, une du groupe `plan`, une du groupe `labels` (mode externe).
 */
const COUCHES = [
  { id: "sat", type: "raster" },
  { id: "plan", type: "raster" },
  { id: "lbl", type: "raster" },
  { id: "landuse", type: "fill", metadata: { "argos:group": "plan" } },
  { id: "boundary_2", type: "line", metadata: { "argos:group": "labels" } },
  { id: "routes-line", type: "line" },
];
function fausseCarte(stylePret: boolean, couches = COUCHES) {
  const handlers: Record<string, (() => void)[]> = {};
  const carte = {
    getStyle: () => (stylePret ? { version: 8, layers: couches } : undefined),
    getLayer: (id: string) => couches.find((l) => l.id === id),
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
  it("style prêt : la bascule s'applique tout de suite — le fond vectoriel installé, le plan raster de la station reste éteint (pas de doublon)", () => {
    const { carte, setLayoutProperty } = fausseCarte(true);
    applyBase(carte, false);
    expect(setLayoutProperty).toHaveBeenCalledWith("sat", "visibility", "none");
    expect(setLayoutProperty).toHaveBeenCalledWith("landuse", "visibility", "visible");
    expect(setLayoutProperty).toHaveBeenCalledWith("plan", "visibility", "none");
    expect(setLayoutProperty).toHaveBeenCalledWith("lbl", "visibility", "none");
  });

  it("sans fond vectoriel (station sans style ni polices) : le plan et les repères raster de la station prennent le relais", () => {
    const raster = COUCHES.filter((l) => !("metadata" in l));
    const plan = fausseCarte(true, raster);
    applyBase(plan.carte, false);
    expect(plan.setLayoutProperty).toHaveBeenCalledWith("plan", "visibility", "visible");
    expect(plan.setLayoutProperty).toHaveBeenCalledWith("lbl", "visibility", "none");
    const sat = fausseCarte(true, raster);
    applyBase(sat.carte, true);
    expect(sat.setLayoutProperty).toHaveBeenCalledWith("plan", "visibility", "none");
    expect(sat.setLayoutProperty).toHaveBeenCalledWith("lbl", "visibility", "visible");
  });

  it("fond vectoriel : le plan suit le mode, les repères restent dans les deux, le reste n'est pas touché", () => {
    const { carte, setLayoutProperty } = fausseCarte(true);
    applyBase(carte, true);
    expect(setLayoutProperty).toHaveBeenCalledWith("landuse", "visibility", "none");
    expect(setLayoutProperty).toHaveBeenCalledWith("boundary_2", "visibility", "visible");
    expect(setLayoutProperty.mock.calls.some((c) => c[0] === "routes-line")).toBe(false);
    setLayoutProperty.mockClear();
    applyBase(carte, false);
    expect(setLayoutProperty).toHaveBeenCalledWith("landuse", "visibility", "visible");
    expect(setLayoutProperty).toHaveBeenCalledWith("boundary_2", "visibility", "visible");
  });

  it("une couche absente du style n'est pas touchée (mode externe sans raster plan/lbl)", () => {
    const { carte, setLayoutProperty } = fausseCarte(true);
    (carte as unknown as { getLayer: (id: string) => unknown }).getLayer = (id: string) => (id === "sat" ? { id } : undefined);
    applyBase(carte, true);
    expect(setLayoutProperty).toHaveBeenCalledWith("sat", "visibility", "visible");
    expect(setLayoutProperty.mock.calls.some((c) => c[0] === "plan" || c[0] === "lbl")).toBe(false);
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
