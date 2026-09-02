"use client";

import { useDict } from "@/lib/store";

/** Le fil vide : accueil et trois questions pour commencer. */
export function CopilotEmptyState({
  suggestions,
  busy,
  onAsk,
}: {
  suggestions: { label: string; query: string }[];
  busy: boolean;
  onAsk: (query: string, display?: string) => void;
}) {
  const t = useDict();
  return (
    <div className="flex h-full min-h-[380px] flex-col items-center justify-center gap-6 py-6 sm:min-h-[520px] sm:gap-8">
      <div className="w-full max-w-md text-center">
        <p className="text-[15px] font-semibold leading-snug text-rdia-600 dark:text-rdia-50">
          {t.cp_welcome}
        </p>
        <p className="mt-1 text-[15px] font-medium text-rdia-600 dark:text-rdia-50">
          {t.cp_welcome_q}
        </p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-gray-500 dark:text-rdia-300">
          {t.cp_empty_hint}
        </p>
      </div>
      <div className="flex w-full max-w-md flex-col items-center gap-2 px-2">
        {suggestions.map((ex) => (
          <button
            key={ex.label}
            onClick={() => onAsk(ex.query, ex.label)}
            disabled={busy}
            className="group flex min-h-11 w-full max-w-[320px] items-center justify-between rounded-lg border border-gray-200/70 bg-white/70 px-3 py-2 text-start text-[12px] text-gray-700 transition-all duration-150 hover:border-or-500/40 hover:bg-or-500/5 hover:text-or-600 hover:shadow-sm active:scale-[0.99] disabled:opacity-40 dark:border-rdia-600/50 dark:bg-rdia-700/30 dark:text-rdia-100 dark:hover:text-or-400 dark:hover:border-or-500/40 dark:hover:bg-rdia-700/40"
          >
            <span className="font-medium leading-snug">{ex.label}</span>
            <span
              aria-hidden
              className="ms-3 shrink-0 text-[11px] text-gray-300 transition-all duration-150 group-hover:text-or-500/70 dark:text-rdia-500 dark:group-hover:text-or-400"
            >
              →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
