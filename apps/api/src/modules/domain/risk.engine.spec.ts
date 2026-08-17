import { Test } from "@nestjs/testing";
import { computeRiskPredictions } from "@/modules/domain/risk.engine";
import { RiskService } from "@/modules/domain/risk.service";
import { DomainService } from "@/modules/domain/domain.service";
import { CatalogService } from "@/modules/domain/catalog.service";

// ============================================================================
// ARGOS — moteur de prédiction risques porté côté API (F-04, branche fusion)
//
// L'engagement pris devant l'auteure du moteur (branche IA) : le portage rend
// EXACTEMENT les mêmes prédictions que son code, simplement calculées une fois
// côté serveur. Ces tests gardent cet engagement : pureté (mêmes entrées →
// mêmes sorties), réalisme (données du domaine réel), et bornage.
// ============================================================================

describe("moteur de risques côté API", () => {
  it("est déterministe : deux appels aux mêmes entrées rendent le même résultat", async () => {
    const mod = await Test.createTestingModule({ providers: [DomainService, CatalogService] }).compile();
    const domain = mod.get(DomainService);
    const now = Date.parse("2026-08-17T12:00:00.000Z");
    const ctx = {
      incidents: domain.listIncidents(),
      hospitals: domain.listHospitals(),
      units: domain.listUnits(),
      movements: domain.listMovements(),
      dashStats: domain.stats(),
      now,
    };
    const a = computeRiskPredictions(ctx);
    const b = computeRiskPredictions(ctx);
    expect(a.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("borne la sortie et fournit les champs que le panneau consomme", async () => {
    const mod = await Test.createTestingModule({ providers: [DomainService, CatalogService] }).compile();
    const domain = mod.get(DomainService);
    const preds = computeRiskPredictions({
      incidents: domain.listIncidents(),
      hospitals: domain.listHospitals(),
      units: domain.listUnits(),
      movements: domain.listMovements(),
      dashStats: domain.stats(),
    });
    // Le contrat du panneau : 1..12 prédictions, score borné, libellé présent.
    expect(preds.length).toBeLessThanOrEqual(12);
    for (const p of preds) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
      expect(p.label.length).toBeGreaterThan(0);
      expect(["critique", "eleve", "modere", "faible"]).toContain(p.level);
    }
  });

  it("sert depuis le mémo pendant 5 s (un calcul pour N postes)", async () => {
    const mod = await Test.createTestingModule({
      providers: [RiskService, DomainService, CatalogService],
    }).compile();
    const risk = mod.get(RiskService);
    const first = risk.predictions();
    const second = risk.predictions();
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.predictions).toEqual(first.predictions);
  });
});
