"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { useArgos } from "@/lib/store";
import { UI_ICONS, KPI_ICONS, FLUX_ICONS, TYPE_ICONS } from "@/lib/icons";

const ICONS: Record<string, string> = { ...FLUX_ICONS, ...KPI_ICONS, ...UI_ICONS, ...TYPE_ICONS };
type IconName = keyof typeof ICONS;
import type { GlobalAlertLevel, SituationalAwareness, CriticalFactor, SituationalForecasts, NextRisk } from "@/lib/ai/situational/types";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ========================================================================
// Conscience Situationnelle IA — design ARGOS (palette rdia/or/danger)
// Règles appliquées :
//  - Zéro police grande taille : max 14 px (souvent 10→12 px)
//  - Barres graphiques partout (anticiations → bars, facteurs → bars, risques → bars, hotspots → bars)
//  - Palette EXCLUSIVE : rdia.X (vert militaire) + or.X + danger.X + gray.X + green 500/600
// ========================================================================

const LEVEL_META: Record<
  GlobalAlertLevel,
  { dot: string; tint: string; border: string; bg: string; label: string; scoreFill: string }
> = {
  calme: {
    dot: "bg-green-500",
    tint: "text-green-700 dark:text-green-400",
    bg: "bg-green-50/50 dark:bg-green-500/[0.05]",
    border: "border-green-500/[0.14]",
    label: "Calme",
    scoreFill: "bg-green-500",
  },
  surveillance: {
    dot: "bg-or-400",
    tint: "text-or-600 dark:text-or-400",
    bg: "bg-or-50/50 dark:bg-or-500/[0.05]",
    border: "border-or-500/[0.16]",
    label: "Surveillance",
    scoreFill: "bg-or-400",
  },
  vigilance: {
    dot: "bg-or-400",
    tint: "text-or-600 dark:text-or-300",
    bg: "bg-or-50/60 dark:bg-or-500/[0.08]",
    border: "border-or-500/[0.18]",
    label: "Vigilance renforcée",
    scoreFill: "bg-or-500",
  },
  alerte_rouge: {
    dot: "bg-danger-400",
    tint: "text-danger-600 dark:text-danger-400",
    bg: "bg-danger-50/50 dark:bg-danger-500/[0.05]",
    border: "border-danger-500/[0.16]",
    label: "Alerte rouge",
    scoreFill: "bg-danger-400",
  },
};

const NIV_COLORS: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "bg-green-500",
  modere: "bg-rdia-400",
  eleve: "bg-or-400",
  critique: "bg-danger-400",
};
const NIV_TXT: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "Faible", modere: "Modéré", eleve: "Élevé", critique: "Critique",
};
const IMPACT_FILL: Record<"haut" | "moyen" | "faible", string> = {
  haut: "bg-danger-400",
  moyen: "bg-or-400",
  faible: "bg-green-500",
};
const IMPACT_TEXT: Record<"haut" | "moyen" | "faible", string> = {
  haut: "text-danger-600 dark:text-danger-400 bg-danger-500/[0.08]",
  moyen: "text-or-600 dark:text-or-400 bg-or-500/[0.08]",
  faible: "text-green-600 dark:text-green-400 bg-green-500/[0.08]",
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

function Bar({ value, max = 100, fill, className }: { value: number; max?: number; fill: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/8", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Section({ title, right, children }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-2.5 min-w-0">
      <div className="flex items-center justify-between gap-2 w-full min-w-0 px-0.5">
        <h3 className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-500 dark:text-rdia-300/80 leading-none">{title}</h3>
        {right !== undefined && <div className="shrink-0 text-[10px] font-medium text-gray-400 dark:text-rdia-400 leading-none whitespace-nowrap">{right}</div>}
      </div>
      <div className="w-full min-w-0">{children}</div>
    </div>
  );
}

type Props = { className?: string; bare?: boolean };

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
      <div className={cn("flex h-full w-full flex-col gap-3.5 p-3 md:p-4.5", className)}>{children}</div>
    ) : (
      <section className={cn("rounded-2xl border border-gray-200 bg-white p-4.5 shadow-sm dark:border-white/5 dark:bg-rdia-800/40 md:p-5", className)}>
        <div className="flex h-full flex-col gap-3.5">{children}</div>
      </section>
    );

  if (!sa) {
    return shell(
      <div className="flex h-full flex-col items-center justify-center gap-2.5 text-[12px] text-gray-500 dark:text-rdia-300">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 animate-pulse rounded-full", loading ? "bg-or-500" : "bg-rdia-400")} />
          <span className={cn("font-semibold", loading ? "text-or-600 dark:text-or-400" : "text-rdia-500 dark:text-rdia-300")}>
            {loading ? "Analyse en cours" : "Initialisation"}
          </span>
        </div>
        <Bar value={60} className="h-1.5 w-56" fill={loading ? "bg-or-500" : "bg-rdia-400"} />
      </div>,
    );
  }

  return <ShellInner sa={sa} loading={loading} model={model} onRefresh={() => void recompute()} shell={shell} />;
}

