"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { noticeTime, unseenNotices } from "@/lib/notices";
import { playReminderTone } from "@/lib/sound";

/** Cadence du rappel sonore tant qu'une alerte ou un message reste à acquitter (ADR 0016). */
// Toutes les 20 s, et une première fois 3 s après l'arrivée : un rappel qu'on
// n'entend qu'au bout d'une minute laisse le temps de partir de la pièce.
const REMINDER_MS = 20_000;
const FIRST_REMINDER_MS = 3_000;
import type { Notice } from "@/lib/types";

// ============================================================================
// Cloche de notification (lot COMMS)
//
// CE QU'ELLE COMPTE. Les messages arrivés dans des canaux que l'on ne regarde
// pas. Le canal ouvert à l'écran ne compte jamais : une pastille qui s'allume
// pour ce qu'on est en train de lire n'apprend rien et finit par être ignorée —
// et une pastille ignorée ne sert plus quand elle compte vraiment.
//
// LES ALERTES ADRESSÉES Y SONT AUSSI. L'incident déclaré dans la région d'un
// wali ou d'une place d'armes arrive ici, en tête, et son ouverture centre la
// carte sur l'incident ; la demande d'un compte qui a oublié son mot de passe
// mène à la gestion des utilisateurs : la cloche ne dit pas seulement qu'il
// s'est passé quelque chose, elle y mène.
//
// L'ÉTAT DE LA LIAISON EST DIT. Un écran de commandement qui a cessé de
// recevoir est pire qu'un écran vide : il continue d'AVOIR L'AIR à jour. La
// cloche porte donc aussi l'état du flux — et le porte en TEXTE dans le
// libellé, pas seulement par une teinte.
// ============================================================================

