"use client";

import {
  fmtInt,
  fmtPct,
  occTint,
  } from "@/components/health/parts/shared";


// ===========================================================================
// 1 · Anneau d'occupation global
// ===========================================================================
export 
function OccupancyRing({
  pct,
  freePct,
  totalLits,
  freeLits,
  size = 112,
  stroke = 11,
  big = false,
}: {
  pct: number;
  freePct: number;
  totalLits: number;
  freeLits: number;
  size?: number;
  stroke?: number;
  big?: boolean;
}) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dashOcc = (clamped / 100) * circ;
  const dashFree = Math.max(0, circ - dashOcc - 2);
  const colorOcc = occTint(pct);
  const fs = big ? 24 : 20;
  const subFs = big ? 11 : 9;

  return (
    <div className={`flex w-full flex-col items-center ${big ? "gap-5" : "gap-2.5"}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth={stroke} strokeLinecap="butt" />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={colorOcc}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={`${dashOcc} ${dashFree}`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 select-none">
          <div
            className="font-bold tabular-nums leading-none text-gray-800 dark:text-white"
            style={{ fontSize: fs }}
          >
            {fmtPct(pct)}
          </div>
          <div
            className="font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-300"
            style={{ fontSize: subFs }}
          >
            occupés
          </div>
        </div>
      </div>
      <div className={`grid w-full grid-cols-2 ${big ? "gap-3 max-w-[420px]" : "gap-1.5"}`}>
        <div
          className={
            big
              ? "rounded-lg border border-gray-200 bg-white p-3 text-center dark:border-rdia-500 dark:bg-rdia-700"
              : "rounded-md border border-gray-100 bg-gray-50/70 px-1.5 py-1 text-center dark:border-rdia-600 dark:bg-rdia-800/40"
          }
        >
          <div
            className={big ? "text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300" : "text-[9px] uppercase tracking-wider text-gray-400 dark:text-rdia-400"}
          >
            total
          </div>
          <div
            className={
              big
                ? "text-[22px] font-bold tabular-nums text-gray-800 dark:text-white"
                : "text-[11px] font-bold tabular-nums text-gray-700 dark:text-rdia-100"
            }
          >
            {fmtInt(totalLits)}
          </div>
        </div>
        <div
          className={
            big
              ? "rounded-lg border border-gray-200 bg-white p-3 text-center dark:border-rdia-500 dark:bg-rdia-700"
              : "rounded-md border border-gray-100 bg-gray-50/70 px-1.5 py-1 text-center dark:border-rdia-600 dark:bg-rdia-800/40"
          }
        >
          <div
            className={big ? "text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300" : "text-[9px] uppercase tracking-wider text-gray-400 dark:text-rdia-400"}
          >
            libres
          </div>
          <div
            className={
              big
                ? "text-[22px] font-bold tabular-nums text-green-600 dark:text-green-400"
                : "text-[11px] font-bold tabular-nums text-green-600 dark:text-green-400"
            }
          >
            {fmtInt(freeLits)}
            {big ? null : (
              <span className="ml-0.5 text-[9px] opacity-70">({fmtPct(freePct)})</span>
            )}
          </div>
          {big && (
            <div className="mt-1 text-[11px] font-medium text-gray-500 dark:text-rdia-300">
              soit {fmtPct(freePct)} du parc
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
