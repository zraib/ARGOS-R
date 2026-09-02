"use client";

import { type KeyboardEvent, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { useDict } from "@/lib/store";

/** Puces de questions rapides (quand le fil n'est pas vide) et zone de saisie. */
export function CopilotComposer({
  input,
  busy,
  hasMessages,
  suggestions,
  inputRef,
  onInput,
  onAsk,
}: {
  input: string;
  busy: boolean;
  hasMessages: boolean;
  suggestions: { label: string; query: string }[];
  inputRef: RefObject<HTMLInputElement | null>;
  onInput: (v: string) => void;
  onAsk: (query: string, display?: string) => void;
}) {
  const t = useDict();
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onAsk(input);
    }
  };
  return (
    <>
      {hasMessages && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-gray-100 bg-white/70 px-4 py-2 sm:flex-wrap sm:overflow-x-visible dark:border-rdia-700/60 dark:bg-rdia-800/70">
          {suggestions.slice(0, 4).map((ex) => (
            <button
              key={ex.query}
              onClick={() => onAsk(ex.query, ex.label)}
              disabled={busy}
              className="shrink-0 whitespace-nowrap rounded-full border border-gray-200 px-2.5 py-1.5 text-[12px] text-gray-500 transition-colors hover:border-or-500/50 hover:text-or-500 disabled:opacity-40 sm:text-[11px] dark:border-rdia-600 dark:text-rdia-300"
            >
              {ex.label}
            </button>
          ))}
        </div>
      )}

      <footer className="shrink-0 border-t border-gray-100 bg-white/90 px-3 py-2.5 backdrop-blur dark:border-rdia-700/60 dark:bg-rdia-800/90 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 dark:border-rdia-600 dark:bg-rdia-700/50">
            <kbd className="hidden shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 dark:border-rdia-600 dark:bg-rdia-700 sm:block">⌘K</kbd>
            <input
              ref={inputRef}
              className="min-h-11 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-gray-400 md:min-h-0 md:text-sm dark:text-rdia-50"
              placeholder={t.cp_input_ph}
              value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={onKey}
              disabled={busy}
            />
          </div>
          <button className="btn-primaire cible-tactile shrink-0 px-3 py-2 text-sm" onClick={() => onAsk(input)} disabled={busy || !input.trim()}>
            <Icon path={UI_ICONS.send} size={16} strokeWidth={2} />
          </button>
        </div>
      </footer>
    </>
  );
}
