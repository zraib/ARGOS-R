// ============================================================================
// ARGOS — propagation d'un feu de forêt sur le relief (simulateur)
//
// Ce que ce module calcule : l'HEURE D'ARRIVÉE du front de flammes en chaque
// cellule de la grille d'altitude, depuis un point de départ, par la méthode
// du temps minimal de parcours (Finney 2002, FlamMap) : de chaque cellule
// atteinte, le feu gagne ses huit voisines à une vitesse qui dépend de la
// direction. La vitesse vient du modèle de Rothermel (1972) sur les modèles de
// combustible d'Anderson (1982) — `lib/fire/rothermel.ts` — avec l'humidité
// du combustible déduite de la température et de l'humidité de l'air (Simard
// 1968), le vent à 10 m ramené à mi-flamme (facteur d'ajustement par modèle,
// Andrews 2012). En chaque cellule, le vent et la pente locale (lue sur le
// relief) se combinent en un VENT EFFECTIF unique (Finney 1998, Andrews 2018) :
// il donne la vitesse de tête et l'allongement de l'ellipse (Anderson 1983),
// et l'ellipse donne la vitesse dans chaque direction (Richards 1990).
//
// Ce que ce module NE fait PAS : ni sautes de feu (brandons), ni feu de cime
// (la longueur de flamme dit quand il devient probable), ni carte de
// combustible (l'opérateur choisit la végétation dominante), ni humidité
// mesurée sur le terrain, ni action des secours. Un cadrage aux normes du
// domaine — où le feu va, en combien de temps, avec quelles flammes — pour
// dimensionner une évacuation et des coupures, pas une prévision. Pur.
// ============================================================================

import type { DemGrid } from "@/lib/flood/grid";
import type { PixelBox } from "@/lib/sim/spread";
import { equivalentWind, fuelModel, lengthToBreadthFromWind, midflameWind, moistureScenario, rothermel, slopePhi, type FuelModel, type RothermelResult } from "@/lib/fire/rothermel";

/** La végétation dominante, telle qu'on la nomme au Maroc, rapportée à un modèle d'Anderson. */
export type FuelKind = "grass" | "tallgrass" | "shrub" | "chaparral" | "dormant" | "conifer" | "broadleaf" | "litter" | "slash" | "sparse";
export const FUEL_KINDS: readonly FuelKind[] = ["grass", "tallgrass", "shrub", "chaparral", "dormant", "conifer", "broadleaf", "litter", "slash", "sparse"];

/**
 * Le modèle de combustible de chaque végétation : herbe rase et steppe (FM1),
 * herbe haute et céréales sur pied (FM3), matorral bas — thym, doum, lentisque
 * clairsemé (FM5), maquis dense et arganeraie embroussaillée (FM4),
 * broussaille sèche et rémanents feuillus (FM6), pinède et cédraie avec
 * sous-bois (FM10), chênaie et subéraie — litière de feuillus (FM9), litière
 * fermée de résineux sans sous-bois (FM8), rémanents de coupe (FM11), sol nu
 * ou très clairsemé (FM1 avec charge réduite : voir `SPARSE_LOAD`).
 */
export const FUEL_KIND_MODEL: Record<FuelKind, number> = {
  grass: 1, tallgrass: 3, shrub: 5, chaparral: 4, dormant: 6, conifer: 10, broadleaf: 9, litter: 8, slash: 11, sparse: 1,
};
/** Sol clairsemé : l'herbe rase à un quart de sa charge. */
const SPARSE_LOAD = 0.25;

export function fuelModelOf(kind: FuelKind): FuelModel {
  const fm = fuelModel(FUEL_KIND_MODEL[kind]);
  return kind === "sparse" ? { ...fm, code: "FM1/4", name: "Sparse grass", w1h: fm.w1h * SPARSE_LOAD } : fm;
}

export interface FireParams {
  fuel: FuelKind;
  /** Vent à 10 m (km/h) et direction D'OÙ il vient (degrés, convention météo). */
  windKmh: number;
  windFromDeg: number;
  /** Humidité relative de l'air (%) et température (°C) → humidité du combustible mort (Simard 1968). */
  humidityPct: number;
  tempC: number;
  /** Humidité du combustible vif (%) — 60 en été sec, 120 au printemps ; absent : 80. */
  liveMoisturePct?: number;
}

/** Le comportement du feu à plat, sous le vent de tête : ce que le panneau affiche et ce que la grille étire. */
export function fireBehaviour(p: FireParams): RothermelResult & { fm: FuelModel; midflameMps: number } {
  const fm = fuelModelOf(p.fuel);
  const moisture = moistureScenario(p.tempC, p.humidityPct, (p.liveMoisturePct ?? 80) / 100);
  const midflameMps = midflameWind(p.windKmh, fm);
  return { ...rothermel(fm, moisture, midflameMps, 0), fm, midflameMps };
}

