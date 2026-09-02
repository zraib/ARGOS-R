"use client";

import {
  cn,
  } from "@/components/dashboard/situational/shared";


export function Bar({ value, max = 100, fill, className }: { value: number; max?: number; fill: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/8", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, backgroundColor: fill }}
      />
    </div>
  );
}
