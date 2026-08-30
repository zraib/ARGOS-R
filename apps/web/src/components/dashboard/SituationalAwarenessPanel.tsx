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
// Conscience Situationnelle IA · REDESIGN (version 2)
// ------------------------------------------------------------------------
// Direction · COMMAND-CENTER (militaire ARGOS) :
//   - Header MAITRISÉ : bandeau niveau global + score GAUGE circulaire + synthèse
//   - Panneaux encadrés (style panels command) · chaque section = panel indépendant
//   - Header panel : badge id · title · right meta
//   - Texture grid fine + halo accent glow hover + micro-interactions
//   - Palette stricte : rdia · or · danger · green · gray (inchangée)
// ========================================================================

const LEVEL_META: Record<
  GlobalAlertLevel,
  {
    dot: string; tint: string; border: string; bg: string; label: string; scoreFill: string; scoreHex: string;
    banner: string; bannerBg: string; bannerText: string;
    accent: string;
    badgeTint: string;
  }
> = {
  calme: {
    dot: "bg-green-500", tint: "text-green-700 dark:text-green-400",
    bg: "bg-green-50/40 dark:bg-green-500/[0.05]",
    border: "border-green-500/[0.22]",
    label: "Calme", scoreFill: "bg-green-500", scoreHex: "#10B981",
    banner: "border-[#4B7A51]/50",
    bannerBg: "bg-gradient-to-r from-[#4B7A51]/10 via-[#C9A84C]/6 to-transparent dark:from-[#4B7A51]/15 dark:via-[#C9A84C]/8",
    bannerText: "text-[#2E5332] dark:text-[#BFDCC4]",
    accent: "#4B7A51",
    badgeTint: "rgba(16,185,129,0.16)",
  },
  surveillance: {
    dot: "bg-or-500", tint: "text-or-600 dark:text-or-400",
    bg: "bg-or-500/5 dark:bg-or-500/[0.08]",
    border: "border-[#C9A84C]/[0.36]",
    label: "Surveillance", scoreFill: "bg-[#C9A84C]", scoreHex: "#C9A84C",
    banner: "border-[#C9A84C]/50",
    bannerBg: "bg-gradient-to-r from-or-500/15 to-transparent dark:from-or-500/20",
    bannerText: "text-or-600 dark:text-or-300",
    accent: "#C9A84C",
    badgeTint: "rgba(201,168,76,0.20)",
  },
  vigilance: {
    dot: "bg-[#D97706]", tint: "text-[#8A4A06]",
    bg: "bg-amber-500/5 dark:bg-amber-500/[0.08]",
    border: "border-[#C9A84C]/[0.48]",
    label: "Vigilance renforcée", scoreFill: "bg-[#D97706]", scoreHex: "#D97706",
    banner: "border-[#C9A84C]/60",
    bannerBg: "bg-gradient-to-r from-[#D97706]/18 via-[#C9A84C]/10 to-transparent dark:from-[#D97706]/25 dark:via-[#C9A84C]/12",
    bannerText: "text-[#8A4A06] dark:text-[#F6D28A]",
    accent: "#D97706",
    badgeTint: "rgba(217,119,6,0.22)",
  },
  alerte_rouge: {
    dot: "bg-[#B91C1C]", tint: "text-[#7F1D1D]",
    bg: "bg-danger-500/5 dark:bg-danger-500/[0.09]",
    border: "border-[#C9A84C]/[0.36]",
    label: "Alerte rouge", scoreFill: "bg-[#EF4444]", scoreHex: "#B91C1C",
    banner: "border-[#C9A84C]/50",
    bannerBg: "bg-gradient-to-r from-[#B91C1C]/14 via-[#C9A84C]/9 to-transparent dark:from-[#B91C1C]/26 dark:via-[#C9A84C]/10",
    bannerText: "text-[#7F1D1D] dark:text-[#F6BABA]",
    accent: "#B91C1C",
    badgeTint: "rgba(185,28,28,0.20)",
  },
};

