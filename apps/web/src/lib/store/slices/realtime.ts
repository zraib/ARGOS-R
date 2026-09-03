// ============================================================================
// lib/store/slices/realtime.ts — temps réel (lot COMMS) : liaison, présence, non-lus
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import { openRealtimeStream } from "@/lib/realtime/stream";
import type {
  CommMessage,
  PresenceUser,
  } from "@/lib/types";
import {
  rtHandleRef,
  } from "@/lib/store/shared";

export interface RealtimeSlice {
  // --- temps réel (lot COMMS) ---
  /** Comptes RÉELLEMENT connectés : la présence est la connexion, pas un drapeau. */
  rtOnline: PresenceUser[];
  rtStatus: "connecting" | "open" | "closed";
  /** Non-lus par canal — remis à zéro quand le canal est ouvert à l'écran. */
  rtUnread: Record<string, number>;
  /** Canal actuellement affiché ; ses messages ne comptent jamais comme non lus. */
  rtActiveChannel: string | null;
  // --- temps réel (lot COMMS) ---
  /** Ouvre le flux. Idempotent : appelée à chaque montage de la coquille. */
  rtConnect: () => void;
  rtDisconnect: () => void;
  /** Marque le canal ouvert à l'écran et solde ses non-lus. */
  rtSetActiveChannel: (id: string | null) => void;
}

export const createRealtimeSlice: StateCreator<ArgosState, [], [], RealtimeSlice> = (set, get) => ({
  rtOnline: [],
  rtStatus: "closed",
  rtUnread: {},
  rtActiveChannel: null,
  // --- temps réel (lot COMMS) ------------------------------------------------
  rtConnect: () => {
    // Un seul flux par onglet : rappeler `rtConnect` ne doit pas en ouvrir un
    // second, sinon chaque navigation ajouterait une session fantôme à la
    // liste des présents.
    if (rtHandleRef.current) return;
    rtHandleRef.current = openRealtimeStream(
      (e) => {
        const s = get();
        if (e.kind === "presence") {
          set({ rtOnline: (e.data as { online: PresenceUser[] }).online ?? [] });
          return;
        }
        if (e.kind === "message") {
          const d = e.data as { channelId: string; message: CommMessage };
          if (!d?.channelId || !d.message) return;
          // L'appartenance se décide ICI, sur le MATRICULE de l'auteur : le
          // même message part vers tous les postes, et le nom affiché ne
          // suffit pas à distinguer son auteur.
          const matricule = s.sessionUser?.matricule;
          const message: CommMessage = { ...d.message, mine: !!matricule && d.message.author === matricule };
          const liste = s.comMsgs[d.channelId] ?? [];
          // Le message peut déjà être là : l'auteur l'a inséré à l'envoi et le
          // reçoit ensuite par le flux. Dédoublonner sur l'identifiant évite
          // qu'il s'affiche deux fois.
          if (liste.some((m) => m.id === message.id)) return;
          set({
            comMsgs: { ...s.comMsgs, [d.channelId]: [...liste, message] },
            rtUnread:
              message.mine || d.channelId === s.rtActiveChannel
                ? s.rtUnread
                : { ...s.rtUnread, [d.channelId]: (s.rtUnread[d.channelId] ?? 0) + 1 },
          });
          return;
        }
        if (e.kind === "channel") {
          // La structure a changé sous nos pieds : on la recharge plutôt que de
          // la rejouer à la main, une reconstitution partielle valant pire
          // qu'un aller-retour. Sans les modèles : un canal renommé ne change
          // rien au risque ni à la situation.
          void get().loadDomain({ ai: false });
        }
      },
      (rtStatus) => set({ rtStatus }),
    );
  },
  rtDisconnect: () => {
    rtHandleRef.current?.close();
    rtHandleRef.current = null;
    set({ rtStatus: "closed", rtOnline: [] });
  },
  rtSetActiveChannel: (id) =>
    set((s) => {
      if (!id) return { rtActiveChannel: null };
      const { [id]: _solde, ...reste } = s.rtUnread;
      return { rtActiveChannel: id, rtUnread: reste };
    }),
});
