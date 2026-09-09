"use client";

import { IconName, TONE_CLS, TUILE, type ToneFill } from "@/components/dashboard/situational/shared";
import { Icon } from "@/components/dashboard/situational/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * Tuile de métrique (flux 6 h, ruptures de stock).
 *
 * Bâtie sur la grammaire de `StatTile` : pastille d'icône teintée, libellé
 * discret, grand chiffre tabulaire, puis la barre. Elle se posait auparavant
 * sur un fond, un bord et une ombre colorés en style en ligne — un habillage
 * qu'aucune autre carte du produit ne porte.
 */
export function MetricBar({
  icon, title, subtitle, big, bigUnit, pct, ton,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  big: string;
  bigUnit?: string;
  pct: number;
  /** Ton du projet ; la couleur en est déduite, elle ne se saisit pas. */
  ton: ToneFill;
}) {
  const c = TONE_CLS[ton];
  const safePct = Math.max(0, Math.min(100, pct));
  return (
    <div className={`flex w-full min-w-0 flex-col gap-2.5 ${TUILE}`}>
      <div className="flex w-full min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.chip}`}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-gray-800 dark:text-rdia-50">{title}</span>
          <span className="truncate text-xs text-gray-500 dark:text-rdia-300">{subtitle}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className={`text-2xl font-bold leading-none tabular-nums ${c.text}`}>{big}</span>
          {bigUnit && (
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-300">
              {bigUnit}
            </span>
          )}
        </div>
      </div>
      <ProgressBar value={safePct} fill={c.fill} height="h-2" />
    </div>
  );
}
