"use client";

import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { useDict } from "@/lib/store";

/** Ligne « moyen » sélectionnable (unité ou hôpital), avec sa distance et la mention « suggéré ». */
export function ResponderRow({
  item,
  selected,
  suggested,
  onToggle,
}: {
  item: { id: string; nom: string; ville: string; km: number | null };
  selected: boolean;
  suggested: boolean;
  onToggle: (id: string) => void;
}) {
  const t = useDict();
  return (
    <button
      type="button"
      onClick={() => onToggle(item.id)}
      className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-left transition-colors ${
        selected ? "border-or-500 bg-or-500/10" : "border-gray-200 hover:border-or-500/40 dark:border-rdia-600"
      }`}
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${selected ? "bg-or-500 text-white" : "border border-gray-300 dark:border-rdia-500"}`}>
        {selected && <Icon path={UI_ICONS.check} size={11} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-gray-700 dark:text-rdia-100">{item.nom}</span>
        <span className="block text-[10px] text-gray-400 dark:text-rdia-400">
          {item.ville}
          {item.km != null ? ` · ${item.km} km` : ""}
        </span>
      </span>
      {suggested && (
        <span className="shrink-0 rounded-md bg-green-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-600 dark:text-green-400">{t.wz_suggested}</span>
      )}
    </button>
  );
}
