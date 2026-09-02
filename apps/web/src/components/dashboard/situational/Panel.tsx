"use client";

import { type ReactNode } from "react";
import {
  cn,
  PanelId,
  } from "@/components/dashboard/situational/shared";


export function Panel({
  id, title, right, accent = "#C9A84C", children, className,
}: {
  id: PanelId;
  title: string;
  right?: ReactNode;
  accent?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "group relative isolate flex min-h-0 w-full flex-col overflow-hidden rounded-xl backdrop-blur-md bg-white/85 transition-all duration-300 hover:-translate-y-0.5",
        className,
      )}
      style={{
        border: "1px solid rgba(175,140,60,0.18)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 22px 38px -24px rgba(30,20,0,0.12)",
      }}
    >
      {/* accent chevelure top-left bronze (signature premium) */}
      <span aria-hidden className="pointer-events-none absolute left-4 top-0 h-[3px] w-14" style={{background:"linear-gradient(90deg,#C9A84C,transparent)"}}/>
      {/* shimmer bronze hover premium */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#C9A84C]/10 to-transparent opacity-0 transition-opacity duration-700 group-hover:translate-x-full group-hover:opacity-100 duration-1400ms ease-out"
      />
      {/* soft halo hover accent */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-35"
        style={{ backgroundColor: accent }}
      />

      {/* HEADER panel */}
      <header className="relative z-10 flex items-center justify-between gap-2 border-b px-4 pb-2.5 pt-3 sm:px-5" style={{borderColor:"rgba(175,140,60,0.14)"}}>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="shrink-0 rounded-md border border-or-500/40 bg-or-500/10 px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.2em] text-or-600 dark:text-or-400"
          >
            {id}
          </span>
          <h3 className="min-w-0 truncate text-[12.5px] font-bold tracking-tight text-rdia-600 dark:text-rdia-50 sm:text-[13px]">
            {title}
          </h3>
        </div>
        <div className="shrink-0 text-[10px] font-semibold text-or-600/85 dark:text-or-400/85 sm:text-[10.5px]">
          {right}
        </div>
      </header>

      {/* CONTENU panel */}
      <div className="relative z-10 min-h-0 flex-1 px-4 py-3 sm:px-5 sm:py-3.5">
        {children}
      </div>
    </section>
  );
}
