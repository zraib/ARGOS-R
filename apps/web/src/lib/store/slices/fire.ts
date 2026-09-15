// ============================================================================
// lib/store/slices/fire.ts — feux de forêt : simulateur de propagation sur la carte (ADR 0011)
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
//
// Un point d'allumage, un combustible dominant, le vent, l'air, un horizon :
// le front est calculé ici même sur le relief (temps minimal de parcours) et
// lu en animation au fil du calcul. La météo du point vient du courtier de
// l'API (jamais d'un tiers depuis le navigateur) et se corrige à la main.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type { WeatherForecast } from "@/lib/types";
import { api } from "@/lib/api";
import { loadDemGrid } from "@/lib/flood/dem";
import { cellSizeMeters, gridPixel } from "@/lib/flood/grid";
import type { FireParams } from "@/lib/fire/spread";
import { FireRun, driveFireRun } from "@/lib/fire/run";
import type { SpreadPoi } from "@/lib/sim/spread";
import { shelterPosition } from "@/lib/ai/opsnetAffecteur";

export type FireSimError = "seed" | "dem" | "elevation";

export interface FireSimParams extends FireParams {
  /** Horizon simulé (h). */
  horizonH: number;
  /** Étendue du relief chargé (km de côté) : 25 → cellules d'environ 30 m, 50 → environ 60 m. */
  extentKm: 25 | 50;
}

export const FIRE_DEFAULT_PARAMS: FireSimParams = { fuel: "shrub", windKmh: 20, windFromDeg: 270, humidityPct: 30, tempC: 30, horizonH: 6, extentKm: 25 };
/** Images gardées sur l'horizon : assez pour un curseur fin, peu pour la mémoire. */
const FIRE_FRAMES = 120;
const FIRE_ZOOM: Record<FireSimParams["extentKm"], number> = { 25: 12, 50: 11 };

export interface FireSlice {
  fireSeed: [number, number] | null;
  /** Le prochain clic sur la carte pose le point d'allumage. */
  fireArming: boolean;
  fireParams: FireSimParams;
  /** Quand la météo du point a été relevée (ISO), ou `null` si les réglages sont à la main. */
  fireWeatherAt: string | null;
  fireWeatherBusy: boolean;
  fireWeatherError: boolean;
  /** La simulation en cours ou finie — mutable, partagée par référence ; `fireFrames` et `fireDone` signalent ses changements. */
  fireSim: FireRun | null;
  fireFrames: number;
  fireDone: boolean;
  /** Tuiles absentes ou front arrivé au bord : l'emprise peut être tronquée. */
  firePartial: boolean;
  fireSimBusy: boolean;
  fireSimError: FireSimError | null;
  fireProgress: number;
  firePlaying: boolean;
  setFireArming: (v: boolean) => void;
  setFireSeed: (ll: [number, number] | null) => void;
  setFireParams: (patch: Partial<FireSimParams>) => void;
  fetchFireWeather: () => Promise<void>;
  runFireSim: () => Promise<void>;
  clearFireSim: () => void;
  setFireProgress: (p: number) => void;
  setFirePlaying: (v: boolean) => void;
}

function avecPosition<T extends { ll?: [number, number] }>(items: readonly T[]): (T & { ll: [number, number] })[] {
  return items.filter((x): x is T & { ll: [number, number] } => Array.isArray(x.ll) && x.ll.length === 2);
}

