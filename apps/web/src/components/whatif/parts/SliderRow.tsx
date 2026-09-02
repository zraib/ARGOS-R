"use client";

import { useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import {
  cn,
  SliderCfg,
  } from "@/components/whatif/parts/shared";


export function SliderRow({
  cfg,
  value,
  onChange,
  compact = false,
}: {
  cfg: SliderCfg;
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  const m = useModules();
  const isDual = cfg.min < 0 && cfg.max > 0;
  const pctDual = isDual
    ? ((value - cfg.min) / (cfg.max - cfg.min)) * 100
    : ((value - cfg.min) / (cfg.max - cfg.min)) * 100;
  const fmtVal = cfg.fmt ? cfg.fmt(value) : `${value}${m.whatif[cfg.unitKey]}`;

  const delta = isDual ? value : 0;

  // DIMENSIONS selon compact ou non
  const icSize = compact ? 12 : 14;
  const labelCls = compact ? "text-[10.5px]" : "text-[11.5px]";
  const valCls = compact ? "text-[10.5px] px-1.5 py-[2px]" : "text-[11px] px-1.5 py-0.5";
  const trH = compact ? "[&::-webkit-slider-runnable-track]:h-[6px] [&::-moz-range-track]:h-[6px]" : "[&::-webkit-slider-runnable-track]:h-2 [&::-moz-range-track]:h-2";
  const thMt = compact ? "[&::-webkit-slider-thumb]:mt-[-4px]" : "[&::-webkit-slider-thumb]:mt-[-6px]";
  const thSz = compact ? "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3" : "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4";

  return (
    <div className={cn(compact ? "space-y-1" : "space-y-1.5")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon
            path={cfg.icon}
            size={icSize}
            strokeWidth={compact ? 1.9 : 1.8}
            className={cn(
              "shrink-0",
              cfg.higherIsWorse ? "text-gray-500 dark:text-rdia-400" : "text-or-500/80",
            )}
          />
          <span className={cn("truncate font-medium text-gray-700 dark:text-rdia-200", labelCls)}>
            {m.whatif[cfg.labelKey]}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md font-mono font-bold",
            valCls,
            isDual && delta > 0 && "bg-green-500/15 text-green-700 dark:text-green-300",
            isDual && delta < 0 && "bg-danger-400/15 text-danger-700 dark:text-danger-300",
            !isDual && cfg.higherIsWorse && value > 0 && "bg-danger-400/12 text-danger-700 dark:text-danger-300",
            !isDual && !cfg.higherIsWorse && value > 0 && "bg-green-500/12 text-green-700 dark:text-green-300",
            (!isDual || delta === 0) && value === 0 && "bg-gray-100 text-gray-500 dark:bg-rdia-600 dark:text-rdia-300",
          )}
        >
          {fmtVal}
        </span>
      </div>
      <div className="relative">
        {isDual && (
          <div className={cn(
            "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 dark:bg-rdia-500",
            compact ? "opacity-70" : "",
          )} />
        )}
        <input
          type="range"
          min={cfg.min}
          max={cfg.max}
          step={cfg.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "relative z-10 w-full appearance-none cursor-pointer bg-transparent",
            trH,
            "[&::-webkit-slider-runnable-track]:rounded-full",
            "[&::-webkit-slider-runnable-track]:bg-gray-100 dark:[&::-webkit-slider-runnable-track]:bg-rdia-600",
            "[&::-webkit-slider-thumb]:appearance-none",
            thMt,
            thSz,
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-sm",
            "[&::-webkit-slider-thumb]:bg-or-500 [&::-webkit-slider-thumb]:transition-transform",
            "active:[&::-webkit-slider-thumb]:scale-110",
            "[&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-gray-100 dark:[&::-moz-range-track]:bg-rdia-600",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-or-500",
          )}
          style={{
            background:
              typeof window === "undefined"
                ? undefined
                : `linear-gradient(to right, ${
                    isDual
                      ? `rgba(239,68,68,0.6) 0%, rgba(229,62,62,0.4) ${pctDual * (value < 0 ? 1 : 0)}%, transparent ${pctDual}%`
                      : value < 0
                      ? `rgba(239,68,68,0.55) ${pctDual}%, transparent ${pctDual}%`
                      : `rgba(249,115,22,0.6) ${pctDual}%, transparent ${pctDual}%`
                  })`,
          }}
        />
      </div>
    </div>
  );
}
