// ============================================================================
// ARGOS — une simulation de feu de forêt qui court : heures d'arrivée, puis images
//
// Deux temps : le calcul des heures d'arrivée (Dijkstra, par tranches, la main
// rendue entre deux), puis les instantanés sur l'horizon — l'état de chaque
// cellule à cet instant : intacte, en flammes (depuis peu ou depuis
// longtemps), braises. Chaque image note aussi les hôpitaux, unités, abris et
// villes que le front vient d'atteindre. Tout reste sur le poste.
// ============================================================================

import { gridPixel, type DemGrid } from "@/lib/flood/grid";
import { FUEL_RESIDENCE_MIN, FireSpread, type FireParams } from "@/lib/fire/spread";
import { now, poiCells, souffle, type SpreadFrame, type SpreadImpact, type SpreadPoi, type SpreadRun } from "@/lib/sim/spread";

/** Valeur d'une cellule en braises (les flammes sont passées). */
export const FIRE_BURNT = 255;
/** Les flammes : 1 (vient de s'allumer) à `FIRE_FLAME_MAX` (fin de résidence). */
export const FIRE_FLAME_MAX = 200;

export interface FireFrame extends SpreadFrame {
  /** Surface en flammes à cet instant (km²) — `area` compte flammes et braises. */
  burningKm2: number;
}

/** L'état d'une cellule à l'instant `tMin` : 0 intacte, 1..200 en flammes selon leur âge, 255 braises. */
export function fireState(arrivalMin: number, tMin: number, residenceMin: number): number {
  const age = tMin - arrivalMin;
  if (age < 0) return 0;
  if (age >= residenceMin) return FIRE_BURNT;
  return 1 + Math.min(FIRE_FLAME_MAX - 1, Math.floor((age / residenceMin) * (FIRE_FLAME_MAX - 1)));
}

export interface FireRunInit {
  grid: DemGrid;
  cellMeters: number;
  seedPx: number;
  seedPy: number;
  params: FireParams;
  horizonS: number;
  frameEveryS: number;
  pois: readonly SpreadPoi[];
}

/** Une simulation de feu en cours ou finie : ses images, ses impacts, son état. Mutable, partagée par référence. */
export class FireRun implements SpreadRun<FireFrame> {
  readonly grid: DemGrid;
  readonly spread: FireSpread;
  readonly frames: FireFrame[] = [];
  readonly impacts: SpreadImpact[] = [];
  readonly nFrames: number;
  readonly horizonS: number;
  readonly frameEveryS: number;
  readonly residenceMin: number;
  readonly controller = new AbortController();
  done = false;
  aborted = false;
  private readonly pois: { poi: SpreadPoi; i: number }[];
  private readonly reached = new Set<string>();

  constructor(init: FireRunInit) {
    this.grid = init.grid;
    this.horizonS = init.horizonS;
    this.frameEveryS = init.frameEveryS;
    this.nFrames = Math.floor(init.horizonS / init.frameEveryS + 1e-6) + 1;
    this.residenceMin = FUEL_RESIDENCE_MIN[init.params.fuel];
    this.spread = new FireSpread(init.grid, init.cellMeters, init.seedPx, init.seedPy, init.params, init.horizonS / 60);
    this.pois = poiCells(init.grid, init.pois, gridPixel);
    this.frames.push({ t: 0, x0: 0, y0: 0, w: 0, h: 0, data: new Uint8Array(0), area: 0, burningKm2: 0 });
  }

  get head(): number {
    return this.frames.length - 1;
  }

  /** Le front a-t-il touché un bord de la grille ? L'emprise est alors tronquée. */
  get truncated(): boolean {
    return this.spread.truncated;
  }

  /** L'instantané de l'instant `t` (s) sur la boîte finale, et les points que le front vient d'atteindre. */
  capture(t: number, box: { x0: number; y0: number; x1: number; y1: number }): void {
    const { arrival, dx } = this.spread;
    const tMin = t / 60;
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    const data = new Uint8Array(w * h);
    let touchees = 0;
    let flammes = 0;
    for (let y = 0; y < h; y++) {
      const ligne = (box.y0 + y) * this.grid.width + box.x0;
      for (let x = 0; x < w; x++) {
        const s = fireState(arrival[ligne + x], tMin, this.residenceMin);
        if (s === 0) continue;
        data[y * w + x] = s;
        touchees++;
        if (s !== FIRE_BURNT) flammes++;
      }
    }
    const km2 = (dx * dx) / 1e6;
    this.frames.push({ t, x0: box.x0, y0: box.y0, w, h, data, area: touchees * km2, burningKm2: flammes * km2 });
    for (const { poi, i } of this.pois) {
      if (this.reached.has(poi.id) || arrival[i] > tMin) continue;
      this.reached.add(poi.id);
      this.impacts.push({ ...poi, reachedAt: Math.round(arrival[i] * 60), value: 1 });
    }
  }

  abort(): void {
    this.controller.abort();
  }
}

/**
 * Fait courir la simulation : les heures d'arrivée par tranches de `budgetMs`,
 * puis une image par échéance. `onFrame` est appelé quand de nouvelles images
 * sont là, et une dernière fois à la fin — ou à l'arrêt demandé.
 */
export async function driveFireRun(run: FireRun, onFrame: (run: FireRun) => void, budgetMs = 12): Promise<void> {
  const { spread, controller } = run;
  while (!spread.done && !controller.signal.aborted) {
    const t0 = now();
    while (now() - t0 < budgetMs && !spread.run(400)) {
      /* la tranche continue */
    }
    await souffle();
  }
  if (!controller.signal.aborted) {
    const box = spread.box() ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
    let t0 = now();
    for (let k = 1; k < run.nFrames && !controller.signal.aborted; k++) {
      run.capture(k * run.frameEveryS, box);
      if (now() - t0 >= budgetMs) {
        onFrame(run);
        await souffle();
        t0 = now();
      }
    }
  }
  run.aborted = controller.signal.aborted;
  run.done = !run.aborted;
  onFrame(run);
}
