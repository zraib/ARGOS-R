// ============================================================================
// lib/store/slices/tracking.ts — traceurs GPS et positions partagées, pour la carte
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
//
// L'écran des traceurs garde sa propre liste (filtres, archives) ; la carte
// lit ici la situation vivante : ce qui émet, où. Un rôle sans `tracking:view`
// reçoit un 403 que l'on traduit en liste vide — la couche reste muette, la
// carte ne casse pas.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type { Tracker } from "@/lib/tracking/tracker";
import { api } from "@/lib/api";

export interface TrackingSlice {
  /** Traceurs actifs (boîtiers et partages par l'application), avec leur dernier fix. */
  trackers: Tracker[];
  loadTrackers: () => Promise<void>;
}

export const createTrackingSlice: StateCreator<ArgosState, [], [], TrackingSlice> = (set) => ({
  trackers: [],
  loadTrackers: async () => {
    try {
      const res = await api.getTrackers();
      if (res.error) {
        set({ trackers: [] });
        return;
      }
      set({ trackers: (res.data ?? []) as unknown as Tracker[] });
    } catch {
      set({ trackers: [] });
    }
  },
});
