"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import {
  CHAT_MARGIN_SM,
  CHAT_MARGIN_XS,
  CHAT_MOBILE_MAX,
  CHAT_WINDOWS_END_SM,
  CHAT_WINDOWS_END_XS,
  correspondentOf,
  directChannels,
  isOnline,
  maxOpenWindows,
  orderConversations,
  unreadDirect,
  windowOffset,
} from "@/lib/chat";
import { ChatHead } from "@/components/shell/chat/ChatHead";
import { ChatWindow } from "@/components/shell/chat/ChatWindow";
import { NewChatPopover } from "@/components/shell/chat/NewChatPopover";
import { useExitList } from "@/components/shell/chat/useExitList";
import { useViewportWidth } from "@/components/shell/chat/useViewportWidth";

// ============================================================================
// ARGOS — conversations à chaud : le dock flottant, façon messagerie instantanée
//
// Un bouton à côté du Copilot. Au clic, les têtes des conversations directes
// se déroulent à l'horizontale, vers le bord de départ ; une tête ouvre sa
// fenêtre au-dessus de la rangée ; un clic hors du dock, ou Échap, replie tout
// — chaque mouvement animé, et coupé si l'opérateur réduit les animations.
//
// RIEN NE SE RECOUVRE. La rangée occupe la hauteur du bouton flottant, sous
// les commandes natives de la carte (remontées de 88 px au bureau) ; les
// fenêtres montent depuis la rangée, à partir de la colonne des boutons, et
// jamais plus que ce que la largeur permet sans atteindre la réserve du bord
// de départ (mesure, coordonnées). Sur téléphone : une fenêtre, pleine largeur,
// et les têtes défilent. Le centre de communication n'affiche pas le dock : il
// montre déjà tout.
// ============================================================================

/** Durée de l'animation de sortie (voir globals.css) — le temps de garder l'élément rendu. */
const EXIT_MS = 200;
/** Échelonnement des têtes depuis le bouton. */
const STAGGER_MS = 35;

