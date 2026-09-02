"use client";

import type { AiMessage } from "@/lib/store";
import type { Incident } from "@/lib/types";
import { mapFocusLabel, resolveMapFocus, type MapFocusAction } from "../mapFocus";

/** Bouton « Afficher sur la carte » quand la réponse désigne un lieu ou un incident. */
export function MapAction({ msg, incidents, busy, onFocus }: { msg: AiMessage; incidents: Incident[]; busy: boolean; onFocus: (a: MapFocusAction) => void }) {
  const action = resolveMapFocus(msg, incidents);
  if (!action) return null;
  const label = mapFocusLabel(msg);
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-2.5 dark:border-rdia-700/50">
      <button
        type="button"
        onClick={() => onFocus(action)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-or-500/30 bg-or-500/10 px-3 py-1.5 text-xs font-semibold text-or-500 transition-colors hover:bg-or-500/20 disabled:opacity-40"
      >
        <span className="text-sm leading-none">🗺️</span>
        <span>Afficher sur la carte</span>
        {label && label !== "Localiser" && <span className="text-[11px] text-or-500/70">· {label}</span>}
      </button>
    </div>
  );
}
