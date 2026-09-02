// ============================================================================
// lib/store/slices/map.ts — carte opérationnelle : couches, 3D/satellite, sélection, météo
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type {
  Incident,
  MapSelection,
  MarkerKind,
  WeatherGridSeries,
} from "@/lib/types";
import { api } from "@/lib/api";
import {
  LayerState,
  } from "@/lib/store/shared";

export interface MapSlice {
  /** incident à centrer sur la carte (même pattern que quakeFocus) ; consommé puis remis à null */
  incidentFocus: Incident | null;
  /** incrémentée à chaque demande focusIncident, utilisée par MapCanvas pour détecter un focus arrivé avant son mount */
  incidentFocusAt: number;
  /** centrage générique carte : demandé par un composant (Copilot) ; consommé par MapCanvas puis remis à null */
  mapCenterRequest: { ll: [number, number]; zoom: number; at: number; label?: string } | null;
  // --- couches météo de la carte opérationnelle (grille de prévisions 24 h) ---
  wxGrid: WeatherGridSeries | null;
  /** grille mondiale grossière (pas 10°) : couverture planétaire des couches */
  wxWorld: WeatherGridSeries | null;
  /** couches météo actives sur la carte (indépendantes, superposables) */
  wxLayers: { temp: boolean; wind: boolean; precip: boolean };
  // --- sélection de détail ressource / hôpital (partagée avec la carte) ---
  selUnit: string | null;
  selHosp: string | null;
  // --- carte ---
  layers: LayerState;
  map3d: boolean;
  mapSat: boolean;
  selMarker: MapSelection | null;
  /** Demande le centrage de la carte sur un incident (active la couche incidents) ; null pour purger. */
  focusIncident: (inc: Incident | null) => void;
  /** Demande un centrage générique de la carte (ex: zone géographique). Consommé par MapCanvas. null = purge. */
  setMapCenter: (ll: [number, number] | null, zoom?: number, label?: string) => void;
  /** Bascule une couche météo de la carte (charge la grille à la 1re activation). */
  toggleWxLayer: (k: "temp" | "wind" | "precip") => void;
  /** Charge la grille météo (conditions actuelles) depuis l'API. */
  loadWxGrid: () => Promise<void>;
  toggleLayer: (k: keyof LayerState) => void;
  setMap3d: (v: boolean) => void;
  setMapSat: (v: boolean) => void;
  select: (kind: MarkerKind, id: string) => void;
  clearSelection: () => void;
  setSelUnit: (id: string | null) => void;
  setSelHosp: (id: string | null) => void;
}

export const createMapSlice: StateCreator<ArgosState, [], [], MapSlice> = (set, get) => ({
  incidentFocus: null,
  incidentFocusAt: 0,
  mapCenterRequest: null,
  wxGrid: null,
  wxWorld: null,
  wxLayers: { temp: false, wind: false, precip: false },
  selUnit: null,
  selHosp: null,
  // Le réseau civil (106 établissements) est masqué par défaut : il se
  // rallume d'un clic quand l'opérateur cherche une capacité d'accueil.
  layers: { units: true, hospitals: true, hospitalsCiv: false, incidents: true, vehicles: true, field: true, aircraft: true, missions: true },
  map3d: false,
  mapSat: true,
  selMarker: null,
  // « Voir sur la carte » : centre sur un incident (pattern identique à focusQuake)
  focusIncident: (inc) => set((s) => {
    if (!inc) return { incidentFocus: null };
    const layers = s.layers.incidents ? s.layers : { ...s.layers, incidents: true };
    return {
      incidentFocus: inc,
      incidentFocusAt: Date.now(),
      selMarker: { kind: "inc", id: inc.id },
      layers,
    };
  }),
  // Centre générique carte (ex: zone géographique, ville) — consommé par MapCanvas useEffect
  // zoom par défaut = 7 (niveau national) sinon explicit.
  setMapCenter: (ll, zoom, label) => set({ mapCenterRequest: ll ? { ll, zoom: zoom ?? 7, at: Date.now(), label } : null }),
  toggleWxLayer: (k) => {
    const s = get();
    const wxLayers = { ...s.wxLayers, [k]: !s.wxLayers[k] };
    set({ wxLayers });
    // Recharge si L'UNE des deux grilles manque (échec précédent inclus).
    if (wxLayers[k] && (!s.wxGrid || !s.wxWorld)) void get().loadWxGrid();
  },
  // Grilles météo (nationale dense + mondiale grossière) : chargées
  // paresseusement à la première activation d'une couche. Les deux appels sont
  // INDÉPENDANTS (allSettled) : l'échec de l'un ne prive pas de l'autre, et la
  // carte re-tente périodiquement tant qu'une grille manque.
  loadWxGrid: async () => {
    const [res, resW] = await Promise.allSettled([api.getWeatherGrid(), api.getWeatherGridWorld()]);
    if (res.status === "fulfilled") {
      const g = res.value.data as WeatherGridSeries | undefined;
      if (g && Array.isArray(g.points) && g.points.length > 0) set({ wxGrid: g });
    }
    if (resW.status === "fulfilled") {
      const w = resW.value.data as WeatherGridSeries | undefined;
      if (w && Array.isArray(w.points) && w.points.length > 0) set({ wxWorld: w });
    }
  },
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setMap3d: (v) => set({ map3d: v }),
  setMapSat: (v) => set({ mapSat: v }),
  select: (kind, id) => set({ selMarker: { kind, id } }),
  clearSelection: () => set({ selMarker: null }),
  setSelUnit: (id) => set({ selUnit: id }),
  setSelHosp: (id) => set({ selHosp: id }),
});