export function ChatDock({ besideCopilot }: { besideCopilot: boolean }) {
  const t = useDict();
  const pathname = usePathname();
  const comCats = useArgos((s) => s.comCats);
  const comMsgs = useArgos((s) => s.comMsgs);
  const rtUnread = useArgos((s) => s.rtUnread);
  const rtOnline = useArgos((s) => s.rtOnline);
  const sessionUser = useArgos((s) => s.sessionUser);
  const dockOpen = useArgos((s) => s.chatDockOpen);
  const open = useArgos((s) => s.chatOpen);
  const toggleDock = useArgos((s) => s.toggleChatDock);
  const openChat = useArgos((s) => s.openChat);
  const closeAll = useArgos((s) => s.closeAllChats);
  const width = useViewportWidth();
  const [nouveau, setNouveau] = useState(false);
  const zone = useRef<HTMLDivElement>(null);

  const chans = useMemo(() => directChannels(comCats), [comCats]);
  const ordonnees = useMemo(() => orderConversations(chans, comMsgs, open), [chans, comMsgs, open]);
  const nonLus = unreadDirect(chans, rtUnread);
  const mobile = width < CHAT_MOBILE_MAX;
  const limite = maxOpenWindows(width, besideCopilot);
  // Une fenêtre ouverte sur un canal qui a disparu (canal supprimé) ne se rend pas.
  const fenetres = useMemo(() => open.filter((id) => chans.some((c) => c.id === id)).slice(0, limite), [open, chans, limite]);

  // Clic hors du dock, ou Échap : tout se replie — têtes, fenêtres, sélecteur.
  const actif = dockOpen || open.length > 0 || nouveau;
  useEffect(() => {
    if (!actif) return;
    const dehors = (e: PointerEvent) => {
      if (!zone.current?.contains(e.target as Node)) {
        closeAll();
        setNouveau(false);
      }
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeAll();
        setNouveau(false);
      }
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [actif, closeAll]);

  const tetes = useExitList(dockOpen ? ordonnees.map((c) => c.id) : [], EXIT_MS);
  // Sur téléphone, le sélecteur prend la place de la fenêtre : un seul panneau à la fois.
  const rendues = useExitList(mobile && nouveau ? [] : fenetres, EXIT_MS);

  // Le centre de communication montre déjà tout : pas de dock par-dessus.
  if (pathname === "/communication") return null;

  const bas = mobile ? CHAT_WINDOWS_END_XS : CHAT_WINDOWS_END_SM;
  const boutonEnd = besideCopilot ? "end-[5.25rem] sm:end-[5.75rem]" : "end-4 sm:end-6";
  const marge = mobile ? CHAT_MARGIN_XS : CHAT_MARGIN_SM;
  const canal = (id: string) => chans.find((c) => c.id === id);
  const libelle = nonLus > 0 ? `${t.ch_open} — ${nonLus} ${nonLus > 1 ? t.notif_unread_many : t.notif_unread_one}` : t.ch_open;
  // Les têtes s'alignent depuis le bouton : la plus récente (rang 0) est la
  // plus proche de lui, donc la DERNIÈRE de la rangée ; l'échelonnement part
  // d'elle. En RTL la rangée se renverse d'elle-même.
  const teteRendues = [...tetes].reverse();
  const caches = Math.max(0, ordonnees.length - tetes.filter((h) => !h.leaving).length);

  return (
    <div ref={zone} data-chat-dock>
      <div
        className={`fixed bottom-4 z-40 flex items-center gap-2 sm:bottom-6 ${boutonEnd}`}
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Rangée des têtes : défilable quand elles ne tiennent pas (téléphone). */}
        {(tetes.length > 0 || dockOpen) && (
          <div
            className="flex max-w-[calc(100vw-10rem)] items-center gap-2 overflow-x-auto px-1 py-2 sm:max-w-[min(60vw,640px)]"
            style={{ scrollbarWidth: "none" }}
          >
            {dockOpen && (
              <button
                type="button"
                onClick={() => setNouveau((v) => !v)}
                title={t.ch_new}
                aria-label={t.ch_new}
                aria-expanded={nouveau}
                className={`anim-tete-in flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-colors ${
                  nouveau
                    ? "border-or-500 bg-or-500/15 text-or-500"
                    : "border-gray-300 bg-white/90 text-gray-500 hover:border-or-500 hover:text-or-500 dark:border-rdia-500 dark:bg-rdia-800/90 dark:text-rdia-200"
                }`}
                style={{ animationDelay: `${tetes.length * STAGGER_MS}ms` }}
              >
                <Icon path={UI_ICONS.plus} size={18} strokeWidth={2.2} />
              </button>
            )}
            {caches > 0 && dockOpen && <span className="sr-only">{tpl(t.ch_more, { n: caches })}</span>}
            {teteRendues.map((h, i) => {
              const ch = canal(h.id);
              if (!ch) return null;
              // Rang depuis le bouton : la dernière de la rangée est la plus proche.
              const rang = teteRendues.length - 1 - i;
              return (
                <ChatHead
                  key={h.id}
                  name={ch.name}
                  online={isOnline(correspondentOf(ch, sessionUser?.matricule), rtOnline)}
                  unread={rtUnread[h.id] ?? 0}
                  active={open.includes(h.id)}
                  leaving={h.leaving}
                  delayMs={h.leaving ? 0 : rang * STAGGER_MS}
                  onClick={() => {
                    setNouveau(false);
                    openChat(h.id, limite);
                  }}
                />
              );
            })}
            {dockOpen && ordonnees.length === 0 && (
              <span className="anim-tete-in max-w-[200px] rounded-lg bg-rdia-800 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-white shadow-lg dark:bg-rdia-700">
                {t.ch_none}
              </span>
            )}
          </div>
        )}

        {/* Le bouton : même gabarit que celui du Copilot, couleur de marque
            (vert rdia) pour ne pas se confondre avec l'or de l'assistant. */}
        <button
          type="button"
          onClick={() => {
            setNouveau(false);
            toggleDock();
          }}
          aria-label={libelle}
          title={libelle}
          aria-expanded={dockOpen}
          className="group relative shrink-0"
        >
          <span className="absolute -inset-1 rounded-full bg-rdia-500 opacity-25 blur transition-opacity duration-300 group-hover:opacity-50" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-rdia-600 text-white shadow-2xl shadow-rdia-600/40 ring-4 ring-white transition-transform duration-200 group-hover:scale-110 active:scale-95 dark:bg-rdia-500 dark:ring-rdia-800">
            <Icon path={dockOpen ? UI_ICONS.close : NAV_ICONS.comms} size={dockOpen ? 26 : 30} strokeWidth={2} />
            {nonLus > 0 && !dockOpen && (
              <span className="absolute -end-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-danger-500 px-1 font-mono text-[10px] font-bold text-white dark:border-rdia-800">
                {nonLus > 99 ? "99+" : nonLus}
              </span>
            )}
          </span>
          {/* Bulle d'aide au-dessus du bouton (pas à côté : le Copilot y est). */}
          <span className="pointer-events-none absolute bottom-full end-0 mb-2 hidden whitespace-nowrap rounded-lg bg-rdia-800 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 sm:block dark:bg-rdia-700">
            {t.ch_title}
          </span>
        </button>
      </div>

      {rendues.map((w, i) => {
        const ch = canal(w.id);
        return ch ? (
          <ChatWindow
            key={w.id}
            channel={ch}
            leaving={w.leaving}
            offset={windowOffset(i, width, besideCopilot)}
            bottom={bas}
            mobile={mobile}
          />
        ) : null;
      })}

      {nouveau && (
        <NewChatPopover
          offset={mobile ? marge : windowOffset(fenetres.length, width, besideCopilot)}
          bottom={bas}
          mobile={mobile}
          limit={limite}
          onClose={() => setNouveau(false)}
        />
      )}
    </div>
  );
}
