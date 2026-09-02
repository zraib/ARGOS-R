"use client";

import type { SituationalAwareness } from "@/lib/ai/situational/types";


// ---------- Hotspots bars redesign · cartes + bars ----------------
export function HotspotsBars({ data }: { data: SituationalAwareness["pointsChauds"] }) {
  if (!data.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200/80 p-5 text-center text-[11px] text-gray-400 dark:border-white/10">
        Aucun point chaud détecté
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.poids), 0.3);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {data.map((h, i) => {
        const hex =
          h.sev === "high" ? "#EF4444" :
          h.sev === "medium" ? "#F59E0B" :
          "#4B5563";
        const hPct = Math.max(8, (h.poids / max) * 100);
        return (
          <div
            key={h.id}
            className="group relative flex flex-col items-stretch gap-2 rounded-xl border p-2.5 transition-all duration-300 hover:-translate-y-0.5"
            style={{
              borderColor: `${hex}30`,
              backgroundColor: `${hex}08`,
              boxShadow: `0 6px 22px -22px ${hex}99`,
            }}
          >
            {/* rang label + n° rank */}
            <div className="flex items-center justify-between gap-1.5">
              <span
                className="font-mono text-[9px] font-black tabular-nums"
                style={{ color: `${hex}cc` }}
              >
                0{i + 1}
              </span>
              <span
                className="flex h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: hex }}
              />
            </div>
            {/* barre verticale container */}
            <div className="relative flex h-[76px] w-full items-end justify-center rounded-md bg-gray-100/60 dark:bg-white/6">
              <div
                className="relative w-[38px] shrink-0 rounded-t-md transition-all duration-700 ease-out group-hover:brightness-110"
                style={{
                  height: `${hPct}%`,
                  backgroundColor: hex,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px ${hex}22, 0 4px 18px -6px ${hex}aa`,
                }}
              />
            </div>
            {/* label région */}
            <div className="min-w-0 text-center">
              <div className="min-w-0 truncate text-[11px] font-extrabold leading-snug text-gray-800 dark:text-rdia-100" title={h.region}>
                {h.region}
              </div>
              <div className="mt-0.5 flex items-center justify-center gap-1">
                <span className="font-mono text-[9.5px] font-bold tabular-nums" style={{ color: `${hex}cc` }}>
                  {h.nIncidents}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-rdia-400">incident{h.nIncidents > 1 ? "s" : ""}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
