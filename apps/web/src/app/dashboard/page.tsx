"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { KPI_ICONS, UI_ICONS } from "@/lib/icons";
import { ChartCard, type ChartDatum } from "@/components/charts/ChartCard";
import { LineAreaChart } from "@/components/charts/LineAreaChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatTile } from "@/components/flux/FluxUI";
import { occBarClass, sevBadge, typeLabel } from "@/lib/helpers";
import { HealthGlyph } from "@/components/health/HealthGlyph";
import { aggregateCasualties, incidentColor, semanticChipsForType } from "@/lib/derive";
import type { HospitalKind, Incident, Lang } from "@/lib/types";
import SituationalAwarenessPanel from "@/components/dashboard/SituationalAwarenessPanel";
import { IncidentsPanel } from "@/components/dashboard/DashboardIncidentBlocks";
import { IncidentDetailModal } from "@/components/dashboard/IncidentDetailModal";

// ============================================================================
// Tableau de bord national — LANGAGE VISUEL DE LA PLATEFORME, pas un magazine.
//
// La version précédente posait un « hero éditorial premium » (serif italique,
// encres #1C1A17/#8A6D1B, surfaces ivoire) étranger au système de design
// d'ARGOS : partout ailleurs, l'app parle en `.carte`, tokens rdia/or/danger,
// sans-serif, clair ET sombre. Cette page revient dans le rang :
//
// - les KPI réutilisent `StatTile` (components/flux/FluxUI), LE patron KPI
//   de la maison ;
// - chaque tuile est une `.carte` avec l'en-tête standard des graphiques
//   (patron CardShell de ChartCard) ;
// - chaque tuile garde son bouton « Agrandir » : la miniature montre la forme,
//   la modale montre le DÉTAIL — graphique plus grand + table des valeurs
//   exactes (recommandation d'accessibilité : un graphique seul n'est pas
//   lisible par un lecteur d'écran, la table l'est) ;
// - la topbar du shell affiche déjà « Tableau de bord » : aucun titre géant
//   redondant, la donnée d'abord.
// ============================================================================

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

interface Kpi {
  label: string;
  val: string;
  sub: string;
  subColor: string;
  icon: string;
  iconWrap: string;
}

type TileId = "evolution" | "casualties" | "moyens" | "hospitals" | "severity" | "feed" | "incidents";

