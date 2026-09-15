// ============================================================================
// ARGOS — modèle d'inondation à onde inertielle sur le relief (simulateur)
//
// Ce que ce module calcule : l'écoulement d'un VOLUME d'eau injecté en un
// point selon un hydrogramme (le débit au fil du temps) sur la grille
// d'altitude, pas à pas dans le temps. Chaque cellule porte une lame d'eau ;
// chaque face entre deux cellules porte un débit unitaire (m²/s) qui suit la
// pente de la surface de l'eau et que la rugosité freine — l'équation de
// l'onde inertielle de Bates, Horritt & Fewtrell (2010), celle des modèles de
// plaine d'inondation de type LISFLOOD-FP. Le volume se conserve : ce qui
// entre est au sol, ou sorti du domaine par ses bords.
//
// Ce que ce module NE fait PAS : ni turbulence, ni ouvrages que le relief ne
// résout pas (ponts, digues fines), ni infiltration, ni pluie, ni rugosité
// distribuée. Un relief à 30–60 m et une rugosité unique : un ORDRE DE
// GRANDEUR de propagation — où l'eau va, en combien de temps, à quelle
// profondeur — pour cadrer une évacuation, pas une étude hydraulique. Pur :
// se teste sur des grilles de synthèse.
// ============================================================================

import type { DemGrid } from "@/lib/flood/grid";
import type { PixelBox } from "@/lib/sim/spread";

export type { PixelBox };

const G = 9.81;

export interface HydroParams {
  /** Rugosité de Manning n (s·m^-1/3) — 0,05 : plaine d'inondation avec cultures, haies, bâti épars. */
  manning: number;
  /** Lame (m) en dessous de laquelle une face ne coule pas — évite les oscillations sur un film d'eau. */
  hmin: number;
  /** Pas de temps maximal (s), quand l'eau est peu profonde et lente. */
  dtMax: number;
  /** Coefficient de Courant : la fraction du pas de temps limite que l'on s'autorise. */
  alpha: number;
}

export const HYDRO_DEFAULTS: HydroParams = { manning: 0.05, hmin: 0.01, dtMax: 10, alpha: 0.7 };

// --- hydrogrammes -----------------------------------------------------------------

/** Un hydrogramme : le débit (m³/s) injecté au point de départ à l'instant `t` (s). */
export type Hydrograph = (tSeconds: number) => number;

/** Crue ou rupture : montée jusqu'au pic puis décrue — un triangle, `riseFraction` du temps à monter. */
export function triangularHydrograph(peakQ: number, durationS: number, riseFraction = 1 / 3): Hydrograph {
  const tr = Math.max(1, durationS * riseFraction);
  const tf = Math.max(1, durationS - tr);
  return (t) => (t < 0 || t >= tr + tf ? 0 : t < tr ? (peakQ * t) / tr : peakQ * (1 - (t - tr) / tf));
}

/** Déversement : un débit constant pendant la durée. */
export function plateauHydrograph(q: number, durationS: number): Hydrograph {
  return (t) => (t >= 0 && t < durationS ? q : 0);
}

/** Volume total (m³) d'un hydrogramme sur une durée — intégration au point milieu, pas `dt`. */
export function hydrographVolume(h: Hydrograph, durationS: number, dt = 60): number {
  let v = 0;
  for (let t = 0; t < durationS; t += dt) v += h(Math.min(durationS, t + dt / 2)) * Math.min(dt, durationS - t);
  return v;
}

/** Débit de pointe d'une rupture de barrage (Froehlich 1995) : `V` en m³, `H` hauteur d'eau au barrage (m) → m³/s. */
export function froehlichPeak(volumeM3: number, heightM: number): number {
  return 0.607 * Math.pow(Math.max(0, volumeM3), 0.295) * Math.pow(Math.max(0, heightM), 1.24);
}

// --- scénarios --------------------------------------------------------------------

export type FloodSource = "river" | "lake" | "dam";

/** Ce que l'opérateur règle : la source, ses chiffres, l'horizon et l'étendue du relief. */
export interface FloodScenarioParams {
  source: FloodSource;
  /** Rivière : débit de pointe (m³/s) et durée de la crue (h). */
  peakQ: number;
  durationH: number;
  /** Lac : volume déversé (hm³) sur la durée ; barrage : volume de la retenue (hm³). */
  volumeHm3: number;
  /** Barrage : hauteur d'eau au barrage (m) — avec le volume, elle donne le débit de pointe. */
  damHeightM: number;
  /** Horizon simulé (h). */
  horizonH: number;
  /** Étendue du relief chargé (km de côté) : 25 → cellules d'environ 30 m, 50 → environ 60 m. */
  extentKm: 25 | 50;
}

export interface FloodScenario {
  hydrograph: Hydrograph;
  /** Débit de pointe (m³/s), durée de l'apport (s), volume total (m³). */
  peakQ: number;
  durationS: number;
  volumeM3: number;
}

