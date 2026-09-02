// ============================================================================
// lib/store/slices/seismic.ts — flux sismique EMSC, alerte globale et focus séisme
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type {
  SeismicAlertConfig,
  SeismicEvent,
  } from "@/lib/types";
import { pointInMorocco } from "@/lib/map/morocco";
import { api } from "@/lib/api";

export interface SeismicSlice {
  // --- flux sismique (EMSC) : partagé par la page /seismologie, la carte et l'alerte globale ---
  quakes: SeismicEvent[];
  /** couche séismes active (carte) + surveillance de l'alerte */
  quakesOn: boolean;
  quakesMinMag: number;
  quakesRegion: "morocco" | "world";
  /** dernier nouveau séisme détecté (déclenche la pop-up d'alerte) ; null = aucune alerte */
  quakeAlert: SeismicEvent | null;
  /** séisme à centrer sur la carte (« voir sur la carte ») ; consommé puis remis à null */
  quakeFocus: SeismicEvent | null;
  /** séisme sélectionné (bandeau de détail flottant sur la carte) ; null = aucun */
  quakeSelected: SeismicEvent | null;
  /** configuration des alertes (seuils + autorités), chargée depuis l'API */
  seisConfig: SeismicAlertConfig | null;
  loadQuakes: () => Promise<void>;
  loadSeisConfig: () => Promise<void>;
  setSeisConfig: (cfg: SeismicAlertConfig) => void;
  setQuakesOn: (v: boolean) => void;
  setQuakesFilter: (minmag: number, region: "morocco" | "world") => void;
  dismissQuakeAlert: () => void;
  /** Demande le centrage de la carte sur un séisme (active la couche) ; null pour purger. */
  focusQuake: (ev: SeismicEvent | null) => void;
  /** Sélectionne un séisme pour le bandeau de détail (clic sur la carte) ; null ferme. */
  selectQuake: (ev: SeismicEvent | null) => void;
}

export const createSeismicSlice: StateCreator<ArgosState, [], [], SeismicSlice> = (set, get) => ({
  quakes: [],
  quakesOn: true,
  quakesMinMag: 2.5,
  quakesRegion: "world",
  quakeAlert: null,
  quakeFocus: null,
  quakeSelected: null,
  seisConfig: null,
  loadQuakes: async () => {
    const { quakesMinMag, quakesRegion, quakes: prev, quakesOn, seisConfig } = get();
    const res = await api.getSeismicEvents(quakesMinMag, quakesRegion);
    const list = ((res.data as SeismicEvent[] | undefined) ?? []).filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.lon));
    const firstLoad = prev.length === 0;
    const prevIds = new Set(prev.map((q) => q.id));
    // Seuils d'alerte configurés (Paramètres) : un séisme NATIONAL alerte dès
    // maMinMag (alerte rouge + SMS/e-mail côté serveur), un séisme mondial
    // seulement dès globalMinMag (notification dans l'app). Un séisme national
    // prime toujours sur un mondial détecté au même balayage.
    const maMin = seisConfig?.maMinMag ?? 4.0;
    const glMin = seisConfig?.globalMinMag ?? 5.5;
    const fresh = list.filter(
      (q) => !prevIds.has(q.id) && (pointInMorocco(q.lon, q.lat) ? q.mag >= maMin : q.mag >= glMin),
    );
    const freshMa = fresh.filter((q) => pointInMorocco(q.lon, q.lat));
    const pick = (freshMa.length > 0 ? freshMa : fresh);
    set((s) => ({
      quakes: list,
      quakeAlert:
        quakesOn && !firstLoad && pick.length > 0
          ? pick.reduce((a, b) => (b.mag > a.mag ? b : a))
          : s.quakeAlert,
    }));
  },
  // Configuration des alertes sismiques (chargée une fois, rafraîchie après
  // enregistrement dans les Paramètres).
  loadSeisConfig: async () => {
    try {
      const res = await api.getSeismicAlertConfig();
      const cfg = res.data as SeismicAlertConfig | undefined;
      if (cfg && typeof cfg.maMinMag === "number") set({ seisConfig: cfg });
    } catch {
      // API injoignable : les seuils par défaut restent appliqués.
    }
  },
  setSeisConfig: (cfg) => set({ seisConfig: cfg }),
  setQuakesOn: (v) => set((s) => ({ quakesOn: v, quakeAlert: v ? s.quakeAlert : null })),
  // Changer de filtre repart d'une liste vide : le prochain chargement est traité
  // comme un 1er chargement (pas de fausse alerte sur le changement de périmètre).
  setQuakesFilter: (minmag, region) => set({ quakesMinMag: minmag, quakesRegion: region, quakes: [], quakeAlert: null }),
  dismissQuakeAlert: () => set({ quakeAlert: null }),
  // « Voir sur la carte » : centre (quakeFocus, consommé) + sélectionne pour le
  // bandeau de détail (quakeSelected, persistant) + active la couche séismes.
  focusQuake: (ev) => set((s) => ({ quakeFocus: ev, quakeSelected: ev ?? s.quakeSelected, quakesOn: ev ? true : s.quakesOn })),
  selectQuake: (ev) => set({ quakeSelected: ev }),
});
