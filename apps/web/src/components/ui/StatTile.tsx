import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/** Tuile KPI compacte : icône teintée + libellé + grande valeur. Réutilisée par les modules. */
export function StatTile({
  label,
  value,
  icon,
  tint = "or",
  sub,
}: {
  label: string;
  value: ReactNode;
  icon: string;
  tint?: "or" | "danger" | "green" | "blue" | "rdia" | "amber" | "gray";
  sub?: ReactNode;
}) {
  const tints: Record<string, string> = {
    or: "bg-or-500/15 text-or-500",
    danger: "bg-danger-500/10 text-danger-500",
    green: "bg-green-500/10 text-green-600",
    blue: "bg-blue-500/10 text-blue-500",
    rdia: "bg-rdia-500/10 text-rdia-500 dark:text-rdia-200",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    gray: "bg-gray-400/20 text-gray-500 dark:text-rdia-200",
  };
  return (
    // Rembourrage réduit sur téléphone : dans une grille à deux colonnes à
    // 375 px, 16 px de chaque côté ne laissaient plus de place au libellé.
    <div className="carte flex items-center gap-3 p-3 sm:p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tints[tint]}`}>
        <Icon path={icon} size={20} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs text-gray-500 dark:text-rdia-300">{label}</div>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold leading-none tabular-nums text-rdia-600 dark:text-rdia-50">{value}</span>
          {sub && <span className="text-[10px] font-semibold text-gray-400 dark:text-rdia-300">{sub}</span>}
        </div>
      </div>
    </div>
  );
}
