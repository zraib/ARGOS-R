// Recrée le <DashboardDonut> d'AminDesign : anneau SVG + légende avec valeurs.

import type { ChartDatum } from "@/components/charts/ChartCard";

const R = 52;
const STROKE = 20;
const C = 2 * Math.PI * R;

export function DonutChart({ titre, data, bare = false, compact = false }: { titre: string; data: ChartDatum[]; bare?: boolean; compact?: boolean }) {
  const total = Math.max(1, data.reduce((a, d) => a + d.value, 0));
  let offset = 0;

  const body = (
    <div className={`flex h-full w-full min-h-0 flex-1 ${
      compact
        ? "flex-row items-center gap-2"
        : bare
          ? "flex-col items-center justify-center gap-2"
          : "items-center gap-4"
    }`}>
        <div className={compact ? "relative shrink-0 w-[38%]" : "relative shrink-0"}>
          <svg className={compact ? "h-auto w-full" : ""} width={compact ? undefined : bare ? 108 : 140} height={compact ? undefined : bare ? 108 : 140} viewBox="0 0 140 140" preserveAspectRatio="xMidYMid meet">
            <g transform="rotate(-90 70 70)">
              <circle cx={70} cy={70} r={R} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={STROKE} />
              {data.map((d) => {
                const len = (d.value / total) * C;
                const seg = (
                  <circle
                    key={d.label}
                    cx={70}
                    cy={70}
                    r={R}
                    fill="none"
                    stroke={d.couleur}
                    strokeWidth={STROKE}
                    strokeDasharray={`${len} ${C - len}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return seg;
              })}
            </g>
            <text x={70} y={compact ? 68 : 66} textAnchor="middle" fontSize={compact ? 20 : 22} fontWeight={700} fill="currentColor" className="tabular-nums">
              {total}
            </text>
            <text x={70} y={compact ? 86 : 84} textAnchor="middle" fontSize={compact ? 8 : 9} fill="currentColor" fillOpacity={0.55}>
              TOTAL
            </text>
          </svg>
        </div>
        <div className={`flex min-w-0 flex-col gap-1.5 ${compact ? "w-[62%] flex-1" : bare ? "w-full" : "flex-1"}`}>
          {data.map((d) => (
            <div key={d.label} className={compact ? "flex items-start gap-1.5 text-[10.5px]" : "flex items-start gap-2 text-xs"}>
              <span className={`${compact ? "mt-[4px] h-2 w-2 shrink-0 rounded-sm" : "mt-[4px] h-2.5 w-2.5 shrink-0 rounded-sm"}`} style={{ backgroundColor: d.couleur }} />
              <span className={compact ? "min-w-0 flex-1 break-words font-semibold leading-tight text-gray-700 dark:text-rdia-200 hyphens-auto" : "min-w-0 flex-1 break-words leading-tight text-gray-600 dark:text-rdia-200 hyphens-auto"}>
                {d.label}
              </span>
              <span className={compact ? "shrink-0 font-mono text-[10px] font-bold tabular-nums text-gray-800 dark:text-rdia-100" : "shrink-0 font-mono font-semibold tabular-nums text-gray-700 dark:text-rdia-50"}>
                {d.value}
              </span>
            </div>
          ))}
        </div>
    </div>
  );

  if (bare) return body;
  return (
    <div className="carte flex h-full flex-col p-4">
      <h3 className="mb-4 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{titre}</h3>
      {body}
    </div>
  );
}
