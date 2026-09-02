"use client";

import { useEffect, type ReactNode } from "react";
import { useArgos } from "@/lib/store";
import {
  cn,
  Props,
  } from "@/components/dashboard/situational/shared";
import { Bar } from "@/components/dashboard/situational/Bar";
import { ShellInner } from "@/components/dashboard/situational/ShellInner";

export default function SituationalAwarenessPanel({ className, bare }: Props) {
  const sa = useArgos((s) => s.situationalAwareness);
  const loading = useArgos((s) => s.situationalLoadingAI);
  const model = useArgos((s) => s.situationalModel);
  const recompute = useArgos((s) => s.recomputeSituationalAwarenessAI);

  const incidents = useArgos((s) => s.incidents);
  const hospitals = useArgos((s) => s.hospitals);
  const units = useArgos((s) => s.units);
  const dashStats = useArgos((s) => s.dashStats);
  const evoHash = (dashStats?.evolution ?? [])
    .slice(-6)
    .map((e) => `${e.d}_${e.opened ?? 0}_${e.closed ?? 0}`)
    .join("|");

  useEffect(() => {
    if (sa) return;
    void recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const run = () => void recompute();
    const schedule = () => { clearTimeout(t); t = setTimeout(run, 750); };
    schedule();
    return () => { if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents.length, hospitals.length, units.length, evoHash]);

  const shell = (children: ReactNode) =>
    bare ? (
      <div className={cn("flex h-full w-full flex-col gap-4 p-3 md:p-5", className)}>{children}</div>
    ) : (
      <section className={cn("rounded-2xl border bg-white p-4.5 shadow-sm backdrop-blur-md dark:border-white/5 md:p-6", className)}
        style={{border:"1px solid rgba(175,140,60,0.18)", boxShadow:"0 1px 0 rgba(255,255,255,0.6) inset, 0 24px 44px -26px rgba(30,20,0,0.12)"}}
      >
        <div className="flex h-full flex-col gap-4">{children}</div>
      </section>
    );

  if (!sa) {
    return shell(
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[12px] text-gray-500 dark:text-rdia-300">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 animate-pulse rounded-full", loading ? "bg-or-500" : "bg-rdia-400")} />
          <span className={cn("font-semibold", loading ? "text-or-600 dark:text-or-400" : "text-rdia-500 dark:text-rdia-300")}>
            {loading ? "Analyse en cours…" : "Initialisation"}
          </span>
        </div>
        <Bar value={60} className="h-1.5 w-56" fill={loading ? "#F59E0B" : "#4B5563"} />
      </div>,
    );
  }

  return <ShellInner sa={sa} loading={loading} model={model} onRefresh={() => void recompute()} shell={shell} />;
}
