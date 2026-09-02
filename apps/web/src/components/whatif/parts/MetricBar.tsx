"use client";

import {
  type WhatIfSubMetric,
} from "@/lib/ai/whatif/types";
import {
  cn,
  } from "@/components/whatif/parts/shared";
import { DeltaBadge } from "@/components/whatif/parts/DeltaBadge";

export function MetricBar({
  metric,
  detail,
}: {
  metric: WhatIfSubMetric;
  detail?: string;
}) {
  const delta = metric.delta;
  const worse = delta > 0;
  const better = delta < 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11.5px] font-medium text-gray-700 dark:text-rdia-200">
            {metric.label}
          </div>
          {detail && (
            <div className="truncate text-[9.5px] leading-tight text-gray-400 dark:text-rdia-400">
              {detail}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="font-mono text-[11.5px] font-semibold text-gray-700 dark:text-rdia-200">
            {Math.round(metric.value)}
          </span>
          <DeltaBadge delta={delta} small />
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            worse ? "bg-danger-400" : better ? "bg-green-500" : "bg-or-400",
          )}
          style={{ width: `${Math.max(3, Math.min(100, metric.value))}%` }}
        />
      </div>
    </div>
  );
}
