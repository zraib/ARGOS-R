// ============================================================================
// ARGOS — modèle de propagation d'un feu de forêt sur le relief (simulateur)
//
// Ce que ce module calcule : l'HEURE D'ARRIVÉE du front de flammes en chaque
// cellule de la grille d'altitude, depuis un point de départ, par la méthode
// du temps minimal de parcours (Huygens / Dijkstra) : de chaque cellule
// atteinte, le feu gagne ses huit voisines à une vitesse qui dépend de la
// direction — une ellipse allongée dans le sens du vent (Alexander 1985,
// Richards 1990), déformée par la pente (la vitesse double tous les 10° de
// montée, règle de McArthur) — et du combustible, de l'humidité de l'air et
// de la température (facteurs des abaques de Rothermel 1972).
//
// Ce que ce module NE fait PAS : ni sautes de feu (brandons), ni couronnement,
// ni combustible réel (pas de carte d'occupation du sol : l'opérateur choisit
// le type dominant), ni humidité du combustible mesurée, ni action des
// secours. Un ORDRE DE GRANDEUR de propagation — où le feu va, en combien de
// temps — pour cadrer une évacuation et des coupures, pas une prévision. Pur.
// ============================================================================

import type { DemGrid } from "@/lib/flood/grid";
import type { PixelBox } from "@/lib/sim/spread";

export type FuelKind = "grass" | "shrub" | "conifer" | "broadleaf" | "sparse";
export const FUEL_KINDS: readonly FuelKind[] = ["grass", "shrub", "conifer", "broadleaf", "sparse"];

/** Vitesse de base du front (m/min) sans vent, à plat, par temps sec — ordres de grandeur des abaques. */
export const FUEL_BASE_ROS: Record<FuelKind, number> = { grass: 9, shrub: 4.5, conifer: 2.5, broadleaf: 1.2, sparse: 0.5 };
/** Temps de résidence des flammes (min) : au-delà, la cellule n'est plus que braises. */
export const FUEL_RESIDENCE_MIN: Record<FuelKind, number> = { grass: 6, shrub: 15, conifer: 35, broadleaf: 40, sparse: 8 };

export interface FireParams {
  fuel: FuelKind;
  /** Vent à 10 m (km/h) et direction D'OÙ il vient (degrés, convention météo). */
  windKmh: number;
  windFromDeg: number;
  /** Humidité relative de l'air (%) et température (°C). */
  humidityPct: number;
  tempC: number;
}

/** Facteur du vent sur la vitesse de tête — il croît plus vite que le vent lui-même. */
export function windFactor(windKmh: number): number {
  return 1 + 0.06 * Math.pow(Math.max(0, windKmh), 1.2);
}

/** Facteur de l'humidité de l'air : sec, ça court ; saturé, ça peine. */
export function moistureFactor(humidityPct: number): number {
  return Math.min(1.6, Math.max(0.25, 1.6 - humidityPct / 80));
}

/** Facteur de la température, autour de 25 °C. */
export function temperatureFactor(tempC: number): number {
  return Math.min(1.3, Math.max(0.6, 1 + (tempC - 25) / 60));
}

/** Vitesse de tête (m/min) : la base du combustible, poussée par le vent, modulée par l'air. */
export function headRos(p: FireParams): number {
  return FUEL_BASE_ROS[p.fuel] * windFactor(p.windKmh) * moistureFactor(p.humidityPct) * temperatureFactor(p.tempC);
}

/** Allongement de l'ellipse de propagation selon le vent (Alexander 1985), borné. */
export function lengthToBreadth(windKmh: number): number {
  return Math.min(8, 1 + 0.0012 * Math.pow(Math.max(0, windKmh), 2.154));
}

/** Vitesse dans une direction faisant l'angle `theta` (rad) avec le vent — l'ellipse vue depuis son foyer arrière. */
export function rosTowards(head: number, lb: number, theta: number): number {
  const e = Math.sqrt(Math.max(0, 1 - 1 / (lb * lb)));
  return (head * (1 - e)) / (1 - e * Math.cos(theta));
}

/** La pente : la vitesse double tous les 10° de montée, se divise par deux tous les 10° de descente (borné à ±30°). */
export function slopeFactor(dzMeters: number, distMeters: number): number {
  const deg = Math.max(-30, Math.min(30, (Math.atan2(dzMeters, Math.max(1, distMeters)) * 180) / Math.PI));
  return Math.pow(2, deg / 10);
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
  readonly head: number;
  readonly lb: number;
  private readonly rosDir: number[];
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
    this.head = headRos(params);
    this.lb = lengthToBreadth(params.windKmh);
    // Vers où souffle le vent, en angle mathématique (est = 0, nord = π/2).
    const versDeg = (params.windFromDeg + 180) % 360;
    const vent = Math.PI / 2 - (versDeg * Math.PI) / 180;
    this.rosDir = VOISINES.map((v) => rosTowards(this.head, this.lb, Math.atan2(-v.oy, v.ox) - vent));
    const seed = seedPy * grid.width + seedPx;
    if (seedPx >= 0 && seedPy >= 0 && seedPx < grid.width && seedPy < grid.height && Number.isFinite(this.elev[seed])) {
      this.arrival[seed] = 0;
      this.push(0, seed);
    } else this.done = true;
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
        const ros = this.rosDir[k] * slopeFactor(zn - elev[c], dist);
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
