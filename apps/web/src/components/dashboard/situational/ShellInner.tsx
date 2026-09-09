"use client";

import { useModules } from "@/lib/store";
import { type ReactNode } from "react";
import type { SituationalAwareness } from "@/lib/ai/situational/types";
import {
  cn,
  LEVEL_META,
  fmtDur,
} from "@/components/dashboard/situational/shared";
import { Icon } from "@/components/dashboard/situational/Icon";
import { Panel } from "@/components/dashboard/situational/Panel";
import { ScoreGauge } from "@/components/dashboard/situational/ScoreGauge";
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
      {/* En-tête du panneau : une carte du produit, teintée par le niveau
          d'alerte. Le balayage lumineux, le halo flou et les rehauts en creux
          ont été retirés — trois ornements qu'aucune autre carte ne porte. */}
      <header className="carte relative isolate shrink-0 overflow-hidden">
        <div className={cn("pointer-events-none absolute inset-0", lm.bannerBg)} />

        <div className="relative z-10 flex flex-col gap-4 px-4 pb-4.5 pt-4.5 sm:px-5 sm:pb-5 sm:pt-5 lg:flex-row lg:items-center lg:gap-6">
          {/* ==== COLONNE GAUCHE : niveau global + synthèse opérationnelle ==== */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-3">
              {/* Pastille du niveau : même forme que celle des tuiles de chiffres. */}
              <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border", lm.bg, lm.border)}>
                <span className="relative inline-flex h-3.5 w-3.5">
                  <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-65", lm.dot)} />
                  <span className={cn("relative inline-flex h-3.5 w-3.5 rounded-full", lm.dot)} />
                </span>
              </div>
              <div className="min-w-0 flex flex-col gap-0.5 leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                  {m.situational.level_global}
                </span>
                <span className={cn("text-[18px] sm:text-[19px] font-bold leading-none tracking-tight", lm.bannerText)}>
                  {m.situational[lm.labelKey]}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {sa.fromAI ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-or-500/35 bg-or-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-or-600 dark:text-or-400">
                      <Icon name="sparkles" className="h-2.5 w-2.5" />
                      IA{model ? ` · ${model}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-or-500/35 bg-or-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-or-600 dark:text-or-400">
                      <Icon name="scale" className="h-2.5 w-2.5" />
                      {m.situational.realtime}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/70 bg-white/85 px-1.5 py-0.5 text-[9.5px] font-semibold tabular-nums text-gray-600 dark:border-white/15 dark:bg-white/6 dark:text-rdia-200">
                    <Icon name="clock" className="h-2.5 w-2.5 text-or-500" />
                    {new Date(sa.generatedAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            </div>

            {/* Synthèse opérationnelle */}
            <div className={cn("rounded-lg border p-2.5 sm:p-3", lm.border, lm.bg)}>
              <div className="flex items-start gap-2">
                <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", lm.bg, lm.border)}>
                  <Icon name="info" className={cn("h-3.5 w-3.5", lm.tint)} />
                </div>
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                    {m.situational.synthesis_label}
                  </span>
                  <p className="text-[12px] sm:text-[12.5px] leading-relaxed font-semibold text-gray-800 dark:text-rdia-100">
                    {sa.synthese}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ==== COLONNE DROITE : jauge de score (taille normale) + actualisation ==== */}
          <div className="flex shrink-0 flex-col items-center justify-center gap-2 lg:min-w-[240px]">
            <ScoreGauge value={score} accent={lm.accent} />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="btn-secondaire cible-tactile gap-1.5 px-3 text-xs"
            >
              <Icon name="refresh-cw" className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              {loading ? "MAJ…" : "Actualiser"}
            </button>
            {loading && (
              <div className="flex items-center gap-1.5 rounded-md bg-rdia-500/[0.07] px-2 py-1 text-[9.5px] font-semibold text-rdia-700 dark:bg-rdia-500/10 dark:text-rdia-300">
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
      <Panel title={m.situational.hotspots} right={`${sa.pointsChauds.length} zone(s)`}>
        <HotspotsBars data={sa.pointsChauds} totalIncidents={sa.totalIncidents} />
      </Panel>

      {/* ==== ÉTAGE 2 · 2 colonnes ==== */}
      <div className="shrink-0 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-4.5 lg:gap-5">
        {/* colonne gauche */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={m.situational.anticipations} right="30 min → 12 h">
            <ForeBars forecasts={sa.predictions} generatedAt={sa.generatedAt} debug={sa as unknown as { _debugLitsTot?: number; _debugLitsOcc?: number }} />
          </Panel>
          <Panel title={m.situational.flow6h} right={sa.predictions.flux6h.tendance}>
            <MetricBar
              icon="activity"
              title={`${sa.predictions.flux6h.tendance}`}
              subtitle={`Pic dans ${fmtDur(sa.predictions.flux6h.picDansMinutes)}`}
              big={`+${sa.predictions.flux6h.total}`}
              bigUnit="patients"
              pct={Math.max(0, Math.min(100, (sa.predictions.flux6h.total / 300) * 100))}
              ton={sa.predictions.flux6h.tendance === "↗ en hausse" ? "or" : "gray"}
            />
          </Panel>
        </div>
        {/* colonne droite */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={m.situational.critical_factors} right={`${sa.facteursCritiques.length} détecté(s)`}>
            <FactorBars data={sa.facteursCritiques} />
          </Panel>
          <Panel title={m.situational.imminent_risks} right="H2 · H6 · H24">
            <RiskBars risks={sa.risquesProchaines} />
          </Panel>
        </div>
      </div>

      {/* ==== ÉTAGE 3 · Ruptures stock (pleine largeur) ==== */}
      <Panel title={m.situational.stock_breaks} right={sa.predictions.stockCritique.niveau}>
        <MetricBar
          icon="package"
          title={sa.predictions.stockCritique.niveau === "alerte" ? m.situational.stock_critical : sa.predictions.stockCritique.niveau === "attention" ? m.situational.stock_moderate : m.situational.stock_nominal}
          subtitle={sa.predictions.stockCritique.ruptures.length ? sa.predictions.stockCritique.ruptures.slice(0, 3).join(" · ") : "Stock nominal"}
          big={String(sa.predictions.stockCritique.ruptures.length)}
          bigUnit={sa.predictions.stockCritique.ruptures.length > 1 ? "ruptures" : sa.predictions.stockCritique.ruptures.length === 1 ? "rupture" : ""}
          pct={sa.predictions.stockCritique.niveau === "alerte" ? 95 : sa.predictions.stockCritique.niveau === "attention" ? 65 : 15}
          ton={sa.predictions.stockCritique.niveau === "alerte" ? "danger" : sa.predictions.stockCritique.niveau === "attention" ? "or" : "green"}
        />
      </Panel>

      {/* ==== FOOTER horodatage ==== */}
      <footer className="flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400 sm:text-[10.5px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-rdia-400 dark:bg-rdia-500" />
          <span className="font-semibold">
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
