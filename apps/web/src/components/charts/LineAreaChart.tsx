"use client";

import { axisTicks } from "@/lib/charts";

// ============================================================================
// ARGOS — graphe d'évolution (SVG pur, sans dépendance externe)
// Série temporelle à deux courbes : aire dorée (incidents déclarés) + ligne
// verte (clôturés). Utilisé par le tableau de bord national (évolution 30 j).
// ============================================================================

export interface EvolutionPoint {
  d: string;
  opened: number;
  closed: number;
}

interface Props {
  titre: string;
  data: EvolutionPoint[];
  labelOpened: string;
  labelClosed: string;
  /** Rend uniquement le corps (légende + courbe), sans carte ni titre. */
  bare?: boolean;
}

const W = 560;
const H = 190;
const PAD = { top: 14, right: 10, bottom: 26, left: 28 };

export function LineAreaChart({ titre, data, labelOpened, labelClosed, bare = false }: Props) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...data.map((p) => Math.max(p.opened, p.closed)));
  const xAt = (i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
  const yAt = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = (get: (p: EvolutionPoint) => number) =>
    data.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(get(p)).toFixed(1)}`).join(" ");
  const area = `${line((p) => p.opened)} L${xAt(data.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left},${(PAD.top + innerH).toFixed(1)} Z`;

  // Graduations Y (jusqu'à 4 lignes, distinctes — voir `lib/charts`) + étiquettes X clairsemées (1 sur 6).
  const ticks = axisTicks(max);

  const legend = (
    <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-rdia-300">
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-or-500" />{labelOpened}</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />{labelClosed}</span>
    </div>
  );

  const chart =
    data.length === 0 ? (
      <div className="flex flex-1 items-center justify-center text-xs text-gray-400 dark:text-rdia-400">—</div>
    ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={titre}>
          {/* grille + graduations */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yAt(v)} y2={yAt(v)} stroke="currentColor" strokeOpacity={0.08} />
              <text x={PAD.left - 6} y={yAt(v) + 3} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.45}>{v}</text>
            </g>
          ))}
          {/* aire + ligne « déclarés » */}
          <path d={area} fill="#C9A84C" fillOpacity={0.18} />
          <path d={line((p) => p.opened)} fill="none" stroke="#C9A84C" strokeWidth={2} strokeLinejoin="round" />
          {/* ligne « clôturés » */}
          <path d={line((p) => p.closed)} fill="none" stroke="#22c55e" strokeWidth={1.8} strokeDasharray="4 3" strokeLinejoin="round" />
          {/* point du dernier jour */}
          <circle cx={xAt(data.length - 1)} cy={yAt(data[data.length - 1].opened)} r={3.2} fill="#C9A84C" />
          {/* étiquettes X clairsemées */}
          {data.map((p, i) =>
            i % 6 === 0 || i === data.length - 1 ? (
              <text key={p.d + i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.45}>
                {p.d}
              </text>
            ) : null,
          )}
        </svg>
    );

  if (bare) {
    return (
      <div className="flex h-full flex-col gap-1">
        <div className="flex justify-end">{legend}</div>
        <div className="min-h-0 flex-1">{chart}</div>
      </div>
    );
  }

  return (
    <div className="carte flex h-full flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">{titre}</h3>
        {legend}
      </div>
      {chart}
    </div>
  );
}
