// ============================================================================
// lib/store/slices/nrbc.ts — capacité NRBC : substances et panache (ADR 0005)
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type {
  NrbcPlume,
  NrbcSubstance,
  } from "@/lib/types";
import { api } from "@/lib/api";

export interface NrbcSlice {
  // --- capacité NRBC : catalogue de substances + panache carte (ADR 0005) ---
  /** Catalogue des substances chimiques (API /nrbc/substances), chargé au besoin. */
  nrbcSubstances: NrbcSubstance[];
  /** Incident dont le panache est affiché sur la carte ; null = couche éteinte. */
  plumeIncidentId: string | null;
  /** Référentiels sélectionnés — combinables (le premier actif est le « primaire »). */
  plumeModels: { atp45: boolean; erg: boolean };
  /** Enveloppe prudente : toutes les zones remplies (plus de hiérarchie visuelle). */
  plumeEnvelope: boolean;
  /** Échéance affichée : H+0 … H+6 (heures de prévision). */
  plumeHour: number;
  /** Dernier panache reçu de l'API — consommé par MapCanvas et le panneau. */
  plumeData: NrbcPlume | null;
  /**
   * Les 7 échéances PRÉ-CHARGÉES (H+0…H+6) — la lecture animée interpole
   * entre elles. Sans préchargement, chaque pas déclencherait un aller-retour
   * réseau et l'animation saccaderait (lot V1).
   */
  plumeSteps: (NrbcPlume | null)[];
  /** Lecture en cours : le panache défile dans le temps. */
  plumePlaying: boolean;
  /** Rendu volumique : nappe 3D quand la carte est inclinée (lot V2). */
  plume3d: boolean;
  /**
   * Nappe de fumée animée (lot N-4) plutôt que le remplissage géométrique.
   * Le CONTOUR du gabarit reste tracé dans les deux cas : on voit le nuage, et
   * la ligne sur laquelle on pose le barrage.
   */
  plumeSmoke: boolean;
  /**
   * Zone de VIGILANCE affichée (le grand cercle jaune de l'ATP-45).
   *
   * L'ATP-45 la trace quand le vent est trop faible ou trop variable pour
   * désigner un secteur : elle couvre 10 km dans TOUTES les directions. À
   * l'échelle d'une ville elle recouvre tout le reste, et le commandement qui
   * travaille sur la zone d'isolement veut pouvoir la retirer sans perdre le
   * panache. C'est un choix d'AFFICHAGE : le modèle, lui, continue de la
   * calculer, et la retirer de l'écran ne la retire pas de la doctrine.
   */
  plumeVigilance: boolean;
  plumeBusy: boolean;
  // --- capacité NRBC ---
  /** Charge le catalogue de substances une seule fois (idempotent). */
  ensureNrbcSubstances: () => Promise<void>;
  /** Active le panache d'un incident sur la carte et lance son chargement. */
  showPlume: (incidentId: string) => void;
  hidePlume: () => void;
  setPlumeModels: (patch: Partial<{ atp45: boolean; erg: boolean }>) => void;
  setPlumeEnvelope: (v: boolean) => void;
  setPlumeHour: (h: number) => void;
  /** Précharge les 7 échéances pour permettre la lecture animée (V1). */
  loadPlumeSteps: () => Promise<void>;
  /** Démarre / arrête la lecture animée du panache. */
  setPlumePlaying: (v: boolean) => void;
  /** Bascule le rendu volumique (nappe 3D). */
  setPlume3d: (v: boolean) => void;
  setPlumeSmoke: (v: boolean) => void;
  setPlumeVigilance: (v: boolean) => void;
  /** (Re)charge le panache selon l'état courant (incident, modèles, échéance). */
  loadPlume: () => Promise<void>;
}

