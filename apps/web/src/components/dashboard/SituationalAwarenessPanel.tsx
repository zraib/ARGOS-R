"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { useArgos } from "@/lib/store";
import { UI_ICONS, KPI_ICONS, FLUX_ICONS, TYPE_ICONS } from "@/lib/icons";

const ICONS: Record<string, string> = { ...FLUX_ICONS, ...KPI_ICONS, ...UI_ICONS, ...TYPE_ICONS };
type IconName = keyof typeof ICONS;
import type { GlobalAlertLevel, SituationalAwareness } from "@/lib/ai/situational/types";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ========================================================================
// Conscience Situationnelle IA — TUILE DASHBOARD (beau & minimaliste).
// Règles :
//  - AUCUN texte long (1 synthèse COURTE max 180 chars seulement).
//  - Graphiques MINIMALISTES (barres mini, timeline, chips couleur).
//  - Graphique 1 = barres points-chauds (régions × poids).
//  - Graphique 2 = barres horizontales facteurs critiques (impact haut/moyen/faible).
//  - Timeline 2h / 6h / 24h risques imminents.
// ========================================================================

// ---------- palette et utilitaires
type Props = { className?: string; bare?: boolean };

const LEVEL_META: Record<
  GlobalAlertLevel,
  { dot: string; tint: string; bg: string; label: string; scoreFill: string }
> = {
  calme:        { dot: "bg-emerald-500",   tint: "text-emerald-700 dark:text-emerald-300",   bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/20", label: "Calme",        scoreFill: "bg-emerald-500" },
  surveillance: { dot: "bg-amber-500",     tint: "text-amber-700 dark:text-amber-200",       bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-500/20",     label: "Surveillance", scoreFill: "bg-amber-500" },
  vigilance:    { dot: "bg-orange-500",    tint: "text-orange-700 dark:text-orange-200",     bg: "bg-orange-50 dark:bg-orange-500/10 border-orange-500/20",   label: "Vigilance renforcée", scoreFill: "bg-orange-500" },
  alerte_rouge: { dot: "bg-red-500",       tint: "text-red-700 dark:text-red-200",           bg: "bg-red-50 dark:bg-red-500/10 border-red-500/20",           label: "Alerte rouge", scoreFill: "bg-red-500" },
};

const NIV_COLORS: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "bg-emerald-500", modere: "bg-sky-500", eleve: "bg-orange-500", critique: "bg-red-500",
};
const NIV_TXT: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "Faible", modere: "Modéré", eleve: "Élevé", critique: "Critique",
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

// ---------- Barre de progression simple
function Bar({ value, max = 100, className, fill }: { value: number; max?: number; className?: string; fill: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------- Chip — TAILLE MINIMALISTE RÉDUITE
function Chip({
  icon, label, tone = "gray", value, className,
}: {
  icon?: IconName; label: string; value?: ReactNode;
  tone?: "gray" | "emerald" | "red" | "amber" | "sky" | "violet";
  className?: string;
}) {
  const tones: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-200 border-gray-200/70 dark:border-white/5",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200 border-emerald-500/15",
    red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200 border-red-500/15",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200 border-amber-500/15",
    sky: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200 border-sky-500/15",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200 border-violet-500/15",
  };
  return (
    <div className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold leading-none", tones[tone], className)}>
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      <span className="whitespace-normal">{label}</span>
      {value !== undefined && <span className="ml-0.5 whitespace-normal opacity-90">{value}</span>}
    </div>
  );
}

// ---------- Section (titre petit + contenu) — ALIGNEMENT PIXEL + GAP UNIFORME
function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-3.5 min-w-0">
      <div className="flex items-center justify-between gap-2 w-full min-w-0 px-0.5">
        <h3 className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.05em] text-gray-500 dark:text-rdia-300/80 leading-none">{title}</h3>
        {right}
      </div>
      <div className="w-full min-w-0">{children}</div>
    </div>
  );
}

