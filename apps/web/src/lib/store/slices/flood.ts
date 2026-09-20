// ============================================================================
// lib/store/slices/flood.ts — crues : prévisions du courtier et simulateur d'inondation (ADR 0010)
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
//
// Deux choses distinctes vivent ici, et l'écran les sépare de même : les
// PRÉVISIONS (jauges servies par l'API — GloFAS par Open-Meteo sans clé, ou
// Google Flood Hub avec — jamais appelées depuis le navigateur) et la
// SIMULATION (un volume d'eau qui se propage pas à pas sur le relief, calculé
// ici même, sans réseau autre que les tuiles d'altitude de la carte), lue en
// animation au fil du calcul.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type { FloodFeedStatus, FloodForecast, FloodGauge, FloodInundationMap, FloodPolygon } from "@/lib/types";
import { api } from "@/lib/api";
import { loadDemGrid } from "@/lib/flood/dem";
import { cellSizeMeters, gridPixel } from "@/lib/flood/grid";
import { HYDRO_DEFAULTS, manningOf, scenarioOf, type FloodScenarioParams, type FloodSource } from "@/lib/flood/hydro";
import { FloodRun, driveFloodRun, type FloodPoi } from "@/lib/flood/run";
import { shelterPosition } from "@/lib/ai/opsnetAffecteur";

export type { FloodSource };
export type FloodSimParams = FloodScenarioParams;
/** Pourquoi une simulation n'a pas démarré — chaque cause a sa phrase à l'écran. */
export type FloodSimError = "seed" | "dem" | "elevation";

export const FLOOD_DEFAULT_PARAMS: FloodSimParams = { source: "river", peakQ: 1500, durationH: 6, volumeHm3: 50, damHeightM: 40, horizonH: 6, extentKm: 25 };
/** Images gardées sur l'horizon : assez pour un curseur fin, peu pour la mémoire. */
const FLOOD_FRAMES = 120;
/** Zoom des tuiles d'altitude par étendue : 3 × 3 tuiles font ≈ 25 km à z12 et ≈ 50 km à z11 sous la latitude du Maroc. */
const FLOOD_ZOOM: Record<FloodSimParams["extentKm"], number> = { 25: 12, 50: 11, 100: 10, 200: 9 };

export interface FloodSlice {
  floodStatus: FloodFeedStatus | null;
  floodGauges: FloodGauge[];
  floodGaugesOn: boolean;
  floodBusy: boolean;
  /** Jauge dont la fiche est ouverte (prévision, seuils, cartes d'inondation). */
  floodSel: string | null;
  floodForecast: FloodForecast | null;
  /** Les cartes d'inondation Flood Hub de la jauge choisie, avec leur niveau. */
  floodPolygons: { level: FloodInundationMap["level"]; polygon: FloodPolygon }[];
  floodMapsOn: boolean;
  // --- simulateur ---
  floodSeed: [number, number] | null;
  /** Le prochain clic sur la carte pose le point de départ. */
  floodArming: boolean;
  floodParams: FloodSimParams;
  /** La simulation en cours ou finie — mutable, partagée par référence ; `floodFrames` et `floodDone` signalent ses changements. */
  floodSim: FloodRun | null;
  floodFrames: number;
  floodDone: boolean;
  /** Le relief avait des trous (tuiles absentes) : l'eau ne les traverse pas, l'emprise peut être tronquée. */
  floodPartial: boolean;
  /** Relief en chargement ou calcul en cours. */
  floodSimBusy: boolean;
  floodSimError: FloodSimError | null;
  /** Avancement de la lecture, 0 (l'instant du départ) à 1 (l'horizon). */
  floodProgress: number;
  floodPlaying: boolean;
  loadFloodGauges: () => Promise<void>;
  toggleFloodGauges: () => void;
  selectFloodGauge: (id: string | null) => Promise<void>;
  toggleFloodMaps: () => void;
  setFloodArming: (v: boolean) => void;
  setFloodSeed: (ll: [number, number] | null) => void;
  setFloodParams: (patch: Partial<FloodSimParams>) => void;
  runFloodSim: () => Promise<void>;
  clearFloodSim: () => void;
  setFloodProgress: (p: number) => void;
  setFloodPlaying: (v: boolean) => void;
}

