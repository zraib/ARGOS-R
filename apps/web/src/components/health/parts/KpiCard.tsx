"use client";

import { Icon } from "@/components/ui/Icon";
import {
  KpiProps,
  TINT,
  } from "@/components/health/parts/shared";


export function KpiCard({ icon, label, primary, secondary, tint = "neutral" }: KpiProps) {
  const c = TINT[tint];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-600 dark:bg-rdia-700">
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.chipBg} ${c.chipText}`}
        >
          <Icon path={icon} size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
            {label}
          </div>
          <div className={`mt-0.5 truncate text-[18px] font-bold tabular-nums leading-tight ${c.primary}`}>
            {primary}
          </div>
          {secondary && (
            <div className="mt-0.5 truncate text-[10.5px] font-medium leading-tight text-gray-500 dark:text-rdia-300">
              {secondary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
