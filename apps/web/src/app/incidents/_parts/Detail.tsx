"use client";

import { type ReactNode } from "react";


/** Ligne libellé / valeur. */
export function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</div>
      <div className="text-gray-800 dark:text-rdia-50">{value}</div>
    </div>
  );
}