/** Vitesse de tête (m/min) à plat : Rothermel avec le vent à mi-flamme. */
export function headRos(p: FireParams): number {
  return fireBehaviour(p).ros;
}

/** Allongement de l'ellipse de propagation selon le vent à 10 m (Anderson 1983, sur le vent à mi-flamme du combustible), borné à 8. */
export function lengthToBreadth(windKmh: number, fuel: FuelKind = "shrub"): number {
  return lengthToBreadthFromWind(midflameWind(windKmh, fuelModelOf(fuel)));
}

/** Vitesse dans une direction faisant l'angle `theta` (rad) avec le vent — l'ellipse vue depuis son foyer arrière (Richards 1990). */
export function rosTowards(head: number, lb: number, theta: number): number {
  const e = Math.sqrt(Math.max(0, 1 - 1 / (lb * lb)));
  return (head * (1 - e)) / (1 - e * Math.cos(theta));
}

/**
 * La pente, à la manière de Rothermel : le facteur φs = 5,275 β^-0,3 tan²φ ne
 * joue qu'à la montée (1 + φs sur la vitesse à plat sans vent) ; sur la grille,
 * il est converti en vent équivalent et ajouté au vent (`effectiveWind`).
 * `beta` : le tassement du lit — 0,03 vaut pour un maquis.
 */
export function slopeFactor(dzMeters: number, distMeters: number, beta = 0.03): number {
  return 1 + slopePhi(beta, dzMeters / Math.max(1, distMeters));
}

/** Les huit voisines : décalage de colonne, de ligne, et facteur de distance. */
const VOISINES: readonly { ox: number; oy: number; d: number }[] = [
  { ox: 1, oy: 0, d: 1 },
  { ox: -1, oy: 0, d: 1 },
  { ox: 0, oy: 1, d: 1 },
  { ox: 0, oy: -1, d: 1 },
  { ox: 1, oy: 1, d: Math.SQRT2 },
  { ox: 1, oy: -1, d: Math.SQRT2 },
  { ox: -1, oy: 1, d: Math.SQRT2 },
  { ox: -1, oy: -1, d: Math.SQRT2 },
];

/**
 * Le calcul lui-même : un Dijkstra sur la grille, l'heure d'arrivée (min)
 * pour coût, avançable par tranches (`run`) pour ne pas figer l'écran. Une
 * altitude inconnue (tuile absente) ne brûle pas ; les bords de la grille
 * arrêtent le calcul, pas le feu — l'emprise peut être tronquée, et se dit.
 */
export class FireSpread {
  /** Heure d'arrivée du front (min) par cellule ; Infinity = jamais atteinte avant l'horizon. */
  readonly arrival: Float32Array;
  /** Vitesse de tête à plat (m/min), allongement de l'ellipse à plat, comportement complet (Rothermel). */
  readonly head: number;
  readonly lb: number;
  readonly behaviour: ReturnType<typeof fireBehaviour>;
  /** Vent à mi-flamme (m/s) en composantes est/nord — vers où il souffle. */
  private readonly windE: number;
  private readonly windN: number;
  private readonly settled: Uint8Array;
  private readonly heapT: number[] = [];
  private readonly heapI: number[] = [];
  private readonly elev: Float32Array;
  private readonly width: number;
  private readonly height: number;
  /** Cellules atteintes avant l'horizon, la plus tardive, et si le front a touché un bord. */
  cells = 0;
  maxArrival = 0;
  truncated = false;
  done = false;

  constructor(
    grid: DemGrid,
    /** Taille au sol d'une cellule (m). */
    readonly dx: number,
    seedPx: number,
    seedPy: number,
    readonly params: FireParams,
    /** Horizon (min) au-delà duquel on ne calcule plus. */
    readonly horizonMin: number,
  ) {
    this.width = grid.width;
    this.height = grid.height;
    this.elev = grid.elev;
    const n = grid.width * grid.height;
    this.arrival = new Float32Array(n).fill(Infinity);
    this.settled = new Uint8Array(n);
    this.behaviour = fireBehaviour(params);
    this.head = this.behaviour.ros;
    this.lb = lengthToBreadthFromWind(this.behaviour.midflameMps);
    // Vers où souffle le vent, en angle mathématique (est = 0, nord = π/2).
    const versDeg = (params.windFromDeg + 180) % 360;
    const vent = Math.PI / 2 - (versDeg * Math.PI) / 180;
    this.windE = this.behaviour.midflameMps * Math.cos(vent);
    this.windN = this.behaviour.midflameMps * Math.sin(vent);
    const seed = seedPy * grid.width + seedPx;
    if (seedPx >= 0 && seedPy >= 0 && seedPx < grid.width && seedPy < grid.height && Number.isFinite(this.elev[seed])) {
      this.arrival[seed] = 0;
      this.push(0, seed);
    } else this.done = true;
  }