const NIV_COLORS: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "#10B981", modere: "#4B5563", eleve: "#F59E0B", critique: "#EF4444",
};
const NIV_TXT: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "Faible", modere: "Modéré", eleve: "Élevé", critique: "Critique",
};
const NIV_TXT_CLS: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "bg-green-500/10 text-green-700 dark:text-green-400",
  modere: "bg-rdia-500/10 text-rdia-700 dark:text-rdia-300",
  eleve: "bg-or-500/10 text-or-700 dark:text-or-300",
  critique: "bg-danger-500/10 text-danger-700 dark:text-danger-300",
};
const IMPACT_FILL: Record<"haut" | "moyen" | "faible", string> = {
  haut: "#EF4444", moyen: "#F59E0B", faible: "#10B981",
};
const IMPACT_CLS: Record<"haut" | "moyen" | "faible", string> = {
  haut: "bg-danger-500/12 text-danger-700 dark:text-danger-300",
  moyen: "bg-or-500/12 text-or-700 dark:text-or-300",
  faible: "bg-green-500/12 text-green-700 dark:text-green-400",
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
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, backgroundColor: fill }}
      />
    </div>
  );
}

// ---------- Panel (Section encadrée PREMIUM Editorial Executive) ----------
type PanelId = "A" | "B" | "C" | "D" | "E" | "F" | "G";
function Panel({
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
                  Niveau global
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
                    Temps réel
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
                  label="Incidents"
                  big={sa.pointsChauds.reduce((a, h) => a + h.nIncidents, 0)}
                  sub={`${sa.pointsChauds.length} zones`}
                  accent="#F59E0B"
                />
                {/* KPI · risque critique */}
                <MiniKpi
                  icon="alert-triangle"
                  label="Facteurs"
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
                  label="H 24"
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
                Analyse en cours…
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===================================================================
          CORPS : 3 étages (panneau A·B · 2 cols puis C·D · 2 cols puis E · full)
          =================================================================== */}

      {/* ==== ÉTAGE 1 · Panneaux A (Points chauds) ==== */}
      <Panel id="A" title="Points chauds" right={`${sa.pointsChauds.length} zone(s)`} accent="#3B82F6">
        <HotspotsBars data={sa.pointsChauds} />
      </Panel>

      {/* ==== ÉTAGE 2 · 2 colonnes ==== */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-4.5 lg:gap-5">
        {/* colonne gauche */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel id="B" title="Anticipations" right="30 min → 12 h" accent="#D97706">
            <ForeBars forecasts={sa.predictions} generatedAt={sa.generatedAt} debug={sa as unknown as { _debugLitsTot?: number; _debugLitsOcc?: number }} />
          </Panel>
          <Panel id="C" title="Flux 6 h" right={sa.predictions.flux6h.tendance} accent="#F59E0B">
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
          <Panel id="D" title="Facteurs critiques" right={`${sa.facteursCritiques.length} détecté(s)`} accent="#EF4444">
            <FactorBars data={sa.facteursCritiques} />
          </Panel>
          <Panel id="E" title="Risques imminents" right="H2 · H6 · H24" accent="#7C3AED">
            <RiskBars risks={sa.risquesProchaines} />
          </Panel>
        </div>
      </div>

      {/* ==== ÉTAGE 3 · Ruptures stock (pleine largeur) ==== */}
      <Panel id="F" title="Ruptures stock" right={sa.predictions.stockCritique.niveau} accent="#059669">
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
          ARGOS · CONSCIENCE SITUATIONNELLE
        </span>
      </footer>
    </>,
  );
}

// ---------------- helpers score gauge circulaire ----------------
function ScoreGauge({ value, accent }: { value: number; accent: string }) {
  const R = 54;
  const STROKE = 10;
  const C = 2 * Math.PI * R;
  const len = (value / 100) * C;
  return (
    <div className="relative flex items-center justify-center">
      <svg width="150" height="150" viewBox="0 0 140 140" className="h-[115px] w-[115px] sm:h-[130px] sm:w-[130px]">
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
          SCORE / 100
        </text>
      </svg>
    </div>
  );
}

// ---------------- Mini KPI header colonne droite · PREMIUM ----------------
function MiniKpi({ icon, label, big, sub, accent }: {
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

// ---------- Hotspots bars redesign · cartes + bars ----------------
function HotspotsBars({ data }: { data: SituationalAwareness["pointsChauds"] }) {
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

// ---------- Anticipations ForeBars redesign · cartes 4 rows ----------------
type ToneFill = "rdia" | "or" | "danger" | "green";
const TONE_HEX: Record<ToneFill, string> = {
  rdia: "#4B5563", or: "#F59E0B", danger: "#EF4444", green: "#10B981",
};

type BarRow = {
  icon: IconName; label: string; main: string; sub?: string;
  pct: number; tone: ToneFill;
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
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const hex = TONE_HEX[r.tone];
        return (
          <div
            key={r.id}
            className="group flex flex-col gap-1.5 rounded-xl border p-2.5 transition-all duration-300 hover:-translate-y-0.5"
            style={{
              borderColor: `${hex}28`,
              backgroundColor: `${hex}09`,
              boxShadow: `0 6px 22px -22px ${hex}aa`,
            }}
          >
            <div className="flex items-center gap-2.5 w-full min-w-0">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${hex}18`, color: hex }}
              >
                <Icon name={r.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-tight">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: `${hex}cc` }}>
                    0{i + 1} · {r.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-black tabular-nums text-gray-800 dark:text-rdia-100">
                    {Math.round(r.pct)}%
                  </span>
                </div>
                <div className="truncate text-[12px] font-extrabold leading-snug text-gray-900 dark:text-rdia-50">
                  {r.main}
                </div>
                {r.sub && (
                  <div className="truncate text-[10px] leading-snug text-gray-500 dark:text-rdia-300/85">
                    {r.sub}
                  </div>
                )}
              </div>
            </div>
            <Bar value={r.pct} className="h-1.5" fill={hex} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- Facteurs critiques (barres horizontales) · redesign ----------------
function FactorBars({ data }: { data: CriticalFactor[] }) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => {
      const w = (x: CriticalFactor) => (x.impact === "haut" ? 3 : x.impact === "moyen" ? 2 : 1);
      return w(b) - w(a);
    }),
    [data],
  );
  if (!sorted.length) {
    return <div className="rounded-xl border border-dashed border-gray-200/80 p-5 text-center text-[11px] text-gray-400 dark:border-white/10">Aucun facteur critique</div>;
  }
  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      {sorted.slice(0, 5).map((f, i) => {
        const pct = f.impact === "haut" ? 92 : f.impact === "moyen" ? 62 : 30;
        const hex = IMPACT_FILL[f.impact];
        return (
          <div
            key={f.id}
            className="flex flex-col gap-1 rounded-xl border p-2.5 transition-all duration-300 hover:-translate-y-0.5"
            style={{
              borderColor: `${hex}28`,
              backgroundColor: `${hex}08`,
              boxShadow: `0 6px 22px -22px ${hex}aa`,
            }}
          >
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[9.5px] font-black tabular-nums"
                style={{ color: hex, backgroundColor: `${hex}18` }}
              >
                0{i + 1}
              </span>
              <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-none", IMPACT_CLS[f.impact])}>
                {f.impact}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold leading-snug text-gray-800 dark:text-rdia-100">
                {f.label}
              </span>
              {f.value !== undefined && (
                <span className="shrink-0 font-mono text-[11px] font-black tabular-nums text-gray-900 dark:text-rdia-50 leading-none">
                  {String(f.value)}
                </span>
              )}
            </div>
            <Bar value={pct} className="h-1.5" fill={hex} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- Risques imminents 2h/6h/24h (cards redesign) ----------------
function RiskBars({ risks }: { risks: NextRisk[] }) {
  const order: Array<"2h" | "6h" | "24h"> = ["2h", "6h", "24h"];
  const byHorizon = new Map(risks.map((r) => [r.horizon, r]));
  return (
    <div className="flex flex-col gap-2">
      {order.map((h, i) => {
        const r = byHorizon.get(h);
        if (!r) {
          return (
            <div key={h} className="flex items-center gap-2.5 rounded-xl border border-dashed border-gray-200/70 bg-white/50 px-2.5 py-2 dark:border-white/10 dark:bg-white/0">
              <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200/80 bg-white/90 font-mono text-[9.5px] font-black uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-rdia-400">
                H{h}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/8" />
              <span className="text-[10px] font-semibold text-gray-400 dark:text-rdia-400">sans risque</span>
            </div>
          );
        }
        const hex = NIV_COLORS[r.niveau];
        return (
          <div
            key={h}
            className="flex flex-col gap-1.5 rounded-xl border p-2.5 transition-all duration-300 hover:-translate-y-0.5"
            style={{
              borderColor: `${hex}30`,
              backgroundColor: `${hex}09`,
              boxShadow: `0 6px 22px -22px ${hex}aa`,
            }}
          >
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <span
                className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md border font-mono text-[9.5px] font-black uppercase tracking-wide"
                style={{
                  color: hex,
                  borderColor: `${hex}30`,
                  backgroundColor: `${hex}15`,
                }}
              >
                H{h}
              </span>
              <span className="font-mono text-[9px] font-black tabular-nums text-gray-400 dark:text-rdia-400">
                0{i + 1}
              </span>
              <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
              <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-tight">
                <div className="truncate text-[12px] font-extrabold leading-snug text-gray-900 dark:text-rdia-50">{r.type}</div>
                <div className="truncate text-[10px] leading-snug text-gray-500 dark:text-rdia-300/85">{r.zone}</div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5 leading-none">
                <span
                  className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase", NIV_TXT_CLS[r.niveau])}
                >
                  {NIV_TXT[r.niveau]}
                </span>
                <span className="font-mono text-[11px] font-black tabular-nums" style={{ color: hex }}>
                  {r.probabilitePct}%
                </span>
              </div>
            </div>
            <Bar value={r.probabilitePct} className="h-1.5" fill={hex} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- Carte métrique (Flux 6h / Ruptures stock) redesign ----------------
function MetricBar({
  icon, title, subtitle, big, bigUnit, pct, accent,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  big: string;
  bigUnit?: string;
  pct: number;
  accent: string;
}) {
  const safePct = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="group flex flex-col gap-2.5 rounded-2xl border p-3.5 w-full min-w-0 transition-all duration-300 hover:-translate-y-0.5 sm:p-4"
      style={{
        borderColor: `${accent}30`,
        backgroundColor: `${accent}0A`,
        boxShadow: `0 8px 28px -24px ${accent}bb`,
      }}
    >
      <div className="flex items-center gap-3 w-full min-w-0">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-tight">
          <div className="truncate text-[13px] font-extrabold leading-snug text-gray-900 dark:text-rdia-50">
            {title}
          </div>
          <div className="truncate text-[10.5px] leading-snug text-gray-500 dark:text-rdia-300/90">
            {subtitle}
          </div>
        </div>
        <div className="shrink-0 text-right flex flex-col items-end justify-center leading-none">
          <div
            className="text-[22px] font-black tracking-tight tabular-nums leading-none"
            style={{ color: accent }}
          >
            {big}
          </div>
          {bigUnit && (
            <div className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-rdia-300/90">
              {bigUnit}
            </div>
          )}
        </div>
      </div>
      <Bar value={safePct} className="h-2" fill={accent} />
    </div>
  );
}
