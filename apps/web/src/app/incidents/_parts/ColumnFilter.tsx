"use client";

import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";


/**
 * Filtre de colonne façon Excel : chevron → cases à cocher (marquer/démarquer).
 * `align` ancre le panneau à droite quand la commande est près du bord de
 * l'écran — sinon le panneau déborde à 375 px.
 */
export function ColumnFilter({
  label, options, selected, open, onToggleOpen, onToggle, onClear, clearLabel, align = "start",
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  open: boolean;
  onToggleOpen: () => void;
  onToggle: (v: string) => void;
  onClear: () => void;
  clearLabel: string;
  align?: "start" | "end";
}) {
  const activeF = selected.length > 0;
  return (
    <div className="relative inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={label}
        className={`cible-tactile flex shrink-0 items-center justify-center gap-0.5 rounded p-0.5 transition-colors ${activeF ? "text-or-500" : "text-gray-400 hover:text-or-500 dark:text-rdia-400"}`}
      >
        <Icon path={UI_ICONS.caretDown} size={13} strokeWidth={2.5} />
        {activeF && <span className="rounded-full bg-or-500 px-1 text-[9px] font-bold leading-none text-rdia-600">{selected.length}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggleOpen} aria-hidden="true" />
          <div className={`absolute top-full z-50 mt-1.5 max-h-64 min-w-[190px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-rdia-600 dark:bg-rdia-700 ${align === "end" ? "end-0" : "start-0"}`}>
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => onToggle(o.value)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-start text-sm font-medium normal-case text-gray-700 transition-colors hover:bg-gray-100 dark:text-rdia-100 dark:hover:bg-rdia-600 lg:py-1.5 lg:text-xs">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${on ? "bg-or-500 text-white" : "border border-gray-300 dark:border-rdia-500"}`}>
                    {on && <Icon path={UI_ICONS.check} size={11} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
            {activeF && (
              <button type="button" onClick={onClear} className="mt-1 w-full rounded-lg px-2 py-2.5 text-start text-xs font-semibold normal-case text-danger-500 transition-colors hover:bg-danger-500/10 lg:py-1.5 lg:text-[11px]">
                {clearLabel}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
