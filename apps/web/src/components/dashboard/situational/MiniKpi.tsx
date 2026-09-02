"use client";

import {
  IconName,
  } from "@/components/dashboard/situational/shared";
import { Icon } from "@/components/dashboard/situational/Icon";

// ---------------- Mini KPI header colonne droite · PREMIUM ----------------
export function MiniKpi({ icon, label, big, sub, accent }: {
  icon: IconName; label: string; big: string | number; sub: string; accent: string;
}) {
  return (
    <div
      className="group relative isolate overflow-hidden flex flex-col gap-1 rounded-xl border p-2 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        borderColor: "rgba(175,140,60,0.18)",
        background: "rgba(255,255,255,0.85)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 10px 22px -18px rgba(30,20,0,0.12)",
      }}
    >
      <span aria-hidden className="pointer-events-none absolute left-3 top-0 h-[3px] w-10" style={{background:"linear-gradient(90deg,#C9A84C,transparent)"}}/>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#C9A84C]/10 to-transparent opacity-0 transition-opacity duration-700 group-hover:translate-x-full group-hover:opacity-100 duration-1400ms ease-out"
      />
      <div className="relative z-10 flex items-center gap-1.5">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-or-500/15 text-or-600 dark:text-or-400"
        >
          <Icon name={icon} className="h-3 w-3" />
        </span>
        <span
          className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-or-600 dark:text-or-400"
        >
          {label}
        </span>
      </div>
      <div className="relative z-10 flex items-baseline gap-1.5 leading-none pl-0.5">
        <span
          className="text-[17px] font-bold tabular-nums leading-none"
          style={{ color: accent }}
        >
          {big}
        </span>
      </div>
      <div className="relative z-10 truncate text-[9px] font-semibold pl-0.5" style={{color:"rgba(28,26,23,0.60)"}}>
        {sub}
      </div>
    </div>
  );
}
