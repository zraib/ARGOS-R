"use client";

import {
  type HospinetFacts,
} from "@/lib/ai/llmHospinetSummary";
import {
  PAD,
  PAD_XL,
  fmtPct,
  occTint,
  } from "@/components/health/parts/shared";


// ===========================================================================
// 2 · Barres verticales par service
// ===========================================================================
export 
function ServicesBars({
  services,
  big = false,
}: {
  services: HospinetFacts["services"];
  big?: boolean;
}) {
  const pad = big ? PAD_XL : PAD;
  const W = big ? 560 : 360;
  const H = big ? 260 : 138;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const count = services.length;
  const gap = big ? 28 : 14;
  const barW = (innerW - (count - 1) * gap) / count;
  const tickFs = big ? 10 : 8.5;
  const nameFs = big ? 12 : 9;
  const pctFs = big ? 11 : 8.5;

  return (
    <div className="flex w-full flex-col">
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {/* axes */}
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={H - pad.bottom}
          stroke="#E5E7EB"
          strokeWidth={big ? 1.2 : 1}
        />
        <line
          x1={pad.left}
          y1={H - pad.bottom}
          x2={W - pad.right}
          y2={H - pad.bottom}
          stroke="#E5E7EB"
          strokeWidth={big ? 1.2 : 1}
        />
        {/* ticks Y */}
        {[0, 25, 50, 75, 100].map((g) => {
          const y = H - pad.bottom - (g / 100) * innerH;
          return (
            <g key={g}>
              <line
                x1={pad.left - (big ? 5 : 3)}
                y1={y}
                x2={pad.left}
                y2={y}
                stroke="#C7CCD2"
                strokeWidth={1}
              />
              <text
                x={pad.left - (big ? 8 : 5)}
                y={y + (big ? 4 : 3)}
                textAnchor="end"
                className="fill-gray-400"
                style={{ fontSize: tickFs, fontWeight: 500 }}
              >
                {g}
              </text>
              {big && g !== 0 && (
                <line
                  x1={pad.left}
                  y1={y}
                  x2={W - pad.right}
                  y2={y}
                  stroke="#E5E7EB"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  opacity="0.6"
                />
              )}
            </g>
          );
        })}
        {services.map((s, i) => {
          const x = pad.left + i * (barW + gap);
          const clamped = Math.max(0, Math.min(100, s.pct));
          const h = Math.max(1, (clamped / 100) * innerH);
          const y = H - pad.bottom - h;
          const fill = occTint(s.pct);
          const pctAbove = big ? true : h >= 20;
          return (
            <g key={s.name}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={big ? 3 : 2}
                fill={fill}
                opacity="0.92"
              >
                <title>
                  {s.name} · {s.free} libres / {s.total} ({fmtPct(s.pct)})
                </title>
              </rect>
              {/* nom du service sous l'axe */}
              <text
                x={x + barW / 2}
                y={H - pad.bottom + (big ? 22 : 14)}
                textAnchor="middle"
                className="fill-gray-700 dark:fill-rdia-200"
                style={{ fontSize: nameFs, fontWeight: big ? 700 : 600 }}
              >
                {s.name}
              </text>
              {/* % : au-dessus si place, sinon à droite */}
              {pctAbove ? (
                <text
                  x={x + barW / 2}
                  y={y - (big ? 8 : 4)}
                  textAnchor="middle"
                  className="fill-gray-800 dark:fill-white"
                  style={{ fontSize: pctFs, fontWeight: 800 }}
                >
                  {fmtPct(s.pct)}
                </text>
              ) : (
                <text
                  x={x + barW + 3}
                  y={y + (big ? 11 : 8)}
                  className="fill-gray-600 dark:fill-rdia-200"
                  style={{ fontSize: pctFs, fontWeight: 700 }}
                >
                  {fmtPct(s.pct)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
