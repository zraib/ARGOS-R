import { Injectable } from "@nestjs/common";
import { DomainService } from "@/modules/domain/domain.service";
import { computeRiskPredictions } from "@/modules/domain/risk.engine";
import type { RiskPrediction } from "@/modules/domain/risk.types";

// ============================================================================
// ARGOS — service de prédiction risques (F-04, branche fusion)
//
// Le moteur déterministe tournait dans CHAQUE navigateur, à chaque affichage du
// tableau de bord — N calculs identiques pour N opérateurs, sur le thread
// principal. Ici il tourne UNE fois, sur les données faisant foi de l'API, et
// tous les postes reçoivent le même résultat (cohérence de commandement en
// prime : plus de prédictions divergentes entre deux écrans).
// ============================================================================

/** Mémo court : le temps que N postes se synchronisent, un seul calcul. */
const MEMO_TTL_MS = 5_000;

/** Enveloppe de réponse : les métriques rendent le gain VISIBLE (démo F-04). */
export interface RiskEnvelope {
  /** Horodatage du calcul (ISO 8601). */
  computedAt: string;
  /** Durée du calcul serveur, en millisecondes. */
  computeMs: number;
  /** true si la réponse vient du mémo (aucun recalcul). */
  cached: boolean;
  predictions: RiskPrediction[];
}

@Injectable()
export class RiskService {
  private memo: { at: number; env: RiskEnvelope } | null = null;

  constructor(private readonly domain: DomainService) {}

  predictions(): RiskEnvelope {
    const hit = this.memo && Date.now() - this.memo.at < MEMO_TTL_MS;
    if (hit) return { ...this.memo!.env, cached: true };

    const t0 = process.hrtime.bigint();
    const predictions = computeRiskPredictions({
      incidents: this.domain.listIncidents(),
      hospitals: this.domain.listHospitals(),
      units: this.domain.listUnits(),
      movements: this.domain.listMovements(),
      dashStats: this.domain.stats(),
    });
    const computeMs = Number(process.hrtime.bigint() - t0) / 1e6;

    const env: RiskEnvelope = {
      computedAt: new Date().toISOString(),
      computeMs: Math.round(computeMs * 100) / 100,
      cached: false,
      predictions,
    };
    this.memo = { at: Date.now(), env };
    return env;
  }
}
