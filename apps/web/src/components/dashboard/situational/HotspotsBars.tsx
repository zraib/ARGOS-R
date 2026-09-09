"use client";

import { tpl } from "@/lib/i18n/format";
import { useModules } from "@/lib/store";
import type { SituationalAwareness } from "@/lib/ai/situational/types";
import { TONE_CLS, TUILE, type ToneFill } from "@/components/dashboard/situational/shared";
import { Icon } from "@/components/dashboard/situational/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * Points chauds : un bandeau de synthèse, puis une tuile par région.
 *
 * Les tuiles portaient un dégradé de fond, un halo flou, un double bord, une
 * ombre colorée et une colonne de barre gravée de pointillés — un vocabulaire
 * graphique que l'on ne trouve nulle part ailleurs dans le poste de
 * commandement. Elles emploient désormais la même grammaire que les tuiles de
 * chiffres du reste de l'application : pastille teintée, libellé discret,
 * grand nombre tabulaire, barre plate. La gravité se lit au badge, à la
 * pastille et au remplissage — jamais à la couleur seule, puisqu'elle est
 * aussi écrite.
 */
export function HotspotsBars({ data, totalIncidents }: { data: SituationalAwareness["pointsChauds"]; totalIncidents: number }) {
  const m = useModules();
  if (!data.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400 dark:border-rdia-600 dark:text-rdia-400">
        {m.situational.no_hotspot}
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.poids), 0.3);
  const nTotal = Math.max(1, totalIncidents);
  const TON: Record<"high" | "medium" | "low", ToneFill> = { high: "danger", medium: "or", low: "gray" };

  return (
    <div className="flex flex-col gap-4">
      {/* ==== Synthèse et légende ==== */}
      <div className={`flex flex-wrap items-center justify-between gap-3 ${TUILE}`}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
            <Icon name="activity" className="h-5 w-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-gray-500 dark:text-rdia-300">{m.situational.hb_title}</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-rdia-50">
              {tpl(m.situational.hb_summary, { z: data.length, n: totalIncidents })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["high", "medium", "low"] as const).map((sev) => (
            <span key={sev} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TONE_CLS[TON[sev]].badge}`}>
              {sev === "high" ? m.situational.hb_sev_high : sev === "medium" ? m.situational.hb_sev_medium : m.situational.hb_sev_low}
            </span>
          ))}
        </div>
      </div>

      {/* ==== Une tuile par région ==== */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        {data.map((h, i) => {
          const c = TONE_CLS[TON[h.sev]];
          const sevLabel =
            h.sev === "high" ? m.situational.hb_sev_high : h.sev === "medium" ? m.situational.hb_sev_medium : m.situational.hb_sev_low;
          return (
            <div key={h.id} className={`flex flex-col gap-3 ${TUILE}`}>
              {/* rang · région · gravité */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[12px] font-bold tabular-nums ${c.chip}`}>
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                      {m.situational.hb_region}
                    </span>
                    <span className="truncate text-[13px] font-semibold leading-tight text-gray-800 dark:text-rdia-50">
                      {h.region}
                    </span>
                  </div>
                </div>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${c.badge}`}>{sevLabel}</span>
              </div>

              {/* incidents rapportés au total */}
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-xs text-gray-500 dark:text-rdia-300">{m.situational.incidents}</span>
                  <span className="flex items-baseline gap-1">
                    <span className={`text-2xl font-bold leading-none tabular-nums ${c.text}`}>{h.nIncidents}</span>
                    <span className="text-[11px] text-gray-400 dark:text-rdia-400">/ {totalIncidents}</span>
                  </span>
                </div>
                <ProgressBar value={Math.round((h.nIncidents / nTotal) * 100)} fill={c.fill} />
              </div>

              {/* part du risque national */}
              <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-rdia-600">
                <span className="text-[11px] text-gray-500 dark:text-rdia-300">{m.situational.hb_share}</span>
                <span className="font-mono text-[12px] font-bold tabular-nums text-gray-700 dark:text-rdia-100">
                  {Math.round((h.poids / max) * 100)} %
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
