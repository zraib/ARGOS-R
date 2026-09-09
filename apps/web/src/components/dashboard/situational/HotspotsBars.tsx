"use client";

import { tpl } from "@/lib/i18n/format";
import { TOKEN } from "@/components/dashboard/situational/shared";
import { useModules } from "@/lib/store";
import type { SituationalAwareness } from "@/lib/ai/situational/types";
import { Icon } from "@/components/dashboard/situational/Icon";

/**
 * Points chauds : un bandeau de synthèse (zones à risque, total RÉEL des
 * incidents actifs, légende des gravités) puis une carte par région avec le
 * nombre d'incidents rapporté au total, la barre de poids et la part du
 * risque national.
 */
export function HotspotsBars({ data, totalIncidents }: { data: SituationalAwareness["pointsChauds"]; totalIncidents: number }) {
  const m = useModules();
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200/80 p-6 text-center text-[12px] font-semibold text-gray-400 dark:border-white/10">
        {m.situational.no_hotspot}
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.poids), 0.3);
  const nTotal = Math.max(1, totalIncidents);
  return (
    <div className="flex flex-col gap-4">
      {/* ==== Synthèse en tête ==== */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100/80 bg-gradient-to-r from-gray-50/60 via-white/80 to-or-500/[0.05] px-4 py-3 dark:border-white/8 dark:from-white/4 dark:via-white/3 dark:to-or-500/[0.08]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-or-500/25 bg-or-500/10">
            <Icon name="activity" className="h-4 w-4 text-or-500" />
          </div>
          <div className="flex flex-col gap-0.5 leading-tight">
            <span className="text-[9.5px] font-black uppercase tracking-[0.22em] text-or-600/75 dark:text-or-400/75">
              {m.situational.hb_title}
            </span>
            <span className="text-[12px] font-semibold text-gray-700 dark:text-rdia-100">
              {tpl(m.situational.hb_summary, { z: data.length, n: totalIncidents })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-danger-500/25 bg-danger-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-danger-500">
            <span className="h-1.5 w-1.5 rounded-full bg-danger-500" /> {m.situational.hb_sev_high}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-or-500/30 bg-or-500/12 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-or-600 dark:text-or-500">
            <span className="h-1.5 w-1.5 rounded-full bg-or-500" /> {m.situational.hb_sev_medium}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-rdia-400/30 bg-rdia-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-rdia-500 dark:text-rdia-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rdia-400" /> {m.situational.hb_sev_low}
          </span>
        </div>
      </div>

      {/* ==== Une carte par région ==== */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
        {data.map((h, i) => {
          // Même convention de gravité que le reste de l'application
              // (`satTint`, `occBarClass`) : rouge, or, puis neutre.
              const hex = h.sev === "high" ? TOKEN.danger500 : h.sev === "medium" ? TOKEN.or500 : TOKEN.gray500;
          const sevLabel = h.sev === "high" ? m.situational.hb_sev_high : h.sev === "medium" ? m.situational.hb_sev_medium : m.situational.hb_sev_low;
          const hPct = Math.max(12, (h.poids / max) * 100);
          return (
            <div
              key={h.id}
              className="group relative overflow-hidden rounded-2xl border-2 bg-white/95 p-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-xl dark:bg-white/4"
              style={{
                borderColor: `${hex}3A`,
                background: `linear-gradient(180deg, ${hex}0D 0%, ${hex}03 45%, rgba(255,255,255,0) 100%)`,
                boxShadow: `0 1px 0 rgba(255,255,255,0.8) inset, 0 12px 30px -22px ${hex}AA, 0 0 0 1px ${hex}08`,
              }}
            >
              <span aria-hidden className="pointer-events-none absolute left-5 top-0 h-[3px] w-16" style={{ background: `linear-gradient(90deg, ${TOKEN.or500}, transparent)` }} />
              <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-3xl" style={{ backgroundColor: hex }} />

              {/* rang + région + gravité */}
              <div className="relative z-10 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-xl border font-mono text-[12px] font-black tabular-nums shadow-inner"
                    style={{ borderColor: `${hex}33`, backgroundColor: `${hex}12`, color: hex, boxShadow: `inset 0 0 0 1px ${hex}15` }}
                  >
                    0{i + 1}
                  </span>
                  <div className="flex flex-col gap-0.5 leading-tight">
                    <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-gray-400 dark:text-rdia-400">{m.situational.hb_region}</span>
                    <span className="text-[13.5px] font-black leading-tight text-gray-900 dark:text-rdia-50">{h.region}</span>
                  </div>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em]"
                  style={{ borderColor: `${hex}33`, backgroundColor: `${hex}10`, color: hex }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
                  {sevLabel}
                </span>
              </div>

              {/* incidents rapportés au total + barre de poids */}
              <div className="relative z-10 mt-4 flex items-end justify-between gap-4">
                <div className="flex min-w-0 shrink-0 flex-col gap-0.5 leading-none">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-rdia-400">{m.situational.incidents}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[30px] font-black leading-none tabular-nums" style={{ color: hex, filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.8))" }}>
                      {h.nIncidents}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-rdia-300">/ {totalIncidents}</span>
                  </div>
                  <div className="mt-0.5 h-1 w-28 overflow-hidden rounded-full bg-gray-100/80 dark:bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${Math.round((h.nIncidents / nTotal) * 100)}%`, background: `linear-gradient(90deg, ${hex}DD, ${hex}88)` }} />
                  </div>
                </div>
                <div className="relative flex h-[110px] w-14 shrink-0 items-end justify-center rounded-xl bg-gradient-to-b from-gray-100/70 to-gray-100/30 shadow-inner dark:from-white/8 dark:to-white/2">
                  <div
                    className="relative w-9 shrink-0 rounded-t-xl transition-all duration-700 ease-out group-hover:brightness-110"
                    style={{
                      height: `${hPct}%`,
                      background: `linear-gradient(180deg, ${hex} 0%, ${hex}DD 40%, ${hex}80 100%)`,
                      boxShadow: `inset 0 2px 0 rgba(255,255,255,0.45), 0 0 0 1px ${hex}33, 0 10px 24px -8px ${hex}AA`,
                    }}
                  >
                    <span className="absolute left-1/2 top-1 flex h-2 w-2 -translate-x-1/2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.8)" }} />
                  </div>
                  {[25, 50, 75].map((g) => (
                    <span key={g} aria-hidden className="absolute left-1 right-1 border-t border-dashed" style={{ bottom: `${g}%`, borderColor: "rgba(0,0,0,0.04)" }} />
                  ))}
                </div>
              </div>

              {/* part du risque national */}
              <div className="relative z-10 mt-3 flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: `${hex}15` }}>
                <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-rdia-400">{m.situational.hb_share}</span>
                <span className="font-mono text-[11.5px] font-black tabular-nums" style={{ color: `${hex}CC` }}>
                  {Math.round((h.poids / max) * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
