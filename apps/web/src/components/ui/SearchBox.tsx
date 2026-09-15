"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

export interface Suggestion {
  id: string;
  label: string;
  sub?: string;
}

/**
 * Champ de recherche avec auto-complétion : la liste filtre en direct, les
 * suggestions se parcourent au clavier (↑ ↓, Entrée, Échap) et à la souris.
 * Sémantique combobox/listbox pour les lecteurs d'écran ; la saisie reste
 * libre — choisir une suggestion est un raccourci, pas une obligation.
 */
export function SearchBox({
  value, onChange, onPick, suggestions, placeholder, hint, emptyLabel, className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  /** Une suggestion choisie (clavier ou souris). */
  onPick: (s: Suggestion) => void;
  suggestions: readonly Suggestion[];
  placeholder: string;
  hint?: string;
  emptyLabel: string;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const shown = open && value.trim().length > 0;

  // Un clic hors du champ referme la liste sans perdre la saisie.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => setActive(0), [value, suggestions.length]);

  const pick = (s: Suggestion) => {
    onPick(s);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!shown || suggestions.length === 0) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === "Enter") { e.preventDefault(); const s = suggestions[active]; if (s) pick(s); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <div className="relative">
        <Icon path={UI_ICONS.search} size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          role="combobox"
          aria-expanded={shown}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={shown && suggestions[active] ? `${id}-opt-${active}` : undefined}
          className="input-champ cible-tactile w-full ps-8 text-base md:text-sm"
          placeholder={placeholder}
          aria-label={placeholder}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          autoComplete="off"
        />
      </div>
      {shown && (
        <div id={`${id}-list`} role="listbox" className="carte absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto p-1 shadow-xl">
          {suggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-rdia-400">{emptyLabel}</div>
          ) : (
            suggestions.map((s, i) => (
              <button
                key={s.id}
                id={`${id}-opt-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={`flex w-full flex-col items-start rounded-lg px-3 py-1.5 text-start transition-colors ${i === active ? "bg-or-500/15 text-or-600 dark:text-or-400" : "text-gray-700 hover:bg-gray-100 dark:text-rdia-100 dark:hover:bg-rdia-600"}`}
              >
                <span className="text-sm font-semibold">{s.label}</span>
                {s.sub && <span className="text-[11px] text-gray-500 dark:text-rdia-300">{s.sub}</span>}
              </button>
            ))
          )}
          {hint && suggestions.length > 0 && <div className="px-3 pb-1 pt-1.5 text-[10px] text-gray-400 dark:text-rdia-400">{hint}</div>}
        </div>
      )}
    </div>
  );
}
