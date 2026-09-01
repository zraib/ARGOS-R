"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

// ============================================================================
// Cloche de notification (lot COMMS)
//
// CE QU'ELLE COMPTE. Les messages arrivés dans des canaux que l'on ne regarde
// pas. Le canal ouvert à l'écran ne compte jamais : une pastille qui s'allume
// pour ce qu'on est en train de lire n'apprend rien et finit par être ignorée —
// et une pastille ignorée ne sert plus quand elle compte vraiment.
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

  const [ouvert, setOuvert] = useState(false);
  const zone = useRef<HTMLDivElement>(null);

  const total = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread]);

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

  const allerAuCanal = (id: string) => {
    setActive(id);
    setOuvert(false);
    router.push("/communication");
  };

  // Le libellé porte le compte ET l'état de la liaison : lu d'un trait par un
  // lecteur d'écran, il dit tout ce que la pastille et la teinte disent à l'œil.
  const libelle = `${t.notif_title} — ${
    total > 0 ? `${total} ${total > 1 ? t.notif_unread_many : t.notif_unread_one}` : t.notif_none
  }${status !== "open" ? ` · ${status === "connecting" ? t.notif_connecting : t.notif_offline}` : ""}`;

  return (
    <div ref={zone} className="relative shrink-0">
      <button
        onClick={() => setOuvert((v) => !v)}
        title={libelle}
        aria-label={libelle}
        aria-expanded={ouvert}
        className="cible-tactile relative flex shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 lg:p-1.5 dark:text-rdia-200 dark:hover:bg-rdia-700/60 dark:hover:text-or-400"
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-rdia-300">
              {t.notif_title}
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

          {lignes.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12px] text-gray-500 dark:text-rdia-300">{t.notif_none}</p>
          ) : (
            <ul className="max-h-[300px] overflow-y-auto overscroll-contain py-1">
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
