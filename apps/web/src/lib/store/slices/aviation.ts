// ============================================================================
// lib/store/slices/aviation.ts — suivi aérien : aéronefs inscrits et positions
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type {
  AircraftRole,
  TrackedAircraftState,
  } from "@/lib/types";
import { api } from "@/lib/api";

export interface AviationSlice {
  /** Recharge les séismes (EMSC) et détecte les nouveaux (→ alerte). */
  // --- suivi aérien : aéronefs inscrits + positions ---
  /** Aéronefs inscrits, enrichis de leur position quand le flux les voit. */
  aircraft: TrackedAircraftState[];
  /** Fournisseur de positions en service (« OpenSky Network », « Exercice… »). */
  aircraftFeed: string;
  /** Vrai pendant une inscription/suppression, pour désarmer les boutons. */
  aircraftBusy: boolean;
  /** Dernière erreur de saisie, affichée sous le formulaire ; null = aucune. */
  aircraftError: string | null;
  loadAircraft: () => Promise<void>;
  addAircraft: (input: { code: string; label: string; role: AircraftRole }) => Promise<boolean>;
  removeAircraft: (id: string) => Promise<void>;
}

export const createAviationSlice: StateCreator<ArgosState, [], [], AviationSlice> = (set, get) => ({
  // Recharge les séismes depuis l'API (proxy EMSC) et détecte les nouveaux
  // événements pour déclencher l'alerte globale (hors 1er chargement / couche off).
  aircraft: [],
  aircraftFeed: "",
  aircraftBusy: false,
  aircraftError: null,
  /**
   * Recharge la liste et les positions. L'API ne renvoie que les aéronefs
   * inscrits : le trafic aérien non désigné n'atteint jamais le navigateur.
   */
  loadAircraft: async () => {
    const res = await api.getAircraftStates();
    const data = res.data as
      | {
          feed?: string;
          feedHealth?: { available: boolean; reason?: string; retryAt?: string } | null;
          aircraft?: TrackedAircraftState[];
        }
      | undefined;
    if (!data) return;
    // Une liste vide se lit « aucun appareil dans l'emprise » ; ce peut être
    // « le fournisseur nous a refusés ». Deux situations opposées pour un
    // état-major — on remonte donc l'indisponibilité au lieu de la taire.
    const sante = data.feedHealth;
    set({
      aircraft: data.aircraft ?? [],
      aircraftFeed: data.feed ?? "",
      aircraftError: sante && !sante.available ? (sante.reason ?? "indisponible") : null,
    });
  },
  /** Inscrit un aéronef. Retourne `false` et publie le motif si l'API refuse. */
  addAircraft: async (input) => {
    set({ aircraftBusy: true, aircraftError: null });
    try {
      const res = await api.addAircraft(input);
      if (res.error) {
        const msg = (res.error as { message?: string | string[] } | undefined)?.message;
        set({ aircraftError: Array.isArray(msg) ? msg.join(" ") : (msg ?? "Inscription refusée.") });
        return false;
      }
      await get().loadAircraft();
      return true;
    } finally {
      set({ aircraftBusy: false });
    }
  },
  /** Retire un aéronef du suivi (archivage : geste réversible, non destructif). */
  removeAircraft: async (id) => {
    set({ aircraftBusy: true });
    try {
      await api.archiveAircraft(id);
      await get().loadAircraft();
    } finally {
      set({ aircraftBusy: false });
    }
  },
});