// ---------- Composant principal
export default function SituationalAwarenessPanel({ className, bare }: Props) {
  const sa = useArgos((s) => s.situationalAwareness);
  const loading = useArgos((s) => s.situationalLoadingAI);
  const model = useArgos((s) => s.situationalModel);
  const recompute = useArgos((s) => s.recomputeSituationalAwarenessAI);

  const incidents = useArgos((s) => s.incidents);
  const hospitals = useArgos((s) => s.hospitals);
  const units = useArgos((s) => s.units);
  const dashStats = useArgos((s) => s.dashStats);
  const evoHash = (dashStats?.evolution ?? []).slice(-6).map((e) => `${e.d}_${e.opened ?? 0}_${e.closed ?? 0}`).join("|");

  useEffect(() => {
    if (sa) return;
    void recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Auto-MAJ si changements de données (sans saturer: debouncing par timeout natif 750ms)
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
      <section className={cn("rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-rdia-800/40 md:p-6", className)}>
        <div className="flex h-full flex-col gap-4">{children}</div>
      </section>
    );

  if (!sa) {
    return shell(
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />
          <span className="font-medium text-violet-700 dark:text-violet-300">
            {loading ? "Analyse IA en cours…" : "Initialisation conscience situationnelle"}
          </span>
        </div>
        <Bar value={60} className="h-1.5 w-52" fill="bg-violet-500" />
      </div>,
    );
  }

  return <ShellInner sa={sa} loading={loading} model={model} onRefresh={() => void recompute()} shell={shell} />;
}

// ---------- Render final du shell
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
  return shell(
    <>
      {/* -------- ROW 1 : niveau global + synthèse + boutons — SANS AFFICHAGE SCORE */}
      <header className="flex items-start gap-3">
        <div className={cn("shrink-0 rounded-xl border p-2.5", lm.bg)}>
          <div className={cn("h-3 w-3 rounded-full ring-2 ring-offset-1 ring-offset-transparent dark:ring-offset-rdia-900/0", lm.dot, loading ? "animate-pulse" : "")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-[17px] font-bold leading-none", lm.tint)}>{lm.label}</span>
            {sa.fromAI ? (
              <Chip icon="sparkles" tone="violet" label={`IA · ${model ?? "modèle"}`} />
            ) : (
              <Chip icon="scale" tone="gray" label="Analyse temps réel" />
            )}
            {loading && <Chip tone="violet" label="Mise à jour…" />}
          </div>
          <p className="mt-1.5 text-[12.5px] leading-snug font-medium text-gray-700 dark:text-rdia-100/95">{sa.synthese}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="shrink-0 inline-flex h-11 items-center gap-1.5 lg:h-9 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/5 dark:bg-white/5 dark:text-rdia-100 dark:hover:bg-white/10"
        >
          <Icon name="refresh-cw" className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualiser
        </button>
      </header>

      {/* -------- ROW 2 : 2 colonnes — GAP RÉDUITS style minimaliste -------- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-5">
        {/* ========== COLONNE GAUCHE (3 blocs) — GAP 5 ========== */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Bloc 1 — Points chauds géographiques */}
          <Section title="Points chauds géographiques" right={<span className="text-[10.5px] font-medium text-gray-400 leading-none">{sa.pointsChauds.length} zone(s)</span>}>
            <HotspotsBars data={sa.pointsChauds} />
          </Section>

          {/* Bloc 2 — Anticipations IA (1 LIGNE · 4 CHIPS) */}
          <Section title="Anticipations IA" right={<span className="text-[10.5px] font-medium text-gray-400 leading-none">Horizons 30 min–12 h</span>}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <ForeChip
                tone={sa.predictions.ttgStable ? "emerald" : sa.predictions.ttgMinutes <= 30 ? "red" : sa.predictions.ttgMinutes <= 90 ? "amber" : "sky"}
                icon="clock"
                label={sa.predictions.ttgStable ? "Réseau stable" : `Saturation à ${new Date(sa.generatedAt + sa.predictions.ttgMinutes * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                value={sa.predictions.ttgStable ? `> ${fmtDur(60 * 48)}` : `dans ${fmtDur(sa.predictions.ttgMinutes)}`}
                hint={sa.predictions.ttgStable ? (() => {
                  const litsTot = (sa as unknown as { _debugLitsTot?: number })._debugLitsTot;
                  const litsOcc = (sa as unknown as { _debugLitsOcc?: number })._debugLitsOcc;
                  if (typeof litsTot === "number" && typeof litsOcc === "number") {
                    const disp = litsTot - litsOcc;
                    return `${disp} lits dispos · ${Math.round((disp / litsTot) * 100)}% marge`;
                  }
                  // Fallback (fallback déterministe n'avait pas ces meta — on calcule depuis predictions flux)
                  return `Débit < ${Math.max(0, Math.round((sa.predictions.flux6h.total / 6) / 60 * 100) / 100)} patients/min · marge OK`;
                })() : `Débit ~ ${Math.max(0, Math.round((sa.predictions.flux6h.total / 6) / 60 * 100) / 100)} patients / min`}
                hintPct={sa.predictions.ttgStable ? 0.15 : Math.max(0, Math.min(1, 1 - sa.predictions.ttgMinutes / 180))}
              />
              <ForeChip
                tone={!sa.predictions.nextSat ? "gray" : sa.predictions.nextSat.alreadySat ? "red" : sa.predictions.nextSat.minutesUntilSat <= 30 ? "amber" : "sky"}
                icon="alert-triangle"
                label="Prochaine saturation"
                value={
                  sa.predictions.nextSat
                    ? sa.predictions.nextSat.alreadySat
                      ? `${Math.round(sa.predictions.nextSat.occPctNow * 100)}% (actuel)`
                      : `${Math.round(sa.predictions.nextSat.occPctNow * 100)}% → ${new Date(sa.generatedAt + sa.predictions.nextSat.minutesUntilSat * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Réseau contrôlé"
                }
                hint={sa.predictions.nextSat ? `${sa.predictions.nextSat.nom}${sa.predictions.nextSat.alreadySat ? " · saturé" : ` · dans ${fmtDur(sa.predictions.nextSat.minutesUntilSat)}`}` : "Aucun hôpital à risque"}
                hintPct={sa.predictions.nextSat ? sa.predictions.nextSat.occPctNow : 0.2}
              />
              <ForeChip
                tone={!sa.predictions.besoinHMC?.nombre ? "emerald" : sa.predictions.besoinHMC.nombre >= 3 ? "red" : "amber"}
                icon="tent"
                label="Besoin HMC · 6 h"
                value={!sa.predictions.besoinHMC?.nombre ? "Capacités OK" : `${sa.predictions.besoinHMC.nombre} HMC${sa.predictions.besoinHMC.nombre > 1 ? "s" : ""}`}
                hint={sa.predictions.besoinHMC?.nombre ? `${sa.predictions.besoinHMC.litsTotal} lits · ${sa.predictions.besoinHMC.litsParHMC}/unité` : "Aucun renfort"}
                hintPct={Math.max(0, Math.min(1, (sa.predictions.besoinHMC?.nombre ?? 0) / 4))}
              />
              <ForeChip
                tone={sa.predictions.redirection.nHopitaux >= 3 ? "emerald" : sa.predictions.redirection.nHopitaux === 0 ? "red" : "sky"}
                icon="shuffle"
                label="Redirection"
                value={`${sa.predictions.redirection.litsRedirigeables} lits`}
                hint={`${sa.predictions.redirection.nHopitaux} CHU basculable(s)`}
                hintPct={Math.max(0, Math.min(1, sa.predictions.redirection.litsRedirigeables / 500))}
              />
            </div>
          </Section>

          {/* Bloc 3 — Flux patients 6 h (poussé en bas colonne gauche mt-auto ↔ aligné avec Ruptures stock droite) */}
          <div className="mt-auto w-full min-w-0">
            <WideAlertCard
              icon="activity"
              title={`Flux 6 h · ${sa.predictions.flux6h.tendance}`}
              subtitle={`Pic dans ${fmtDur(sa.predictions.flux6h.picDansMinutes)}`}
              bigNumber={`+${sa.predictions.flux6h.total}`}
              pct={Math.max(0, Math.min(100, sa.predictions.flux6h.total / 300 * 100))}
            />
          </div>
        </div>

        {/* ========== COLONNE DROITE (3 blocs) — GAP 5 ========== */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Bloc 1 — Facteurs critiques */}
          <Section title="Facteurs critiques" right={<span className="text-[10.5px] font-medium text-gray-400 leading-none">{sa.facteursCritiques.length} détecté(s)</span>}>
            <FactorBars data={sa.facteursCritiques} />
          </Section>

          {/* Bloc 2 — Risques imminents */}
          <Section title="Risques imminents">
            <RiskTimeline risks={sa.risquesProchaines} />
          </Section>

          {/* Bloc 3 — Ruptures stock (poussé en bas colonne droite mt-auto ↔ aligné avec Flux gauche) */}
          <div className="mt-auto w-full min-w-0">
            <WideAlertCard
              icon="package"
              title="Ruptures stock"
              subtitle={sa.predictions.stockCritique.ruptures.length ? sa.predictions.stockCritique.ruptures.slice(0, 3).join(" · ") : "Stock nominal"}
              bigNumber={sa.predictions.stockCritique.ruptures.length ? String(sa.predictions.stockCritique.ruptures.length) : "0"}
              bigNumberUnit={sa.predictions.stockCritique.ruptures.length > 1 ? "ruptures" : sa.predictions.stockCritique.ruptures.length === 1 ? "rupture" : ""}
              pct={sa.predictions.stockCritique.niveau === "alerte" ? 95 : sa.predictions.stockCritique.niveau === "attention" ? 65 : 15}
            />
          </div>
        </div>
      </div>

      {/* Footer minimaliste */}
      <footer className="mt-0.5 flex items-center justify-between pt-1 text-[10.5px] text-gray-400 leading-none">
        <span>Mis à jour : {new Date(sa.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </footer>
    </>,
  );
}

// ---------- helpers texte / durée (utilisés par ForeChip)
function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min";
  if (min >= 60 * 48) return "> 48 h";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} minute${m > 1 ? "s" : ""}`;
  if (m === 0) return `${h} heure${h > 1 ? "s" : ""}`;
  return `${h} h ${m}`;
}

// ---------- Carte large ALERTE (fond rose) — Flux 6h & Ruptures stock : MÊME HAUTEUR + chiffre MOINS GRAND
function WideAlertCard({
  icon, title, subtitle, bigNumber, pct, bigNumberUnit,
}: {
  icon: IconName; title: string; subtitle: string; bigNumber: string; pct: number; bigNumberUnit?: string;
}) {
  const safePct = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative flex flex-col justify-between gap-2.5 rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.05)] dark:border-red-500/25 dark:from-red-500/20 dark:to-red-500/5 w-full min-w-0 min-h-[98px] hyphens-none break-words">
      <div className="flex items-center justify-between gap-3 w-full min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-500/25 dark:text-red-200">
            <Icon name={icon} className="h-[18px] w-[18px]" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="whitespace-normal hyphens-none break-words text-[13.5px] font-bold leading-snug text-red-900 dark:text-red-100 min-w-0">{title}</div>
            <div className="whitespace-normal hyphens-none break-words text-[11.5px] leading-snug text-gray-600 dark:text-rdia-300/90 min-w-0">{subtitle}</div>
          </div>
        </div>
        <div className="shrink-0 text-right flex flex-col items-end justify-center gap-0.5 pt-0.5">
          <div className="whitespace-normal hyphens-none break-words text-[20px] font-black leading-none tracking-tight text-red-700 tabular-nums dark:text-red-300">
            {bigNumber}
          </div>
          {bigNumberUnit && (
            <div className="whitespace-normal hyphens-none break-words text-[10.5px] font-semibold leading-none text-gray-500 dark:text-rdia-300/90">
              {bigNumberUnit}
            </div>
          )}
        </div>
      </div>
      <Bar value={safePct} className="h-[7px]" fill="bg-red-600 dark:bg-red-500" />
    </div>
  );
}

// ---------- Forecast chip (PRÉDICTIF EXCLUSIF — ne recopie PAS les KPI existants)
// TTG / Prochaine saturation / Besoin HMC / Redirection
function ForeChip({
  icon, label, value, tone, hint, hintPct,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone: "gray" | "emerald" | "red" | "amber" | "sky" | "violet";
  hint?: string;
  hintPct?: number;
}) {
  const chipBg: Record<string, string> = {
    gray:     "from-gray-50  to-white    border-gray-200/80 text-gray-700    dark:from-white/10  dark:to-white/0   dark:border-white/15 dark:text-rdia-100",
    emerald:  "from-emerald-50 to-emerald-50/60 border-emerald-200 text-emerald-800 dark:from-emerald-500/20 dark:to-emerald-500/5 dark:border-emerald-500/25 dark:text-emerald-100",
    red:      "from-red-50     to-red-50/40     border-red-200     text-red-800     dark:from-red-500/20     dark:to-red-500/5     dark:border-red-500/25     dark:text-red-100",
    amber:    "from-amber-50   to-amber-50/40   border-amber-200   text-amber-900   dark:from-amber-500/20   dark:to-amber-500/5   dark:border-amber-500/25   dark:text-amber-100",
    sky:      "from-sky-50     to-sky-50/40     border-sky-200     text-sky-900     dark:from-sky-500/20     dark:to-sky-500/5     dark:border-sky-500/25     dark:text-sky-100",
    violet:   "from-violet-50  to-violet-50/40  border-violet-200  text-violet-900  dark:from-violet-500/20  dark:to-violet-500/5  dark:border-violet-500/25  dark:text-violet-100",
  };
  const iconBg: Record<string, string> = {
    gray:     "bg-gray-200/80 text-gray-700        dark:bg-white/15       dark:text-rdia-100",
    emerald:  "bg-emerald-100 text-emerald-700     dark:bg-emerald-500/25 dark:text-emerald-100",
    red:      "bg-red-100 text-red-700             dark:bg-red-500/25     dark:text-red-100",
    amber:    "bg-amber-100 text-amber-800         dark:bg-amber-500/25   dark:text-amber-100",
    sky:      "bg-sky-100 text-sky-800             dark:bg-sky-500/25     dark:text-sky-100",
    violet:   "bg-violet-100 text-violet-800       dark:bg-violet-500/25  dark:text-violet-100",
  };
  const safeHintPct = typeof hintPct === "number" ? Math.max(0, Math.min(1, hintPct)) : undefined;
  const fillByTone: Record<string, string> = {
    gray: "bg-gray-400/80 dark:bg-white/30",
    emerald: "bg-emerald-500 dark:bg-emerald-400",
    red: "bg-red-500 dark:bg-red-400",
    amber: "bg-amber-500 dark:bg-amber-400",
    sky: "bg-sky-500 dark:bg-sky-400",
    violet: "bg-violet-500 dark:bg-violet-400",
  };
  return (
    <div
      className={cn(
        "group relative h-auto min-h-[110px] w-full min-w-0 flex flex-col gap-1.5 rounded-xl border bg-gradient-to-br p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.05)] transition hyphens-none break-words",
        chipBg[tone],
      )}
      title={`${label} · ${value}${hint ? ` · ${hint}` : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconBg[tone])}>
          <Icon name={icon} className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 text-right hyphens-none break-words">
          <div className="whitespace-normal break-words text-[14px] font-bold leading-tight tabular-nums tracking-tight hyphens-none">{value}</div>
        </div>
      </div>
      <div className="whitespace-normal hyphens-none break-words text-[12px] font-semibold leading-snug tracking-tight opacity-90">
        {label}
      </div>
      {(hint || typeof safeHintPct === "number") && (
        <div className="mt-auto flex flex-col gap-1">
          {hint && (
            <span className="whitespace-normal hyphens-none break-words text-[10.5px] font-medium leading-snug opacity-80">{hint}</span>
          )}
          {typeof safeHintPct === "number" && (
            <Bar
              value={safeHintPct * 100}
              className="h-[5px] rounded-full"
              fill={fillByTone[tone] ?? "bg-black/20 dark:bg-white/20"}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Graph barres verticales mini (top 5 régions) — ALIGNEMENT BASELINE 100% PARFAIT + hover incidents
function HotspotsBars({ data }: { data: SituationalAwareness["pointsChauds"] }) {
  if (!data.length) {
    return <div className="rounded-lg border border-dashed border-gray-200 p-2.5 text-center text-[10.5px] text-gray-400 dark:border-white/10">Aucun point chaud</div>;
  }
  const max = Math.max(...data.map((d) => d.poids), 0.3);
  const cols = data.length <= 2 ? "grid-cols-2 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-gray-100 bg-gray-50/60 p-4 dark:border-white/5 dark:bg-white/3 min-h-[170px] w-full min-w-0">
      {/* ========== ROW 1 : BARRES (hauteur FIXE + items-end → BASELINE PARFAITE à 0.5px) ========== */}
      <div className="relative flex h-[110px] w-full items-end justify-start">
        {/* Ligne de base visuelle (toutes les barres PARTENT DE CETTE LIGNE — preuve d'alignement) */}
        <div className="absolute bottom-0 left-0 h-px w-full bg-gray-200/80 dark:bg-white/10" />

        {/* Grille barres : CHAQUE CELLULE = items-end justify-center → barre COLLÉE AU BAS */}
        <div className={cn("relative z-10 grid h-[110px] w-full items-end justify-items-center gap-x-3.5", cols)}>
          {data.map((h) => {
            const sevTint = h.sev === "high" ? "bg-red-500" : h.sev === "medium" ? "bg-orange-500" : "bg-amber-400";
            const hPct = (h.poids / max) * 100;
            return (
              <div
                key={h.id}
                className="group relative flex h-full w-full items-end justify-center min-w-0"
                title={`${h.region} · ${h.nIncidents} incident(s)`}
              >
                {/* Zone piste barre (subtile alignement) */}
                <div className={cn(
                  "absolute bottom-0 h-[110px] w-[56px] rounded-t-md opacity-70",
                  h.sev === "high" ? "bg-red-600/10" : h.sev === "medium" ? "bg-orange-500/10" : "bg-amber-400/10",
                )} />

                {/* BARRE — height en % + w-[56px] fixe + bottom=0 (items-end flex garantit) */}
                <div
                  className={cn(
                    "relative z-10 w-[56px] shrink-0 rounded-t-md transition-all duration-500 group-hover:brightness-110 group-hover:shadow-[0_0_0_2px_rgba(0,0,0,0.05)]",
                    sevTint,
                  )}
                  style={{ height: `${Math.max(12, hPct)}%` }}
                />

                {/* Badge incidents AU SURVOL — collé au sommet de la barre, centré */}
                <div className="pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-0 opacity-0 transition-all duration-200 ease-out group-hover:-translate-y-1.5 group-hover:opacity-100 bottom-full pb-1.5">
                  <span className="rounded-md bg-black/85 px-2 py-1 text-center text-[10.5px] font-bold text-white shadow-md whitespace-nowrap dark:bg-black/80">
                    {h.nIncidents} incident{h.nIncidents > 1 ? "s" : ""}
                  </span>
                  <span className="-mt-[5px] h-2 w-2 rotate-45 border-b border-r border-black/70 bg-black/85" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========== ROW 2 : LABELS (MÊME GRILLE COLONNES que row barres → label PILE SOUS SA BARRE) ========== */}
      <div className={cn("grid w-full items-start justify-items-center gap-x-3.5", cols)}>
        {data.map((h) => (
          <div
            key={`lbl-${h.id}`}
            className="w-full text-center text-[11.5px] font-semibold leading-snug text-gray-700 dark:text-rdia-100/90 whitespace-normal hyphens-none break-words max-w-[72px] mx-auto min-w-0"
          >
            {h.region}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Facteurs critiques (barres horizontales triées) — style minimaliste compact
function FactorBars({ data }: { data: SituationalAwareness["facteursCritiques"] }) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => {
      const w = (x: typeof data[number]) => (x.impact === "haut" ? 3 : x.impact === "moyen" ? 2 : 1);
      return w(b) - w(a);
    }),
    [data],
  );
  return (
    <div className="flex flex-col gap-2.5 w-full min-w-0">
      {sorted.slice(0, 5).map((f) => {
        const pct = f.impact === "haut" ? 92 : f.impact === "moyen" ? 60 : 28;
        const fill = f.impact === "haut" ? "bg-red-500" : f.impact === "moyen" ? "bg-amber-500" : "bg-emerald-500";
        const tag = f.impact === "haut" ? "text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-200" :
                   f.impact === "moyen" ? "text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-200" :
                   "text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-200";
        return (
          <div key={f.id} className="flex flex-col gap-2 rounded-md px-2 py-2 min-w-0 hyphens-none" title={`${f.label}${f.value !== undefined ? ` · ${String(f.value)}` : ""}`}>
            <div className="flex items-start gap-2.5 w-full min-w-0">
              <span className={cn("shrink-0 w-14 text-center rounded px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide leading-none", tag)}>
                {f.impact}
              </span>
              <span className="min-w-0 flex-1 whitespace-normal hyphens-none break-words text-[12.5px] font-semibold leading-snug text-gray-800 dark:text-rdia-100 pt-px">
                {f.label}
              </span>
              {f.value !== undefined && (
                <span className="shrink-0 whitespace-nowrap font-mono text-[15px] font-black text-gray-900 dark:text-rdia-50 tabular-nums leading-none pt-px ml-0.5">{String(f.value)}</span>
              )}
            </div>
            <Bar value={pct} className="h-[6px]" fill={fill} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- Timeline risques 2h/6h/24h — style minimaliste compact
function RiskTimeline({ risks }: { risks: SituationalAwareness["risquesProchaines"] }) {
  const order: Array<"2h" | "6h" | "24h"> = ["2h", "6h", "24h"];
  const byHorizon = new Map(risks.map((r) => [r.horizon, r]));
  return (
    <div className="relative grid grid-cols-1 gap-2.5 rounded-lg border border-gray-100 bg-gray-50/60 p-3 dark:border-white/5 dark:bg-white/3 sm:grid-cols-3 w-full min-w-0">
      {order.map((h) => {
        const r = byHorizon.get(h);
        if (!r) {
          return (
            <div key={h} className="relative flex min-h-[145px] h-auto flex-col rounded-lg border border-dashed border-gray-200 bg-white/50 p-2.5 dark:border-white/10 dark:bg-white/0">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 leading-none">H {h}</div>
              <div className="mt-1.5 text-[11px] text-gray-400">—</div>
            </div>
          );
        }
        return (
          <div key={h} className="relative flex min-h-[145px] h-auto flex-col rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm dark:border-white/10 dark:bg-white/5 hyphens-none break-words" title={r ? `${r.type} · ${r.zone} · ${NIV_TXT[r.niveau]} ${r.probabilitePct}%` : `Horizon ${h}`}>
            <div className="flex items-center justify-between w-full min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500 dark:text-rdia-300/80 shrink-0 leading-none">Horizon {h}</div>
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", NIV_COLORS[r?.niveau ?? "faible"])} />
            </div>
            <div className="mt-2 whitespace-normal hyphens-none break-words text-[12.5px] font-bold leading-snug text-gray-900 dark:text-rdia-50 min-w-0">{r?.type ?? "—"}</div>
            <div className="mt-0.5 whitespace-normal hyphens-none break-words text-[11px] leading-snug text-gray-500 dark:text-rdia-300/85 min-w-0">{r?.zone ?? "—"}</div>
            {r && (
              <>
                <div className="mt-auto flex items-center justify-between pt-2 w-full min-w-0">
                  <span className={cn("shrink-0 rounded px-2.5 py-1 text-[10.5px] font-bold leading-none",
                    r.niveau === "critique" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200" :
                    r.niveau === "eleve" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200" :
                    r.niveau === "modere" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200" :
                    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
                  )}>
                    {NIV_TXT[r.niveau]} {r.probabilitePct}%
                  </span>
                </div>
                <Bar value={r.probabilitePct} className="mt-2 h-[6px]" fill={NIV_COLORS[r.niveau]} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
