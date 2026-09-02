"use client";

import { useModules } from "@/lib/store";
import { type ReactNode } from "react";
import type { SituationalAwareness } from "@/lib/ai/situational/types";
import {
  cn,
  LEVEL_META,
  NIV_TXT,
  fmtDur,
  } from "@/components/dashboard/situational/shared";
import { Icon } from "@/components/dashboard/situational/Icon";
import { Panel } from "@/components/dashboard/situational/Panel";
import { ScoreGauge } from "@/components/dashboard/situational/ScoreGauge";
import { MiniKpi } from "@/components/dashboard/situational/MiniKpi";
import { HotspotsBars } from "@/components/dashboard/situational/HotspotsBars";
import { ForeBars } from "@/components/dashboard/situational/ForeBars";
import { FactorBars } from "@/components/dashboard/situational/FactorBars";
import { RiskBars } from "@/components/dashboard/situational/RiskBars";
import { MetricBar } from "@/components/dashboard/situational/MetricBar";

// ---------- Rendu principal ----------
export function ShellInner({
  sa, loading, model, onRefresh, shell,
}: {
  sa: SituationalAwareness;
  loading: boolean;
  model?: string;
  onRefresh: () => void;
  shell: (children: ReactNode) => ReactNode;
}) {
  const m = useModules();
  const lm = LEVEL_META[sa.niveauGlobal];
  const score = Math.max(0, Math.min(100, Math.round(sa.scoreGlobal)));

  return shell(
    <>
      {/* ===================================================================
          HEADER PRINCIPAL PREMIUM · bandeau niveau global + score gauge + synthèse
          =================================================================== */}
      <header
        className={cn(
          "group relative isolate overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-rdia-700",
          lm.banner,
        )}
        style={{
          border: "1px solid rgba(175,140,60,0.22)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.7) inset, 0 26px 50px -28px rgba(30,20,0,0.14)",
        }}
      >
        {/* dégradé bandeau */}
        <div className={cn("pointer-events-none absolute inset-0", lm.bannerBg)} />
        {/* accent chevelure top-left bronze signature premium */}
        <span aria-hidden className="pointer-events-none absolute left-5 top-0 h-[3px] w-16" style={{background:"linear-gradient(90deg,#C9A84C,transparent)"}}/>
        {/* shimmer bronze hover premium */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#C9A84C]/12 to-transparent opacity-0 transition-opacity duration-700 group-hover:translate-x-full group-hover:opacity-100 duration-1400ms ease-out"
        />
        {/* halo accent bas gauche */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full opacity-35 blur-3xl"
          style={{ backgroundColor: lm.accent }}
        />

        <div className="relative z-10 flex flex-col gap-3 px-4 pb-4 pt-4 sm:flex-row sm:items-stretch sm:gap-4 sm:px-5 sm:pb-5 sm:pt-4.5">
          {/* ==== COLONNE GAUCHE : NIVEAU GLOBAL ==== */}
          <div className="flex shrink-0 flex-col gap-2.5 sm:w-[28%]">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-inner",
                  lm.bg, lm.border,
                )}
                style={{
                  boxShadow: "inset 0 0 0 1px rgba(201,168,76,0.18), 0 4px 16px -10px " + lm.accent + "66",
                }}
              >
                <span className="relative inline-flex h-3.5 w-3.5">
                  <span
                    className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", lm.dot)}
                  />
                  <span className={cn("relative inline-flex h-3.5 w-3.5 rounded-full", lm.dot)} />
                </span>
              </div>
              <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-none">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-or-600 dark:text-or-400">
                  {m.situational.level_global}
                </span>
                <span className={cn("text-[18px] font-bold leading-tight tracking-tight", lm.bannerText)}>
                  {lm.label}
                </span>
                {sa.fromAI ? (
                  <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-md border border-or-500/30 bg-or-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-or-600 dark:text-or-400">
                    <Icon name="sparkles" className="h-2.5 w-2.5" />
                    IA{model ? ` · ${model}` : ""}
                  </span>
                ) : (
                  <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-md border border-or-500/30 bg-or-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-or-600 dark:text-or-400">
                    <Icon name="scale" className="h-2.5 w-2.5" />
                    {m.situational.realtime}
                  </span>
                )}
              </div>
            </div>
            {/* sous-label synthèse tag premium */}
            <div className={cn("rounded-lg border p-2.5 sm:p-3", lm.bg, lm.border)} style={{background: lm.badgeTint}}>
              <div className="flex items-start gap-2">
                <Icon name="info" className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", lm.tint)} />
                <p className="text-[11.5px] leading-relaxed text-gray-700 dark:text-rdia-100">
                  {sa.synthese}
                </p>
              </div>
            </div>
          </div>

          {/* ==== COLONNE CENTRE : SCORE GAUGE CIRULAIRE ==== */}
          <div className="flex items-center justify-center shrink-0 sm:w-[36%]">
            <ScoreGauge value={score} accent={lm.accent} />
          </div>

          {/* ==== COLONNE DROITE : 3 INDICATEURS COURTS + refresh ==== */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1 grid grid-cols-3 gap-1.5 sm:gap-2">
                {/* KPI · incidents actifs */}
                <MiniKpi
                  icon="activity"
                  label={m.situational.incidents}
                  big={sa.pointsChauds.reduce((a, h) => a + h.nIncidents, 0)}
                  sub={`${sa.pointsChauds.length} zones`}
                  accent="#F59E0B"
                />
                {/* KPI · risque critique */}
                <MiniKpi
                  icon="alert-triangle"
                  label={m.situational.factors}
                  big={sa.facteursCritiques.length}
                  sub={
                    sa.facteursCritiques.filter((f) => f.impact === "haut").length > 0
                      ? `${sa.facteursCritiques.filter((f) => f.impact === "haut").length} impact haut`
                      : "impact maîtrisé"
                  }
                  accent="#EF4444"
                />
                {/* KPI · risque prochain */}
                <MiniKpi
                  icon="clock"
                  label={m.situational.h24}
                  big={(() => {
                    const r = sa.risquesProchaines.find((x) => x.horizon === "24h");
                    return r ? `${r.probabilitePct}%` : "—";
                  })()}
                  sub={(() => {
                    const r = sa.risquesProchaines.find((x) => x.horizon === "24h");
                    return r ? NIV_TXT[r.niveau] : "Sans risque";
                  })()}
                  accent="#4B5563"
                />
              </div>
              {/* Bouton refresh */}
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-gray-200/80 bg-white/90 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-gray-700 transition hover:-translate-y-0.5 hover:border-gray-300 hover:bg-white hover:shadow-sm disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-rdia-100 dark:hover:border-white/20 dark:hover:bg-white/10"
              >
                <Icon name="refresh-cw" className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                {loading ? "MAJ…" : "Actualiser"}
              </button>
            </div>
            {loading && (
              <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-rdia-500/[0.07] px-2 py-1 text-[9.5px] font-semibold text-rdia-700 dark:bg-rdia-500/10 dark:text-rdia-300">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-or-500 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-or-500" />
                </span>
                {m.situational.analyzing}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===================================================================
          CORPS : 3 étages (panneau A·B · 2 cols puis C·D · 2 cols puis E · full)
          =================================================================== */}

      {/* ==== ÉTAGE 1 · Panneaux A (Points chauds) ==== */}
      <Panel id="A" title={m.situational.hotspots} right={`${sa.pointsChauds.length} zone(s)`} accent="#3B82F6">
        <HotspotsBars data={sa.pointsChauds} />
      </Panel>

      {/* ==== ÉTAGE 2 · 2 colonnes ==== */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-4.5 lg:gap-5">
        {/* colonne gauche */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel id="B" title={m.situational.anticipations} right="30 min → 12 h" accent="#D97706">
            <ForeBars forecasts={sa.predictions} generatedAt={sa.generatedAt} debug={sa as unknown as { _debugLitsTot?: number; _debugLitsOcc?: number }} />
          </Panel>
          <Panel id="C" title={m.situational.flow6h} right={sa.predictions.flux6h.tendance} accent="#F59E0B">
            <MetricBar
              icon="activity"
              title={`${sa.predictions.flux6h.tendance}`}
              subtitle={`Pic dans ${fmtDur(sa.predictions.flux6h.picDansMinutes)}`}
              big={`+${sa.predictions.flux6h.total}`}
              bigUnit="patients"
              pct={Math.max(0, Math.min(100, (sa.predictions.flux6h.total / 300) * 100))}
              accent={sa.predictions.flux6h.tendance === "↗ en hausse" ? "#F59E0B" : "#4B5563"}
            />
          </Panel>
        </div>
        {/* colonne droite */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel id="D" title={m.situational.critical_factors} right={`${sa.facteursCritiques.length} détecté(s)`} accent="#EF4444">
            <FactorBars data={sa.facteursCritiques} />
          </Panel>
          <Panel id="E" title={m.situational.imminent_risks} right="H2 · H6 · H24" accent="#7C3AED">
            <RiskBars risks={sa.risquesProchaines} />
          </Panel>
        </div>
      </div>

      {/* ==== ÉTAGE 3 · Ruptures stock (pleine largeur) ==== */}
      <Panel id="F" title={m.situational.stock_breaks} right={sa.predictions.stockCritique.niveau} accent="#059669">
        <MetricBar
          icon="package"
          title={sa.predictions.stockCritique.niveau === "alerte" ? "Ruptures critiques" : sa.predictions.stockCritique.niveau === "attention" ? "Ruptures modérées" : "Stock nominal"}
          subtitle={sa.predictions.stockCritique.ruptures.length ? sa.predictions.stockCritique.ruptures.slice(0, 3).join(" · ") : "Stock nominal"}
          big={String(sa.predictions.stockCritique.ruptures.length)}
          bigUnit={sa.predictions.stockCritique.ruptures.length > 1 ? "ruptures" : sa.predictions.stockCritique.ruptures.length === 1 ? "rupture" : ""}
          pct={sa.predictions.stockCritique.niveau === "alerte" ? 95 : sa.predictions.stockCritique.niveau === "attention" ? 65 : 15}
          accent={sa.predictions.stockCritique.niveau === "alerte" ? "#EF4444" : sa.predictions.stockCritique.niveau === "attention" ? "#F59E0B" : "#059669"}
        />
      </Panel>

      {/* ==== FOOTER horodatage ==== */}
      <footer className="flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400 sm:text-[10.5px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-rdia-400 dark:bg-rdia-500" />
          <span className="font-bold uppercase tracking-[0.15em]">
            SITREP · Mis à jour {new Date(sa.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <span className="font-mono tabular-nums opacity-80">
          {m.situational.banner}
        </span>
      </footer>
    </>,
  );
}
