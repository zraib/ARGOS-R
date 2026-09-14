"use client";

import { Avatar } from "@/components/ui/Avatar";
import { useDict } from "@/lib/store";

/**
 * Une tête de conversation : l'avatar du correspondant, sa présence (la
 * pastille verte est la CONNEXION, pas un drapeau), ses non-lus. L'entrée et
 * la sortie sont animées ; `delayMs` échelonne le déroulé depuis le bouton.
 */
export function ChatHead({
  name, online, unread, active, leaving, delayMs, onClick,
}: {
  name: string;
  online: boolean;
  unread: number;
  /** Sa fenêtre est ouverte : anneau doré. */
  active: boolean;
  leaving: boolean;
  delayMs: number;
  onClick: () => void;
}) {
  const t = useDict();
  const etat = online ? t.ch_online : t.ch_offline;
  const nonLus = unread > 0 ? ` — ${unread} ${unread > 1 ? t.notif_unread_many : t.notif_unread_one}` : "";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${name} — ${etat}`}
      aria-label={`${name} — ${etat}${nonLus}`}
      aria-pressed={active}
      className={`relative shrink-0 rounded-full shadow-lg ring-2 transition-transform duration-200 hover:scale-110 active:scale-95 ${
        active ? "ring-or-500" : "ring-white dark:ring-rdia-800"
      } ${leaving ? "anim-tete-out" : "anim-tete-in"}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <Avatar nom={name} size={44} />
      {/* Présence : propriété logique, la pastille reste du bon côté en RTL. */}
      <span
        aria-hidden="true"
        className={`absolute h-3 w-3 rounded-full border-2 border-white dark:border-rdia-800 ${online ? "bg-green-500" : "bg-gray-400"}`}
        style={{ bottom: 0, insetInlineEnd: 0 }}
      />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-danger-500 px-1 font-mono text-[10px] font-bold leading-none text-white dark:border-rdia-800"
          style={{ insetInlineEnd: -4 }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
