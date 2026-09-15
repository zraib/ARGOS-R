// ============================================================================
// ARGOS — une simulation d'inondation qui court : images au fil de l'eau
//
// Le calcul dure des secondes ; l'écran ne doit ni geler ni attendre la fin.
// `driveFloodRun` avance la simulation par tranches de quelques millisecondes
// et rend la main entre deux — la carte respire, le panneau se met à jour —,
// dépose un instantané à chaque échéance et note quand l'eau atteint chaque
// point d'intérêt (hôpital, unité, abri, ville). Tout reste sur le poste.
// ============================================================================

import { gridPixel, type DemGrid } from "@/lib/flood/grid";
import { FloodSimulation, type Hydrograph, type HydroParams } from "@/lib/flood/hydro";
import { snapshotFrame, type FloodFrame } from "@/lib/flood/frames";
import { now, poiCells, souffle, type SpreadImpact, type SpreadPoi, type SpreadRun } from "@/lib/sim/spread";

export type FloodPoi = SpreadPoi;
/** Un point d'intérêt que l'eau a atteint : quand (s simulées) et sous quelle lame (m, `value`) alors. */
export type FloodImpact = SpreadImpact;

/** Lame (m) à partir de laquelle un point d'intérêt est dit atteint. */
export const REACH_DEPTH = 0.1;

export interface FloodRunInit {
  grid: DemGrid;
  cellMeters: number;
  seedPx: number;
  seedPy: number;
  hydrograph: Hydrograph;
  /** Horizon simulé (s) et espacement des instantanés (s). */
  horizonS: number;
  frameEveryS: number;
  pois: readonly SpreadPoi[];
  params?: HydroParams;
}

/** Une simulation en cours ou finie : ses images, ses impacts, son état. Mutable, partagée par référence. */
export class FloodRun implements SpreadRun<FloodFrame> {
  readonly grid: DemGrid;
  readonly sim: FloodSimulation;
  readonly frames: FloodFrame[] = [];
  readonly impacts: FloodImpact[] = [];
  /** Nombre d'images une fois le calcul fini (instant 0 compris). */
  readonly nFrames: number;
  readonly horizonS: number;
  readonly frameEveryS: number;
  readonly controller = new AbortController();
  done = false;
  aborted = false;
  private readonly pois: { poi: SpreadPoi; i: number }[];
  private readonly reached = new Set<string>();

  constructor(init: FloodRunInit) {
    this.grid = init.grid;
    this.sim = new FloodSimulation(init.grid, init.cellMeters, init.seedPx, init.seedPy, init.hydrograph, init.params);
    this.horizonS = init.horizonS;
    this.frameEveryS = init.frameEveryS;
    this.nFrames = Math.floor(init.horizonS / init.frameEveryS + 1e-6) + 1;
    this.pois = poiCells(init.grid, init.pois, gridPixel);
    this.frames.push(snapshotFrame(this.sim, 0));
  }

  /** Indice de la dernière image calculée. */
  get head(): number {
    return this.frames.length - 1;
  }

  /** Dépose l'instantané de l'instant `t` et relève les points que l'eau vient d'atteindre. */
  capture(t: number): void {
    this.frames.push(snapshotFrame(this.sim, t));
    for (const { poi, i } of this.pois) {
      if (this.reached.has(poi.id)) continue;
      const d = this.sim.h[i];
      if (d < REACH_DEPTH) continue;
      this.reached.add(poi.id);
      this.impacts.push({ ...poi, reachedAt: t, value: d });
    }
  }

  abort(): void {
    this.controller.abort();
  }
}

/**
 * Fait courir la simulation jusqu'à son horizon par tranches de `budgetMs`,
 * en rendant la main entre deux. `onFrame` est appelé quand de nouvelles
 * images sont là, et une dernière fois à la fin — ou à l'arrêt demandé.
 */
export async function driveFloodRun(run: FloodRun, onFrame: (run: FloodRun) => void, budgetMs = 12): Promise<void> {
  const { sim, controller } = run;
  let prochaine = run.frameEveryS;
  while (sim.t < run.horizonS && !controller.signal.aborted) {
    const t0 = now();
    let nouvelles = false;
    while (now() - t0 < budgetMs && sim.t < run.horizonS) {
      sim.step();
      while (sim.t >= prochaine - 1e-6 && run.frames.length < run.nFrames) {
        run.capture(prochaine);
        prochaine += run.frameEveryS;
        nouvelles = true;
      }
    }
    if (nouvelles) onFrame(run);
    await souffle();
  }
  run.aborted = controller.signal.aborted;
  run.done = !run.aborted;
  onFrame(run);
}