export function NotificationBell() {
  const t = useDict();
  const router = useRouter();
  const unread = useArgos((s) => s.rtUnread);
  const status = useArgos((s) => s.rtStatus);
  const comCats = useArgos((s) => s.comCats);
  const setActive = useArgos((s) => s.rtSetActiveChannel);
  const selectChannel = useArgos((s) => s.selectChannel);
  const notices = useArgos((s) => s.rtNotices);
  const seen = useArgos((s) => s.rtNoticesSeen);
  const markSeen = useArgos((s) => s.rtMarkNoticeSeen);
  const ackNotice = useArgos((s) => s.rtAckNotice);
  const sounds = useArgos((s) => s.sounds);
  const incidents = useArgos((s) => s.incidents);
  const focusIncident = useArgos((s) => s.focusIncident);
  const setMapCenter = useArgos((s) => s.setMapCenter);

  const [ouvert, setOuvert] = useState(false);
  const zone = useRef<HTMLDivElement>(null);

  const totalMessages = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread]);
  const fraiches = useMemo(() => unseenNotices(notices, seen), [notices, seen]);
  const total = totalMessages + fraiches.length;

  // PERSISTANT JUSQU'À L'ACQUITTEMENT (ADR 0016) : tant qu'une alerte n'est pas
  // acquittée ou qu'un message n'est pas lu, la cloche bat et un rappel sonore
  // NET revient à cadence serrée — une notification qu'on peut manquer une
  // fois ne doit pas se taire d'elle-même. Les préférences sonores du poste
  // restent maîtresses ; le rappel se tait dès que le compte est à jour.
  const pending = fraiches.length > 0 || totalMessages > 0;
  useEffect(() => {
    if (!pending) return;
    const wantsSound = (fraiches.length > 0 && sounds.alerts) || (totalMessages > 0 && sounds.messages);
    if (!wantsSound) return;
    const first = window.setTimeout(() => playReminderTone(), FIRST_REMINDER_MS);
    const id = window.setInterval(() => playReminderTone(), REMINDER_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [pending, fraiches.length, totalMessages, sounds.alerts, sounds.messages]);

  /** Nom lisible d'un canal — l'identifiant ne dit rien à personne. */
  const nomCanal = (id: string): string => {
    for (const c of comCats) {
      const ch = c.chans.find((x) => x.id === id);
      if (ch) return ch.name;
    }
    return id;
  };

  const lignes = useMemo(
    () =>
      Object.entries(unread)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1]),
    [unread],
  );

  useEffect(() => {
    if (!ouvert) return;
    const hors = (e: MouseEvent) => {
      if (!zone.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", hors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", hors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  /** Ouvre LA conversation concernée dans le centre de communication — pas seulement l'écran. */
  const allerAuCanal = (id: string) => {
    selectChannel(id);
    setActive(id);
    setOuvert(false);
    router.push("/communication");
  };

  /** Ouvre une alerte : la carte se centre sur l'incident, ou la gestion des comptes s'ouvre. */
  const ouvrirAlerte = (n: Notice) => {
    markSeen(n.id);
    void ackNotice(n.id);
    setOuvert(false);
    if (n.kind === "password_reset_requested") {
      router.push("/utilisateurs");
      return;
    }
    const inc = incidents.find((i) => i.id === n.incidentId);
    if (inc) focusIncident(inc);
    else setMapCenter(n.ll, 10, n.titre);
    router.push("/map");
  };

  // Le libellé porte le compte ET l'état de la liaison : lu d'un trait par un
  // lecteur d'écran, il dit tout ce que la pastille et la teinte disent à l'œil.
  const parts: string[] = [];
  if (fraiches.length > 0) parts.push(`${fraiches.length} ${fraiches.length > 1 ? t.notif_alert_many : t.notif_alert_one}`);
  if (totalMessages > 0) parts.push(`${totalMessages} ${totalMessages > 1 ? t.notif_unread_many : t.notif_unread_one}`);
  const libelle = `${t.notif_title} — ${parts.length ? parts.join(" · ") : t.notif_none}${
    status !== "open" ? ` · ${status === "connecting" ? t.notif_connecting : t.notif_offline}` : ""
  }`;

  return (
    <div ref={zone} className="relative shrink-0">
      <button
        onClick={() => setOuvert((v) => !v)}
        title={libelle}
        aria-label={libelle}
        aria-expanded={ouvert}
        className={`cible-tactile relative flex shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 hover:text-or-500 lg:p-1.5 dark:hover:bg-rdia-700/60 dark:hover:text-or-400 ${
          pending ? "animate-pulse text-danger-500 ring-2 ring-danger-500/40 motion-reduce:animate-none" : "text-gray-400 dark:text-rdia-200"
        }`}
      >
        <Icon path={UI_ICONS.bell} size={18} />
        {total > 0 && (
          <span
            aria-hidden="true"
            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 font-mono text-[9px] font-bold leading-none text-white"
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
        {/* Liaison rompue : un point, DOUBLÉ par le libellé accessible et par
            la ligne d'état du panneau — la couleur ne porte jamais seule. */}
        {total === 0 && status !== "open" && (
          <span
            aria-hidden="true"
            className={`absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full ${
              status === "connecting" ? "bg-or-500" : "bg-gray-400"
            }`}
          />
        )}
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-label={t.notif_title}
          className="absolute end-0 top-full z-50 mt-1.5 w-[280px] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl dark:border-rdia-600 dark:bg-rdia-700"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-rdia-600">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-rdia-300">
              {t.notif_title}
              {fraiches.length > 0 && (
                <button type="button" onClick={() => { for (const n of fraiches) markSeen(n.id); void ackNotice("all"); }} className="cible-tactile rounded-md bg-or-500/15 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-or-500 hover:bg-or-500/25">
                  {t.nb_ack_all}
                </button>
              )}
            </span>
            {/* L'état est ÉCRIT, jamais seulement coloré. */}
            <span
              className={`text-[10.5px] font-semibold ${
                status === "open" ? "text-green-600" : status === "connecting" ? "text-or-500" : "text-gray-400"
              }`}
            >
              {status === "open" ? t.notif_live : status === "connecting" ? t.notif_connecting : t.notif_offline}
            </span>
          </div>

          {lignes.length === 0 && notices.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12px] text-gray-500 dark:text-rdia-300">{t.notif_none}</p>
          ) : (
            <ul className="max-h-[300px] overflow-y-auto overscroll-contain py-1">
              {notices.map((n) => {
                const fraiche = !seen.includes(n.id);
                const reset = n.kind === "password_reset_requested";
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => ouvrirAlerte(n)}
                      title={reset ? t.notif_reset_open : t.notif_open_map}
                      className="flex w-full items-start gap-2 px-3 py-2 text-start transition-colors hover:bg-or-500/10"
                    >
                      <Icon
                        path={reset ? UI_ICONS.key : UI_ICONS.alert}
                        size={13}
                        className={`mt-0.5 shrink-0 ${fraiche ? (reset ? "text-or-500" : "text-danger-500") : "text-gray-400"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[12.5px] ${fraiche ? "font-semibold text-gray-800 dark:text-rdia-50" : "text-gray-600 dark:text-rdia-200"}`}>
                          {reset ? n.nom : n.titre}
                        </span>
                        <span className="block truncate text-[11px] text-gray-500 dark:text-rdia-300">
                          {reset ? `${t.notif_reset_requested} · ${n.matricule}` : `${t.notif_incident_declared} · ${n.region}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-gray-400">{noticeTime(n.at)}</span>
                    </button>
                  </li>
                );
              })}
              {lignes.map(([id, n]) => (
                <li key={id}>
                  <button
                    onClick={() => allerAuCanal(id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-start transition-colors hover:bg-or-500/10"
                  >
                    <Icon path={UI_ICONS.hash} size={13} className="shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-gray-800 dark:text-rdia-50">
                      {nomCanal(id)}
                    </span>
                    <span className="shrink-0 rounded-full bg-danger-500 px-1.5 font-mono text-[10px] font-bold text-white">
                      {n}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
