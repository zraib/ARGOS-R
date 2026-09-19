import { CITIES_MA } from "@/modules/domain/cities.data";
import { PROVINCES_MA, REGIONS_MA } from "@/modules/domain/provinces.data";

// ============================================================================
// Référentiel géographique — ce qui doit rester vrai
//
// Les trois listes (régions, provinces, villes) se référencent par NOM. Une
// faute de frappe dans une seule entrée casserait la cascade région →
// province → ville sans qu'aucun type ne le voie : c'est ce test qui le voit.
// ============================================================================

describe("référentiel géographique — cohérence des trois niveaux", () => {
  const provinces = new Map(PROVINCES_MA.map((p) => [p.v, p]));

  it("compte les douze régions du découpage de 2015", () => {
    expect(REGIONS_MA).toHaveLength(12);
  });

  it("chaque province appartient à une région du référentiel", () => {
    for (const p of PROVINCES_MA) expect(REGIONS_MA).toContain(p.region);
  });

  it("chaque ville désigne une province EXISTANTE, orthographiée à l'identique", () => {
    const orphelines = CITIES_MA.filter((c) => !provinces.has(c.province)).map((c) => `${c.v} → ${c.province}`);
    expect(orphelines).toEqual([]);
  });

  it("la région d'une ville est celle de sa province — jamais une autre", () => {
    const incoherentes = CITIES_MA.filter((c) => provinces.get(c.province)?.region !== c.region).map((c) => c.v);
    expect(incoherentes).toEqual([]);
  });

  it("aucune commune en double dans sa province — les homonymes d'une province à l'autre existent (Oulad Aissa…)", () => {
    const cles = CITIES_MA.map((c) => `${c.province}\u0000${c.v}`);
    expect(new Set(cles).size).toBe(cles.length);
    // Le référentiel est COMPLET : toutes les provinces ont leurs communes, urbaines et rurales.
    expect(CITIES_MA.length).toBeGreaterThan(1400);
    expect(new Set(CITIES_MA.map((c) => c.province)).size).toBe(75);
    expect(CITIES_MA.filter((c) => c.kind === "rural").length).toBeGreaterThan(1000);
    for (const nom of ["Casablanca", "Talat N'Yaaqoub", "Zaouïat Cheikh", "Imlili", "Aït Ourir"]) expect(CITIES_MA.some((c) => c.v === nom)).toBe(true);
  });
});