// ---------- Rendu principal ----------
function ShellInner({
  sa, loading, model, onRefresh, shell,
}: {
  sa: SituationalAwareness;
  loading: boolean;
  model?: string;
  onRefresh: () => void;
  shell: (children: ReactNode) => ReactNode;
}) {
  const levelMeta = LEVEL_META[sa.niveauGlobal];

  /* ===== Données EN-TÊTE (demande user) ===== */
  const nIncidentsCritiques = useMemo(() => {
    const nFacteursImpactHaut = sa.facteursCritiques.filter((f) => f.impact === "haut").length;
    const nRisquesElevOuCrit = sa.risquesProchaines.filter((r) => r.niveau === "critique" || r.niveau === "eleve").length;
    return Math.max(nFacteursImpactHaut, nRisquesElevOuCrit, sa.pointsChauds.filter((p) => p.sev === "high").length);
  }, [sa]);
  const zonesConcernees = sa.pointsChauds.length
    ? sa.pointsChauds.slice(0, 4).map((p) => p.region).join(" · ")
    : "National";
  const zonePrincipale = sa.pointsChauds[0]?.region ?? sa.risquesProchaines.find((r) => r.zone !== "National")?.zone ?? "National";

  /* ===== Graph Points chauds COMPACT ===== */
  const graphHeightPx = 54;
  const hotspotsColLayout = sa.pointsChauds.length <= 2
    ? "grid-cols-2"
    : sa.pointsChauds.length <= 3
    ? "grid-cols-3"
    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";

  return shell(
    <>
      <header
        className={cn(
          "w-full rounded-xl border px-3.5 py-3 shadow-sm dark:shadow-none flex flex-col gap-2.5 min-w-0",
          levelMeta.bg,
          levelMeta.border,
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", levelMeta.bg, levelMeta.border)}>
            <div className={cn("h-3 w-3 rounded-full", levelMeta.dot, loading ? "animate-pulse" : "")} />
          </div>
          <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-none">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("text-[13px] font-extrabold uppercase tracking-[0.03em] leading-none", levelMeta.tint)}>
                {sa.niveauGlobal === "alerte_rouge" ? "ALERTE ROUGE" : sa.niveauGlobal === "vigilance" ? "VIGILANCE RENFORCÉE" : sa.niveauGlobal === "surveillance" ? "SURVEILLANCE" : "SITUATION CALME"}
              </span>
              {sa.fromAI ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-rdia-500/15 bg-rdia-50/70 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-rdia-600 dark:bg-rdia-500/10 dark:text-rdia-300">
                  <Icon name="sparkles" className="h-2.5 w-2.5" />
                  IA{model ? ` · ${model}` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50/60 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-rdia-300">
                  <Icon name="scale" className="h-2.5 w-2.5" />
                  Temps réel
                </span>
              )}
              {loading && (
                <span className="inline-flex items-center gap-1 rounded-md border border-rdia-400/15 bg-rdia-500/8 px-1.5 py-0.5 text-[9.5px] font-semibold text-rdia-500">
                  <Icon name="refresh-cw" className="h-2.5 w-2.5 animate-spin" />
                  MAJ
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-gray-700 dark:text-rdia-100/95 min-w-0">{sa.synthese}</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <span className="text-[9.5px] font-bold uppercase tracking-widest text-gray-400 dark:text-rdia-400">Score</span>
            <Bar value={sa.scoreGlobal} className="h-1.5 w-[140px]" fill={levelMeta.scoreFill} />
            <span className={cn("w-9 text-right font-mono text-[12px] font-extrabold leading-none tabular-nums", levelMeta.tint)}>{Math.round(sa.scoreGlobal)}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="shrink-0 inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-rdia-100 dark:hover:bg-white/10"
          >
            <Icon name="refresh-cw" className={cn("h-3 w-3", loading && "animate-spin")} />
            Actualiser
          </button>
        </div>
        {/* Row 2 · 4 KPIs compactes */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {/* KPI 1 — Score global (chiffre mobile) */}
          <div className="flex flex-col rounded-lg border border-white/40 bg-white/70 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.04] min-w-0">
            <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400 dark:text-rdia-400 leading-none">Score global</span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className={cn("text-[17px] font-black tabular-nums leading-none", levelMeta.tint)}>{Math.round(sa.scoreGlobal)}</span>
              <span className="text-[10px] font-bold text-gray-400">/ 100</span>
            </div>
            <Bar value={sa.scoreGlobal} className="mt-1 h-1" fill={levelMeta.scoreFill} />
          </div>
          {/* KPI 2 — Incidents critiques */}
          <div className="flex flex-col rounded-lg border border-white/40 bg-white/70 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.04] min-w-0">
            <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400 dark:text-rdia-400 leading-none">Incidents critiques</span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-[17px] font-black tabular-nums leading-none text-danger-700 dark:text-danger-400">{nIncidentsCritiques}</span>
              <span className="text-[10px] font-bold text-gray-400">signalés</span>
            </div>
            <Bar value={Math.min(100, nIncidentsCritiques * 15)} className="mt-1 h-1" fill="bg-danger-400" />
          </div>
          {/* KPI 3 — Zones concernées */}
          <div className="flex flex-col rounded-lg border border-white/40 bg-white/70 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.04] min-w-0">
            <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400 dark:text-rdia-400 leading-none">Zones concernées</span>
            <div className="mt-0.5 truncate text-[11px] font-bold text-gray-900 dark:text-rdia-50 leading-snug min-w-0" title={zonesConcernees}>
              {zonesConcernees}
            </div>
            <div className="text-[9.5px] text-gray-500 dark:text-rdia-300/80 mt-0.5 leading-none">{sa.pointsChauds.length} zone(s) · {sa.pointsChauds.reduce((a, b) => a + b.nIncidents, 0)} incident(s)</div>
          </div>
          {/* KPI 4 — Zone principale */}
          <div className="flex flex-col rounded-lg border border-white/40 bg-white/70 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.04] min-w-0">
            <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400 dark:text-rdia-400 leading-none">Zone principale</span>
            <div className="mt-0.5 truncate text-[11px] font-extrabold text-or-700 dark:text-or-300 leading-snug min-w-0" title={zonePrincipale}>
              {zonePrincipale}
            </div>
            <div className="text-[9.5px] text-gray-500 dark:text-rdia-300/80 mt-0.5 leading-none">
              Focus {sa.risquesProchaines[0]?.horizon ?? "24h"} · {sa.risquesProchaines[0]?.type ?? "Risque global"}
            </div>
          </div>
        </div>
      </header>

      {/* =============================================================
          2. PREMIÈRE LIGNE — 2 COLONNES ÉQUILIBRÉES
             GAUCHE : Facteurs critiques  |  DROITE : Points chauds (hauteur graph ↓)
          ============================================================= */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Facteurs critiques" right={`${sa.facteursCritiques.length} détecté(s) · tri impact`}>
          <FactorBars data={sa.facteursCritiques} />
        </Section>
        <Section title="Points chauds" right={`${sa.pointsChauds.length} zone(s) · focus géographique`}>
          {/* Hauteur graph comprimée (graphHeightPx = 54 au lieu 88) + labels compacts */}
          {!sa.pointsChauds.length ? (
            <div className="rounded-md border border-dashed border-gray-200/80 p-2.5 text-center text-[10.5px] text-gray-400 dark:border-white/10">
              Aucun point chaud (zone stable)
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-md border border-gray-200/70 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.04] w-full min-w-0">
              <div className={`relative flex w-full items-end`} style={{ height: `${graphHeightPx}px` }}>
                <div className="absolute bottom-0 left-0 h-px w-full bg-gray-200/70 dark:bg-white/10" />
                <div className={cn("relative z-10 grid h-full w-full items-end justify-items-center gap-x-2", hotspotsColLayout)} style={{ height: `${graphHeightPx}px` }}>
                  {(() => {
                    const max = Math.max(...sa.pointsChauds.map((d) => d.poids), 0.3);
                    return sa.pointsChauds.map((h) => {
                      const fill =
                        h.sev === "high" ? "bg-danger-400" :
                        h.sev === "medium" ? "bg-or-400" :
                        "bg-rdia-400";
                      const hPct = (h.poids / max) * 100;
                      return (
                        <div
                          key={h.id}
                          className="group relative flex h-full w-full items-end justify-center min-w-0"
                          title={`${h.region} · ${h.nIncidents} incident(s)`}
                        >
                          <div
                            className={cn(
                              "relative z-10 w-[36px] shrink-0 rounded-t-sm transition-all duration-500 group-hover:brightness-105",
                              fill,
                            )}
                            style={{ height: `${Math.max(6, hPct)}%` }}
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              <div className={cn("grid w-full items-start justify-items-center gap-x-2 mt-0.5", hotspotsColLayout)}>
                {sa.pointsChauds.map((h) => (
                  <div key={`lbl-${h.id}`} className="w-full text-center leading-snug whitespace-normal break-words max-w-[64px] mx-auto min-w-0">
                    <div className="text-[10.5px] font-bold text-gray-700 dark:text-rdia-100/95 break-all">{h.region}</div>
                    <div className="text-[9px] font-mono font-bold text-gray-400 dark:text-rdia-400 leading-none mt-0.5">
                      {h.nIncidents} inc.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* =============================================================
          3. DEUXIÈME LIGNE — 2 COLONNES ÉQUILIBRÉES
             GAUCHE : Anticipations IA (ForeBars)  |  DROITE : Risques imminents (RiskBars)
          ============================================================= */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Anticipations IA" right="Horizons 30 min – 12 h">
          <ForeBars forecasts={sa.predictions} generatedAt={sa.generatedAt} debug={sa as unknown as { _debugLitsTot?: number; _debugLitsOcc?: number }} />
        </Section>
        <Section title="Risques imminents" right="2h / 6h / 24h">
          <RiskBars risks={sa.risquesProchaines} />
        </Section>
      </div>

      {/* =============================================================
          4. DERNIÈRE LIGNE — 2 COLONNES ÉQUILIBRÉES
             GAUCHE : Flux 6 h  |  DROITE : Ruptures / Capacités (RUPTURES STOCK)
          ============================================================= */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Flux 6 h" right={sa.predictions.flux6h.tendance}>
          <MetricBar
            icon="activity"
            title={`${sa.predictions.flux6h.tendance} sur 6 heures`}
            subtitle={`Pic prévu dans ${fmtDur(sa.predictions.flux6h.picDansMinutes)}`}
            big={`+${sa.predictions.flux6h.total}`}
            bigUnit="patients estimés"
            pct={Math.max(0, Math.min(100, (sa.predictions.flux6h.total / 300) * 100))}
            tone={sa.predictions.flux6h.tendance === "↗ en hausse" ? "or" : sa.predictions.flux6h.tendance === "↘ en baisse" ? "rdia" : "rdia"}
          />
        </Section>
        <Section title="Ruptures / Capacités" right={`${sa.predictions.stockCritique.niveau} · stocks`}>
          <MetricBar
            icon="package"
            title={sa.predictions.stockCritique.niveau === "alerte" ? "Ruptures critiques" : sa.predictions.stockCritique.niveau === "attention" ? "Ruptures modérées" : "Stock nominal · capacités OK"}
            subtitle={sa.predictions.stockCritique.ruptures.length ? sa.predictions.stockCritique.ruptures.slice(0, 4).join(" · ") : "Stock nominal · aucune rupture anticipée"}
            big={String(sa.predictions.stockCritique.ruptures.length)}
            bigUnit={sa.predictions.stockCritique.ruptures.length > 1 ? "ruptures" : sa.predictions.stockCritique.ruptures.length === 1 ? "rupture" : "0 rupture"}
            pct={sa.predictions.stockCritique.niveau === "alerte" ? 95 : sa.predictions.stockCritique.niveau === "attention" ? 65 : 15}
            tone={sa.predictions.stockCritique.niveau === "alerte" ? "danger" : sa.predictions.stockCritique.niveau === "attention" ? "or" : "rdia"}
          />
        </Section>
      </div>

      {/* ===== Footer ===== */}
      <footer className="mt-0 flex items-center justify-between text-[9.5px] text-gray-400 dark:text-rdia-400 leading-none">
        <span>Mis à jour : {new Date(sa.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </footer>
    </>,
  );
}

// ---------- helpers ----------
function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min";
  if (min >= 60 * 48) return "> 48 h";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}
function fmtTimeHhMm(tsMs: number): string {
  return new Date(tsMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------- Hotspots : barres verticales (palette ARGOS) ----------
function HotspotsBars({ data }: { data: SituationalAwareness["pointsChauds"] }) {
  if (!data.length) {
    return (
      <div className="rounded-md border border-dashed border-gray-200/80 p-3 text-center text-[10.5px] text-gray-400 dark:border-white/10">
        Aucun point chaud (zone stable)
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.poids), 0.3);
  const cols = data.length <= 2 ? "grid-cols-2" : data.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";
  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-200/70 bg-white/60 p-2.5 dark:border-white/10 dark:bg-white/[0.04] w-full min-w-0">
      <div className="relative flex h-[88px] w-full items-end">
        <div className="absolute bottom-0 left-0 h-px w-full bg-gray-200/70 dark:bg-white/10" />
        <div className={cn("relative z-10 grid h-[88px] w-full items-end justify-items-center gap-x-2.5", cols)}>
          {data.map((h) => {
            const fill =
              h.sev === "high" ? "bg-danger-400" :
              h.sev === "medium" ? "bg-or-400" :
              "bg-rdia-400";
            const hPct = (h.poids / max) * 100;
            return (
              <div
                key={h.id}
                className="group relative flex h-full w-full items-end justify-center min-w-0"
                title={`${h.region} · ${h.nIncidents} incident(s)`}
              >
                <div
                  className={cn(
                    "relative z-10 w-[44px] shrink-0 rounded-t-sm transition-all duration-500 group-hover:brightness-105",
                    fill,
                  )}
                  style={{ height: `${Math.max(8, hPct)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className={cn("grid w-full items-start justify-items-center gap-x-2.5", cols)}>
        {data.map((h) => (
          <div key={`lbl-${h.id}`} className="w-full text-center text-[11px] font-semibold leading-snug text-gray-700 dark:text-rdia-100/90 whitespace-normal break-words max-w-[68px] mx-auto min-w-0">
            {h.region}
            <div className="mt-0.5 text-[9px] font-mono font-bold text-gray-400 dark:text-rdia-400 leading-none">
              {h.nIncidents} incident{h.nIncidents > 1 ? "s" : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Anticipations IA remplacées par 4 BARRES HORIZONTALES (plus de chips texte) ----------
type ToneFill = "rdia" | "or" | "danger" | "green";
const TONE_FILL: Record<ToneFill, string> = {
  rdia: "bg-rdia-500",
  or: "bg-or-400",
  danger: "bg-danger-400",
  green: "bg-green-500",
};
const TONE_TEXT: Record<ToneFill, string> = {
  rdia: "text-rdia-600 dark:text-rdia-300",
  or: "text-or-600 dark:text-or-400",
  danger: "text-danger-600 dark:text-danger-400",
  green: "text-green-700 dark:text-green-400",
};
const TONE_BG: Record<ToneFill, string> = {
  rdia: "bg-rdia-50/60 border-rdia-500/[0.12]",
  or: "bg-or-50/60 border-or-500/[0.14]",
  danger: "bg-danger-50/60 border-danger-500/[0.14]",
  green: "bg-green-50/60 border-green-500/[0.14]",
};

type BarRow = {
  icon: IconName;
  label: string;
  main: string;
  sub?: string;
  pct: number;
  tone: ToneFill;
};

function ForeBars({ forecasts, generatedAt, debug }: {
  forecasts: SituationalForecasts;
  generatedAt: number;
  debug?: { _debugLitsTot?: number; _debugLitsOcc?: number };
}) {
  const TTG = forecasts.ttgStable
    ? {
        main: "Réseau stable",
        sub: (() => {
          if (typeof debug?._debugLitsTot === "number" && typeof debug?._debugLitsOcc === "number") {
            const disp = debug._debugLitsTot - debug._debugLitsOcc;
            return `${disp} lits dispo · ${Math.round((disp / debug._debugLitsTot) * 100)}% marge`;
          }
          return `Débit < ${Math.max(0, Math.round(((forecasts.flux6h.total / 6) / 60) * 100) / 100)} pat/min · marge OK`;
        })(),
        pct: 15,
        tone: "green" as ToneFill,
      }
    : forecasts.ttgMinutes <= 30
      ? { main: `Saturation à ${fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000)}`, sub: `dans ${fmtDur(forecasts.ttgMinutes)} · débit ↑`, pct: Math.max(0, Math.min(100, 100 - (forecasts.ttgMinutes / 180) * 100)), tone: "danger" as ToneFill }
      : forecasts.ttgMinutes <= 90
        ? { main: `Saturation à ${fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000)}`, sub: `dans ${fmtDur(forecasts.ttgMinutes)}`, pct: Math.max(0, Math.min(100, 100 - (forecasts.ttgMinutes / 180) * 100)), tone: "or" as ToneFill }
        : { main: `Saturation à ${fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000)}`, sub: `dans ${fmtDur(forecasts.ttgMinutes)}`, pct: 35, tone: "rdia" as ToneFill };

  const NSAT = !forecasts.nextSat
    ? { main: "Réseau contrôlé", sub: "Aucun hôpital à risque", pct: 20, tone: "green" as ToneFill }
    : forecasts.nextSat.alreadySat
      ? { main: `${forecasts.nextSat.nom} · saturé`, sub: `${Math.round(forecasts.nextSat.occPctNow * 100)}% actuel`, pct: 95, tone: "danger" as ToneFill }
      : forecasts.nextSat.minutesUntilSat <= 30
        ? { main: `${forecasts.nextSat.nom} · ${fmtTimeHhMm(generatedAt + forecasts.nextSat.minutesUntilSat * 60 * 1000)}`, sub: `${Math.round(forecasts.nextSat.occPctNow * 100)}% · dans ${fmtDur(forecasts.nextSat.minutesUntilSat)}`, pct: Math.max(0, Math.min(100, forecasts.nextSat.occPctNow * 100)) + 10, tone: "or" as ToneFill }
        : { main: `${forecasts.nextSat.nom} · ${fmtTimeHhMm(generatedAt + forecasts.nextSat.minutesUntilSat * 60 * 1000)}`, sub: `${Math.round(forecasts.nextSat.occPctNow * 100)}%`, pct: Math.max(0, Math.min(100, forecasts.nextSat.occPctNow * 100)), tone: "rdia" as ToneFill };

  const HMC = !forecasts.besoinHMC?.nombre
    ? { main: "Capacités OK", sub: "Aucun renfort HMC", pct: 10, tone: "green" as ToneFill }
    : forecasts.besoinHMC.nombre >= 3
      ? { main: `${forecasts.besoinHMC.nombre} HMC nécessaires`, sub: `${forecasts.besoinHMC.litsTotal} lits · ${forecasts.besoinHMC.litsParHMC}/unité`, pct: 92, tone: "danger" as ToneFill }
      : { main: `${forecasts.besoinHMC.nombre} HMC recommandé${forecasts.besoinHMC.nombre > 1 ? "s" : ""}`, sub: `${forecasts.besoinHMC.litsTotal} lits`, pct: 65, tone: "or" as ToneFill };

  const REDIR = forecasts.redirection.nHopitaux >= 3
    ? { main: `${forecasts.redirection.litsRedirigeables} lits redirigeables`, sub: `${forecasts.redirection.nHopitaux} CHU basculables`, pct: Math.max(0, Math.min(100, (forecasts.redirection.litsRedirigeables / 500) * 100)), tone: "green" as ToneFill }
    : forecasts.redirection.nHopitaux === 0
      ? { main: "Aucune bascule possible", sub: `${forecasts.redirection.litsRedirigeables} lits théoriques`, pct: 88, tone: "danger" as ToneFill }
      : { main: `${forecasts.redirection.litsRedirigeables} lits · ${forecasts.redirection.nHopitaux} CHU`, sub: "Basculable limité", pct: 50, tone: "rdia" as ToneFill };

  const rows: Array<BarRow & { id: string }> = [
    { id: "ttg", icon: "clock", label: "Temps avant saturation", main: TTG.main, sub: TTG.sub, pct: Math.min(100, TTG.pct), tone: TTG.tone },
    { id: "nsat", icon: "alert-triangle", label: "Prochaine saturation", main: NSAT.main, sub: NSAT.sub, pct: Math.min(100, NSAT.pct), tone: NSAT.tone },
    { id: "hmc", icon: "tent", label: "Besoin HMC · 6 h", main: HMC.main, sub: HMC.sub, pct: Math.min(100, HMC.pct), tone: HMC.tone },
    { id: "red", icon: "shuffle", label: "Redirection", main: REDIR.main, sub: REDIR.sub, pct: Math.min(100, REDIR.pct), tone: REDIR.tone },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.id} className={cn("flex flex-col gap-1 rounded-md border px-2.5 py-1.5", TONE_BG[r.tone])}>
          <div className="flex items-center gap-2 w-full min-w-0">
            <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", TONE_BG[r.tone], TONE_TEXT[r.tone])}>
              <Icon name={r.icon} className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-none">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-rdia-300/80">{r.label}</div>
              <div className={cn("text-[12px] font-bold leading-snug truncate", TONE_TEXT[r.tone])}>{r.main}</div>
            </div>
            <div className="shrink-0 font-mono text-[11px] font-bold text-gray-700 dark:text-rdia-100 tabular-nums">{Math.round(r.pct)}%</div>
          </div>
          <Bar value={r.pct} className="h-1.5" fill={TONE_FILL[r.tone]} />
          {r.sub && <div className="text-[10px] leading-snug text-gray-500 dark:text-rdia-300/85 truncate">{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------- Facteurs critiques (barres horizontales ARGOS) ----------
function FactorBars({ data }: { data: CriticalFactor[] }) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => {
      const w = (x: CriticalFactor) => (x.impact === "haut" ? 3 : x.impact === "moyen" ? 2 : 1);
      return w(b) - w(a);
    }),
    [data],
  );
  if (!sorted.length) {
    return <div className="rounded-md border border-dashed border-gray-200/80 p-2.5 text-center text-[10.5px] text-gray-400 dark:border-white/10">Aucun facteur critique (situation maîtrisée)</div>;
  }
  return (
    <div className="flex flex-col gap-1.5 w-full min-w-0">
      {sorted.slice(0, 5).map((f) => {
        const pct = f.impact === "haut" ? 92 : f.impact === "moyen" ? 62 : 30;
        const fill = IMPACT_FILL[f.impact];
        return (
          <div key={f.id} className="flex flex-col gap-1 rounded-md border border-gray-200/70 bg-white/60 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04] min-w-0">
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-none", IMPACT_TEXT[f.impact])}>
                {f.impact}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-snug text-gray-800 dark:text-rdia-100">
                {f.label}
              </span>
              {f.value !== undefined && (
                <span className="shrink-0 font-mono text-[11px] font-bold text-gray-900 dark:text-rdia-50 tabular-nums leading-none">{String(f.value)}</span>
              )}
            </div>
            <Bar value={pct} className="h-1.5" fill={fill} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- Risques imminents 2h/6h/24h en 3 BARRES HORIZONTALES (pas de cartes colonnes) ----------
function RiskBars({ risks }: { risks: NextRisk[] }) {
  const order: Array<"2h" | "6h" | "24h"> = ["2h", "6h", "24h"];
  const byHorizon = new Map(risks.map((r) => [r.horizon, r]));
  return (
    <div className="flex flex-col gap-1.5">
      {order.map((h) => {
        const r = byHorizon.get(h);
        if (!r) {
          return (
            <div key={h} className="flex items-center gap-2 rounded-md border border-dashed border-gray-200/80 bg-white/50 px-2 py-1.5 dark:border-white/10 dark:bg-white/0">
              <span className="w-9 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400">H {h}</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/8" />
              <span className="text-[10px] text-gray-400">risque nul</span>
            </div>
          );
        }
        const fill = NIV_COLORS[r.niveau];
        return (
          <div key={h} className="flex flex-col gap-1 rounded-md border border-gray-200/70 bg-white/60 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04] min-w-0">
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <span className="flex h-5.5 w-9 shrink-0 items-center justify-center rounded border border-gray-200/80 bg-white/80 text-[9.5px] font-bold uppercase tracking-wide text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-rdia-300">
                H {h}
              </span>
              <div className={cn("h-1.5 w-1.5 shrink-0 rounded-full", fill)} />
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <div className="truncate text-[11px] font-bold leading-snug text-gray-900 dark:text-rdia-50">{r.type}</div>
                <div className="truncate text-[9.5px] leading-snug text-gray-500 dark:text-rdia-300/85">{r.zone}</div>
              </div>
              <span className="shrink-0 text-right font-mono text-[10.5px] font-bold text-gray-800 dark:text-rdia-50 tabular-nums leading-none">
                <span className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-bold",
                  r.niveau === "critique" ? "bg-danger-500/[0.08] text-danger-600 dark:text-danger-400" :
                  r.niveau === "eleve" ? "bg-or-500/[0.08] text-or-600 dark:text-or-400" :
                  r.niveau === "modere" ? "bg-rdia-500/[0.08] text-rdia-600 dark:text-rdia-300" :
                  "bg-green-500/[0.08] text-green-700 dark:text-green-400",
                )}>{NIV_TXT[r.niveau]}</span>
                <span className="ml-1">{r.probabilitePct}%</span>
              </span>
            </div>
            <Bar value={r.probabilitePct} className="h-1.5" fill={fill} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- Carte métrique bottom (Flux 6h / Ruptures stock) — style ARGOS, chiffre non géant ----------
function MetricBar({
  icon, title, subtitle, big, bigUnit, pct, tone,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  big: string;
  bigUnit?: string;
  pct: number;
  tone: "rdia" | "or" | "danger";
}) {
  const safePct = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn(
      "flex flex-col gap-1.5 rounded-lg border p-2.5 w-full min-w-0",
      tone === "danger" ? "bg-danger-50/60 border-danger-500/[0.16] dark:bg-danger-500/[0.05] dark:border-danger-500/[0.18]"
        : tone === "or" ? "bg-or-50/60 border-or-500/[0.16] dark:bg-or-500/[0.05] dark:border-or-500/[0.18]"
        : "bg-rdia-50/60 border-rdia-500/[0.16] dark:bg-rdia-500/[0.05] dark:border-rdia-500/[0.18]",
    )}>
      <div className="flex items-center gap-2 w-full min-w-0">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          tone === "danger" ? "bg-danger-500/[0.12] text-danger-700 dark:text-danger-300"
            : tone === "or" ? "bg-or-500/[0.12] text-or-700 dark:text-or-300"
            : "bg-rdia-500/[0.12] text-rdia-700 dark:text-rdia-300",
        )}>
          <Icon name={icon} className="h-[15px] w-[15px]" />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <div className="text-[11.5px] font-bold leading-snug text-gray-900 dark:text-rdia-50 truncate">{title}</div>
          <div className="text-[9.5px] leading-snug text-gray-600 dark:text-rdia-300/90 truncate">{subtitle}</div>
        </div>
        <div className="shrink-0 text-right flex flex-col items-end justify-center leading-none">
          <div className={cn(
            "text-[14.5px] font-black tracking-tight tabular-nums leading-none",
            tone === "danger" ? "text-danger-700 dark:text-danger-300"
              : tone === "or" ? "text-or-700 dark:text-or-300"
              : "text-rdia-700 dark:text-rdia-300",
          )}>
            {big}
          </div>
          {bigUnit && (
            <div className="mt-0.5 text-[9px] font-semibold leading-none text-gray-500 dark:text-rdia-300/90">
              {bigUnit}
            </div>
          )}
        </div>
      </div>
      <Bar value={safePct} className="h-1.5" fill={TONE_FILL[tone]} />
    </div>
  );
}
