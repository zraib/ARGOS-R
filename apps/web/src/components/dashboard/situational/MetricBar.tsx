"use client";

import {
  IconName,
  } from "@/components/dashboard/situational/shared";
import { Icon } from "@/components/dashboard/situational/Icon";
import { Bar } from "@/components/dashboard/situational/Bar";

// ---------- Carte métrique (Flux 6h / Ruptures stock) redesign ----------------
export function MetricBar({
  icon, title, subtitle, big, bigUnit, pct, accent,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  big: string;
  bigUnit?: string;
  pct: number;
  accent: string;
}) {
  const safePct = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="group flex flex-col gap-2.5 rounded-2xl border p-3.5 w-full min-w-0 transition-all duration-300 hover:-translate-y-0.5 sm:p-4"
      style={{
        borderColor: `${accent}30`,
        backgroundColor: `${accent}0A`,
        boxShadow: `0 8px 28px -24px ${accent}bb`,
      }}
    >
      <div className="flex items-center gap-3 w-full min-w-0">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-tight">
          <div className="truncate text-[13px] font-extrabold leading-snug text-gray-900 dark:text-rdia-50">
            {title}
          </div>
          <div className="truncate text-[10.5px] leading-snug text-gray-500 dark:text-rdia-300/90">
            {subtitle}
          </div>
        </div>
        <div className="shrink-0 text-right flex flex-col items-end justify-center leading-none">
          <div
            className="text-[22px] font-black tracking-tight tabular-nums leading-none"
            style={{ color: accent }}
          >
            {big}
          </div>
          {bigUnit && (
            <div className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-rdia-300/90">
              {bigUnit}
            </div>
          )}
        </div>
      </div>
      <Bar value={safePct} className="h-2" fill={accent} />
    </div>
  );
}
