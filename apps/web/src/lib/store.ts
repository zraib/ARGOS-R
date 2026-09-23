"use client";

import { create } from "zustand";
import { createSessionSlice, type SessionSlice } from "@/lib/store/slices/session";
import { createUiSlice, type UiSlice } from "@/lib/store/slices/ui";
import { createDomainSlice, type DomainSlice } from "@/lib/store/slices/domain";
import { createSeismicSlice, type SeismicSlice } from "@/lib/store/slices/seismic";
import { createMapSlice, type MapSlice } from "@/lib/store/slices/map";
import { createMissionsSlice, type MissionsSlice } from "@/lib/store/slices/missions";
import { createNrbcSlice, type NrbcSlice } from "@/lib/store/slices/nrbc";
import { createRealtimeSlice, type RealtimeSlice } from "@/lib/store/slices/realtime";
import { createDrawingsSlice, type DrawingsSlice } from "@/lib/store/slices/drawings";
import { createSimulationsSlice, type SimulationsSlice } from "@/lib/store/slices/simulations";
import { createAiSlice, type AiSlice } from "@/lib/store/slices/ai";
import { createAviationSlice, type AviationSlice } from "@/lib/store/slices/aviation";
import { createChatSlice, type ChatSlice } from "@/lib/store/slices/chat";
import { createFloodSlice, type FloodSlice } from "@/lib/store/slices/flood";
import { createFireSlice, type FireSlice } from "@/lib/store/slices/fire";
import { createTrackingSlice, type TrackingSlice } from "@/lib/store/slices/tracking";
import type { Dict } from "@/lib/i18n/translations";
import type { ModulesDict } from "@/lib/i18n/modules";

// Les types publics du magasin vivent dans lib/store/shared.ts ; ré-exportés ici
// pour les importateurs existants.
export type { CommMembers, SessionUser, SessionInit, LayerState, NavGroups, Engagement, AiMessage } from "@/lib/store/shared";
export type { Role } from "@/lib/store/shared";

/**
 * L'état complet : la réunion des tranches. Chaque tranche est un fichier de
 * lib/store/slices/ ; aucune n'importe une autre — elles ne partagent que ce
 * type et lib/store/shared.ts.
 */
export interface ArgosState extends SessionSlice, UiSlice, DomainSlice, SeismicSlice, MapSlice, MissionsSlice, NrbcSlice, RealtimeSlice, AiSlice, AviationSlice, ChatSlice, FloodSlice, FireSlice, TrackingSlice, DrawingsSlice, SimulationsSlice {}

export const useArgos = create<ArgosState>()((...a) => ({
  ...createSessionSlice(...a),
  ...createUiSlice(...a),
  ...createDomainSlice(...a),
  ...createSeismicSlice(...a),
  ...createMapSlice(...a),
  ...createMissionsSlice(...a),
  ...createNrbcSlice(...a),
  ...createRealtimeSlice(...a),
  ...createDrawingsSlice(...a),
  ...createSimulationsSlice(...a),
  ...createAiSlice(...a),
  ...createAviationSlice(...a),
  ...createChatSlice(...a),
  ...createFloodSlice(...a),
  ...createFireSlice(...a),
  ...createTrackingSlice(...a),
}));

/** Hook pratique : dictionnaire courant pour la langue active. */
export function useDict(): Dict {
  return useArgos((s) => s.dict);
}

/** Chaînes des modules pour la langue active (modules opérationnels). */
export function useModules(): ModulesDict {
  return useArgos((s) => s.modulesDict);
}

// Accès console en développement UNIQUEMENT (tests manuels : simuler une
// alerte sismique, inspecter l'état). Jamais exposé en production.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __argos?: typeof useArgos }).__argos = useArgos;
}
