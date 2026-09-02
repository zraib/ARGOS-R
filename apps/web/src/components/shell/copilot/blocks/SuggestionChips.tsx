"use client";

import { useModules } from "@/lib/store";
import type { AiMessage } from "@/lib/store";
import type { Incident } from "@/lib/types";
import { resolveMapFocus, type MapFocusAction } from "../mapFocus";

/**
 * Puces « Suggérés » sous une réponse. Une puce qui parle de la carte agit
 * comme le bouton « Afficher sur la carte » ; les autres relancent une question.
 */
export function SuggestionChips({
  msg,
  incidents,
  busy,
  onAsk,
  onFocus,
}: {
  msg: AiMessage;
  incidents: Incident[];
  busy: boolean;
  onAsk: (query: string) => void;
  onFocus: (a: MapFocusAction) => void;
}) {
  const m = useModules();
  if (!msg.suggestions || msg.suggestions.length === 0) return null;
  const mapAction = resolveMapFocus(msg, incidents);
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2.5 dark:border-rdia-700/50">
      <span className="self-center pr-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-rdia-400">{m.copilot.suggested}</span>
      {msg.suggestions.map((s) => {
        const qlabel = typeof s === "string" ? s : s.label;
        const qquery = typeof s === "string" ? s : s.query;
        const prio = typeof s === "string" ? false : s.priority === "primary";
        const hasMapHint = qlabel.startsWith("🗺️") || qlabel.includes("sur la carte");
        const isMapFocus = hasMapHint && mapAction !== null;
        return (
          <button
            key={qlabel}
            onClick={() => (isMapFocus ? onFocus(mapAction) : onAsk(qquery))}
            disabled={busy}
            className={`rounded-full border px-2.5 py-1.5 text-[12px] transition-colors hover:border-or-500/60 hover:text-or-500 disabled:opacity-40 sm:text-[11px] ${
              prio || isMapFocus ? "border-or-500/40 text-or-500" : "border-gray-200 text-gray-500 dark:border-rdia-600 dark:text-rdia-300"
            }`}
          >
            {qlabel}
          </button>
        );
      })}
    </div>
  );
}