/** L'hydrogramme d'un scénario et ses chiffres dérivés — les mêmes pour le calcul et pour l'écran. */
export function scenarioOf(p: FloodScenarioParams): FloodScenario {
  if (p.source === "river") {
    const durationS = p.durationH * 3600;
    return { hydrograph: triangularHydrograph(p.peakQ, durationS), peakQ: p.peakQ, durationS, volumeM3: (p.peakQ * durationS) / 2 };
  }
  const volumeM3 = p.volumeHm3 * 1e6;
  if (p.source === "lake") {
    const durationS = p.durationH * 3600;
    const q = volumeM3 / durationS;
    return { hydrograph: plateauHydrograph(q, durationS), peakQ: q, durationS, volumeM3 };
  }
  // Barrage : la pointe vient de la retenue et de sa hauteur (Froehlich), la
  // vidange dure le temps de passer ce volume sous un triangle raide.
  const peakQ = Math.max(1, froehlichPeak(volumeM3, p.damHeightM));
  const durationS = (2 * volumeM3) / peakQ;
  return { hydrograph: triangularHydrograph(peakQ, durationS, 1 / 4), peakQ, durationS, volumeM3 };
}

// --- la simulation ----------------------------------------------------------------

/**
 * L'état de l'eau sur la grille et son avancement pas à pas. Les bords de la
 * grille sont ouverts (l'eau qui les atteint quitte le domaine, comptée) ;
 * une altitude inconnue (tuile absente) est un mur. Seules les cellules
 * mouillées et leurs voisines sont visitées : le coût suit l'emprise, pas la
 * grille.
 */
export class FloodSimulation {
  readonly width: number;
  readonly height: number;
  private readonly elev: Float32Array;
  /** Lame d'eau (m) par cellule. */
  readonly h: Float32Array;
  /** Débit unitaire (m²/s) à travers la face EST de chaque cellule (positif vers l'est) et sa face SUD (positif vers le sud). */
  readonly qx: Float32Array;
  readonly qy: Float32Array;
  private readonly flag: Uint8Array;
  private readonly list: Int32Array;
  private count = 0;
  /** Les cellules qui reçoivent l'apport : le point de départ et ses voisines (3 × 3). */
  readonly seeds: number[] = [];
  /** Temps simulé (s), pas effectués, volumes cumulés (m³) entré et sorti par les bords, lame maximale courante (m). */
  t = 0;
  steps = 0;
  volumeIn = 0;
  volumeOut = 0;
  hmax = 0;

