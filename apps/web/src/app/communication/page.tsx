"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { Channel } from "@/lib/types";

/**
 * Vue visible sous `lg`.
 *
 * Choix de mise en page : le centre de communication tient sur trois colonnes
 * (canaux · fil · membres). À 375 px elles ne tiennent pas côte à côte, et un
 * simple empilement obligerait à faire défiler toute la liste des canaux avant
 * d'atteindre le premier message — inutilisable en situation. On garde donc UNE
 * vue à la fois, avec la navigation par exploration des messageries mobiles :
 * liste des canaux → fil (bouton retour) → membres (bouton dédié dans l'en-tête
 * du fil). Rien ne disparaît : les trois vues restent atteignables. À partir de
 * `lg`, les trois colonnes réapparaissent et cet état n'a plus aucun effet.
 */
type MobileView = "chans" | "chat" | "members";

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
  const [mobileView, setMobileView] = useState<MobileView>("chans");

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
  // Sur téléphone, choisir un canal bascule aussitôt sur son fil ; au-dessus de
  // `lg` les trois colonnes restent affichées et l'état n'a aucun effet visible.
  const openChannel = (id: string) => {
    selectChannel(id);
    setMobileView("chat");
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

  // Boutons d'icône seule : 44 px de cible tactile sous `lg` (classe `cible-tactile`).
  const iconBtnCls =
    "cible-tactile flex shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600";

  return (
    // Sous `lg` : une seule colonne qui occupe la hauteur disponible (la coquille
    // borne déjà la page en `dvh`), pour que la barre de saisie reste ancrée en
    // bas. À partir de `lg` : la grille à trois colonnes d'origine.
    <section className="flex min-h-0 flex-1 flex-col gap-3 animate-fade-in sm:gap-4 lg:grid lg:min-h-[560px] lg:grid-cols-[minmax(180px,220px)_minmax(320px,1fr)_minmax(0,190px)]">
      {/* Colonne 1 — canaux */}
      <div className={`carte min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 lg:flex ${mobileView === "chans" ? "flex" : "hidden"}`}>
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <span className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.nav_comms}</span>
          <button className={`${iconBtnCls} p-1.5`} title={t.cm_new_cat} aria-label={t.cm_new_cat} onClick={() => { setNewCatOpen(true); setNewCat(""); }}>
            <Icon path={UI_ICONS.plus} size={14} strokeWidth={2} />
          </button>
        </div>
        {newCatOpen && (
          // 16 px sur mobile : sous ce seuil, iOS zoome au focus et décale la page.
          <input className="input-champ mb-2 text-base md:text-xs" placeholder={t.cm_new_cat_ph} value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={onNewCatKey} autoFocus />
        )}
        {comCats.map((cat) => {
          const open = !comCollapsed[cat.id];
          return (
            <div key={cat.id}>
              <div className="mt-3 flex items-center justify-between gap-1 px-1">
                <button className="flex min-h-11 min-w-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-or-500 lg:min-h-0 dark:text-rdia-400" onClick={() => toggleCategory(cat.id)}>
                  <Icon path={UI_ICONS.chevronRight} size={10} strokeWidth={2.5} className="shrink-0 transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }} />
                  <span className="truncate">{cat.name}</span>
                </button>
                <button className={`${iconBtnCls} p-1`} title={t.cm_new_chan} aria-label={t.cm_new_chan} onClick={() => { setNewChanCat(cat.id); setNewChan(""); }}>
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
                        onClick={() => openChannel(ch.id)}
                        className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors lg:min-h-0 lg:text-[13px] ${
                          active ? "bg-or-500/15 font-semibold text-or-500 dark:text-or-400" : "text-gray-500 hover:bg-gray-100 hover:text-or-500 dark:text-rdia-300 dark:hover:bg-rdia-600/40"
                        }`}
                      >
                        <Icon path={ch.kind === "voice" ? UI_ICONS.voice : UI_ICONS.hash} size={14} className="shrink-0" />
                        <span className="min-w-0 truncate">{ch.name}</span>
                      </button>
                    );
                  })}
                  {newChanCat === cat.id && (
                    <input className="input-champ text-base md:text-xs" placeholder={t.cm_new_chan} value={newChan} onChange={(e) => setNewChan(e.target.value)} onKeyDown={onNewChanKey} autoFocus />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Colonne 2 — chat / vocal */}
      <div className={`carte min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0 lg:flex ${mobileView === "chat" ? "flex" : "hidden"}`}>
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2 lg:gap-3 lg:px-4 lg:py-3 dark:border-rdia-600">
          {/* Retour à la liste des canaux — sous `lg` uniquement. */}
          <button
            onClick={() => setMobileView("chans")}
            title={t.back}
            aria-label={t.back}
            className={`${iconBtnCls} -ms-1.5 lg:hidden`}
          >
            <Icon path={UI_ICONS.arrowLeft} size={18} strokeWidth={2} className="rtl:rotate-180" />
          </button>
          {/* Nom du canal et sujet : empilés sur mobile, sur une ligne dès `lg`. */}
          <div className="flex min-w-0 flex-1 flex-col lg:flex-row lg:items-baseline lg:gap-3">
            <h2 className="min-w-0 truncate text-sm font-bold text-rdia-600 lg:whitespace-nowrap dark:text-rdia-50">
              {selChan ? (isVoice ? selChan.name : `# ${selChan.name}`) : ""}
            </h2>
            <span className="min-w-0 truncate text-xs text-gray-400 dark:text-rdia-400">{selChan?.topic || (isVoice ? t.cm_voice : "")}</span>
          </div>
          {/* Accès aux membres — sous `lg` la troisième colonne n'est pas affichée. */}
          <button
            onClick={() => setMobileView("members")}
            title={t.cm_members}
            aria-label={t.cm_members}
            className={`${iconBtnCls} -me-1.5 lg:hidden`}
          >
            <Icon path={UI_ICONS.users} size={18} strokeWidth={1.8} />
          </button>
        </div>

        {selChan && !isVoice && (
          <>
            <div className="flex min-h-0 flex-1 flex-col-reverse gap-4 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {msgs.map((m) => (
                <div key={m.id} className="flex items-start gap-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${m.av}`}>{m.initials}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`text-xs font-bold ${m.mine ? "text-or-500" : "text-rdia-600 dark:text-rdia-100"}`}>{m.who}</span>
                      <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{m.time}</span>
                    </div>
                    <div className="break-words text-sm leading-snug text-gray-700 dark:text-rdia-100">{m.txt}</div>
                  </div>
                </div>
              ))}
            </div>
            {/* Barre de saisie ancrée : seule la liste défile, la barre reste au
                bas du panneau — dont la hauteur est bornée par le `h-dvh` de la
                coquille (et non `100vh`), donc elle reste atteignable clavier
                ouvert. */}
            <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 p-2 sm:p-3 dark:border-rdia-600">
              <input className="input-champ min-w-0 flex-1 text-base md:text-sm" placeholder={t.cm_msg_ph} value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={onMsgKey} />
              <button className="btn-primaire cible-tactile shrink-0 px-3 text-sm" onClick={send} aria-label={t.send}>
                <Icon path={UI_ICONS.send} size={16} strokeWidth={2} />
              </button>
            </div>
          </>
        )}

        {isVoice && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-4 sm:gap-6 sm:p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.cm_connected}</div>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
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
            <button className="btn-primaire cible-tactile text-sm" onClick={() => showToast(t.cm_joined)}>{t.cm_join}</button>
          </div>
        )}
      </div>

      {/* Colonne 3 — membres */}
      <div className={`carte min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 lg:flex ${mobileView === "members" ? "flex" : "hidden"}`}>
        {/* Retour au fil — sous `lg` seulement : au-dessus, la colonne est permanente. */}
        <button
          onClick={() => setMobileView("chat")}
          className="mb-2 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-semibold text-gray-500 transition-colors hover:text-or-500 lg:hidden dark:text-rdia-300"
        >
          <Icon path={UI_ICONS.arrowLeft} size={14} strokeWidth={2} className="shrink-0 rtl:rotate-180" />
          <span className="truncate">{t.back}</span>
        </button>
        <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.cm_online}</div>
        {comMembers.online.map((mb) => (
          <div key={mb.n} className="flex items-center gap-2 px-1 py-1.5">
            <div className="relative shrink-0">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold ${mb.av}`}>{mb.initials}</div>
              {/* Propriété logique : la pastille reste du bon côté en RTL. */}
              <span className="absolute h-2 w-2 rounded-full bg-green-500" style={{ bottom: 0, insetInlineEnd: 0, border: "1.5px solid #fff" }} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-gray-700 dark:text-rdia-100">{mb.n}</div>
              <div className="truncate text-[10px] text-gray-400 dark:text-rdia-400">{mb.g}</div>
            </div>
          </div>
        ))}
        <div className="mb-2 mt-4 px-1 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.cm_offline}</div>
        {comMembers.offline.map((mb) => (
          <div key={mb.n} className="flex items-center gap-2 px-1 py-1.5 opacity-60">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${mb.av}`}>{mb.initials}</div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-gray-700 dark:text-rdia-100">{mb.n}</div>
              <div className="truncate text-[10px] text-gray-400 dark:text-rdia-400">{mb.g}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
