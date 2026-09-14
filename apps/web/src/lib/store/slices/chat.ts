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
import { withOpened } from "@/lib/chat";

export interface ChatSlice {
  /** Le dock est déroulé : les têtes des conversations directes sont visibles. */
  chatDockOpen: boolean;
  /** Fenêtres ouvertes (identifiants de canaux directs), la plus récente en tête. */
  chatOpen: string[];
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
  toggleChatDock: () => set((s) => (s.chatDockOpen ? { chatDockOpen: false, chatOpen: [] } : { chatDockOpen: true })),
  openChat: (id, limit = 4) => {
    set((s) => ({ chatDockOpen: true, chatOpen: withOpened(s.chatOpen, id, limit) }));
    get().rtClearUnread(id);
  },
  closeChat: (id) => set((s) => ({ chatOpen: s.chatOpen.filter((x) => x !== id) })),
  closeAllChats: () => set({ chatDockOpen: false, chatOpen: [] }),
  startChatWith: async (matricule, limit) => {
    const id = await get().openDirect(matricule, { select: false });
    get().openChat(id, limit);
  },
});
