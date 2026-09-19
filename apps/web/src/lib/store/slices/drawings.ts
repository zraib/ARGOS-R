// ============================================================================
// lib/store/slices/drawings.ts — les croquis dessinés sur la carte (mode dessin)
//
// Tranche du magasin Zustand. Les croquis viennent de l'API (`/drawings`) et
// s'y écrivent ; le temps réel (`drawings`) fait relire tout le monde. L'outil
// en cours (point, cercle, polygone, sélection) et le croquis sélectionné sont
// l'état de l'écran, pas du domaine.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import { api } from "@/lib/api";
import type { Drawing, DrawingKind } from "@/lib/types";
import type { CreateDrawingBody, UpdateDrawingBody } from "@/lib/api-client";

export type DrawTool = DrawingKind | "select";

export interface DrawingsSlice {
  drawings: Drawing[];
  /** L'outil armé ; `null` : le mode dessin est fermé. */
  drawTool: DrawTool | null;
  drawSelected: string | null;
  loadDrawings: () => Promise<void>;
  setDrawTool: (tool: DrawTool | null) => void;
  selectDrawing: (id: string | null) => void;
  createDrawing: (body: CreateDrawingBody) => Promise<Drawing | null>;
  updateDrawing: (id: string, body: UpdateDrawingBody) => Promise<boolean>;
  deleteDrawing: (id: string) => Promise<boolean>;
}

// Les modifications d'un même croquis sont regroupées : un nom se tape lettre à
// lettre, une poignée se traîne — une requête par geste, pas par événement.
const pending = new Map<string, { body: UpdateDrawingBody; timer: ReturnType<typeof setTimeout>; resolvers: ((ok: boolean) => void)[] }>();
const DEBOUNCE_MS = 350;

export const createDrawingsSlice: StateCreator<ArgosState, [], [], DrawingsSlice> = (set, get) => ({
  drawings: [],
  drawTool: null,
  drawSelected: null,
  loadDrawings: async () => {
    const res = (await api.getDrawings()) as { data?: unknown };
    if (Array.isArray(res.data)) set({ drawings: res.data as Drawing[] });
  },
  setDrawTool: (tool) => set({ drawTool: tool, ...(tool === null ? { drawSelected: null } : {}) }),
  selectDrawing: (id) => set({ drawSelected: id }),
  createDrawing: async (body) => {
    // Le client généré ne type pas la réponse de cette route : on la lit telle quelle.
    const res = (await api.createDrawing(body)) as { error?: unknown; data?: unknown };
    if (res.error || !res.data) {
      get().showToast(get().dict.toast_fail);
      return null;
    }
    const d = res.data as Drawing;
    // Le croquis s'affiche tout de suite ; le temps réel confirmera.
    set((s) => ({ drawings: s.drawings.some((x) => x.id === d.id) ? s.drawings : [...s.drawings, d], drawSelected: d.id }));
    return d;
  },
  updateDrawing: (id, body) => {
    // Optimiste : la forme suit la main tout de suite ; l'API confirme (ou le temps réel rétablit).
    set((s) => ({ drawings: s.drawings.map((d) => (d.id === id ? { ...d, ...(body as Partial<Drawing>) } : d)) }));
    return new Promise<boolean>((resolve) => {
      const prev = pending.get(id);
      if (prev) clearTimeout(prev.timer);
      const merged = { ...(prev?.body ?? {}), ...body };
      const resolvers = [...(prev?.resolvers ?? []), resolve];
      const timer = setTimeout(async () => {
        pending.delete(id);
        const res = await api.updateDrawing(id, merged);
        if (res.error) {
          get().showToast(get().dict.toast_fail);
          void get().loadDrawings();
        }
        for (const r of resolvers) r(!res.error);
      }, DEBOUNCE_MS);
      pending.set(id, { body: merged, timer, resolvers });
    });
  },
  deleteDrawing: async (id) => {
    const res = await api.deleteDrawing(id);
    if (res.error) {
      get().showToast(get().dict.toast_fail);
      return false;
    }
    set((s) => ({ drawings: s.drawings.filter((d) => d.id !== id), drawSelected: s.drawSelected === id ? null : s.drawSelected }));
    return true;
  },
});
