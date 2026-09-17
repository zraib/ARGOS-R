"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { api } from "@/lib/api";
import { isSuperAdmin } from "@/lib/roles";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Attachment } from "@/components/comms/Attachment";
import { Receipt } from "@/components/comms/Receipt";
import { TypingIndicator } from "@/components/comms/TypingIndicator";
import { DeployedShortcut } from "@/components/comms/DeployedShortcut";
import { UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import { ATTACHMENT_ACCEPT, uploadAttachment } from "@/lib/comms/attachments";
import { receiptState } from "@/lib/comms/receipts";
import { correspondentOf } from "@/lib/chat";
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
  // --- temps réel (lot COMMS) ---
  const rtOnline = useArgos((s) => s.rtOnline);
  const openDirect = useArgos((s) => s.openDirect);
  const sessionUser = useArgos((s) => s.sessionUser);
  const isSelf = (m: string) => !!sessionUser && m.toLowerCase() === sessionUser.matricule.toLowerCase();
  const rtStatus = useArgos((s) => s.rtStatus);
  const rtSetActiveChannel = useArgos((s) => s.rtSetActiveChannel);
  const role = useArgos((s) => s.role);
  const loadDomain = useArgos((s) => s.loadDomain);
  const comMsgs = useArgos((s) => s.comMsgs);
  const comSel = useArgos((s) => s.comSel);
  const unread = useArgos((s) => s.rtUnread);
  const comCollapsed = useArgos((s) => s.comCollapsed);
  const selectChannel = useArgos((s) => s.selectChannel);
  const sendMessage = useArgos((s) => s.sendMessage);
  const addCategory = useArgos((s) => s.addCategory);
  const addChannel = useArgos((s) => s.addChannel);
  const comDirectory = useArgos((s) => s.comDirectory);
  const loadCommsDirectory = useArgos((s) => s.loadCommsDirectory);
  const addChannelMembers = useArgos((s) => s.addChannelMembers);
  const removeChannelMember = useArgos((s) => s.removeChannelMember);
  const toggleCategory = useArgos((s) => s.toggleCategory);
  const showToast = useArgos((s) => s.showToast);
  const rtTyping = useArgos((s) => s.rtTyping);
  const rtSendTyping = useArgos((s) => s.rtSendTyping);

  const [msg, setMsg] = useState("");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  // Création d'un canal : le groupe visé, son nom, et LES MEMBRES convoqués.
  // Le tout dans une boîte, pas dans un champ en ligne : composer une
  // conversation, c'est choisir qui la reçoit, et ce choix ne tient pas sur une
  // ligne au milieu de l'arborescence.
  const [newChanCat, setNewChanCat] = useState<string | null>(null);
  const [newChan, setNewChan] = useState("");
  const [newChanMembres, setNewChanMembres] = useState<string[]>([]);
  const [rechercheMembre, setRechercheMembre] = useState("");
  // Gestion des participants d'un canal EXISTANT : la composition d'une
  // conversation se révise (une unité relevée, un renfort arrivé), elle n'est
  // pas figée à la création.
  const [participantsOuvert, setParticipantsOuvert] = useState(false);
  const [rechercheParticipant, setRechercheParticipant] = useState("");
  const [majParticipants, setMajParticipants] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("chans");
  // --- administration et pièces jointes (lot COMMS) ---
  const [renomme, setRenomme] = useState<string | null>(null);
  const [nouveauNom, setNouveauNom] = useState("");
  const [envoiPJ, setEnvoiPJ] = useState(false);
  const [erreurPJ, setErreurPJ] = useState<string | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const canAdmin = isSuperAdmin(role) || role === "admin";

  const selChan: Channel | undefined = useMemo(() => {
    for (const c of comCats) for (const ch of c.chans) if (ch.id === comSel) return ch;
    return undefined;
  }, [comCats, comSel]);
  const isVoice = selChan?.kind === "voice";
  const msgs = (comMsgs[comSel] || []).slice().reverse();
  // Dans une conversation directe : les coches de mes messages, et la frappe de l'autre.
  const correspondant = selChan?.direct ? correspondentOf(selChan, sessionUser?.matricule) : undefined;
  const frappe = selChan?.direct ? rtTyping[selChan.id] : undefined;

  // Le canal ouvert à l'écran ne compte jamais comme non lu : une pastille qui
  // s'allume pour ce qu'on est en train de lire finit par être ignorée, et une
  // pastille ignorée ne sert plus quand elle compte.
  useEffect(() => {
    rtSetActiveChannel(comSel || null);
    return () => rtSetActiveChannel(null);
  }, [comSel, rtSetActiveChannel]);

  const send = () => {
    sendMessage(msg);
    setMsg("");
  };

  /**
   * Verse un fichier puis l'envoie comme message — en deux temps (voir
   * `lib/comms/attachments`) : un fichier refusé ne laisse jamais un message
   * orphelin dans le canal. Le texte tapé sert de légende.
   */
  const joindre = async (f: File) => {
    setErreurPJ(null);
    setEnvoiPJ(true);
    try {
      const res = await uploadAttachment(f);
      if (!res.ok) {
        setErreurPJ(res.reason === "too_big" ? t.cm_attach_too_big : res.reason === "refused" ? t.cm_attach_refused : t.cm_attach_failed);
        return;
      }
      sendMessage(msg, undefined, res.attachment);
      setMsg("");
    } finally {
      setEnvoiPJ(false);
      if (fichierRef.current) fichierRef.current.value = "";
    }
  };

  const renommer = async () => {
    if (!renomme || !nouveauNom.trim()) return;
    const res = await api.renameCommsChannel(renomme, nouveauNom.trim());
    setRenomme(null);
    if (!res.error) await loadDomain();
  };

  const supprimer = async (id: string) => {
    // Confirmation NATIVE plutôt qu'une modale de plus : la suppression d'un
    // canal emporte sa conversation, et le geste doit s'interrompre net.
    if (!window.confirm(t.cm_delete_confirm)) return;
    const res = await api.deleteCommsChannel(id);
    if (!res.error) await loadDomain();
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
  /** Ouvre la boîte de création et tire l'annuaire (une fois suffit). */
  const ouvrirNouveauCanal = (catId: string) => {
    setNewChanCat(catId);
    setNewChan("");
    setNewChanMembres([]);
    setRechercheMembre("");
    if (comDirectory.length === 0) void loadCommsDirectory();
  };
  const fermerNouveauCanal = () => setNewChanCat(null);
  const creerCanal = () => {
    if (!newChanCat || !newChan.trim()) return;
    addChannel(newChanCat, newChan, newChanMembres);
    fermerNouveauCanal();
  };
  /** Ouvre la gestion des participants du canal affiché. */
  const ouvrirParticipants = () => {
    setParticipantsOuvert(true);
    setRechercheParticipant("");
    if (comDirectory.length === 0) void loadCommsDirectory();
  };
  /** Nom lisible d'un matricule ; à défaut, le matricule lui-même. */
  const nomDe = (matricule: string) => {
    const u = comDirectory.find((x) => x.matricule === matricule);
    if (!u) return matricule;
    return u.grade ? `${u.grade} ${u.nom}` : u.nom;
  };
  const convoquer = async (matricule: string) => {
    if (!selChan || majParticipants) return;
    setMajParticipants(true);
    const ok = await addChannelMembers(selChan.id, [matricule]);
    setMajParticipants(false);
    showToast(ok ? t.cm_participants_saved : t.toast_fail);
  };
  const retirer = async (matricule: string) => {
    if (!selChan || majParticipants) return;
    setMajParticipants(true);
    const ok = await removeChannelMember(selChan.id, matricule);
    setMajParticipants(false);
    showToast(ok ? t.cm_participants_saved : t.toast_fail);
  };
  const basculerMembre = (matricule: string) =>
    setNewChanMembres((l) => (l.includes(matricule) ? l.filter((m) => m !== matricule) : [...l, matricule]));
  // Filtre de l'annuaire : matricule, nom ou grade — ce que l'opérateur a en tête.
  const annuaireFiltre = useMemo(() => {
    const q = rechercheMembre.trim().toLowerCase();
    if (!q) return comDirectory;
    return comDirectory.filter((u) =>
      `${u.matricule} ${u.nom} ${u.grade ?? ""}`.toLowerCase().includes(q),
    );
  }, [comDirectory, rechercheMembre]);
  const participants = useMemo(() => selChan?.members ?? [], [selChan]);
  const aConvoquer = useMemo(() => {
    const q = rechercheParticipant.trim().toLowerCase();
    return comDirectory
      .filter((u) => !participants.includes(u.matricule))
      .filter((u) => !q || `${u.matricule} ${u.nom} ${u.grade ?? ""}`.toLowerCase().includes(q));
  }, [comDirectory, participants, rechercheParticipant]);

  // Boutons d'icône seule : 44 px de cible tactile sous `lg` (classe `cible-tactile`).
  const iconBtnCls =
    "cible-tactile flex shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600";

  return (
    // Sous `lg` : une seule colonne qui occupe la hauteur disponible (la coquille
    // borne déjà la page en `dvh`), pour que la barre de saisie reste ancrée en
    // bas. À partir de `lg` : la grille à trois colonnes d'origine.
    <section className="relative flex min-h-0 flex-1 flex-col gap-3 animate-fade-in sm:gap-4 lg:grid lg:min-h-[560px] lg:grid-cols-[minmax(180px,220px)_minmax(320px,1fr)_minmax(0,190px)]">
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
                <button className={`${iconBtnCls} p-1`} title={t.cm_new_channel} aria-label={t.cm_new_channel} onClick={() => ouvrirNouveauCanal(cat.id)}>
                  <Icon path={UI_ICONS.plus} size={12} strokeWidth={2} />
                </button>
              </div>
              {open && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {cat.chans.map((ch) => {
                    const active = comSel === ch.id;
                    const autre = ch.direct ? correspondentOf(ch, sessionUser?.matricule) : undefined;
                    // Nouveaux messages non lus : la conversation se signale dans
                    // la liste — en gras, avec son compte — jusqu'à ce qu'on l'ouvre.
                    const nouveaux = unread[ch.id] ?? 0;
                    return (
                      // Le raccourci carte d'un correspondant déployé vit À CÔTÉ du
                      // bouton du canal, pas dedans : un bouton ne s'imbrique pas.
                      <div key={ch.id} className="flex items-center gap-0.5">
                        <button
                          onClick={() => openChannel(ch.id)}
                          className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors lg:min-h-0 lg:text-[13px] ${
                            active
                              ? "bg-or-500/15 font-semibold text-or-500 dark:text-or-400"
                              : nouveaux > 0
                                ? "bg-danger-500/10 font-bold text-gray-800 hover:bg-danger-500/15 dark:text-rdia-50"
                                : "text-gray-500 hover:bg-gray-100 hover:text-or-500 dark:text-rdia-300 dark:hover:bg-rdia-600/40"
                          }`}
                        >
                          <Icon path={ch.direct ? UI_ICONS.users : ch.kind === "voice" ? UI_ICONS.voice : UI_ICONS.hash} size={14} className="shrink-0" />
                          <span className="min-w-0 truncate">{ch.name}</span>
                          {nouveaux > 0 && !active && (
                            <span className="ms-auto shrink-0 rounded-full bg-danger-500 px-1.5 font-mono text-[10px] font-bold text-white" aria-label={`${nouveaux} ${nouveaux > 1 ? t.notif_unread_many : t.notif_unread_one}`}>
                              {nouveaux}
                            </span>
                          )}
                        </button>
                        {autre && <DeployedShortcut matricule={autre} />}
                      </div>
                    );
                  })}
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
            <h2 className="flex min-w-0 items-center gap-1 text-sm font-bold text-rdia-600 lg:whitespace-nowrap dark:text-rdia-50">
              {correspondant && <DeployedShortcut matricule={correspondant} />}
              <span className="min-w-0 truncate">{selChan ? (isVoice || selChan.direct ? selChan.name : `# ${selChan.name}`) : ""}</span>
            </h2>
            <span className="min-w-0 truncate text-xs text-gray-400 dark:text-rdia-400">{selChan?.topic || (isVoice ? t.cm_voice : "")}</span>
          </div>
          {/* ADMINISTRATION DU CANAL — renommer et supprimer.
              Réservée à l'administration côté SERVEUR (`comms_admin:*`, ligne
              séparée de `comms`) : ce masquage n'est qu'un confort, l'API
              refuserait de toute façon. Un canal renommé sous les pieds d'une
              conduite en cours, ou supprimé avec sa conversation, ne se
              rattrape pas — d'où la séparation. */}
          {canAdmin && selChan && !isVoice && (
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => {
                  setRenomme(selChan.id);
                  setNouveauNom(selChan.name);
                }}
                title={t.cm_rename}
                aria-label={`${t.cm_rename} — ${selChan.name}`}
                className={iconBtnCls}
              >
                <Icon path={UI_ICONS.edit} size={15} />
              </button>
              <button
                onClick={() => void supprimer(selChan.id)}
                title={t.cm_delete}
                aria-label={`${t.cm_delete} — ${selChan.name}`}
                className={`${iconBtnCls} hover:!text-danger-500`}
              >
                <Icon path={UI_ICONS.trash} size={15} />
              </button>
            </div>
          )}
          {/* PARTICIPANTS du canal — révisable par la conduite, pas seulement par
              l'administration : convoquer un renfort ou relever une unité fait
              partie de la conduite, renommer et supprimer n'en font pas partie. */}
          {selChan && !isVoice && (
            <button
              onClick={ouvrirParticipants}
              title={t.cm_participants}
              aria-label={`${t.cm_participants} — ${selChan.name}`}
              className={`${iconBtnCls} shrink-0 gap-1 px-1.5 text-[11px] font-semibold`}
            >
              <Icon path={UI_ICONS.users} size={15} />
              <span className="tabular-nums">{selChan.members ? selChan.members.length : "∞"}</span>
            </button>
          )}
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
              {/* En tête du fil (la colonne est inversée) : « X écrit… ». */}
              {frappe && <TypingIndicator nom={frappe.nom} />}
              {msgs.map((m) => (
                <div key={m.id} className="flex items-start gap-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${m.av}`}>{m.initials}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2">
                      {!m.mine && m.author && <DeployedShortcut matricule={m.author} />}
                      <span className={`text-xs font-bold ${m.mine ? "text-or-500" : "text-rdia-600 dark:text-rdia-100"}`}>{m.who}</span>
                      <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{m.time}</span>
                      {/* Les coches : sur MES messages d'une conversation directe. */}
                      {m.mine && correspondant && <Receipt state={receiptState(m, correspondant)} tone="list" />}
                    </div>
                    {m.txt && (
                      <div className="break-words text-sm leading-snug text-gray-700 dark:text-rdia-100">{m.txt}</div>
                    )}
                    {m.attachment && <Attachment att={m.attachment} />}
                  </div>
                </div>
              ))}
            </div>
            {/* Barre de saisie ancrée : seule la liste défile, la barre reste au
                bas du panneau — dont la hauteur est bornée par le `h-dvh` de la
                coquille (et non `100vh`), donc elle reste atteignable clavier
                ouvert. */}
            <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 p-2 sm:p-3 dark:border-rdia-600">
              {/* Le fichier part dès qu'il est choisi, avec le texte tapé pour
                  légende : demander un second clic sur « envoyer » ferait perdre
                  la pièce à qui presse Entrée par réflexe. */}
              <input
                ref={fichierRef}
                type="file"
                className="sr-only"
                accept={ATTACHMENT_ACCEPT}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void joindre(f);
                }}
              />
              <button
                onClick={() => fichierRef.current?.click()}
                disabled={envoiPJ}
                title={t.cm_attach}
                aria-label={t.cm_attach}
                className="cible-tactile flex shrink-0 items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 disabled:opacity-40 dark:hover:bg-rdia-600"
              >
                <Icon path={UI_ICONS.paperclip} size={17} />
              </button>
              <input
                className="input-champ min-w-0 flex-1 text-base md:text-sm"
                placeholder={t.cm_msg_ph}
                value={msg}
                onChange={(e) => {
                  setMsg(e.target.value);
                  // Le correspondant d'une conversation directe voit qu'on écrit.
                  if (selChan?.direct && e.target.value) rtSendTyping(selChan.id);
                }}
                onKeyDown={onMsgKey}
              />
              <button className="btn-primaire cible-tactile shrink-0 px-3 text-sm" onClick={send} aria-label={t.send} disabled={envoiPJ}>
                <Icon path={UI_ICONS.send} size={16} strokeWidth={2} />
              </button>
            </div>
            {(envoiPJ || erreurPJ) && (
              <p
                role={erreurPJ ? "alert" : undefined}
                className={`px-3 pb-2 text-[11.5px] font-semibold ${erreurPJ ? "text-danger-400" : "text-gray-500 dark:text-rdia-300"}`}
              >
                {erreurPJ ?? t.cm_attach_sending}
              </p>
            )}
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
        {/* PRÉSENCE RÉELLE. L'ancienne liste était figée dans le code : deux
            tableaux « en ligne » et « hors ligne » écrits à la main, qui
            disaient la même chose quoi qu'il arrive. Ce qui s'affiche ici vient
            désormais des flux temps réel ouverts — un compte est en ligne tant
            que sa connexion l'est, et fermer l'onglet suffit à l'en retirer. */}
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
            {t.cm_online_real}
          </span>
          <span className="font-mono text-[11px] font-bold tabular-nums text-green-600">{rtOnline.length}</span>
        </div>

        {rtOnline.length === 0 ? (
          <p className="px-1 text-[11.5px] leading-snug text-gray-500 dark:text-rdia-300">{t.cm_offline_real}</p>
        ) : (
          rtOnline.map((u) => (
            // Double-clic : la conversation directe avec ce compte — jamais avec soi-même.
            <div
              key={u.matricule}
              className={`flex items-center gap-2 rounded-lg px-1 py-1.5 ${isSelf(u.matricule) ? "" : "cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-rdia-600/40"}`}
              title={isSelf(u.matricule) ? undefined : t.cm_dm_hint}
              onDoubleClick={() => {
                if (isSelf(u.matricule)) return;
                void openDirect(u.matricule)
                  .then(() => setMobileView("chat"))
                  .catch((err: unknown) => showToast(`${t.toast_fail} — ${err instanceof Error ? err.message : String(err)}`));
              }}
            >
              <div className="relative shrink-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-or-500 text-[9px] font-bold text-rdia-600">
                  {u.matricule.slice(0, 2).toUpperCase()}
                </div>
                {/* Propriété logique : la pastille reste du bon côté en RTL. */}
                <span
                  className="absolute h-2 w-2 rounded-full bg-green-500"
                  style={{ bottom: 0, insetInlineEnd: 0, border: "1.5px solid #fff" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  {/* Déployé sur une opération : le raccourci mène à sa position sur la carte. */}
                  <DeployedShortcut matricule={u.matricule} />
                  <span className="min-w-0 truncate text-xs font-semibold text-gray-700 dark:text-rdia-100">{u.matricule}</span>
                </div>
                <div className="truncate text-[10px] text-gray-400 dark:text-rdia-400">
                  {u.role}
                  {/* Deux onglets d'un même officier font UN présent : on le dit
                      plutôt que de le compter deux fois. */}
                  {u.sessions > 1 && ` · ${u.sessions} ${t.cm_sessions}`}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Liaison temps réel rompue : DIT, jamais tu. Un écran de commandement
          qui a cessé de recevoir est pire qu'un écran vide — il continue
          d'avoir l'air à jour. */}
      {rtStatus !== "open" && (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-3 top-2 z-30 rounded-lg bg-danger-500/15 px-3 py-1.5 text-center text-[11.5px] font-semibold text-danger-400"
        >
          {rtStatus === "connecting" ? t.notif_connecting : t.cm_stream_down}
        </p>
      )}

      {participantsOuvert && selChan && (
        <Modal open title={`${t.cm_participants} — ${selChan.name}`} onClose={() => setParticipantsOuvert(false)} size="md">
          <div className="space-y-4">
            {!selChan.members && (
              <p className="rounded-lg bg-or-500/10 px-3 py-2 text-[11.5px] leading-snug text-or-700 dark:text-or-300">
                {t.cm_participants_open}
              </p>
            )}

            {participants.length > 0 && (
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-gray-700 dark:text-white/80">{t.cm_participants}</span>
                  <span className="text-[11px] tabular-nums text-gray-400 dark:text-rdia-400">
                    {tpl(t.cm_participants_count, { n: participants.length })}
                  </span>
                </div>
                <ul className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-rdia-600">
                  {participants.map((m) => (
                    <li key={m} className="flex min-h-11 items-center gap-2.5 border-b border-gray-100 px-3 py-2 last:border-0 dark:border-rdia-700/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-gray-800 dark:text-rdia-50">{nomDe(m)}</span>
                        <span className="block truncate font-mono text-[11px] text-gray-400 dark:text-rdia-400">{m}</span>
                      </span>
                      <button
                        onClick={() => void retirer(m)}
                        disabled={majParticipants}
                        title={t.cm_participants_remove}
                        aria-label={`${t.cm_participants_remove} — ${nomDe(m)}`}
                        className={`${iconBtnCls} shrink-0 hover:!text-danger-500 disabled:opacity-40`}
                      >
                        <Icon path={UI_ICONS.close} size={14} strokeWidth={2.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <span className="mb-1 block text-[12px] font-semibold text-gray-700 dark:text-white/80">{t.cm_participants_add}</span>
              <input
                className="input-champ cible-tactile mb-2 w-full text-base md:text-sm"
                placeholder={t.cm_chan_members_search}
                value={rechercheParticipant}
                onChange={(e) => setRechercheParticipant(e.target.value)}
              />
              <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-rdia-600">
                {aConvoquer.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12px] text-gray-400 dark:text-rdia-400">{t.cm_chan_members_none}</p>
                ) : (
                  aConvoquer.map((u) => (
                    <button
                      key={u.matricule}
                      onClick={() => void convoquer(u.matricule)}
                      disabled={majParticipants}
                      className="flex min-h-11 w-full items-center gap-2.5 border-b border-gray-100 px-3 py-2 text-start transition-colors last:border-0 hover:bg-gray-50 disabled:opacity-40 dark:border-rdia-700/60 dark:hover:bg-rdia-600/30"
                    >
                      <Icon path={UI_ICONS.plus} size={14} className="shrink-0 text-or-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-gray-800 dark:text-rdia-50">
                          {u.grade ? `${u.grade} ${u.nom}` : u.nom}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-gray-400 dark:text-rdia-400">{u.matricule}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button className="btn-secondaire cible-tactile text-sm" onClick={() => setParticipantsOuvert(false)}>
                {t.cp_close}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {newChanCat && (
        <Modal open title={t.cm_new_channel} onClose={fermerNouveauCanal} size="md">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-gray-700 dark:text-white/80" htmlFor="cm-nouveau-canal">
                {t.cm_channel_name}
              </label>
              <input
                id="cm-nouveau-canal"
                className="input-champ cible-tactile w-full"
                placeholder={t.cm_new_chan}
                value={newChan}
                onChange={(e) => setNewChan(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newChan.trim()) creerCanal(); }}
                maxLength={60}
                autoFocus
              />
            </div>

            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-semibold text-gray-700 dark:text-white/80">{t.cm_chan_members}</span>
                <span className="text-[11px] tabular-nums text-gray-400 dark:text-rdia-400">
                  {newChanMembres.length > 0 ? tpl(t.cm_chan_members_count, { n: newChanMembres.length }) : t.cm_chan_open}
                </span>
              </div>
              <input
                className="input-champ cible-tactile mb-2 w-full text-base md:text-sm"
                placeholder={t.cm_chan_members_search}
                value={rechercheMembre}
                onChange={(e) => setRechercheMembre(e.target.value)}
              />
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-rdia-600">
                {annuaireFiltre.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12px] text-gray-400 dark:text-rdia-400">{t.cm_chan_members_none}</p>
                ) : (
                  annuaireFiltre.map((u) => {
                    const choisi = newChanMembres.includes(u.matricule);
                    return (
                      <label
                        key={u.matricule}
                        className={`flex min-h-11 cursor-pointer items-center gap-2.5 border-b border-gray-100 px-3 py-2 last:border-0 transition-colors dark:border-rdia-700/60 ${
                          choisi ? "bg-or-500/10" : "hover:bg-gray-50 dark:hover:bg-rdia-600/30"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-or-500"
                          checked={choisi}
                          onChange={() => basculerMembre(u.matricule)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-gray-800 dark:text-rdia-50">
                            {u.grade ? `${u.grade} ${u.nom}` : u.nom}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-gray-400 dark:text-rdia-400">{u.matricule}</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug text-gray-500 dark:text-rdia-300">{t.cm_chan_members_hint}</p>
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn-secondaire cible-tactile text-sm" onClick={fermerNouveauCanal}>
                {t.cancel}
              </button>
              <button className="btn-primaire cible-tactile text-sm" onClick={creerCanal} disabled={!newChan.trim()}>
                {t.lbl_create}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {renomme && (
        <Modal open title={t.cm_rename} onClose={() => setRenomme(null)} size="sm">
          <div className="space-y-3">
            <label className="block text-[12px] font-semibold text-gray-700 dark:text-white/80" htmlFor="cm-nom">
              {t.cm_channel_name}
            </label>
            <input
              id="cm-nom"
              className="input-champ cible-tactile w-full"
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              maxLength={60}
              autoFocus
            />
            <p className="text-[11.5px] leading-snug text-gray-500 dark:text-rdia-300">{t.cm_admin_only}</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondaire cible-tactile text-sm" onClick={() => setRenomme(null)}>
                {t.cancel}
              </button>
              <button
                className="btn-primaire cible-tactile text-sm"
                onClick={() => void renommer()}
                disabled={!nouveauNom.trim()}
              >
                {t.save}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
