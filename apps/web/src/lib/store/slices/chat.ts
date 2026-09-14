// ============================================================================
// lib/store/slices/chat.ts — conversations flottantes (têtes et fenêtres)
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
//
// Ce qui vit ici est l'état d'AFFICHAGE des conversations « à chaud » : le dock
// est-il déroulé, quelles fenêtres sont ouvertes. Les conversations elles-mêmes
// (canaux directs, messages, non-lus) restent dans les tranches domaine et
// temps réel — une fenêtre n'est qu'une autre vue d'un canal.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import { maxOpenWindows, withOpened } from "@/lib/chat";

export interface ChatSlice {
  /** Le dock est déroulé : les têtes des conversations directes sont visibles. */
  chatDockOpen: boolean;
  /** Fenêtres ouvertes (identifiants de canaux directs), la plus récente en tête. */
  chatOpen: string[];
  /**
   * Réserve au bord de fin (px), posée par l'écran affiché : la carte y garde
   * sa colonne de droite. Zéro partout ailleurs. Ne vaut qu'au bureau.
   */
  chatEndReserve: number;
  setChatEndReserve: (px: number) => void;
  toggleChatDock: () => void;
  /**
   * Ouvre la fenêtre d'une conversation, en tête, et ne garde que `limit`
   * fenêtres : ce que la largeur de l'écran permet sans rien recouvrir. Ses
   * non-lus sont soldés — on l'a sous les yeux.
   */
  openChat: (id: string, limit?: number) => void;
  closeChat: (id: string) => void;
  /** Clic à l'extérieur, Échap : tout se replie, têtes et fenêtres. */
  closeAllChats: () => void;
  /** Ouvre (ou retrouve) la conversation directe avec un compte, puis sa fenêtre. */
  startChatWith: (matricule: string, limit?: number) => Promise<void>;
}

export const createChatSlice: StateCreator<ArgosState, [], [], ChatSlice> = (set, get) => ({
  chatDockOpen: false,
  chatOpen: [],
  chatEndReserve: 0,
  setChatEndReserve: (px) => set((s) => (s.chatEndReserve === px ? {} : { chatEndReserve: px })),
  toggleChatDock: () => set((s) => (s.chatDockOpen ? { chatDockOpen: false, chatOpen: [] } : { chatDockOpen: true })),
  openChat: (id, limit) => {
    // Sans limite fournie (fiche d'unité, panneau de la carte), elle se lit
    // sur la largeur du moment, comme le dock le fait pour lui-même.
    const s0 = get();
    const largeur = typeof window === "undefined" ? 1280 : window.innerWidth;
    const bornee = limit ?? maxOpenWindows(largeur, s0.flags["assistant"] !== false, s0.chatEndReserve);
    set((s) => ({ chatDockOpen: true, chatOpen: withOpened(s.chatOpen, id, bornee) }));
    get().rtClearUnread(id);
  },
  closeChat: (id) => set((s) => ({ chatOpen: s.chatOpen.filter((x) => x !== id) })),
  closeAllChats: () => set({ chatDockOpen: false, chatOpen: [] }),
  startChatWith: async (matricule, limit) => {
    const id = await get().openDirect(matricule, { select: false });
    get().openChat(id, limit);
  },
});
