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
import { ackNotices, mergeNotice } from "@/lib/notices";
import { directChannels } from "@/lib/chat";
import { applyReceipt, lastForeignId } from "@/lib/comms/receipts";
import { playMessageTone, playNotificationTone } from "@/lib/sound";
import { api } from "@/lib/api";
import {
  rtHandleRef,
  } from "@/lib/store/shared";

/** Un signal de frappe s'éteint seul, passé ce délai sans nouveau signal. */
const TYPING_TTL_MS = 4_000;
/** On ne dit pas « j'écris » à chaque touche : au plus une fois par canal et par deux secondes. */
const TYPING_THROTTLE_MS = 2_000;
// Hors de l'état : des minuteurs et des horodatages, pas de quoi rendre un écran.
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const typingSent = new Map<string, number>();

export interface TypingSignal {
  matricule: string;
  nom: string;
  at: number;
}

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
  /** Qui écrit dans quel canal, à l'instant — un signal qui s'éteint seul. */
  rtTyping: Record<string, TypingSignal>;
  // --- temps réel (lot COMMS) ---
  /** Ouvre le flux. Idempotent : appelée à chaque montage de la coquille. */
  rtConnect: () => void;
  rtDisconnect: () => void;
  /** Marque le canal ouvert à l'écran et solde ses non-lus. */
  rtSetActiveChannel: (id: string | null) => void;
  /** Solde les non-lus d'un canal sans en faire le canal affiché (fenêtre flottante ouverte). */
  rtClearUnread: (id: string) => void;
  rtMarkNoticeSeen: (id: string) => void;
  /** Acquitte une alerte (ou toutes) : côté serveur, pour tous les postes du compte (ADR 0016). */
  rtAckNotice: (id: string | "all") => Promise<void>;
  /** Note (ou éteint, `null`) le signal de frappe d'un canal. */
  rtNoteTyping: (channelId: string, who: { matricule: string; nom: string } | null) => void;
  /** Accuse lecture des messages du correspondant — la conversation directe est sous les yeux. */
  rtMarkRead: (channelId: string) => void;
  /** Dit au correspondant qu'on écrit, sans marteler le serveur. */
  rtSendTyping: (channelId: string) => void;
}

export const createRealtimeSlice: StateCreator<ArgosState, [], [], RealtimeSlice> = (set, get) => ({
  rtOnline: [],
  rtStatus: "closed",
  rtUnread: {},
  rtNotices: [],
  rtNoticesSeen: [],
  rtTyping: {},
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
          if (!message.mine) {
            // Accusé au correspondant : « remis » — « lu » si la conversation est
            // sous les yeux. Et s'il vient de parler, il n'écrit plus.
            if (directe) void api.sendReceipt(d.channelId, sousLesYeux ? "read" : "delivered", message.id);
            get().rtNoteTyping(d.channelId, null);
          }
          return;
        }
        if (e.kind === "receipt") {
          // Le correspondant a reçu, ou lu, mes messages jusqu'à `upToId`.
          const r = e.data as { channelId?: string; by?: string; state?: "delivered" | "read"; upToId?: number };
          if (!r.channelId || !r.by || !r.state || typeof r.upToId !== "number") return;
          const liste = s.comMsgs[r.channelId];
          if (!liste) return;
          const maj = applyReceipt(liste, r.by, r.state, r.upToId);
          if (maj !== liste) set({ comMsgs: { ...s.comMsgs, [r.channelId]: [...maj] } });
          return;
        }
        if (e.kind === "typing") {
          const ty = e.data as { channelId?: string; matricule?: string; nom?: string };
          if (ty.channelId && ty.matricule) get().rtNoteTyping(ty.channelId, { matricule: ty.matricule, nom: ty.nom ?? ty.matricule });
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
    for (const t of typingTimers.values()) clearTimeout(t);
    typingTimers.clear();
    set({ rtStatus: "closed", rtOnline: [], rtTyping: {} });
  },
  rtNoteTyping: (channelId, who) => {
    const en_cours = typingTimers.get(channelId);
    if (en_cours) clearTimeout(en_cours);
    typingTimers.delete(channelId);
    if (!who) {
      set((s) => {
        if (!(channelId in s.rtTyping)) return {};
        const { [channelId]: _fini, ...reste } = s.rtTyping;
        return { rtTyping: reste };
      });
      return;
    }
    set((s) => ({ rtTyping: { ...s.rtTyping, [channelId]: { ...who, at: Date.now() } } }));
    typingTimers.set(channelId, setTimeout(() => get().rtNoteTyping(channelId, null), TYPING_TTL_MS));
  },
  rtMarkRead: (channelId) => {
    const s = get();
    if (!directChannels(s.comCats).some((ch) => ch.id === channelId)) return;
    const jusqua = lastForeignId(s.comMsgs[channelId] ?? []);
    if (jusqua > 0) void api.sendReceipt(channelId, "read", jusqua);
  },
  rtSendTyping: (channelId) => {
    const s = get();
    if (!directChannels(s.comCats).some((ch) => ch.id === channelId)) return;
    const now = Date.now();
    if (now - (typingSent.get(channelId) ?? 0) < TYPING_THROTTLE_MS) return;
    typingSent.set(channelId, now);
    void api.sendTyping(channelId);
  },
  rtMarkNoticeSeen: (id) => set((s) => (s.rtNoticesSeen.includes(id) ? {} : { rtNoticesSeen: [...s.rtNoticesSeen, id] })),
  rtAckNotice: async (id) => {
    set((s) => ({ rtNotices: ackNotices(s.rtNotices, id) }));
    try {
      await api.ackNotice(id);
    } catch {
      /* hors ligne : l'acquittement local tient jusqu'au rechargement */
    }
  },
  rtClearUnread: (id) =>
    set((s) => {
      if (!(id in s.rtUnread)) return {};
      const { [id]: _solde, ...reste } = s.rtUnread;
      return { rtUnread: reste };
    }),
  rtSetActiveChannel: (id) => {
    set((s) => {
      if (!id) return { rtActiveChannel: null };
      const { [id]: _solde, ...reste } = s.rtUnread;
      return { rtActiveChannel: id, rtUnread: reste };
    });
    // Affiché au centre de communication : le correspondant voit « lu ».
    if (id) get().rtMarkRead(id);
  },
});
