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
  Notice,
  PresenceUser,
  } from "@/lib/types";
import { mergeNotice } from "@/lib/notices";
import { directChannels } from "@/lib/chat";
import { playMessageTone, playNotificationTone } from "@/lib/sound";
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
  /** Alertes adressées au compte (incident déclaré dans sa région…), la plus récente d'abord. */
  rtNotices: Notice[];
  /** Identifiants des alertes déjà ouvertes — le compte de la cloche ne les recompte pas. */
  rtNoticesSeen: string[];
  // --- temps réel (lot COMMS) ---
  /** Ouvre le flux. Idempotent : appelée à chaque montage de la coquille. */
  rtConnect: () => void;
  rtDisconnect: () => void;
  /** Marque le canal ouvert à l'écran et solde ses non-lus. */
  rtSetActiveChannel: (id: string | null) => void;
  /** Solde les non-lus d'un canal sans en faire le canal affiché (fenêtre flottante ouverte). */
  rtClearUnread: (id: string) => void;
  rtMarkNoticeSeen: (id: string) => void;
}

export const createRealtimeSlice: StateCreator<ArgosState, [], [], RealtimeSlice> = (set, get) => ({
  rtOnline: [],
  rtStatus: "closed",
  rtUnread: {},
  rtNotices: [],
  rtNoticesSeen: [],
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
          // Un canal se lit à deux endroits : le centre de communication, et
          // une fenêtre flottante. Ni l'un ni l'autre ne compte de non-lu.
          const sousLesYeux = d.channelId === s.rtActiveChannel || s.chatOpen.includes(d.channelId);
          const directe = directChannels(s.comCats).some((ch) => ch.id === d.channelId);
          set({
            comMsgs: { ...s.comMsgs, [d.channelId]: [...liste, message] },
            rtUnread:
              message.mine || sousLesYeux
                ? s.rtUnread
                : { ...s.rtUnread, [d.channelId]: (s.rtUnread[d.channelId] ?? 0) + 1 },
            // Une conversation directe qui reçoit se signale d'elle-même : ses
            // têtes se déroulent, la fenêtre reste à ouvrir — elle ne saute pas
            // sur la carte au milieu d'un geste.
            chatDockOpen: s.chatDockOpen || (directe && !message.mine),
          });
          if (!message.mine && s.sounds.messages) playMessageTone();
          return;
        }
        if (e.kind === "notice") {
          // Une alerte adressée : gardée, dite à voix haute — d'une signature
          // sonore DISTINCTE de celle des messages — et, pour un incident, le
          // domaine est rechargé : il doit être sur la carte avant que
          // l'opérateur n'y aille.
          const n = (e.data as { notice?: Notice }).notice;
          if (!n?.id) return;
          set({ rtNotices: mergeNotice(s.rtNotices, n) });
          if (n.kind === "incident_declared") {
            s.showToast(`${s.dict.notif_incident_declared} — ${n.titre}`);
            void get().loadDomain({ ai: false });
          } else {
            s.showToast(`${s.dict.notif_reset_requested} — ${n.nom} (${n.matricule})`);
          }
          if (s.sounds.alerts) playNotificationTone();
          return;
        }
        if (e.kind === "posts") {
          // Un poste a bougé quelque part : on relit ceux qu'on a le droit de voir.
          void get().loadPosts();
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
  rtMarkNoticeSeen: (id) => set((s) => (s.rtNoticesSeen.includes(id) ? {} : { rtNoticesSeen: [...s.rtNoticesSeen, id] })),
  rtClearUnread: (id) =>
    set((s) => {
      if (!(id in s.rtUnread)) return {};
      const { [id]: _solde, ...reste } = s.rtUnread;
      return { rtUnread: reste };
    }),
  rtSetActiveChannel: (id) =>
    set((s) => {
      if (!id) return { rtActiveChannel: null };
      const { [id]: _solde, ...reste } = s.rtUnread;
      return { rtActiveChannel: id, rtUnread: reste };
    }),
});