export const createNrbcSlice: StateCreator<ArgosState, [], [], NrbcSlice> = (set, get) => ({
  nrbcSubstances: [],
  plumeIncidentId: null,
  // Les deux référentiels combinés par défaut : l'opérateur voit d'emblée le
  // gabarit OTAN ET la table substance, puis affine depuis le panneau carte.
  // (Sans substance déclarée, l'API omet l'ERG et la réponse l'indique.)
  plumeModels: { atp45: true, erg: true },
  plumeEnvelope: false,
  plumeHour: 0,
  plumeData: null,
  plumeSteps: [],
  plumePlaying: false,
  plume3d: true,
  plumeSmoke: true,
  plumeVigilance: true,
  plumeBusy: false,
  // --- capacité NRBC (ADR 0005) ---
  ensureNrbcSubstances: async () => {
    if (get().nrbcSubstances.length > 0) return;
    const res = await api.getNrbcSubstances();
    const data = res.data as { substances?: NrbcSubstance[] } | undefined;
    if (data?.substances) set({ nrbcSubstances: data.substances });
  },
  showPlume: (incidentId) => {
    set({ plumeIncidentId: incidentId, plumeData: null, plumeSteps: [], plumePlaying: false, plumeHour: 0 });
    // Le cadrage n'est PAS demandé ici : un panache de quelques kilomètres est
    // invisible à l'échelle nationale, mais c'est MapCanvas qui ajuste la
    // caméra sur l'emprise réelle des zones dès qu'elles arrivent — seul
    // endroit qui connaisse l'état du canevas (voir fitPlumeRef).
    void get().loadPlume();
    // Préchargement en tâche de fond : la lecture animée est prête quand
    // l'opérateur appuie sur ▶, sans l'avoir fait attendre.
    void get().loadPlumeSteps();
  },
  hidePlume: () => set({ plumeIncidentId: null, plumeData: null, plumeSteps: [], plumePlaying: false }),
  setPlumeModels: (patch) => {
    const models = { ...get().plumeModels, ...patch };
    // Toujours au moins un référentiel actif : une couche vide serait lue
    // comme « pas de danger », le contresens qu'on ne peut pas se permettre.
    if (!models.atp45 && !models.erg) return;
    set({ plumeModels: models });
    void get().loadPlume();
  },
  setPlumeEnvelope: (v) => set({ plumeEnvelope: v }),
  setPlumeHour: (h) => {
    set({ plumeHour: Math.max(0, Math.min(6, h)) });
    void get().loadPlume();
  },
  loadPlumeSteps: async () => {
    const { plumeIncidentId, plumeModels } = get();
    if (!plumeIncidentId) return;
    const models = [plumeModels.atp45 ? "atp45" : null, plumeModels.erg ? "erg" : null].filter(Boolean).join(",");
    // Les 7 échéances en parallèle : l'API les sert depuis son cache météo,
    // donc c'est une seule fenêtre d'attente et non sept.
    const res = await Promise.allSettled(
      Array.from({ length: 7 }, (_, h) => api.getNrbcPlume(plumeIncidentId, models, h)),
    );
    const steps = res.map((r) =>
      r.status === "fulfilled" ? ((r.value.data as unknown as NrbcPlume) ?? null) : null,
    );
    // Réponse d'un panache abandonné entre-temps : ignorée.
    if (get().plumeIncidentId === plumeIncidentId) set({ plumeSteps: steps });
  },
  setPlumePlaying: (v) => set({ plumePlaying: v }),
  setPlume3d: (v) => set({ plume3d: v }),
  setPlumeSmoke: (v) => set({ plumeSmoke: v }),
  setPlumeVigilance: (v) => set({ plumeVigilance: v }),
  loadPlume: async () => {
    const { plumeIncidentId, plumeModels, plumeHour } = get();
    if (!plumeIncidentId) return;
    const models = [plumeModels.atp45 ? "atp45" : null, plumeModels.erg ? "erg" : null].filter(Boolean).join(",");
    set({ plumeBusy: true });
    try {
      const res = await api.getNrbcPlume(plumeIncidentId, models, plumeHour);
      const data = res.data as unknown as NrbcPlume | undefined;
      // Réponse d'une requête périmée (l'opérateur a déjà changé d'incident) : ignorée.
      if (data && get().plumeIncidentId === data.incidentId) set({ plumeData: data });
    } finally {
      set({ plumeBusy: false });
    }
  },
});
