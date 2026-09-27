// ============================================================================
// lib/store/slices/routing.ts — l'outil d'itinéraire de la carte (ADR 0039)
//
// Tranche du magasin Zustand. Les étapes cliquées sur la carte, les options
// (véhicule ou à pied, obstacles, zones NRBC) et le dernier plan rendu par
// l'API. La carte y pose les étapes et dessine le plan ; le panneau d'itinéraire
// l'affiche et le règle ; le menu contextuel y part « d'ici ».
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type { RoutePlan } from "@/lib/types";
import { DEFAULT_PLAN_OPTIONS, planRoute, type PlanOptions } from "@/lib/map/routing";

type LL = [number, number];

/** Au plus 10 étapes : ce qu'accepte l'API. */
const MAX_PTS = 10;

export interface RoutingSlice {
  /** L'outil est armé : un clic sur la carte ajoute une étape. */
  routeOn: boolean;
  routePts: LL[];
  routeOptions: PlanOptions;
  routePlan: RoutePlan | null;
  routeBusy: boolean;
  setRouteOn: (on: boolean) => void;
  addRoutePt: (ll: LL) => void;
  moveRoutePt: (i: number, d: -1 | 1) => void;
  removeRoutePt: (i: number) => void;
  /** Remplace les étapes (« itinéraire depuis ici ») et arme l'outil. */
  setRoutePts: (pts: LL[]) => void;
  clearRoute: () => void;
  setRouteOptions: (patch: Partial<PlanOptions>) => void;
  /** (Re)calcule le plan des étapes et options courantes ; une réponse périmée est ignorée. */
  computeRoute: () => Promise<void>;
}

/** Numéro de la dernière demande : une réponse plus ancienne n'écrase pas une plus récente. */
let demande = 0;

export const createRoutingSlice: StateCreator<ArgosState, [], [], RoutingSlice> = (set, get) => ({
  routeOn: false,
  routePts: [],
  routeOptions: DEFAULT_PLAN_OPTIONS,
  routePlan: null,
  routeBusy: false,
  setRouteOn: (on) => set({ routeOn: on }),
  addRoutePt: (ll) => {
    if (get().routePts.length >= MAX_PTS) return;
    set((s) => ({ routePts: [...s.routePts, ll] }));
    void get().computeRoute();
  },
  moveRoutePt: (i, d) => {
    const pts = [...get().routePts];
    const j = i + d;
    if (j < 0 || j >= pts.length) return;
    [pts[i], pts[j]] = [pts[j], pts[i]];
    set({ routePts: pts });
    void get().computeRoute();
  },
  removeRoutePt: (i) => {
    set((s) => ({ routePts: s.routePts.filter((_, k) => k !== i) }));
    void get().computeRoute();
  },
  setRoutePts: (pts) => {
    set({ routePts: pts.slice(0, MAX_PTS), routeOn: true });
    void get().computeRoute();
  },
  clearRoute: () => {
    demande++;
    set({ routePts: [], routePlan: null, routeBusy: false });
  },
  setRouteOptions: (patch) => {
    set((s) => ({ routeOptions: { ...s.routeOptions, ...patch } }));
    void get().computeRoute();
  },
  computeRoute: async () => {
    const n = ++demande;
    const { routePts, routeOptions } = get();
    if (routePts.length === 0) {
      set({ routePlan: null, routeBusy: false });
      return;
    }
    set({ routeBusy: true });
    const plan = await planRoute(routePts, routeOptions);
    if (n === demande) set({ routePlan: plan, routeBusy: false });
  },
});
