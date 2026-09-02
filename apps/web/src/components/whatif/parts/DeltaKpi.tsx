"use client";

import {
  cn,
  } from "@/components/whatif/parts/shared";


export function DeltaKpi({
  label,
  sub,
  delta,
  suffix,
}: {
  label: string;
  sub?: string;
  delta: number;
  suffix?: string;
}) {
  // Convention : Δ = sim - baseline
  //   Δ > 0 : score monte → empiré → ROUGE + ⬆️
  //   Δ < 0 : score baisse → améliore → VERT + ⬇️
  const worse = delta > 0;
  const better = delta < 0;
  return (
    <div
      className={cn(
        "rounded-xl border p-2.5 transition-all text-center flex flex-col items-stretch h-full",
        worse && "border-danger-400/20 bg-danger-400/[0.04]",
        better && "border-green-500/20 bg-green-500/[0.04]",
        !worse && !better && "border-gray-200 bg-white dark:border-rdia-600 dark:bg-rdia-700",
      )}
    >
      {/* LIGNE 1 : LABEL — HAUTEUR FIXE 12px (~2 lignes max) */}
      <div
        className="h-[22px] flex items-end justify-center text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-rdia-400"
        title={label}
      >
        <span className="line-clamp-2 leading-[11px] text-center">{label}</span>
      </div>

      {/* LIGNE 2 : CHIFFRE Δ — HAUTEUR FIXE 20px, FONT MONO pour alignement horizontal ±0 */}
      <div
        className={cn(
          "mt-1 h-[20px] flex items-center justify-center font-mono font-bold text-[16px] leading-none",
          worse && "text-danger-600 dark:text-danger-300",
          better && "text-green-600 dark:text-green-400",
          !worse && !better && "text-gray-600 dark:text-rdia-300",
        )}
      >
        <span className="tabular-nums">
          {delta === 0
            ? "± 0"
            : `${delta > 0 ? "⬆ +" : "⬇ "}${delta}${suffix ?? ""}`}
        </span>
      </div>

      {/* LIGNE 3 : SOUS-LABEL — HAUTEUR FIXE 22px (~2 lignes max), alignement bottom constant */}
      <div className="mt-1 min-h-[22px] flex items-start justify-center text-[10px] leading-[11px] text-gray-400 dark:text-rdia-400">
        <span className="text-center">{sub ?? "\u00A0"}</span>
      </div>
    </div>
  );
}