export const createFireSlice: StateCreator<ArgosState, [], [], FireSlice> = (set, get) => ({
  fireSeed: null,
  fireArming: false,
  fireParams: FIRE_DEFAULT_PARAMS,
  fireWeatherAt: null,
  fireWeatherBusy: false,
  fireWeatherError: false,
  fireSim: null,
  fireFrames: 0,
  fireDone: false,
  firePartial: false,
  fireSimBusy: false,
  fireSimError: null,
  fireProgress: 0,
  firePlaying: false,

  setFireArming: (v) => set({ fireArming: v }),
  setFireSeed: (ll) => set({ fireSeed: ll, fireArming: false, fireSimError: null, fireWeatherAt: null, fireWeatherError: false }),
  // Un réglage à la main n'est plus « la météo relevée ».
  setFireParams: (patch) => set((s) => ({ fireParams: { ...s.fireParams, ...patch }, fireWeatherAt: "windKmh" in patch || "windFromDeg" in patch || "humidityPct" in patch || "tempC" in patch ? null : s.fireWeatherAt })),
  clearFireSim: () => {
    get().fireSim?.abort();
    set({ fireSim: null, fireFrames: 0, fireDone: false, firePartial: false, fireSimBusy: false, fireSimError: null, firePlaying: false, fireProgress: 0 });
  },
  setFireProgress: (p) => set({ fireProgress: Math.min(1, Math.max(0, p)) }),
  setFirePlaying: (v) => set((s) => ({ firePlaying: v && s.fireSim !== null, fireProgress: v && s.fireProgress >= 1 ? 0 : s.fireProgress })),

  /** Le vent, l'humidité et la température du point d'allumage, par le courtier météo de l'API. */
  fetchFireWeather: async () => {
    const seed = get().fireSeed;
    if (!seed || get().fireWeatherBusy) return;
    set({ fireWeatherBusy: true, fireWeatherError: false });
    try {
      const res = await api.getWeatherForecast(seed[1], seed[0]);
      const cur = (res.data as WeatherForecast | undefined)?.current;
      if (!cur) {
        set({ fireWeatherError: true });
        return;
      }
      set((s) => ({
        fireParams: { ...s.fireParams, windKmh: cur.wind, windFromDeg: cur.windDir, humidityPct: cur.humidity, tempC: cur.temp },
        fireWeatherAt: new Date().toISOString(),
      }));
    } catch {
      set({ fireWeatherError: true });
    } finally {
      set({ fireWeatherBusy: false });
    }
  },

  /**
   * Charge le relief autour du point d'allumage, lance le calcul des heures
   * d'arrivée du front et sa lecture ; le calcul court en arrière-plan. Il
   * relève quand le front atteint hôpitaux, unités, abris et villes. Tout se
   * passe ici : aucune donnée ne part vers un service.
   */
  runFireSim: async () => {
    const s0 = get();
    const seed = s0.fireSeed;
    if (!seed) {
      set({ fireSimError: "seed" });
      return;
    }
    if (s0.fireSimBusy) return;
    s0.fireSim?.abort();
    set({ fireSimBusy: true, fireSimError: null, fireSim: null, fireFrames: 0, fireDone: false, firePlaying: false, fireProgress: 0 });
    const params = s0.fireParams;
    const z = FIRE_ZOOM[params.extentKm];
    let run: FireRun;
    try {
      const grid = await loadDemGrid(seed, z, 1);
      if (!grid) {
        set({ fireSimError: "dem", fireSimBusy: false });
        return;
      }
      const p = gridPixel(grid, seed[0], seed[1]);
      const seedElev = p ? grid.elev[p.py * grid.width + p.px] : NaN;
      if (!p || !Number.isFinite(seedElev)) {
        set({ fireSimError: "elevation", fireSimBusy: false });
        return;
      }
      let inconnues = false;
      for (let i = 0; i < grid.elev.length; i += 97) {
        if (!Number.isFinite(grid.elev[i])) {
          inconnues = true;
          break;
        }
      }
      const st = get();
      const pois: SpreadPoi[] = [
        ...avecPosition(st.hospitals).map((h): SpreadPoi => ({ id: `h:${h.nom}`, kind: "hospital", nom: h.nom, ll: h.ll })),
        ...avecPosition(st.units).map((u): SpreadPoi => ({ id: `u:${u.nom}`, kind: "unit", nom: u.nom, ll: u.ll })),
        ...st.shelters
          .map((a) => ({ nom: a.nom, ll: shelterPosition(a, st.cities) }))
          .filter((a): a is { nom: string; ll: [number, number] } => a.ll !== null)
          .map((a): SpreadPoi => ({ id: `a:${a.nom}`, kind: "shelter", nom: a.nom, ll: a.ll })),
        ...st.cities.map((c): SpreadPoi => ({ id: `c:${c.v}`, kind: "city", nom: c.v, ll: c.ll })),
      ];
      const horizonS = params.horizonH * 3600;
      run = new FireRun({ grid, cellMeters: cellSizeMeters(z, seed[1]), seedPx: p.px, seedPy: p.py, params, horizonS, frameEveryS: horizonS / FIRE_FRAMES, pois });
      set({ fireSim: run, fireFrames: 1, fireDone: false, firePartial: inconnues, fireProgress: 0, firePlaying: true });
    } catch {
      set({ fireSimError: "dem", fireSimBusy: false });
      return;
    }
    void driveFireRun(run, (r) => {
      if (get().fireSim === r) set({ fireFrames: r.frames.length, fireDone: r.done, firePartial: get().firePartial || r.truncated });
    }).finally(() => {
      if (get().fireSim === run) set({ fireSimBusy: false });
    });
  },
});
