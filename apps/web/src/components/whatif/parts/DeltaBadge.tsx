"use client";

import {
  cn,
  } from "@/components/whatif/parts/shared";


export function DeltaBadge({
  delta,
  small,
}: {
  delta: number;
  small?: boolean;
}) {
  if (delta === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md bg-gray-100 font-mono font-bold text-gray-500 dark:bg-rdia-600 dark:text-rdia-400",
          small ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-1 text-xs",
        )}
      >
        ±0
      </span>
    );
  }
  // pos → empiré ROUGE, neg → améliore VERT
  const worse = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono font-bold",
        worse
          ? "rounded-md bg-danger-400/15 text-danger-700 dark:text-danger-300"
          : "rounded-md bg-green-500/15 text-green-700 dark:text-green-300",
        small ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-1 text-xs",
      )}
    >
      {worse ? "⬆ +" : "⬇ "}
      {delta}
    </span>
  );
}
