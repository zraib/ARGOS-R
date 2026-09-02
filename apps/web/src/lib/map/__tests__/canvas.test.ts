import { describe, expect, it } from "vitest";
import { WX_LUT, WX_LUT_N, WX_T_MAX, WX_T_MIN, natIdw, wxDays, wxMercY } from "@/lib/map/canvas/weather-raster";
import { WXG_COLS, WXG_DLON, WXG_LON0, WXG_ROWS } from "@/lib/map/canvas/weather-grid";
import { esc, qMagHex } from "@/lib/map/canvas/quakes";
import { interpolatePlume } from "@/lib/map/canvas/plume";

// ============================================================================
// Aides pures de la carte (extraites de MapCanvas.tsx)
//
// Ces fonctions dessinaient jusqu'ici DANS le composant, hors de portée de tout
// test. Les sortir a permis de les tester : ce fichier fixe leurs invariants
// pour que la prochaine retouche du rendu météo ou sismique ne les casse pas
// en silence.
// ============================================================================

describe("carte météo raster", () => {
  it("la table de couleurs couvre exactement WX_LUT_N entrées RVB", () => {
    expect(WX_LUT.length).toBe(WX_LUT_N * 3);
    expect(WX_T_MIN).toBeLessThan(WX_T_MAX);
  });

  it("la projection Mercator est nulle à l'équateur et croît vers le nord", () => {
    expect(wxMercY(0)).toBeCloseTo(0, 12);
    expect(wxMercY(30)).toBeGreaterThan(wxMercY(10));
    expect(wxMercY(-30)).toBeCloseTo(-wxMercY(30), 12);
  });

  it("l'IDW rend la valeur d'un échantillon quand on l'interroge dessus", () => {
    const pts = [
      { lat: 33.5, lon: -7.6 },
      { lat: 34.0, lon: -6.8 },
    ];
    const vals = new Float32Array([20, 30]);
    expect(natIdw(pts, vals, -7.6, 33.5)).toBeCloseTo(20, 3);
    // Entre les deux, la valeur reste entre les deux : pas d'extrapolation.
    const milieu = natIdw(pts, vals, -7.2, 33.75);
    expect(milieu).toBeGreaterThan(20);
    expect(milieu).toBeLessThan(30);
  });

  it("wxDays regroupe les échéances horaires par jour, dans l'ordre", () => {
    const times = ["2026-09-02T00:00", "2026-09-02T03:00", "2026-09-03T00:00"];
    const jours = wxDays(times, "fr");
    expect(jours.map((j) => j.date)).toEqual(["2026-09-02", "2026-09-03"]);
    expect(jours[0].idx).toBe(0);
    expect(jours[1].idx).toBe(2);
    expect(jours[0].label).not.toBe("");
  });
});

describe("grille mondiale régulière", () => {
  it("36 colonnes de 10° couvrent le tour du globe depuis -180°", () => {
    expect(WXG_COLS * WXG_DLON).toBe(360);
    expect(WXG_LON0).toBe(-180);
    expect(WXG_ROWS).toBeGreaterThan(0);
  });
});

describe("séismes", () => {
  it("échappe le texte externe avant injection dans une popup", () => {
    expect(esc(`<b>"EMSC" & co</b>`)).not.toMatch(/[<>"]/);
    expect(esc("sain")).toBe("sain");
  });

  it("la couleur du bandeau est une paire hex lisible, plus sombre quand ça secoue", () => {
    for (const m of [2, 4, 5.5, 7]) {
      const c = qMagHex(m);
      expect(c.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.fg).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(qMagHex(2).bg).not.toBe(qMagHex(7).bg);
  });
});

describe("panache NRBC", () => {
  it("sans échéance de départ, il n'y a rien à interpoler", () => {
    expect(interpolatePlume([], 0)).toBeNull();
    expect(interpolatePlume([null, null], 1)).toBeNull();
  });
});
