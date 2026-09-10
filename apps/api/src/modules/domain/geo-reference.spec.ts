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

  it("aucun nom de ville en double", () => {
    const noms = CITIES_MA.map((c) => c.v);
    expect(new Set(noms).size).toBe(noms.length);
  });
});
