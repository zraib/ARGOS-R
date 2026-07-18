// Recrée le <DashboardChartCard> d'AminDesign. Deux formes de graphique du
// tableau de bord : "bars" horizontales (incidents par type) et "column3d" (par
// région). SVG/flex pur — aucune librairie de graphes, le bundle reste auto-hébergé.

export interface ChartDatum {
  label: string;
  value: number;
  couleur: string;
}

function CardShell({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="carte flex h-full flex-col p-4">
      <h3 className="mb-4 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{titre}</h3>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Bars({ data }: { data: ChartDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col justify-center gap-3 h-full">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs text-gray-500 dark:text-rdia-200" title={d.label}>
            {d.label}
          </span>
          <div className="relative h-4 flex-1 overflow-hidden rounded-md bg-gray-100 dark:bg-rdia-800/60">
            <div
              className="h-full rounded-md transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.couleur }}
            />
          </div>
          <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-gray-600 dark:text-rdia-100">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function shade(hex: string, amt: number): string {
  // amt dans [-1, 1] ; éclaircit (>0) ou assombrit (<0) une couleur #rrggbb.
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amt * 255);
  const g = clamp(((n >> 8) & 255) + amt * 255);
  const b = clamp((n & 255) + amt * 255);
  return `rgb(${r} ${g} ${b})`;
}

function Column3D({ data }: { data: ChartDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 300;
  const H = 210;
  const pad = { top: 24, bottom: 34 };
  const chartH = H - pad.top - pad.bottom;
  const slot = W / data.length;
  const colW = Math.min(30, slot * 0.5);
  const depth = 7;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {/* baseline */}
      <line x1={0} y1={pad.top + chartH} x2={W} y2={pad.top + chartH} stroke="currentColor" strokeOpacity={0.12} />
      {data.map((d, i) => {
        const h = (d.value / max) * chartH;
        const x = i * slot + (slot - colW) / 2;
        const y = pad.top + chartH - h;
        const first = d.label.split(/[\s-]/)[0];
        return (
          <g key={d.label}>
            {/* top face */}
            <polygon
              points={`${x},${y} ${x + colW},${y} ${x + colW + depth},${y - depth} ${x + depth},${y - depth}`}
              fill={shade(d.couleur, 0.16)}
            />
            {/* right face */}
            <polygon
              points={`${x + colW},${y} ${x + colW + depth},${y - depth} ${x + colW + depth},${pad.top + chartH - depth} ${x + colW},${pad.top + chartH}`}
              fill={shade(d.couleur, -0.18)}
            />
            {/* front face */}
            <rect x={x} y={y} width={colW} height={h} fill={d.couleur} />
            {/* value */}
            <text x={x + colW / 2} y={y - depth - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="currentColor" fillOpacity={0.75}>
              {d.value}
            </text>
            {/* label */}
            <text x={x + colW / 2} y={pad.top + chartH + 16} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.55}>
              <title>{d.label}</title>
              {first}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ChartCard({
  titre,
  type,
  data,
  bare = false,
}: {
  titre: string;
  type: "bars" | "column3d";
  data: ChartDatum[];
  /** Rend uniquement le corps (sans carte ni titre) — pour une tuile parente. */
  bare?: boolean;
}) {
  const body = type === "bars" ? <Bars data={data} /> : <Column3D data={data} />;
  if (bare) return <div className="h-full">{body}</div>;
  return <CardShell titre={titre}>{body}</CardShell>;
}