  /**
   * Vent effectif en une cellule (m/s, composantes est/nord), vitesse de tête
   * et allongement qui en découlent. La pente vient du gradient du relief
   * (différences centrées) ; son facteur φs devient un vent équivalent
   * (Andrews 2018) ajouté vectoriellement au vent — face au vent, la montée
   * peut donc se retrouver freinée, comme dans FARSITE.
   */
  private effectiveWind(c: number, cx: number, cy: number): { eE: number; eN: number; headEff: number; lbEff: number } {
    const { elev, width: w, height: h, dx } = this;
    const z = elev[c];
    const zE = cx < w - 1 && Number.isFinite(elev[c + 1]) ? elev[c + 1] : z;
    const zW = cx > 0 && Number.isFinite(elev[c - 1]) ? elev[c - 1] : z;
    const zS = cy < h - 1 && Number.isFinite(elev[c + w]) ? elev[c + w] : z;
    const zN = cy > 0 && Number.isFinite(elev[c - w]) ? elev[c - w] : z;
    // Gradient (montée) : est et nord (les lignes de la grille descendent vers le sud).
    const gE = (zE - zW) / (2 * dx);
    const gN = (zN - zS) / (2 * dx);
    const tan = Math.min(Math.tan((60 * Math.PI) / 180), Math.hypot(gE, gN));
    const b = this.behaviour;
    let eE = this.windE;
    let eN = this.windN;
    if (tan > 0 && b.ros0 > 0) {
      const uS = equivalentWind(slopePhi(b.beta, tan), b.windCoef);
      const norm = Math.hypot(gE, gN) || 1;
      eE += (uS * gE) / norm;
      eN += (uS * gN) / norm;
    }
    const uEff = Math.hypot(eE, eN);
    const phi = uEff > 0 ? b.windCoef.C * Math.pow(uEff * 196.85, b.windCoef.B) * Math.pow(b.windCoef.ratio, -b.windCoef.E) : 0;
    return { eE, eN, headEff: b.ros0 * (1 + phi), lbEff: lengthToBreadthFromWind(uEff) };
  }

  private push(t: number, i: number): void {
    const T = this.heapT;
    const I = this.heapI;
    T.push(t);
    I.push(i);
    let k = T.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (T[p] <= T[k]) break;
      [T[p], T[k]] = [T[k], T[p]];
      [I[p], I[k]] = [I[k], I[p]];
      k = p;
    }
  }

  private pop(): number {
    const T = this.heapT;
    const I = this.heapI;
    const top = I[0];
    const lastT = T.pop() as number;
    const lastI = I.pop() as number;
    if (T.length > 0) {
      T[0] = lastT;
      I[0] = lastI;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < T.length && T[l] < T[m]) m = l;
        if (r < T.length && T[r] < T[m]) m = r;
        if (m === k) break;
        [T[m], T[k]] = [T[k], T[m]];
        [I[m], I[k]] = [I[k], I[m]];
        k = m;
      }
    }
    return top;
  }

  /** Règle au plus `budget` cellules ; rend `true` quand tout est réglé ou que l'horizon est dépassé. */
  run(budget: number): boolean {
    if (this.done) return true;
    const { width: w, height: h, elev, arrival, settled } = this;
    let reglees = 0;
    while (this.heapT.length > 0 && reglees < budget) {
      const t = this.heapT[0];
      const c = this.pop();
      if (settled[c]) continue;
      if (t > this.horizonMin) {
        this.done = true;
        return true;
      }
      settled[c] = 1;
      reglees++;
      this.cells++;
      if (t > this.maxArrival) this.maxArrival = t;
      const cx = c % w;
      const cy = (c - cx) / w;
      if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) this.truncated = true;
      // Le vent effectif de la cellule : le vent à mi-flamme plus le vent
      // équivalent à la pente locale, dirigé vers la montée (Finney 1998).
      const { eE, eN, headEff, lbEff } = this.effectiveWind(c, cx, cy);
      const dirEff = Math.atan2(eN, eE);
      for (let k = 0; k < 8; k++) {
        const v = VOISINES[k];
        const nx = cx + v.ox;
        const ny = cy + v.oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nIdx = ny * w + nx;
        if (settled[nIdx]) continue;
        const zn = elev[nIdx];
        if (zn !== zn) continue; // tuile absente : ne brûle pas
        const dist = v.d * this.dx;
        const ros = rosTowards(headEff, lbEff, Math.atan2(-v.oy, v.ox) - dirEff);
        const nt = t + dist / Math.max(1e-3, ros);
        if (nt < arrival[nIdx]) {
          arrival[nIdx] = nt;
          this.push(nt, nIdx);
        }
      }
    }
    if (this.heapT.length === 0) this.done = true;
    return this.done;
  }

  /** La boîte (px, bornes hautes exclusives) des cellules atteintes avant l'horizon, ou `null`. */
  box(): PixelBox | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const { width: w, arrival, horizonMin } = this;
    for (let i = 0; i < arrival.length; i++) {
      if (arrival[i] > horizonMin) continue;
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }
}
