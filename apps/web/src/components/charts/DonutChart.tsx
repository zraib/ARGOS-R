// Recrée le <DashboardDonut> d'AminDesign : anneau SVG + légende avec valeurs.

import type { ChartDatum } from "@/components/charts/ChartCard";

const R = 52;
const STROKE = 20;
const C = 2 * Math.PI * R;

export function DonutChart({ titre, data }: { titre: string; data: ChartDatum[] }) {
  const total = Math.max(1, data.reduce((a, d) => a + d.value, 0));
  let offset = 0;

  return (
    <div className="carte flex h-full flex-col p-4">
      <h3 className="mb-4 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{titre}</h3>
      <div className="flex flex-1 items-center gap-4">
        <div className="relative shrink-0">
          <svg width={140} height={140} viewBox="0 0 140 140">
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
            <text x={70} y={66} textAnchor="middle" fontSize={22} fontWeight={700} fill="currentColor" className="tabular-nums">
              {total}
            </text>
            <text x={70} y={84} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.55}>
              TOTAL
            </text>
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.couleur }} />
              <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-rdia-200" title={d.label}>
                {d.label}
              </span>
              <span className="shrink-0 font-mono font-semibold tabular-nums text-gray-700 dark:text-rdia-50">
                {d.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
