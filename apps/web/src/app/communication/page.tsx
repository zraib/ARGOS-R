"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { Channel } from "@/lib/types";

export default function CommunicationPage() {
  const t = useDict();
  const comCats = useArgos((s) => s.comCats);
  const comMembers = useArgos((s) => s.comMembers);
  const comMsgs = useArgos((s) => s.comMsgs);
  const comSel = useArgos((s) => s.comSel);
  const comCollapsed = useArgos((s) => s.comCollapsed);
  const selectChannel = useArgos((s) => s.selectChannel);
  const sendMessage = useArgos((s) => s.sendMessage);
  const addCategory = useArgos((s) => s.addCategory);
  const addChannel = useArgos((s) => s.addChannel);
  const toggleCategory = useArgos((s) => s.toggleCategory);
  const showToast = useArgos((s) => s.showToast);

  const [msg, setMsg] = useState("");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newChanCat, setNewChanCat] = useState<string | null>(null);
  const [newChan, setNewChan] = useState("");

  const selChan: Channel | undefined = useMemo(() => {
    for (const c of comCats) for (const ch of c.chans) if (ch.id === comSel) return ch;
    return undefined;
  }, [comCats, comSel]);
  const isVoice = selChan?.kind === "voice";
  const msgs = (comMsgs[comSel] || []).slice().reverse();

  const send = () => {
    sendMessage(msg);
    setMsg("");
  };
  const onMsgKey = (e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && send();
  const onNewCatKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setNewCatOpen(false);
    if (e.key === "Enter" && newCat.trim()) { addCategory(newCat); setNewCat(""); setNewCatOpen(false); }
  };
  const onNewChanKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setNewChanCat(null);
    if (e.key === "Enter" && newChan.trim() && newChanCat) { addChannel(newChanCat, newChan); setNewChan(""); setNewChanCat(null); }
  };

  return (
    <section
      className="grid gap-4 animate-fade-in"
      style={{ height: "100%", minHeight: 560, gridTemplateColumns: "minmax(180px, 220px) minmax(320px, 1fr) minmax(0, 190px)" }}
    >
      {/* Colonne 1 — canaux */}
      <div className="carte flex min-w-0 flex-col overflow-y-auto p-3">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.nav_comms}</span>
          <button className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600" title={t.cm_new_cat} onClick={() => { setNewCatOpen(true); setNewCat(""); }}>
            <Icon path={UI_ICONS.plus} size={14} strokeWidth={2} />
          </button>
        </div>
        {newCatOpen && (
          <input className="input-champ mb-2 text-xs" placeholder={t.cm_new_cat_ph} value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={onNewCatKey} autoFocus />
        )}
        {comCats.map((cat) => {
          const open = !comCollapsed[cat.id];
          return (
            <div key={cat.id}>
              <div className="mt-3 flex items-center justify-between px-1">
                <button className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-or-500 dark:text-rdia-400" onClick={() => toggleCategory(cat.id)}>
                  <Icon path={UI_ICONS.chevronRight} size={10} strokeWidth={2.5} className="transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }} />
                  <span className="truncate">{cat.name}</span>
                </button>
                <button className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600" title={t.cm_new_chan} onClick={() => { setNewChanCat(cat.id); setNewChan(""); }}>
                  <Icon path={UI_ICONS.plus} size={12} strokeWidth={2} />
                </button>
              </div>
              {open && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {cat.chans.map((ch) => {
                    const active = comSel === ch.id;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => selectChannel(ch.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                          active ? "bg-or-500/15 font-semibold text-or-500 dark:text-or-400" : "text-gray-500 hover:bg-gray-100 hover:text-or-500 dark:text-rdia-300 dark:hover:bg-rdia-600/40"
                        }`}
                      >
                        <Icon path={ch.kind === "voice" ? UI_ICONS.voice : UI_ICONS.hash} size={14} className="shrink-0" />
                        <span className="truncate">{ch.name}</span>
                      </button>
                    );
                  })}
                  {newChanCat === cat.id && (
                    <input className="input-champ text-xs" placeholder={t.cm_new_chan} value={newChan} onChange={(e) => setNewChan(e.target.value)} onKeyDown={onNewChanKey} autoFocus />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Colonne 2 — chat / vocal */}
      <div className="carte flex min-w-0 flex-col overflow-hidden" style={{ padding: 0 }}>
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-rdia-600">
          <h2 className="whitespace-nowrap text-sm font-bold text-rdia-600 dark:text-rdia-50">
            {selChan ? (isVoice ? selChan.name : `# ${selChan.name}`) : ""}
          </h2>
          <span className="min-w-0 truncate text-xs text-gray-400 dark:text-rdia-400">{selChan?.topic || (isVoice ? t.cm_voice : "")}</span>
        </div>

        {selChan && !isVoice && (
          <>
            <div className="flex min-h-0 flex-1 flex-col-reverse gap-4 overflow-y-auto p-4">
              {msgs.map((m) => (
                <div key={m.id} className="flex items-start gap-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${m.av}`}>{m.initials}</div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-xs font-bold ${m.mine ? "text-or-500" : "text-rdia-600 dark:text-rdia-100"}`}>{m.who}</span>
                      <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{m.time}</span>
                    </div>
                    <div className="text-sm leading-snug text-gray-700 dark:text-rdia-100">{m.txt}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 p-3 dark:border-rdia-600">
              <input className="input-champ flex-1 text-sm" placeholder={t.cm_msg_ph} value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={onMsgKey} />
              <button className="btn-primaire shrink-0 text-sm" onClick={send} aria-label="Envoyer">
                <Icon path={UI_ICONS.send} size={16} strokeWidth={2} />
              </button>
            </div>
          </>
        )}

        {isVoice && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.cm_connected}</div>
            <div className="flex flex-wrap justify-center gap-6">
              {comMembers.voice.map((vp) => (
                <div key={vp.n} className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold ${vp.av}`}>{vp.initials}</div>
                    {vp.speaking && <span className="absolute rounded-full" style={{ inset: -3, border: "2px solid #10B981" }} />}
                  </div>
                  <span className="text-xs text-gray-600 dark:text-rdia-200">{vp.n}</span>
                </div>
              ))}
            </div>
            <button className="btn-primaire text-sm" onClick={() => showToast(t.cm_joined)}>{t.cm_join}</button>
          </div>
        )}
      </div>

      {/* Colonne 3 — membres */}
      <div className="carte min-w-0 overflow-y-auto p-3">
        <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.cm_online}</div>
        {comMembers.online.map((mb) => (
          <div key={mb.n} className="flex items-center gap-2 px-1 py-1.5">
            <div className="relative shrink-0">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold ${mb.av}`}>{mb.initials}</div>
              <span className="absolute h-2 w-2 rounded-full bg-green-500" style={{ bottom: 0, right: 0, border: "1.5px solid #fff" }} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-gray-700 dark:text-rdia-100">{mb.n}</div>
              <div className="text-[10px] text-gray-400 dark:text-rdia-400">{mb.g}</div>
            </div>
          </div>
        ))}
        <div className="mb-2 mt-4 px-1 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.cm_offline}</div>
        {comMembers.offline.map((mb) => (
          <div key={mb.n} className="flex items-center gap-2 px-1 py-1.5 opacity-60">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${mb.av}`}>{mb.initials}</div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-gray-700 dark:text-rdia-100">{mb.n}</div>
              <div className="text-[10px] text-gray-400 dark:text-rdia-400">{mb.g}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
