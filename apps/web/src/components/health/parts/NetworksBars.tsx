"use client";

import {
  type HospinetFacts,
} from "@/lib/ai/llmHospinetSummary";
import {
  fmtInt,
  fmtPct,
  } from "@/components/health/parts/shared";


// ===========================================================================
// 3 · Barres horizontales · Réseaux militaire / civil + catégories
// ===========================================================================
export 
function NetworksBars({
  networks,
  kinds,
  big = false,
}: {
  networks: HospinetFacts["networks"];
  kinds: HospinetFacts["kinds"];
  big?: boolean;
}) {
  const W = big ? 560 : 340;
  const H = big ? 80 : 150;
  const padL = big ? 80 : 60;
  const padR = big ? 18 : 8;
  const padT = big ? 14 : 8;
  const innerW = W - padL - padR;
  const barH = big ? 18 : 12;
  const gap = big ? 12 : 10;
  const startY = padT;

  const labelFs = big ? 12 : 9.5;
  const valueFs = big ? 11 : 8.5;
  const kindFs = big ? 11 : 8.5;

  return (
    <div className={`flex w-full flex-col ${big ? "gap-3" : "gap-2"}`}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {networks.map((n, i) => {
          const y = startY + i * (barH + gap);
          const clamped = Math.max(0, Math.min(100, n.pct));
          const w = Math.max(2, (clamped / 100) * innerW);
          const color = n.reseau === "militaire" ? "#C9A84C" : "#3B82F6";
          const label = n.reseau === "militaire" ? "Militaire" : "Civil";
          const labelInside = w > (big ? 130 : 62);
          return (
            <g key={n.reseau}>
              <text
                x={padL - (big ? 12 : 6)}
                y={y + barH / 2 + (big ? 5 : 3.5)}
                textAnchor="end"
                className="fill-gray-700 dark:fill-rdia-200"
                style={{ fontSize: labelFs, fontWeight: big ? 800 : 600 }}
              >
                {label}
              </text>
              <rect
                x={padL}
                y={y}
                width={innerW}
                height={barH}
                rx={big ? 5 : 2.5}
                fill="#E5E7EB"
                opacity="0.45"
              />
              <rect
                x={padL}
                y={y}
                width={w}
                height={barH}
                rx={big ? 5 : 2.5}
                fill={color}
              >
                <title>
                  {label} · {n.free} libres / {n.lits} lits ({fmtPct(n.pct)})
                </title>
              </rect>
              {labelInside ? (
                <text
                  x={padL + (big ? 10 : 4)}
                  y={y + barH / 2 + (big ? 4.5 : 3)}
                  style={{ fontSize: valueFs, fontWeight: 800 }}
                  fill="#fff"
                >
                  {fmtPct(n.pct)} · {fmtInt(n.lits)} lits
                </text>
              ) : (
                <text
                  x={padL + w + (big ? 8 : 3)}
                  y={y + barH / 2 + (big ? 4.5 : 3)}
                  style={{ fontSize: valueFs, fontWeight: 800 }}
                  className="fill-gray-800 dark:fill-white"
                >
                  {fmtPct(n.pct)} · {fmtInt(n.lits)}
                </text>
              )}
            </g>
          );
        })}
        {/* Légende catégories (mode compact seulement) */}
        {!big && (
          <g transform={`translate(${padL - 2}, ${startY + 2 * (barH + gap) + 6})`}>
            {kinds.slice(0, 4).map((k, i) => {
              const col = i % 2;
              const row = Math.floor(i / 2);
              const cx_ = col * 132;
              const cy_ = row * 15;
              return (
                <g key={k.kind ?? i} transform={`translate(${cx_}, ${cy_})`}>
                  <rect
                    x={0}
                    y={2}
                    width={8}
                    height={8}
                    rx={1.5}
                    fill={k.color}
                  />
                  <text
                    x={12}
                    y={9}
                    className="fill-gray-700 dark:fill-rdia-200"
                    style={{ fontSize: kindFs, fontWeight: 600 }}
                  >
                    {k.label}
                    <tspan className="opacity-60" style={{ fontWeight: 500 }}>
                      {" "}
                      · {k.count} éta.
                    </tspan>
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {/* Légende catégories (mode big) — HTML centré */}
      {big && (
        <div className="mx-auto grid w-full max-w-[520px] grid-cols-2 gap-y-2 gap-x-6">
          {kinds.slice(0, 4).map((k) => (
            <div key={k.kind ?? k.label} className="flex items-center gap-2.5">
              <div
                className="h-3 w-3 shrink-0 rounded-[2.5px] shadow-inner"
                style={{ background: k.color }}
              />
              <span className="text-[11.5px] font-medium text-gray-700 dark:text-rdia-200">
                {k.label}
                <span className="opacity-60"> · {k.count} éta.</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {!big && (
        <div
          className={`grid grid-cols-2 ${big ? "gap-4 max-w-[560px]" : "gap-1.5"}`}
        >
          {networks.map((n) => {
            const reaPct = n.reaPct;
            const color =
              reaPct >= 92
                ? "text-danger-500 dark:text-danger-300"
                : reaPct >= 75
                  ? "text-or-500 dark:text-or-400"
                  : "text-green-600 dark:text-green-400";
            const header =
              big
                ? "text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300"
                : "text-[8.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
            const valueCls = big
              ? `text-[22px] font-extrabold tabular-nums ${color}`
              : `text-[11px] font-bold tabular-nums ${color}`;
            return (
              <div
                key={n.reseau}
                className={
                  big
                    ? "rounded-xl border border-gray-200 bg-white p-4 text-center dark:border-rdia-500 dark:bg-rdia-700"
                    : "rounded-md border border-gray-100 bg-gray-50/70 px-1.5 py-1 text-center dark:border-rdia-600 dark:bg-rdia-800/40"
                }
              >
                <div className={header}>
                  REA {n.reseau === "militaire" ? "militaire" : "civil"}
                </div>
                <div className={valueCls}>
                  {fmtInt(n.reaFree)}
                  <span className="opacity-60">/{fmtInt(n.rea)}</span>
                </div>
                {big && (
                  <div className="mt-1 text-[12px] font-medium text-gray-500 dark:text-rdia-300">
                    {fmtPct(reaPct)} d'occupation
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
