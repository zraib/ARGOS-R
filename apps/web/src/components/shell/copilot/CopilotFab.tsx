"use client";

import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { useArgos, useDict } from "@/lib/store";

/** Bouton flottant d'ouverture du Copilot (visible quand le tiroir est fermé). */
export function CopilotFab({ unread }: { unread: number }) {
  const t = useDict();
  return (
    <button
      aria-label={t.cp_open}
      title={t.cp_open}
      onClick={() => useArgos.getState().openCopilot()}
      className="group fixed bottom-4 end-4 z-50 sm:bottom-6 sm:end-6"
    >
      <span className="absolute -inset-1 rounded-full bg-or-500 opacity-30 blur transition-opacity duration-300 group-hover:opacity-60" />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-or-500 text-rdia-900 shadow-2xl shadow-or-500/40 ring-4 ring-white dark:ring-rdia-800 transition-transform duration-200 group-hover:scale-110 active:scale-95">
        <Icon path={UI_ICONS.copilot} size={36} strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-danger-500 px-1 text-[10px] font-bold text-white dark:border-rdia-800">
            {unread}
          </span>
        )}
      </span>
      {/* Bulle d'aide : masquée sous sm — au doigt il n'y a pas de survol,
          et elle débordait de l'écran à 375 px. */}
      <span className="absolute end-full top-1/2 me-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-rdia-800 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 sm:block dark:bg-rdia-700">
        {t.cp_title} · ⌘K
      </span>
    </button>
  );
}
