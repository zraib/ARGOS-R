"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import { CHAT_WINDOW_WIDTH, correspondentOf, isOnline } from "@/lib/chat";
import type { Channel, CommMessage } from "@/lib/types";

const AUCUN: CommMessage[] = [];

/**
 * Une fenêtre de conversation directe, posée au-dessus de la rangée des têtes.
 * Elle porte le nom du correspondant et son état de connexion, le fil en
 * bulles, une saisie. Ce n'est qu'une autre vue du canal : le centre de
 * communication montre la même chose, avec les pièces jointes en plus.
 */
export function ChatWindow({
  channel, leaving, offset, bottom, mobile,
}: {
  channel: Channel;
  leaving: boolean;
  /** Décalage depuis le bord de fin (px) — ignoré sur téléphone, où la fenêtre prend la largeur. */
  offset: number;
  /** Hauteur de la rangée des boutons, sous la fenêtre (px). */
  bottom: number;
  mobile: boolean;
}) {
  const t = useDict();
  const router = useRouter();
  const messages = useArgos((s) => s.comMsgs[channel.id]) ?? AUCUN;
  const rtOnline = useArgos((s) => s.rtOnline);
  const sessionUser = useArgos((s) => s.sessionUser);
  const sendMessage = useArgos((s) => s.sendMessage);
  const closeChat = useArgos((s) => s.closeChat);
  const selectChannel = useArgos((s) => s.selectChannel);
  const closeAll = useArgos((s) => s.closeAllChats);
  const [txt, setTxt] = useState("");
  const fil = useRef<HTMLDivElement>(null);
  const saisie = useRef<HTMLInputElement>(null);

  const autre = correspondentOf(channel, sessionUser?.matricule);
  const online = isOnline(autre, rtOnline);

  // Le fil suit le dernier message ; le curseur va dans la saisie à l'ouverture
  // — sauf sur téléphone, où le clavier surgirait sur la moitié de l'écran.
  useEffect(() => {
    const el = fil.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  useEffect(() => {
    if (!mobile && !leaving) saisie.current?.focus();
  }, [mobile, leaving]);

  const envoyer = () => {
    if (!txt.trim()) return;
    sendMessage(txt, channel.id);
    setTxt("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") envoyer();
  };
  const ouvrirCentre = () => {
    selectChannel(channel.id);
    closeAll();
    router.push("/communication");
  };

  const iconBtn =
    "cible-tactile flex shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:min-h-0 lg:min-w-0 lg:p-1.5";

  return (
    <section
      role="dialog"
      aria-label={channel.name}
      className={`fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-rdia-600 dark:bg-rdia-800 ${
        leaving ? "anim-fenetre-out" : "anim-fenetre-in"
      } ${mobile ? "inset-x-2" : ""}`}
      style={{
        bottom,
        width: mobile ? undefined : CHAT_WINDOW_WIDTH,
        insetInlineEnd: mobile ? undefined : offset,
        height: mobile ? "min(520px, 70dvh)" : "min(440px, calc(100dvh - 140px))",
      }}
    >
      {/* En-tête : le correspondant, son état — ÉCRIT, pas seulement coloré. */}
      <div className="flex shrink-0 items-center gap-2.5 bg-rdia-700 px-3 py-2 text-white dark:bg-rdia-900">
        <div className="relative shrink-0">
          <Avatar nom={channel.name} size={32} />
          <span
            aria-hidden="true"
            className={`absolute h-2.5 w-2.5 rounded-full border-2 border-rdia-700 dark:border-rdia-900 ${online ? "bg-green-500" : "bg-gray-400"}`}
            style={{ bottom: -1, insetInlineEnd: -1 }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold">{channel.name}</div>
          <div className={`truncate text-[10.5px] font-semibold ${online ? "text-green-400" : "text-white/50"}`}>
            {online ? t.ch_online : t.ch_offline}
          </div>
        </div>
        <button type="button" onClick={ouvrirCentre} title={t.ch_open_center} aria-label={t.ch_open_center} className={iconBtn}>
          <Icon path={NAV_ICONS.comms} size={16} />
        </button>
        <button
          type="button"
          onClick={() => closeChat(channel.id)}
          title={t.ch_close}
          aria-label={`${t.ch_close} — ${channel.name}`}
          className={iconBtn}
        >
          <Icon path={UI_ICONS.close} size={16} strokeWidth={2.2} />
        </button>
      </div>

      {/* Fil en bulles : les miens à la fin de ligne, en or ; les siens au début. */}
      <div ref={fil} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain bg-gray-50/60 p-3 dark:bg-rdia-900/40">
        {messages.length === 0 && (
          <p className="m-auto px-4 text-center text-[12px] leading-snug text-gray-400 dark:text-rdia-400">
            {tpl(t.ch_start, { nom: channel.name })}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex max-w-[85%] flex-col ${m.mine ? "items-end self-end" : "items-start self-start"}`}>
            <div
              className={`break-words rounded-2xl px-3 py-1.5 text-[13px] leading-snug ${
                m.mine
                  ? "rounded-ee-md bg-or-500 text-rdia-900"
                  : "rounded-es-md bg-white text-gray-800 shadow-sm dark:bg-rdia-700 dark:text-rdia-50"
              }`}
            >
              {m.txt && <span>{m.txt}</span>}
              {m.attachment && (
                <button
                  type="button"
                  onClick={ouvrirCentre}
                  className={`flex items-center gap-1.5 text-[12px] font-semibold underline-offset-2 hover:underline ${m.txt ? "mt-1" : ""}`}
                >
                  <Icon path={UI_ICONS.paperclip} size={13} className="shrink-0" />
                  <span className="truncate">{m.attachment.name}</span>
                </button>
              )}
            </div>
            <span className="mt-0.5 px-1 font-mono text-[9.5px] text-gray-400 dark:text-rdia-400">{m.time}</span>
          </div>
        ))}
      </div>

      {/* Saisie : 16 px sous md (iOS zoome en dessous), bouton de 44 px au doigt. */}
      <div className="flex shrink-0 items-center gap-1.5 border-t border-gray-200 p-2 dark:border-rdia-600">
        <input
          ref={saisie}
          className="input-champ min-w-0 flex-1 text-base md:text-sm"
          placeholder={tpl(t.ch_write, { nom: channel.name })}
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={onKey}
          aria-label={tpl(t.ch_write, { nom: channel.name })}
        />
        <button
          type="button"
          onClick={envoyer}
          disabled={!txt.trim()}
          aria-label={t.send}
          title={t.send}
          className="btn-primaire cible-tactile shrink-0 px-3 text-sm disabled:opacity-40 lg:min-h-0"
        >
          <Icon path={UI_ICONS.send} size={16} strokeWidth={2} />
        </button>
      </div>
    </section>
  );
}