/** Les éléments qui portent une position — un élément sans point n'est ni dedans ni dehors. */
function avecPosition<T extends { ll?: [number, number] }>(items: readonly T[]): (T & { ll: [number, number] })[] {
  return items.filter((x): x is T & { ll: [number, number] } => Array.isArray(x.ll) && x.ll.length === 2);
}

export const createFloodSlice: StateCreator<ArgosState, [], [], FloodSlice> = (set, get) => ({
  floodStatus: null,
  floodGauges: [],
  floodGaugesOn: false,
  floodBusy: false,
  floodSel: null,
  floodForecast: null,
  floodPolygons: [],
  floodMapsOn: true,
  floodSeed: null,
  floodArming: false,
  floodParams: FLOOD_DEFAULT_PARAMS,
  floodSim: null,
  floodFrames: 0,
  floodDone: false,
  floodPartial: false,
  floodSimBusy: false,
  floodSimError: null,
  floodProgress: 0,
  floodPlaying: false,

  loadFloodGauges: async () => {
    if (get().floodBusy) return;
    set({ floodBusy: true });
    try {
      const [status, gauges] = await Promise.all([api.getFloodStatus(), api.getFloodGauges()]);
      set({
        floodStatus: (status.data as FloodFeedStatus | undefined) ?? get().floodStatus,
        floodGauges: Array.isArray(gauges.data) ? (gauges.data as FloodGauge[]) : get().floodGauges,
      });
    } catch {
      /* flux indisponible : l'état précédent reste, le statut le dit */
    } finally {
      set({ floodBusy: false });
    }
  },
  toggleFloodGauges: () => {
    const on = !get().floodGaugesOn;
    set({ floodGaugesOn: on });
    if (on && get().floodGauges.length === 0) void get().loadFloodGauges();
  },
  selectFloodGauge: async (id) => {
    if (!id) {
      set({ floodSel: null, floodForecast: null, floodPolygons: [] });
      return;
    }
    const jauge = get().floodGauges.find((g) => g.gaugeId === id);
    set({ floodSel: id, floodForecast: null, floodPolygons: [], floodGaugesOn: true });
    // La prévision et les cartes d'inondation arrivent chacune de leur côté :
    // une carte absente ne prive pas de la prévision, et inversement.
    const [prevision, cartes] = await Promise.all([
      api.getFloodForecast(id).then((r) => (r.data as FloodForecast | undefined) ?? null).catch(() => null),
      Promise.all(
        (jauge?.inundationMaps ?? []).map((m) =>
          api
            .getFloodPolygon(m.polygonId)
            .then((r) => (r.data ? { level: m.level, polygon: r.data as FloodPolygon } : null))
            .catch(() => null),
        ),
      ),
    ]);
    // L'opérateur a pu changer de jauge entre-temps : on ne pose que ce qui vaut encore.
    if (get().floodSel !== id) return;
    set({
      floodForecast: prevision,
      floodPolygons: cartes.filter((c): c is { level: FloodInundationMap["level"]; polygon: FloodPolygon } => c !== null),
    });
  },
  toggleFloodMaps: () => set((s) => ({ floodMapsOn: !s.floodMapsOn })),
  setFloodArming: (v) => set({ floodArming: v }),
  setFloodSeed: (ll) => set({ floodSeed: ll, floodArming: false, floodSimError: null }),
  setFloodParams: (patch) => set((s) => ({ floodParams: { ...s.floodParams, ...patch } })),
  clearFloodSim: () => {
    get().floodSim?.abort();
    set({ floodSim: null, floodFrames: 0, floodDone: false, floodPartial: false, floodSimBusy: false, floodSimError: null, floodPlaying: false, floodProgress: 0 });
  },
  setFloodProgress: (p) => set({ floodProgress: Math.min(1, Math.max(0, p)) }),
  // Relancer depuis la fin repart du début ; sinon la lecture reprend où elle en était.
  setFloodPlaying: (v) => set((s) => ({ floodPlaying: v && s.floodSim !== null, floodProgress: v && s.floodProgress >= 1 ? 0 : s.floodProgress })),

  /**
   * Charge le relief autour du point de départ, lance la propagation du
   * scénario (débit, volume, durée) et sa lecture ; le calcul court en
   * arrière-plan et ses images arrivent au fil de l'eau. Il relève au passage
   * quand l'eau atteint hôpitaux, unités, abris et villes. Tout se passe ici :
   * aucune donnée ne part vers un service.
   */
  runFloodSim: async () => {
    const s0 = get();
    const seed = s0.floodSeed;
    if (!seed) {
      set({ floodSimError: "seed" });
      return;
    }
    if (s0.floodSimBusy) return;
    s0.floodSim?.abort();
    set({ floodSimBusy: true, floodSimError: null, floodSim: null, floodFrames: 0, floodDone: false, floodPlaying: false, floodProgress: 0 });
    const params = s0.floodParams;
    const z = FLOOD_ZOOM[params.extentKm];
    let run: FloodRun;
    try {
      const grid = await loadDemGrid(seed, z, 1);
      if (!grid) {
        set({ floodSimError: "dem", floodSimBusy: false });
        return;
      }
      const p = gridPixel(grid, seed[0], seed[1]);
      const seedElev = p ? grid.elev[p.py * grid.width + p.px] : NaN;
      if (!p || !Number.isFinite(seedElev)) {
        set({ floodSimError: "elevation", floodSimBusy: false });
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
      const pois: FloodPoi[] = [
        ...avecPosition(st.hospitals).map((h): FloodPoi => ({ id: `h:${h.nom}`, kind: "hospital", nom: h.nom, ll: h.ll })),
        ...avecPosition(st.units).map((u): FloodPoi => ({ id: `u:${u.nom}`, kind: "unit", nom: u.nom, ll: u.ll })),
        ...st.shelters
          .map((a) => ({ nom: a.nom, ll: shelterPosition(a, st.cities) }))
          .filter((a): a is { nom: string; ll: [number, number] } => a.ll !== null)
          .map((a): FloodPoi => ({ id: `a:${a.nom}`, kind: "shelter", nom: a.nom, ll: a.ll })),
        ...st.cities.map((c): FloodPoi => ({ id: `c:${c.v}`, kind: "city", nom: c.v, ll: c.ll })),
      ];
      const scenario = scenarioOf(params);
      const horizonS = params.horizonH * 3600;
      run = new FloodRun({
        grid,
        cellMeters: cellSizeMeters(z, seed[1]),
        seedPx: p.px,
        seedPy: p.py,
        hydrograph: scenario.hydrograph,
        horizonS,
        frameEveryS: horizonS / FLOOD_FRAMES,
        pois,
        // La rugosité du terrain (Chow 1959) ; le reste des réglages numériques est celui du schéma.
        params: { ...HYDRO_DEFAULTS, manning: manningOf(params) },
      });
      set({ floodSim: run, floodFrames: 1, floodDone: false, floodPartial: inconnues, floodProgress: 0, floodPlaying: true });
    } catch {
      set({ floodSimError: "dem", floodSimBusy: false });
      return;
    }
    // Le calcul court ; ses images arrivent au fil de l'eau et la lecture les suit.
    // Une course remplacée ou effacée entre-temps ne touche plus au magasin.
    void driveFloodRun(run, (r) => {
      if (get().floodSim === r) set({ floodFrames: r.frames.length, floodDone: r.done });
    }).finally(() => {
      if (get().floodSim === run) set({ floodSimBusy: false });
    });
  },
});
