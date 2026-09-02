"use client";

import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { useDict } from "@/lib/store";

export type ProviderStatus = "checking" | "online" | "offline";

/** En-tête du tiroir : titre, pastille d'état du fournisseur, réglages, effacer, fermer. */
export function CopilotHeader({
  status,
  busy,
  showSettings,
  canClear,
  onToggleSettings,
  onClear,
  onClose,
}: {
  status: ProviderStatus;
  busy: boolean;
  showSettings: boolean;
  canClear: boolean;
  onToggleSettings: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const t = useDict();
  const statusDot =
    status === "online"
      ? { bg: "bg-emerald-500", title: t.cp_ready }
      : status === "offline"
        ? { bg: "bg-amber-500", title: t.cp_det_only }
        : { bg: "bg-gray-400", title: t.cp_checking };
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-gray-100/70 bg-white/80 px-4 py-3 backdrop-blur dark:border-rdia-700/50 dark:bg-rdia-800/80">
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-or-500/15 text-or-500 ring-1 ring-or-500/20">
          <Icon path={NAV_ICONS.assistant} size={18} />
          <span
            title={statusDot.title}
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${statusDot.bg} ring-2 ring-white dark:ring-rdia-800`}
          />
        </div>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-none text-rdia-600 dark:text-rdia-50">{t.cp_title}</h2>
          <p className="mt-0.5 text-[10px] text-gray-400 dark:text-rdia-400 truncate">{t.cp_subtitle}</p>
        </div>
      </div>
      {/* Commandes d'en-tête : cibles de 44 px sous lg (32 px au doigt, on
          vise la voisine une fois sur deux). */}
      <div className="ms-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleSettings}
          disabled={busy}
          title={showSettings ? t.cp_settings_hide : t.cp_settings_show}
          className={`cible-tactile flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            showSettings
              ? "bg-or-500/10 text-or-500 ring-1 ring-or-500/25"
              : "text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-rdia-700/50 dark:hover:text-rdia-100"
          } disabled:opacity-40`}
          aria-label={t.cp_settings}
        >
          <Icon path={UI_ICONS.sliders} size={15} />
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={busy || !canClear}
          title={!canClear ? t.cp_clear_empty : t.cp_clear}
          className="cible-tactile flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rdia-700/50 dark:hover:text-red-400"
          aria-label={t.cp_clear}
        >
          <Icon path={UI_ICONS.trash} size={14} />
        </button>
        <button
          type="button"
          aria-label={t.cp_close}
          title={t.cp_close_esc}
          onClick={onClose}
          className="cible-tactile flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-rdia-700/50 dark:hover:text-rdia-100"
        >
          <Icon path={UI_ICONS.close} size={15} />
        </button>
      </div>
    </header>
  );
}
