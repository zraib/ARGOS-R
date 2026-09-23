// ============================================================================
// lib/store/slices/simulations.ts — les simulations PARTAGÉES (ADR 0029)
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
//
// « Si quelqu'un effectue une simulation sur la carte, tout le monde doit la
// voir — sauf si elle est supprimée. » Ce qui circule est le SCÉNARIO (nature,
// point de départ, réglages) : chaque poste le REJOUE sur son propre relief et
// obtient le même front. Rien d'autre ne transite — une image de crue pèse des
// dizaines de mégaoctets, un scénario quelques centaines d'octets, et une
// station hors ligne s'en accommode.
//
// Adoption : à l'arrivée d'une simulation d'un AUTRE poste, celui-ci la rejoue
// — sauf s'il est en train d'en calculer une lui-même (on ne lui coupe pas son
// travail sous les doigts) ; la liste du panneau lui permet alors de la
// reprendre quand il veut. Retirée par son auteur (ou le Super Administrateur),
// elle disparaît de toutes les cartes, calcul compris.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import { api } from "@/lib/api";
import type { FireSimParams } from "@/lib/store/slices/fire";
import type { FloodSimParams } from "@/lib/store/slices/flood";

/** Une simulation partagée, telle que l'API la sert. */
export interface SharedSimulation {
  id: string;
  kind: "fire" | "flood";
  label: string;
  seed: [number, number];
  params: Record<string, unknown>;
  incidentId?: string;
  createdBy: string;
  createdAt: string;
}

export interface SimulationsSlice {
  /** Les simulations publiées, toutes natures confondues. */
  sharedSims: SharedSimulation[];
  /** Celle que ce poste rejoue en ce moment, par nature — pour ne pas la relancer en boucle. */
  adoptedSim: { fire: string | null; flood: string | null };
  simShareBusy: boolean;
  loadSimulations: () => Promise<void>;
  /** Publie la simulation en cours (nature donnée) : tous les postes la rejouent. */
  shareSimulation: (kind: "fire" | "flood", label: string) => Promise<void>;
  /** Retire une simulation partagée — son auteur ou le Super Administrateur. */
  removeSharedSimulation: (id: string) => Promise<void>;
  /** Rejoue une simulation partagée sur ce poste (reprend ses réglages et lance le calcul). */
  adoptSimulation: (id: string) => Promise<void>;
  /** Rejoue ce qui vient d'arriver, quand ce poste n'a rien en cours. */
  syncSharedSimulations: () => void;
}

export const createSimulationsSlice: StateCreator<ArgosState, [], [], SimulationsSlice> = (set, get) => ({
  sharedSims: [],
  adoptedSim: { fire: null, flood: null },
  simShareBusy: false,

  loadSimulations: async () => {
    const res = (await api.getSimulations()) as { data?: unknown };
    if (Array.isArray(res.data)) {
      set({ sharedSims: res.data as SharedSimulation[] });
      get().syncSharedSimulations();
    }
  },

  shareSimulation: async (kind, label) => {
    const s = get();
    const seed = kind === "fire" ? s.fireSeed : s.floodSeed;
    if (!seed || s.simShareBusy) return;
    set({ simShareBusy: true });
    try {
      const params = kind === "fire" ? s.fireParams : s.floodParams;
      const res = (await api.publishSimulation({
        kind,
        label: label.trim() || (kind === "fire" ? s.dict.fire_sim : s.dict.flood_sim),
        seed,
        // `params` est un objet libre côté API ; le générateur le rend en `Record<string, never>`.
        params: params as unknown as Record<string, never>,
      })) as { error?: unknown; data?: unknown };
      if (res.error) {
        s.showToast(`${s.dict.toast_fail} — ${s.dict.sim_share_failed}`);
        return;
      }
      const sim = res.data as SharedSimulation | undefined;
      // La sienne est déjà calculée : on la marque adoptée pour ne pas la rejouer.
      if (sim) set((st) => ({ sharedSims: [...st.sharedSims.filter((x) => x.id !== sim.id), sim], adoptedSim: { ...st.adoptedSim, [kind]: sim.id } }));
      s.showToast(s.dict.sim_shared);
    } finally {
      set({ simShareBusy: false });
    }
  },

  removeSharedSimulation: async (id) => {
    const s = get();
    const sim = s.sharedSims.find((x) => x.id === id);
    const res = (await api.deleteSimulation(id)) as { error?: unknown };
    if (res.error) {
      s.showToast(`${s.dict.toast_fail} — ${s.dict.sim_remove_denied}`);
      return;
    }
    set((st) => ({ sharedSims: st.sharedSims.filter((x) => x.id !== id) }));
    // Ce poste la rejouait : `syncSharedSimulations` arrête le calcul et vide la carte.
    if (sim) get().syncSharedSimulations();
    s.showToast(s.dict.sim_removed);
  },

  adoptSimulation: async (id) => {
    const s = get();
    const sim = s.sharedSims.find((x) => x.id === id);
    if (!sim) return;
    set((st) => ({ adoptedSim: { ...st.adoptedSim, [sim.kind]: sim.id } }));
    if (sim.kind === "fire") {
      s.setFireSeed(sim.seed);
      s.setFireParams(sim.params as Partial<FireSimParams>);
      await get().runFireSim();
    } else {
      s.setFloodSeed(sim.seed);
      s.setFloodParams(sim.params as Partial<FloodSimParams>);
      await get().runFloodSim();
    }
  },

  /**
   * Rejoue ce qui vient d'arriver : la simulation la plus récente de chaque
   * nature, quand ce poste n'en calcule pas déjà une et ne l'a pas déjà
   * adoptée. Celle qu'on a publiée soi-même est déjà à l'écran.
   */
  syncSharedSimulations: () => {
    const s = get();
    for (const kind of ["fire", "flood"] as const) {
      // Retirée — par son auteur, depuis n'importe quel poste — elle disparaît
      // d'ICI aussi : la liste ne la porte plus, le calcul s'efface.
      const adoptee = s.adoptedSim[kind];
      if (adoptee && !s.sharedSims.some((x) => x.id === adoptee)) {
        set((st) => ({ adoptedSim: { ...st.adoptedSim, [kind]: null } }));
        if (kind === "fire") get().clearFireSim();
        else get().clearFloodSim();
        continue;
      }
      const derniere = [...s.sharedSims].filter((x) => x.kind === kind).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop();
      if (!derniere) continue;
      if (s.adoptedSim[kind] === derniere.id) continue;
      const occupe = kind === "fire" ? s.fireSimBusy || s.fireSim !== null : s.floodSimBusy || s.floodSim !== null;
      if (occupe) continue;
      void get().adoptSimulation(derniere.id);
    }
  },
});
