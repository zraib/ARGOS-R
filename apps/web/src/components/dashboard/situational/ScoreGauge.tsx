"use client";

import { useModules } from "@/lib/store";



// ---------------- helpers score gauge circulaire ----------------
export function ScoreGauge({ value, accent }: { value: number; accent: string }) {
  const m = useModules();
  const R = 54;
  const STROKE = 10;
  const C = 2 * Math.PI * R;
  const len = (value / 100) * C;
  return (
    <div className="relative flex items-center justify-center">
      <svg width="150" height="150" viewBox="0 0 140 140" className="h-[130px] w-[130px] sm:h-[140px] sm:w-[140px] lg:h-[150px] lg:w-[150px]">
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity={0.95} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.55} />
          </linearGradient>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* track fond */}
        <g transform="rotate(-90 70 70)">
          <circle
            cx={70} cy={70} r={R} fill="none"
            stroke="currentColor" strokeOpacity={0.07} strokeWidth={STROKE}
          />
          {/* segment progression */}
          <circle
            cx={70} cy={70} r={R} fill="none"
            stroke="url(#scoreGrad)" strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={`${len} ${C - len}`} filter="url(#softGlow)"
            style={{ transition: "stroke-dasharray 900ms ease" }}
          />
        </g>
        {/* point accent début */}
        <circle
          cx={70} cy={16} r={4.5}
          fill={accent} fillOpacity={0.9}
        />
        <text x={70} y={64} textAnchor="middle" fontSize={28} fontWeight={900} fill={accent} className="tabular-nums">
          {value}
        </text>
        <text x={70} y={84} textAnchor="middle" fontSize={9} fontWeight={800} fill="currentColor" fillOpacity={0.5} letterSpacing={3}>
          {m.situational.score_of_100}
        </text>
      </svg>
    </div>
  );
}
