import { afterEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Origine du fond de carte (ADR 0006, ADR 0014) — la règle qui protège le
// profil d'activité : en production la sortie vers un fournisseur externe ne
// s'ouvre que sur demande EXPLICITE et figée à la construction ; le mode
// souverain sans serveur configuré donne une carte SANS fond, jamais un repli
// silencieux.
// ============================================================================

async function charger(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  return import("@/lib/map/tiles");
}

afterEach(() => vi.unstubAllEnvs());

describe("origine des tuiles", () => {
  it("en production, le défaut est souverain : sans demande explicite, rien ne sort", async () => {
    const m = await charger({ NODE_ENV: "production", NEXT_PUBLIC_MAP_TILES: "", NEXT_PUBLIC_TILES_URL: "" });
    expect(m.TILES_MODE).toBe("sovereign");
    expect(m.TILES_AVAILABLE).toBe(false);
  });

  it("en production, seule la valeur explicite `external` ouvre les fournisseurs (ADR 0014)", async () => {
    const m = await charger({ NODE_ENV: "production", NEXT_PUBLIC_MAP_TILES: "external", NEXT_PUBLIC_TILES_URL: "" });
    expect(m.TILES_MODE).toBe("external");
    expect(m.TILES_AVAILABLE).toBe(true);
    expect(m.demTileUrl(10, 500, 400)).toBe("https://s3.amazonaws.com/elevation-tiles-prod/terrarium/10/500/400.png");
  });

  it("souverain sans URL : pas de fond du tout (fermé), et ce n'est pas une erreur", async () => {
    const m = await charger({ NODE_ENV: "development", NEXT_PUBLIC_MAP_TILES: "sovereign", NEXT_PUBLIC_TILES_URL: "" });
    expect(m.TILES_MODE).toBe("sovereign");
    expect(m.TILES_AVAILABLE).toBe(false);
  });

  it("souverain avec un serveur configuré : fond disponible", async () => {
    const m = await charger({ NODE_ENV: "development", NEXT_PUBLIC_MAP_TILES: "sovereign", NEXT_PUBLIC_TILES_URL: "https://argos.example/tiles" });
    expect(m.TILES_AVAILABLE).toBe(true);
    expect(m.SOVEREIGN_TILES_URL).toBe("https://argos.example/tiles");
  });

  it("une valeur inconnue ferme : on ne devine jamais dans le sens de la fuite", async () => {
    const m = await charger({ NODE_ENV: "development", NEXT_PUBLIC_MAP_TILES: "self", NEXT_PUBLIC_TILES_URL: "" });
    expect(m.TILES_MODE).toBe("sovereign");
    expect(m.TILES_AVAILABLE).toBe(false);
  });

  it("en développement, l'externe est le défaut — et il se voit (bandeau)", async () => {
    const m = await charger({ NODE_ENV: "development", NEXT_PUBLIC_MAP_TILES: "", NEXT_PUBLIC_TILES_URL: "" });
    expect(m.TILES_MODE).toBe("external");
    expect(m.TILES_AVAILABLE).toBe(true);
  });
});
