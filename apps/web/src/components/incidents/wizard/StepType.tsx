"use client";

import { Icon } from "@/components/ui/Icon";
import type { IncidentTypeDef, Lang } from "@/lib/types";

/** Étape 1 — le type d'incident (catalogue paramétrable servi par l'API). */
export function StepType({ types, lang, value, onSelect }: { types: IncidentTypeDef[]; lang: Lang; value: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="grid max-h-[46dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
      {types.map((def) => (
        <button
          key={def.id}
          onClick={() => onSelect(def.id)}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 text-xs font-semibold transition-all sm:p-4 ${
            value === def.id
              ? "border-or-500 bg-or-500/10 text-or-500"
              : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
          }`}
        >
          <Icon path={def.icon} size={26} strokeWidth={1.6} />
          <span className="text-center leading-tight">{def.labels[lang]}</span>
        </button>
      ))}
    </div>
  );
}
