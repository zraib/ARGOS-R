// ============================================================================
// lib/store/slices/flood.ts — crues : jauges Flood Hub et simulateur d'inondation (ADR 0010)
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
//
// Deux choses distinctes vivent ici, et l'écran les sépare de même : les
// PRÉVISIONS (jauges servies par l'API — GloFAS par Open-Meteo sans clé, ou
// Google Flood Hub avec — jamais appelées depuis le navigateur) et la
// SIMULATION (une emprise calculée ici même, sur le relief, sans réseau autre
// que les tuiles d'altitude de la carte), lue en animation : l'eau gagne les
// cellules dans l'ordre où elle les a atteintes.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type { FloodFeedStatus, FloodForecast, FloodGauge, FloodInundationMap, FloodPolygon } from "@/lib/types";
import { api } from "@/lib/api";
import { loadDemGrid } from "@/lib/flood/dem";
import {
  cellSizeMeters,
  damBreakRule,
  floodFill,
  floodedAmong,
  floodedAreaKm2,
  gridCorners,
  gridPixel,
  riseRule,
  type DemGrid,
  type FloodFillResult,
} from "@/lib/flood/bathtub";
import { shelterPosition } from "@/lib/ai/opsnetAffecteur";

export type FloodSource = "river" | "lake" | "dam";
/** Pourquoi une simulation n'a pas abouti — chaque cause a sa phrase à l'écran. */
export type FloodSimError = "seed" | "dem" | "elevation";

export interface FloodSimParams {
  source: FloodSource;
  /** Rivière, lac : montée de la surface au-dessus du point de départ (m). */
  riseM: number;
  /** Barrage : lame d'eau au pied de l'ouvrage (m). */
  heightM: number;
  /** Barrage : distance à laquelle la lame s'éteint (km). */
  attenuationKm: number;
  /** Étendue du relief chargé autour du point (km de côté, en ordre de grandeur). */
  extentKm: 20 | 40;
}

export interface FloodImpacts {
  hospitals: string[];
  units: string[];
  shelters: string[];
  cities: string[];
}

/** Ce qu'une simulation laisse : le relief et la propagation (pour la dessiner à tout instant), ses chiffres, ce qu'elle touche. */
export interface FloodSimResult {
  seed: [number, number];
  params: FloodSimParams;
  seedElev: number;
  areaKm2: number;
  maxDepth: number;
  cells: number;
  cellMeters: number;
  corners: [[number, number], [number, number], [number, number], [number, number]];
  /** Le relief et la propagation : la couche de la carte en tire l'image de chaque instant. */
  grid: DemGrid;
  fill: FloodFillResult;
  impacts: FloodImpacts;
  /** Des tuiles d'altitude manquaient, ou la borne de calcul a été atteinte : l'emprise est incomplète. */
  partial: boolean;
}

export const FLOOD_DEFAULT_PARAMS: FloodSimParams = { source: "river", riseM: 3, heightM: 15, attenuationKm: 20, extentKm: 20 };
/** Borne du calcul : au-delà, l'emprise est dite partielle plutôt que de figer l'écran. */
const FLOOD_MAX_CELLS = 1_200_000;

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
  floodSim: FloodSimResult | null;
  floodSimBusy: boolean;
  floodSimError: FloodSimError | null;
  /** Avancement de la lecture, 0 (le point de départ) à 1 (l'emprise entière). */
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
  floodSimBusy: false,
  floodSimError: null,
  floodProgress: 1,
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
  clearFloodSim: () => set({ floodSim: null, floodSimError: null, floodPlaying: false, floodProgress: 1 }),
  setFloodProgress: (p) => set({ floodProgress: Math.min(1, Math.max(0, p)) }),
  // Relancer depuis la fin repart du début ; sinon la lecture reprend où elle en était.
  setFloodPlaying: (v) => set((s) => ({ floodPlaying: v && s.floodSim !== null, floodProgress: v && s.floodProgress >= 1 ? 0 : s.floodProgress })),

  /**
   * Calcule l'emprise sur le relief chargé autour du point de départ, relève
   * ce qu'elle atteint (hôpitaux, unités, abris, villes) et lance la lecture
   * animée. Tout se passe ici : aucune donnée ne part vers un service.
   */
  runFloodSim: async () => {
    const s0 = get();
    const seed = s0.floodSeed;
    if (!seed) {
      set({ floodSimError: "seed" });
      return;
    }
    if (s0.floodSimBusy) return;
    set({ floodSimBusy: true, floodSimError: null, floodPlaying: false });
    try {
      const params = s0.floodParams;
      // 5 × 5 tuiles : ~20 km de côté à z13 (~19 m par cellule), ~40 km à z12.
      const z = params.extentKm === 20 ? 13 : 12;
      const grid = await loadDemGrid(seed, z, 2);
      if (!grid) {
        set({ floodSimError: "dem" });
        return;
      }
      const p = gridPixel(grid, seed[0], seed[1]);
      const seedElev = p ? grid.elev[p.py * grid.width + p.px] : NaN;
      if (!p || !Number.isFinite(seedElev)) {
        set({ floodSimError: "elevation" });
        return;
      }
      const cellMeters = cellSizeMeters(z, seed[1]);
      const rule =
        params.source === "dam"
          ? damBreakRule(seedElev, params.heightM, params.attenuationKm * 1000)
          : riseRule(seedElev, params.riseM);
      const fill = floodFill(grid, p.px, p.py, rule, cellMeters, FLOOD_MAX_CELLS);
      let inconnues = false;
      for (let i = 0; i < grid.elev.length; i += 97) {
        if (!Number.isFinite(grid.elev[i])) {
          inconnues = true;
          break;
        }
      }
      const st = get();
      const abris = st.shelters
        .map((a) => ({ nom: a.nom, ll: shelterPosition(a, st.cities) }))
        .filter((a): a is { nom: string; ll: [number, number] } => a.ll !== null);
      const impacts: FloodImpacts = {
        hospitals: floodedAmong(grid, fill, avecPosition(st.hospitals)).map((h) => h.nom),
        units: floodedAmong(grid, fill, avecPosition(st.units)).map((u) => u.nom),
        shelters: floodedAmong(grid, fill, abris).map((a) => a.nom),
        cities: floodedAmong(grid, fill, st.cities).map((c) => c.v),
      };
      set({
        floodSim: {
          seed,
          params,
          seedElev,
          areaKm2: floodedAreaKm2(fill, cellMeters),
          maxDepth: fill.maxDepth,
          cells: fill.cells,
          cellMeters,
          corners: gridCorners(grid),
          grid,
          fill,
          impacts,
          partial: inconnues || fill.cells >= FLOOD_MAX_CELLS,
        },
        // La lecture part du point de départ dès que le résultat est là.
        floodProgress: 0,
        floodPlaying: true,
      });
    } catch {
      set({ floodSimError: "dem" });
    } finally {
      set({ floodSimBusy: false });
    }
  },
});