  constructor(
    grid: DemGrid,
    /** Taille au sol d'une cellule (m). */
    readonly dx: number,
    seedPx: number,
    seedPy: number,
    readonly hydrograph: Hydrograph,
    readonly params: HydroParams = HYDRO_DEFAULTS,
  ) {
    this.width = grid.width;
    this.height = grid.height;
    this.elev = grid.elev;
    const n = grid.width * grid.height;
    this.h = new Float32Array(n);
    this.qx = new Float32Array(n);
    this.qy = new Float32Array(n);
    this.flag = new Uint8Array(n);
    this.list = new Int32Array(n);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dxp = -1; dxp <= 1; dxp++) {
        const x = seedPx + dxp;
        const y = seedPy + dy;
        if (x <= 0 || y <= 0 || x >= this.width - 1 || y >= this.height - 1) continue;
        const i = y * this.width + x;
        if (!Number.isFinite(this.elev[i])) continue;
        this.seeds.push(i);
        this.flag[i] = 2;
        this.list[this.count++] = i;
      }
    }
    for (const s of this.seeds) this.activateAround(s);
  }

  /** Cellules visitées à ce pas — la mesure du coût. */
  get activeCells(): number {
    return this.count;
  }

  private activate(i: number): void {
    if (this.flag[i] || !Number.isFinite(this.elev[i])) return;
    this.flag[i] = 1;
    this.list[this.count++] = i;
  }

  private activateAround(i: number): void {
    const x = i % this.width;
    if (x > 0) this.activate(i - 1);
    if (x < this.width - 1) this.activate(i + 1);
    if (i >= this.width) this.activate(i - this.width);
    if (i + this.width < this.h.length) this.activate(i + this.width);
  }

  /** Le débit unitaire à travers la face entre `i` et `j` (positif de `i` vers `j`) au pas suivant. */
  private face(i: number, j: number, q: number, dt: number, n2: number): number {
    const zi = this.elev[i];
    const zj = this.elev[j];
    if (zi !== zi || zj !== zj) return 0; // NaN : tuile absente, un mur
    const ei = zi + this.h[i];
    const ej = zj + this.h[j];
    // La lame qui coule : ce que la surface la plus haute laisse au-dessus du sol le plus haut.
    const hf = Math.max(ei, ej) - Math.max(zi, zj);
    if (hf <= this.params.hmin) return 0;
    const slope = (ej - ei) / this.dx;
    let qn = (q - G * hf * dt * slope) / (1 + (G * dt * n2 * Math.abs(q)) / Math.pow(hf, 7 / 3));
    // Jamais plus vite que l'onde : le régime critique borne le débit (Froude ≤ 1).
    const qc = hf * Math.sqrt(G * hf);
    if (qn > qc) qn = qc;
    else if (qn < -qc) qn = -qc;
    return qn;
  }

  /** Un pas de temps adaptatif ; rend sa durée (s). */
  step(): number {
    const { width: w, h, qx, qy, dx, params } = this;
    const n = h.length;
    const n2 = params.manning * params.manning;
    const dt = Math.min(params.dtMax, (params.alpha * dx) / Math.sqrt(G * Math.max(this.hmax, params.hmin)));
    const list = this.list;
    const count = this.count;

    // 1. Les faces : l'onde inertielle, freinée par la rugosité.
    for (let k = 0; k < count; k++) {
      const i = list[k];
      if (i % w < w - 1) qx[i] = this.face(i, i + 1, qx[i], dt, n2);
      if (i + w < n) qy[i] = this.face(i, i + w, qy[i], dt, n2);
    }

    // 2. Une cellule ne donne pas plus qu'elle n'a : ses sorties se réduisent au prorata.
    const r = dt / dx;
    for (let k = 0; k < count; k++) {
      const i = list[k];
      const x = i % w;
      const oE = x < w - 1 && qx[i] > 0 ? qx[i] : 0;
      const oW = x > 0 && qx[i - 1] < 0 ? -qx[i - 1] : 0;
      const oS = i + w < n && qy[i] > 0 ? qy[i] : 0;
      const oN = i >= w && qy[i - w] < 0 ? -qy[i - w] : 0;
      const out = (oE + oW + oS + oN) * r;
      if (out > h[i] && out > 0) {
        const s = h[i] / out;
        if (oE > 0) qx[i] *= s;
        if (oW > 0) qx[i - 1] *= s;
        if (oS > 0) qy[i] *= s;
        if (oN > 0) qy[i - w] *= s;
      }
    }

    // 3. Les lames : l'apport de l'hydrogramme au point de départ, puis le bilan des faces.
    const q = this.hydrograph(this.t);
    if (q > 0 && this.seeds.length > 0) {
      const apport = (q * dt) / (this.seeds.length * dx * dx);
      for (const s of this.seeds) h[s] += apport;
      this.volumeIn += q * dt;
    }
    for (let k = 0; k < count; k++) {
      const i = list[k];
      const x = i % w;
      const bilan = (x > 0 ? qx[i - 1] : 0) - (x < w - 1 ? qx[i] : 0) + (i >= w ? qy[i - w] : 0) - (i + w < n ? qy[i] : 0);
      const v = h[i] + r * bilan;
      h[i] = v > 0 ? v : 0;
    }

    // 4. Les bords sont ouverts : l'eau qui les atteint quitte le domaine.
    // 5. Qui a de l'eau réveille ses voisines ; la lame maximale règle le prochain pas.
    let hmax = 0;
    const hm = this.height;
    for (let k = 0; k < count; k++) {
      const i = list[k];
      const v = h[i];
      if (v <= 0) continue;
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === hm - 1) {
        this.volumeOut += v * dx * dx;
        h[i] = 0;
        continue;
      }
      if (v > hmax) hmax = v;
      if (v > params.hmin) this.activateAround(i);
    }
    this.hmax = hmax;
    this.t += dt;
    this.steps++;
    if (this.steps % 64 === 0) this.compact();
    return dt;
  }

  /** Avance jusqu'à l'instant `tTarget` (s). */
  advance(tTarget: number): void {
    while (this.t < tTarget) this.step();
  }

  /** Oublie les cellules sèches sans voisine mouillée — la liste suit l'emprise. */
  private compact(): void {
    const { h, width: w, list, flag } = this;
    const n = h.length;
    let m = 0;
    for (let k = 0; k < this.count; k++) {
      const i = list[k];
      const x = i % w;
      const garde =
        flag[i] === 2 ||
        h[i] > 0 ||
        (x > 0 && h[i - 1] > 0) ||
        (x < w - 1 && h[i + 1] > 0) ||
        (i >= w && h[i - w] > 0) ||
        (i + w < n && h[i + w] > 0);
      if (garde) list[m++] = i;
      else {
        flag[i] = 0;
        this.qx[i] = 0;
        this.qy[i] = 0;
      }
    }
    this.count = m;
  }

  /** Volume d'eau au sol (m³). */
  volumeOnGround(): number {
    let v = 0;
    for (let k = 0; k < this.count; k++) v += this.h[this.list[k]];
    return v * this.dx * this.dx;
  }

  /** Nombre de cellules dont la lame dépasse `threshold` (m). */
  wetCount(threshold: number): number {
    let c = 0;
    for (let k = 0; k < this.count; k++) if (this.h[this.list[k]] > threshold) c++;
    return c;
  }

  /** La boîte (px, bornes hautes exclusives) des cellules dont la lame dépasse `threshold`, ou `null`. */
  wetBox(threshold: number): PixelBox | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < this.count; k++) {
      const i = this.list[k];
      if (this.h[i] <= threshold) continue;
      const x = i % this.width;
      const y = (i - x) / this.width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }
}