export default function DashboardPage() {
  const t = useDict();
  const m = useModules();
  const incidents = useArgos((s) => s.incidents);
  const hospitals = useArgos((s) => s.hospitals);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const feed = useArgos((s) => s.feed);
  const dashStats = useArgos((s) => s.dashStats);
  const situational = useArgos((s) => s.situationalAwareness);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const lang = useArgos((s) => s.lang) as Lang;

  const [expanded, setExpanded] = useState<TileId | null>(null);
  const [selIncident, setSelIncident] = useState<Incident | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  /**
   * Onglet actif : vue opérationnelle (tuiles) ou analyse IA (conscience
   * situationnelle). Le panneau IA mérite son propre onglet, pas une case de
   * grille de 920 px.
   */
  const [view, setView] = useState<"ops" | "ia">("ops");

  const activeInc = incidents.filter((i) => i.st !== "closed").length;
  const bedsFixed = hospitals.reduce((a, h) => a + (h.lits - h.occ), 0);
  const bedsField = fieldHosps.reduce((a, f) => a + (f.cap - f.occ), 0);

  // 5e KPI : niveau global de conscience situationnelle (IA + repli).
  const kpiSA = useMemo(() => {
    if (!situational) return null;
    const levelMap: Record<Lowercase<typeof situational.niveauGlobal>, { tint: "red" | "amber" | "green" | "blue"; label: string }> = {
      alerte_rouge: { tint: "red", label: "Alerte rouge" },
      vigilance: { tint: "amber", label: "Vigilance renforcée" },
      surveillance: { tint: "blue", label: "Surveillance" },
      calme: { tint: "green", label: "Calme" },
    };
    const meta = levelMap[situational.niveauGlobal];
    const iconWrap =
      meta.tint === "red" ? "bg-danger-500/10 text-danger-500" :
      meta.tint === "amber" ? "bg-or-500/15 text-or-500" :
      meta.tint === "green" ? "bg-green-500/10 text-green-600" : "bg-blue-500/10 text-blue-500";
    const subColor =
      meta.tint === "red" ? "text-danger-500" :
      meta.tint === "amber" ? "text-or-500" :
      meta.tint === "green" ? "text-green-600" : "text-blue-500";
    const nHot = situational.pointsChauds.length;
    const sub = `${meta.label}${nHot ? ` · ${nHot} point(s) chaud(s)` : ""}`;
    return { score: situational.scoreGlobal, sub, iconWrap, subColor } as const;
  }, [situational]);

  const kpis: Kpi[] = [
    { label: t.kpi_inc, val: String(activeInc), sub: "+2 · 24h", subColor: "text-danger-500", icon: KPI_ICONS.incidents, iconWrap: "bg-danger-500/10 text-danger-500" },
    { label: t.kpi_pers, val: "1 043", sub: "+320 · 24h", subColor: "text-or-500", icon: KPI_ICONS.personnel, iconWrap: "bg-or-500/15 text-or-500" },
    { label: t.kpi_beds, val: String(bedsFixed + bedsField), sub: `+${bedsField} HMC`, subColor: "text-green-600", icon: KPI_ICONS.beds, iconWrap: "bg-green-500/10 text-green-600" },
    { label: t.kpi_units, val: "4", sub: `2 ${t.u_deployed.toLowerCase()}`, subColor: "text-blue-500", icon: KPI_ICONS.units, iconWrap: "bg-blue-500/10 text-blue-500" },
  ];

  const chartMoyens: ChartDatum[] = [
    { label: "Véhicules", value: 86, couleur: "#C9A84C" },
    { label: "Ambulances", value: 76, couleur: "#EF4444" },
    { label: "Génie", value: 24, couleur: "#3B82F6" },
    { label: "Hélicos", value: 12, couleur: "#10B981" },
  ];

  // ===== Bilan humain · un seul useMemo via le helper source unique (derive.ts)
  const { casualtiesByType, topImpactIncidents, semKpis } = useMemo(() => {
    const { byType, topImpact, kpis: k } = aggregateCasualties(incidents, dashStats);
    return {
      casualtiesByType: byType,
      topImpactIncidents: topImpact.map((x) => ({ i: x.incident, impact: x.impact })),
      semKpis: k,
    };
  }, [incidents, dashStats]);

  const titleOf: Record<TileId, string> = {
    evolution: t.dash_evolution,
    casualties: m.orsec.casualties,
    moyens: t.chart_moyens,
    hospitals: t.dash_hosp,
    severity: m.analytics.severity_dist,
    feed: t.feed,
    incidents: t.dash_incidents ?? "Incidents",
  };

  /**
   * Corps d'une tuile. `detail` = rendu dans la modale agrandie : même donnée,
   * mais PLUS d'information — graphique à l'aise + table des valeurs exactes
   * pour les vues agrégées (un lecteur d'écran lit la table, pas le SVG).
   */
  const body = (id: TileId, detail = false): ReactNode => {
    switch (id) {
      case "evolution": {
        if (!dashStats) return <Empty />;
        const chart = (
          <LineAreaChart bare titre={t.dash_evolution} data={dashStats.evolution} labelOpened={t.dash_opened} labelClosed={t.dash_closed} />
        );
        if (!detail) return chart;
        return (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="min-h-0 flex-1">{chart}</div>
            <DetailTable
              cols={["", t.dash_opened, t.dash_closed]}
              rows={dashStats.evolution.map((p) => [p.d, String(p.opened), String(p.closed)])}
            />
          </div>
        );
      }
      case "casualties": {
        return (
          <div className="flex h-full min-h-0 w-full flex-col gap-2">
            {/* ==== 6 KPI systématiques · Décès · Contaminés · Infectés · Blessés · Disparus · Secourus (+ Exposés si > 0) ==== */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
              {semKpis.map((k) => {
                const dim = k.value === 0 ? " opacity-60" : "";
                return (
                  <div
                    key={k.key}
                    className={`flex min-h-0 flex-col items-center justify-center rounded-md border-t-2 ${k.color.br} ${k.color.bg} px-1.5 py-1.5 text-center${dim}`}
                  >
                    <span className={`text-[20px] font-black leading-none tabular-nums ${k.color.text}`}>{k.value}</span>
                    <span
                      className={`mt-0.5 max-w-full text-[9.5px] font-bold uppercase tracking-[0.05em] break-all leading-tight ${k.color.text}`}
                      style={{ hyphens: "auto" } as React.CSSProperties}
                    >
                      {k.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ==== Répartition par catégorie + top incidents (2 colonnes) ==== */}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden md:grid-cols-2">
              {/* Colonne gauche · répartition par type (défile) */}
              <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[10.5px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-rdia-400">
                    {t.dash_by_type ?? "Par type"}
                  </span>
                  {filterType && (
                    <button
                      type="button"
                      onClick={() => setFilterType(null)}
                      className="text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-rdia-300"
                    >
                      ← {t.flt_all}
                    </button>
                  )}
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pe-0.5">
                  {casualtiesByType.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-gray-400 dark:text-rdia-400">
                      —
                    </div>
                  ) : casualtiesByType.map((r) => {
                    const hex = incidentColor(r.type);
                    const active = filterType === r.type;
                    const { main: mainDim, secondary: secondaryDimChips } = semanticChipsForType(r);
                    return (
                      <button
                        key={r.type}
                        type="button"
                        onClick={() => setFilterType(active ? null : r.type)}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-md border px-1.5 py-1.5 text-start transition-all duration-150",
                          active
                            ? "border-transparent text-white shadow-sm"
                            : "border-gray-200/60 bg-white/70 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04]",
                        )}
                        style={active ? { backgroundColor: hex } : undefined}
                      >
                        {/* Ligne 1 · type + Σ total */}
                        <div className="flex w-full items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: active ? "rgba(255,255,255,0.9)" : hex }}
                          />
                          <span className={cn(
                            "min-w-0 flex-1 truncate text-[11.5px] font-extrabold leading-snug",
                            active ? "text-white" : "text-gray-800 dark:text-rdia-100",
                          )}>
                            {typeLabel(r.type, incidentTypes, lang)}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums",
                              active ? "bg-white/25 text-white" : "text-white",
                            )}
                            style={!active ? { backgroundColor: hex } : undefined}
                          >
                            Σ{r.total}
                          </span>
                        </div>
                        {/* Ligne 2 · chips sémantiques (contaminés, exposés…) */}
                        <div className="flex w-full flex-wrap items-center gap-1">
                          {mainDim && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold leading-none",
                                active ? "bg-white/25 text-white" : "text-white",
                              )}
                              style={!active ? { backgroundColor: mainDim.hex } : undefined}
                            >
                              {mainDim.label} <span className="font-mono tabular-nums">{mainDim.v}</span>
                            </span>
                          )}
                          {secondaryDimChips.map((ch) => (
                            <span
                              key={ch.label}
                              className={cn(
                                "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8.5px] font-bold leading-none",
                                active ? "bg-white/20 text-white/90" : "",
                              )}
                              style={!active ? { backgroundColor: `${ch.hex}16`, color: ch.hex } : undefined}
                            >
                              {ch.label} <span className="font-mono tabular-nums">{ch.v}</span>
                            </span>
                          ))}
                          {!mainDim && secondaryDimChips.length === 0 && r.total === 0 && (
                            <span className="text-[9px] font-semibold text-gray-400 dark:text-rdia-500">—</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Colonne droite · top incidents par impact (défile) */}
              <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
                <span className="px-0.5 text-[10.5px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-rdia-400">
                  Top · impact
                </span>
                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pe-0.5">
                  {topImpactIncidents.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-gray-400 dark:text-rdia-400">
                      —
                    </div>
                  ) : topImpactIncidents.map(({ i: inc, impact }, idx) => {
                    const sev = sevBadge(inc.sev, t);
                    const sevC = sev.type === "high" ? "bg-danger-500" : sev.type === "medium" ? "bg-or-500" : "bg-green-500";
                    return (
                      <button
                        key={inc.id}
                        type="button"
                        onClick={() => setSelIncident(inc)}
                        className="group flex items-center gap-1.5 rounded-md border border-gray-200/60 bg-white/70 px-1.5 py-1.5 text-start transition hover:border-gray-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04]"
                      >
                        <span className="w-4 shrink-0 text-center font-mono text-[10px] font-black tabular-nums text-gray-400 dark:text-rdia-500">
                          {idx + 1}
                        </span>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${sevC}`} />
                        <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold leading-snug text-gray-800 dark:text-rdia-100">
                          {inc.titre}
                        </span>
                        <span className="shrink-0 rounded-md bg-gray-900/90 px-1.5 py-0.5 font-mono text-[10px] font-black tabular-nums text-white dark:bg-white dark:text-gray-900">
                          Σ{impact}
                        </span>
                        <Icon
                          path={UI_ICONS.chevronRight}
                          size={11}
                          className="shrink-0 text-gray-400 group-hover:text-rdia-500 dark:group-hover:text-rdia-300"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      }
      case "moyens": {
        const chart = <DonutChart compact={!detail} bare titre={t.chart_moyens} data={chartMoyens} />;
        if (!detail) return chart;
        const total = chartMoyens.reduce((a, d) => a + d.value, 0);
        return (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="min-h-0 flex-1">{chart}</div>
            <DetailTable
              cols={["", "", "%"]}
              rows={chartMoyens.map((d) => [d.label, String(d.value), `${Math.round((d.value / Math.max(1, total)) * 100)} %`])}
              swatches={chartMoyens.map((d) => d.couleur)}
            />
          </div>
        );
      }
      case "hospitals":
        return dashStats ? (
          // Réseau militaire en tête, puis le civil trié par saturation
          // décroissante (tri effectué par l'API) — la liste défile. En mode
          // agrandi, le nom complet + la ville remplacent le libellé tronqué.
          <div className="flex h-full flex-col gap-2 overflow-y-auto pe-1">
            {dashStats.hospitals.map((h) => (
              <div key={h.id} className="flex items-center gap-2 sm:gap-2.5">
                <HealthGlyph kind={(h.kind ?? "civ") as HospitalKind} size={15} />
                <span
                  className={cn(
                    "shrink-0 truncate text-xs text-gray-600 dark:text-rdia-200",
                    detail ? "w-64" : "w-24 sm:w-36",
                  )}
                  title={`${h.nom} · ${h.ville}`}
                >
                  {detail ? `${h.nom} · ${h.ville}` : h.nom}
                </span>
                <div className="min-w-0 flex-1"><ProgressBar value={h.occPct} fill={occBarClass(h.occPct)} /></div>
                <span className="w-10 shrink-0 text-end font-mono text-xs tabular-nums text-gray-500 dark:text-rdia-300">{h.occPct} %</span>
              </div>
            ))}
          </div>
        ) : <Empty />;
      case "severity": {
        if (!dashStats) return <Empty />;
        const data: ChartDatum[] = [
          { label: t.sev_high, value: dashStats.severity.high, couleur: "#EF4444" },
          { label: t.sev_med, value: dashStats.severity.medium, couleur: "#C9A84C" },
          { label: t.sev_low, value: dashStats.severity.low, couleur: "#10B981" },
        ];
        const chart = <ChartCard bare titre={m.analytics.severity_dist} type="bars" data={data} />;
        if (!detail) return chart;
        const total = data.reduce((a, d) => a + d.value, 0);
        return (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="min-h-0 flex-1">{chart}</div>
            <DetailTable
              cols={["", "", "%"]}
              rows={data.map((d) => [d.label, String(d.value), `${Math.round((d.value / Math.max(1, total)) * 100)} %`])}
              swatches={data.map((d) => d.couleur)}
            />
          </div>
        );
      }
      case "feed":
        return (
          <div className="flex h-full flex-col gap-1.5 overflow-y-auto">
            {feed.map((f, i) => (
              <div key={`${f.time}-${i}`} className="flex items-center gap-2 border-b border-gray-100 py-1 dark:border-rdia-700/50 sm:gap-2.5">
                <span className="w-9 shrink-0 font-mono text-[11px] text-gray-400 dark:text-rdia-400 sm:text-[10px]">{f.time}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${f.c}`} />
                <span className={cn("min-w-0 flex-1 text-xs text-gray-700 dark:text-rdia-100", !detail && "truncate")}>{f.txt}</span>
              </div>
            ))}
          </div>
        );
      case "incidents":
        return (
          <IncidentsPanel
            incidents={incidents}
            types={incidentTypes}
            lang={lang}
            t={t}
            onOpen={(i) => setSelIncident(i)}
            filterType={filterType}
            onFilterChange={setFilterType}
          />
        );
    }
  };

  const dateHero = useMemo(() => {
    const d = new Date();
    const j = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${j}/${mm}/${d.getFullYear()}`;
  }, []);

  return (
    // Sous `lg`, la grille ne tient plus dans une hauteur d'écran : la page
    // reprend un flux vertical normal et c'est `<main>` qui défile.
    <section className="flex flex-col gap-4 animate-fade-in lg:h-full">
      {/* ===== Bandeau : KPI (patron StatTile de la maison) + état IA + onglets.
           La topbar du shell porte déjà le titre de la page — pas de hero
           redondant, la donnée d'abord. ===== */}
      <header className="shrink-0 space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {kpis.map((k) => (
            <StatTile
              key={k.label}
              icon={k.icon}
              iconWrap={k.iconWrap}
              label={k.label}
              value={k.val}
              sub={k.sub}
              subColor={k.subColor}
            />
          ))}
          {kpiSA ? (
            <StatTile
              icon={UI_ICONS.sparkles}
              iconWrap={kpiSA.iconWrap}
              label={t.dash_tab_ai}
              value={`${kpiSA.score}/100`}
              sub={kpiSA.sub}
              subColor={kpiSA.subColor}
            />
          ) : (
            <StatTile
              icon={UI_ICONS.sparkles}
              iconWrap="bg-gray-500/10 text-gray-400"
              label={t.dash_tab_ai}
              value="—"
              sub={t.sa_init}
            />
          )}
        </div>

        {/* Onglets vue opérationnelle / analyse IA + date du jour */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label={t.nav_dash}
            className="flex overflow-hidden rounded-lg border border-gray-200 bg-white p-1 dark:border-rdia-600 dark:bg-rdia-700"
          >
            {([
              ["ops", t.dash_tab_ops],
              ["ia", t.dash_tab_ai],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  "min-h-[38px] rounded-md px-4 text-xs font-semibold transition-colors duration-200",
                  view === id
                    ? "bg-rdia-600 text-white dark:bg-or-500 dark:text-rdia-900"
                    : "text-gray-500 hover:text-rdia-600 dark:text-rdia-300 dark:hover:text-or-400",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="font-mono text-[11px] tabular-nums text-gray-400 dark:text-rdia-400">{dateHero}</span>
        </div>
      </header>

      {view === "ia" ? (
        <div className="carte flex min-h-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-rdia-700/50 sm:px-5">
            <h3 className="min-w-0 truncate text-sm font-semibold text-rdia-600 dark:text-rdia-50">{t.dash_ai_title}</h3>
            {kpiSA ? (
              <span className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                kpiSA.subColor === "text-danger-500" ? "bg-danger-500/10 text-danger-500" :
                kpiSA.subColor === "text-or-500" ? "bg-or-500/15 text-or-600 dark:text-or-400" :
                kpiSA.subColor === "text-green-600" ? "bg-green-500/10 text-green-600" : "bg-blue-500/10 text-blue-500",
              )}>
                Score {kpiSA.score} / 100
              </span>
            ) : null}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pe-2 sm:p-4">
            <SituationalAwarenessPanel bare />
          </div>
        </div>
      ) : (
      <>
      {/* Grille de tuiles ops :
           - Mobile : 1 colonne · hauteurs naturelles
           - Tablette md : 2 colonnes
           - Desktop lg : 3 colonnes × 3 rangées (R3 plus haute pour la liste)
           - R1 · bilan humain (2) + moyens (1)
             R2 · évolution (1) + hôpitaux (1) + gravité (1)
             R3 · fil (1) + incidents (2) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
        <DashTile id="casualties" title={titleOf.casualties} onExpand={setExpanded} label={t.dash_expand} className="md:col-span-2">{body("casualties")}</DashTile>
        <DashTile id="moyens" title={titleOf.moyens} onExpand={setExpanded} label={t.dash_expand} className="md:col-span-2 lg:col-span-1">{body("moyens")}</DashTile>
        <DashTile id="evolution" title={titleOf.evolution} onExpand={setExpanded} label={t.dash_expand}>{body("evolution")}</DashTile>
        <DashTile id="hospitals" title={titleOf.hospitals} onExpand={setExpanded} label={t.dash_expand}>{body("hospitals")}</DashTile>
        <DashTile id="severity" title={titleOf.severity} onExpand={setExpanded} label={t.dash_expand}>{body("severity")}</DashTile>
        <DashTile id="feed" title={titleOf.feed} onExpand={setExpanded} label={t.dash_expand}>{body("feed")}</DashTile>
        <DashTile id="incidents" title={titleOf.incidents} className="min-h-[320px] sm:min-h-[360px] md:col-span-2 lg:min-h-0" onExpand={setExpanded} label={t.dash_expand}>
          {body("incidents")}
        </DashTile>
      </div>
      </>
      )}

      {/* Tuile agrandie : même donnée, PLUS de détail (graphique à l'aise +
          table des valeurs). `dvh` et non `vh` pour la barre d'adresse mobile. */}
      <Modal open={expanded !== null} size="2xl" title={expanded ? titleOf[expanded] : ""} onClose={() => setExpanded(null)}>
        <div className="h-[65dvh] sm:h-[72dvh] lg:h-[85dvh]">{expanded && body(expanded, true)}</div>
      </Modal>

      {/* Modale détail d'incident (clic sur une ligne / une catégorie) */}
      <IncidentDetailModal
        open={selIncident !== null}
        incident={selIncident}
        onClose={() => setSelIncident(null)}
      />
    </section>
  );
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-xs text-gray-400 dark:text-rdia-400">…</div>;
}

/**
 * Table des valeurs exactes affichée sous le graphique agrandi. C'est le
 * complément d'accessibilité du SVG : lisible au lecteur d'écran, copiable,
 * sans ambiguïté d'échelle. `swatches` ajoute la pastille couleur de la série.
 */
function DetailTable({ cols, rows, swatches }: { cols: string[]; rows: string[][]; swatches?: string[] }) {
  return (
    <div className="max-h-56 shrink-0 overflow-y-auto rounded-lg border border-gray-100 dark:border-rdia-700/50">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-gray-50 dark:bg-rdia-800">
          <tr>
            {cols.map((c, i) => (
              <th key={i} className={cn("px-3 py-1.5 font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300", i === 0 ? "text-start" : "text-end")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-gray-100 dark:border-rdia-700/50">
              {r.map((cell, ci) => (
                <td key={ci} className={cn("px-3 py-1.5", ci === 0 ? "text-start text-gray-700 dark:text-rdia-100" : "text-end font-mono tabular-nums text-gray-600 dark:text-rdia-200")}>
                  {ci === 0 && swatches ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: swatches[ri] }} />
                      {cell}
                    </span>
                  ) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Tuile du tableau de bord : `.carte` + en-tête standard des graphiques de la
 * plateforme (patron CardShell), bouton « Agrandir » en cible tactile 44 px.
 */
function DashTile({
  id,
  title,
  label,
  className = "",
  onExpand,
  children,
}: {
  id: TileId;
  title: string;
  label: string;
  className?: string;
  onExpand: (id: TileId) => void;
  children: ReactNode;
}) {
  return (
    <div className={cn("carte flex min-h-0 flex-col", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-rdia-700/50 sm:px-5">
        <h3 className="min-w-0 truncate text-sm font-semibold text-rdia-600 dark:text-rdia-50">{title}</h3>
        <button
          onClick={() => onExpand(id)}
          title={label}
          aria-label={label}
          className="cible-tactile inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-200 p-1.5 text-gray-400 transition-colors duration-200 hover:border-or-500/60 hover:text-or-600 dark:border-rdia-600 dark:text-rdia-300 dark:hover:border-or-400/60 dark:hover:text-or-400"
        >
          <Icon path={UI_ICONS.expand} size={13} strokeWidth={2.25} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5 sm:px-5 sm:py-3">
        {children}
      </div>
    </div>
  );
}
