"use client";

import type { KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { useDict } from "@/lib/store";
import { fieldCls, labelCls } from "./styles";

/**
 * Saisie des mots-clés, un par un, en puces avec ×.
 *
 * Le bouton « Ajouter » est HORS de la rangée `flex-wrap` et TOUJOURS rendu
 * (désactivé tant qu'il n'y a rien à ajouter) : rendu à l'intérieur et
 * seulement quand la saisie n'était pas vide, il apparaissait à la première
 * lettre, rétrécissait le champ et faisait sauter le curseur sous les doigts.
 */
export function KeywordChips({
  keywords,
  draft,
  onDraft,
  onKey,
  onAdd,
  onRemove,
}: {
  keywords: string[];
  draft: string;
  onDraft: (v: string) => void;
  onKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const t = useDict();
  return (
    <div>
      <label className={labelCls}>{t.f_keywords}</label>
      <div className="flex items-start gap-2">
        <div
          className={`${fieldCls} flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-2`}
          onClick={(e) => {
            const el = (e.currentTarget.querySelector('input[data-wiz-keyword-input="1"]') ?? null) as HTMLInputElement | null;
            el?.focus();
          }}
        >
          {keywords.map((kw, i) => (
            <span
              key={`${kw}-${i}`}
              className="inline-flex items-center gap-1 rounded-md border border-or-500/40 bg-or-500/10 px-2 py-0.5 text-xs font-semibold text-or-700 dark:text-or-300"
            >
              <span className="max-w-[18ch] truncate">{kw}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-or-700/70 hover:bg-or-500/20 hover:text-or-700 dark:text-or-300/80 dark:hover:text-or-200"
                title={`Retirer « ${kw} »`}
              >
                <Icon path={UI_ICONS.close} size={11} strokeWidth={3} />
              </button>
            </span>
          ))}
          <input
            data-wiz-keyword-input="1"
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={keywords.length ? "" : t.f_keywords_chip_ph}
            className="min-w-[14ch] flex-1 border-0 bg-transparent p-0 text-sm outline-none ring-0 placeholder:text-gray-400 dark:placeholder:text-rdia-400"
          />
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={!draft.trim()}
          className="btn-primaire cible-tactile shrink-0 px-2.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t.f_keywords_add}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-gray-400 dark:text-rdia-400">{t.f_keywords_hint}</p>
    </div>
  );
}
