"use client";

import {
  cn,
  } from "@/components/whatif/parts/shared";
import { DeltaBadge } from "@/components/whatif/parts/DeltaBadge";

export function HorizonRow({
  label,
  base,
  sim,
  delta,
  probLabel,
}: {
  label: string;
  base: number;
  sim: number;
  delta: number;
  probLabel: string;
}) {
  const worse = delta > 0;
  const better = delta < 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-bold text-gray-700 dark:text-rdia-200">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-mono">
          <span className="text-gray-400 dark:text-rdia-400">{base} →</span>
          <span className="font-bold text-gray-800 dark:text-rdia-100">{sim}</span>
          <DeltaBadge delta={delta} small />
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
        <div
          className={cn(
            "h-full rounded-full",
            worse ? "bg-danger-400" : better ? "bg-green-500" : "bg-or-400",
          )}
          style={{ width: `${Math.max(4, Math.min(100, sim))}%` }}
        />
      </div>
      <div className="text-[10.5px] text-gray-500 dark:text-rdia-400">
        <span className="font-semibold">{probLabel}</span>
      </div>
    </div>
  );
}
