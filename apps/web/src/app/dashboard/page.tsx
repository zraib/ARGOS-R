"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { KPI_ICONS, UI_ICONS } from "@/lib/icons";
import { ChartCard, type ChartDatum } from "@/components/charts/ChartCard";
import { LineAreaChart } from "@/components/charts/LineAreaChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { ListCard } from "@/components/charts/ListCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { occBarClass, sevBadge, typeLabel } from "@/lib/helpers";
import { HealthGlyph } from "@/components/health/HealthGlyph";
import { aggregateCasualties, incidentColor, semanticChipsForType } from "@/lib/derive";
import type { HospitalKind, Incident, Lang } from "@/lib/types";
import SituationalAwarenessPanel from "@/components/dashboard/SituationalAwarenessPanel";
import { IncidentsPanel } from "@/components/dashboard/DashboardIncidentBlocks";
import { IncidentDetailModal } from "@/components/dashboard/IncidentDetailModal";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function DatedBadge({children}:{children:ReactNode}){
  return (<span className="inline-flex items-center gap-1.5 rounded-full border" style={{borderColor:"rgba(201,168,76,0.35)", background:"rgba(251,248,239,0.8)", padding:"6px 12px"}}>
    <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{background:"#C9A84C"}}/>
    <span className="font-serif text-[10px] font-semibold uppercase tracking-[0.22em]" style={{color:"#8A6D1B"}}>{children}</span>
  </span>);
}

function SectionLabel({label, eyebrow}:{label:string; eyebrow?:string}){
  return (
    <div className="flex items-center gap-3">
      {eyebrow ? <span className="font-serif text-[10px] font-semibold uppercase tracking-[0.28em]" style={{color:"#8A6D1B"}}>{eyebrow}</span> : null}
      <span className="h-px flex-1" style={{background:"linear-gradient(90deg,rgba(201,168,76,0.5),transparent)"}}/>
      <span className="font-serif text-[10px] font-bold uppercase tracking-[0.28em]" style={{color:"#8A6D1B"}}>{label}</span>
      <span className="h-px flex-1" style={{background:"linear-gradient(90deg,transparent,rgba(201,168,76,0.5))"}}/>
    </div>
  );
}

function PremiumCard({tone, children, className = ""}:{tone?:"light"|"dark"|"ivory"; children: ReactNode; className?:string}){
  const surfaces = {
    light: "bg-white/85",
    dark: "bg-[#1C1A17]/95",
    ivory: "bg-[#FBF8EF]",
  } as const;
  return (
    <div
      className={`group relative h-full w-full overflow-hidden rounded-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 ${surfaces[tone ?? "light"]} ${className}`}
      style={{
        border: "1px solid rgba(175,140,60,0.14)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 20px 40px -24px rgba(30,20,0,0.08)",
      }}
    >
      <span aria-hidden className="pointer-events-none absolute left-4 top-0 h-[3px] w-14" style={{ background: "linear-gradient(90deg,#C9A84C,transparent)" }} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#C9A84C]/10 to-transparent opacity-0 transition-opacity duration-700 group-hover:translate-x-full group-hover:opacity-100 duration-1400ms ease-out"
      />
      {children}
    </div>
  );
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

/**
 * Tableau de bord national (disposition A) : grille compacte tenant sur un
 * écran (sans défilement) ; chaque tuile porte en haut à droite un bouton
 * « Agrandir » qui l'ouvre en grand dans une modale.
 */
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
   * situationnelle). La tuile IA occupait une rangée entière de la grille avec
   * 920 px de haut — un panneau de cette ampleur mérite son propre onglet, pas
   * une case de grille.
   */
  const [view, setView] = useState<"ops" | "ia">("ops");

  const activeInc = incidents.filter((i) => i.st !== "closed").length;
  const bedsFixed = hospitals.reduce((a, h) => a + (h.lits - h.occ), 0);
  const bedsField = fieldHosps.reduce((a, f) => a + (f.cap - f.occ), 0);

  // 5e KPI: Niveau global conscience situationnelle (IA + fallback). Cache par useMemo.
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
      meta.tint === "red" ? "bg-red-500/10 text-red-500" :
      meta.tint === "amber" ? "bg-amber-500/10 text-amber-500" :
      meta.tint === "green" ? "bg-green-500/10 text-green-600" : "bg-blue-500/10 text-blue-500";
    const subColor =
      meta.tint === "red" ? "text-red-500" :
      meta.tint === "amber" ? "text-amber-500" :
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
  const ops = [
    { id: 1, title: "Op. SALAMA — secours Al Haouz", color: "#C9A84C", progression: 65 },
    { id: 2, title: "Pont aérien Agadir–Amizmiz", color: "#3B82F6", progression: 40 },
    { id: 3, title: "Évacuation vallée de l'Ourika", color: "#EF4444", progression: 82 },
    { id: 4, title: "Rétablissement axes RN7 / RP2010", color: "#10B981", progression: 30 },
  ];

  // ===== Bilan humain · 1 useMemo via helper source unique (derive.ts)
  //      → par type, top incidents, totaux et KPIs dynamiques (4 KPI slots, sémantiques)
  const { casualtiesByType, topImpactIncidents, casualtiesTotals, semKpis } = useMemo(() => {
    const { byType, topImpact, totals, kpis } = aggregateCasualties(incidents, dashStats);
    return {
      casualtiesByType: byType,
      topImpactIncidents: topImpact.map((x) => ({ i: x.incident, impact: x.impact })),
      casualtiesTotals: totals,
      semKpis: kpis,
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

  /** Corps (bare) d'une tuile, réutilisé dans la grille et dans la modale. */
  const body = (id: TileId): ReactNode => {
    switch (id) {
      case "evolution":
        return dashStats ? (
          <LineAreaChart bare titre={t.dash_evolution} data={dashStats.evolution} labelOpened={t.dash_opened} labelClosed={t.dash_closed} />
        ) : <Empty />;
      case "casualties": {
        const maxCat = Math.max(1, ...casualtiesByType.map((r) => r.total));

        return (
          <div className="flex h-full min-h-0 w-full flex-col gap-2">
            {/* ==== 4 KPIs SÉMANTIQUES DYNAMIQUES ==== */}
            <div className="grid grid-cols-4 gap-1.5">
              {semKpis.map((k) => {
                return (
                  <div
                    key={k.key}
                    className={`flex min-h-0 flex-col items-center justify-center rounded-md border-t-2 ${k.color.br} ${k.color.bg} px-1.5 py-1.5 text-center`}
                  >
                    <span className={`text-[22px] font-black leading-none tabular-nums ${k.color.text}`}>{k.value}</span>
                    <span
                      className={`mt-1 max-w-full text-[10px] font-bold uppercase tracking-wider break-all leading-tight ${k.color.text}`}
                      style={{ hyphens: "auto" } as React.CSSProperties}
                    >
                      {k.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ==== Répartition par CATEGORIE + Top incidents (2 cols) ==== */}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 min-h-0 flex-1 overflow-hidden">
              {/* Colonne gauche · Répartition par catégorie scroll */}
              <div className="min-h-0 flex flex-col gap-1 overflow-hidden">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[10.5px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-rdia-400">
                    Par type
                  </span>
                  {filterType && (
                    <button
                      type="button"
                      onClick={() => setFilterType(null)}
                      className="text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-rdia-300"
                    >
                      ← tous
                    </button>
                  )}
                </div>
                <div className="min-h-0 flex-1 flex flex-col gap-1 overflow-y-auto pr-0.5">
                  {casualtiesByType.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-gray-400 dark:text-rdia-400">
                      Pas de victimes
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
                          "flex flex-col gap-1.5 rounded-md border px-1.5 py-1.5 text-left transition-all duration-150",
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
                        {/* Ligne 2 · chips sémantiques détail */}
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
                            <span className="text-[9px] font-semibold text-gray-400 dark:text-rdia-500">pas de données</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Colonne droite · Top incidents par impact scroll */}
              <div className="min-h-0 flex flex-col gap-1 overflow-hidden">
                <span className="px-0.5 text-[10.5px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-rdia-400">
                  Top · impact
                </span>
                <div className="min-h-0 flex-1 flex flex-col gap-1 overflow-y-auto pr-0.5">
                  {topImpactIncidents.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-gray-400 dark:text-rdia-400">
                      (pas d'incidents)
                    </div>
                  ) : topImpactIncidents.map(({ i: inc, impact }, idx) => {
                    const sev = sevBadge(inc.sev, t);
                    const sevC = sev.type === "high" ? "bg-danger-500" : sev.type === "medium" ? "bg-or-500" : "bg-green-500";
                    return (
                      <button
                        key={inc.id}
                        type="button"
                        onClick={() => setSelIncident(inc)}
                        className="group flex items-center gap-1.5 rounded-md border border-gray-200/60 bg-white/70 px-1.5 py-1.5 text-left transition hover:border-gray-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04]"
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
      case "moyens":
        return <DonutChart compact bare titre={t.chart_moyens} data={chartMoyens} />;
      case "hospitals":
        return dashStats ? (
          // Réseau militaire en tête, puis le civil trié par saturation
          // décroissante (tri effectué par l'API) — la liste défile.
          <div className="flex h-full flex-col gap-2 overflow-y-auto pe-1">
            {dashStats.hospitals.map((h) => (
              <div key={h.id} className="flex items-center gap-2 sm:gap-2.5">
                <HealthGlyph kind={(h.kind ?? "civ") as HospitalKind} size={15} />
                {/* Nom raccourci sous `sm` : à 375 px, 144 px de libellé ne
                    laisseraient plus de place à la jauge d'occupation. */}
                <span className="w-24 shrink-0 truncate text-xs text-gray-600 dark:text-rdia-200 sm:w-36" title={`${h.nom} · ${h.ville}`}>{h.nom}</span>
                <div className="min-w-0 flex-1"><ProgressBar value={h.occPct} fill={occBarClass(h.occPct)} /></div>
                <span className="w-10 shrink-0 text-end font-mono text-xs tabular-nums text-gray-500 dark:text-rdia-300">{h.occPct} %</span>
              </div>
            ))}
          </div>
        ) : <Empty />;
      case "severity":
        return dashStats ? (
          <ChartCard
            bare
            titre={m.analytics.severity_dist}
            type="bars"
            data={[
              { label: t.sev_high, value: dashStats.severity.high, couleur: "#EF4444" },
              { label: t.sev_med, value: dashStats.severity.medium, couleur: "#C9A84C" },
              { label: t.sev_low, value: dashStats.severity.low, couleur: "#10B981" },
            ]}
          />
        ) : <Empty />;
      case "feed":
        return (
          <div className="flex h-full flex-col gap-1.5 overflow-y-auto">
            {feed.map((f, i) => (
              <div key={`${f.time}-${i}`} className="flex items-center gap-2 border-b border-gray-100 py-1 dark:border-rdia-700/50 sm:gap-2.5">
                <span className="w-9 shrink-0 font-mono text-[11px] text-gray-400 dark:text-rdia-400 sm:text-[10px]">{f.time}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${f.c}`} />
                <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-rdia-100">{f.txt}</span>
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
    return `${j} · ${mm} · ${d.getFullYear()}`;
  }, []);

  return (
    // Sous `lg`, la grille ne peut plus tenir dans une seule hauteur d'écran :
    // la page reprend un flux vertical normal et c'est `<main>` qui défile.
    <section className="flex flex-col gap-4 animate-fade-in lg:h-full">
      {/* ===== HERO PREMIUM · Hero compact + onglets ===== */}
      <header className="shrink-0 space-y-3">
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr] lg:items-stretch">
          {/* HERO gauche · titre ops opérationnel + KPIs micro inline */}
          <PremiumCard tone="light" className="p-4 sm:p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <DatedBadge>{dateHero}</DatedBadge>
              <span className="font-serif italic text-[12px]" style={{color:"#8A6D1B"}}>
                {t.dash_tab_ops ?? "Vue opérationnelle"} et Analyse IA
              </span>
            </div>

            <div className="mt-3 flex items-end gap-3">
              <h1 className="font-serif tracking-tight text-[44px] leading-[1.02] text-[#1C1A17] sm:text-[38px]">
                Tableau de bord
                <span className="ml-2 font-serif italic text-[18px] sm:text-[16px]" style={{color:"#8A6D1B"}}>
                  général
                </span>
              </h1>
            </div>

            <p className="mt-2 max-w-[62ch] font-serif text-[13px] leading-[1.65] text-[#1C1A17]/70">
              Synthèse en temps réel des incidents, des ressources et du réseau hospitalier.
              Conscience situationnelle IA intégrée dans l'onglet « Analyse IA ».
            </p>

            {/* ===== 4 KPIs micro inline hero ===== */}
            <div className="mt-4 grid grid-cols-4 items-stretch gap-2 overflow-hidden sm:gap-3">
              {kpis.map((k, i) => (
                <div key={k.label} className={cn("relative flex min-w-0 flex-col gap-1 py-1 sm:py-1.5", i > 0 ? "pl-2 sm:pl-4" : "")}>
                  {i > 0 ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-px"
                      style={{ background: "linear-gradient(180deg,transparent,rgba(201,168,76,0.55) 40%,rgba(201,168,76,0.55) 60%,transparent)", height: "24px" }}
                    />
                  ) : null}
                  <span className="truncate font-serif text-[9px] font-semibold uppercase tracking-[0.22em]" style={{color:"#8A6D1B"}}>{k.label}</span>
                  <div className="flex flex-wrap items-end gap-x-1.5">
                    <span className="whitespace-nowrap font-serif text-[22px] font-semibold leading-none tabular-nums text-[#1C1A17] sm:text-[20px]">{k.val}</span>
                    <span className={cn("whitespace-nowrap text-[9.5px] font-semibold", k.subColor)}>{k.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </PremiumCard>

          {/* HERO droite · Onglets premium ops / Analyse IA + situation actuelle */}
          <PremiumCard tone="ivory" className="flex flex-col justify-between p-4 sm:p-5 lg:p-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-serif italic text-[13px]" style={{color:"#8A6D1B"}}>
                  {t.dash_tab_ai ?? "Analyse IA"}
                </span>
                {kpiSA ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[4px]" style={{borderColor:"rgba(201,168,76,0.35)", background:"rgba(255,255,255,0.55)"}}>
                    <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", kpiSA.subColor === "text-red-500" ? "bg-red-500" : kpiSA.subColor === "text-amber-500" ? "bg-or-500" : kpiSA.subColor === "text-green-600" ? "bg-green-500" : "bg-blue-500")}/>
                    <span className={cn("font-serif text-[9px] font-bold uppercase tracking-[0.2em]", kpiSA.subColor)}>
                      {kpiSA.sub.split("·")[0].trim()}
                    </span>
                  </span>
                ) : null}
              </div>

              <p className="mt-3 font-serif text-[17px] leading-snug text-[#1C1A17] sm:text-[15.5px]">
                {kpiSA
                  ? kpiSA.sub.includes("point(s)")
                    ? kpiSA.sub
                    : `${kpiSA.sub} · Score global ${kpiSA.score} / 100`
                  : "Conscience situationnelle en cours de calcul..."}
              </p>
            </div>

            {/* ===== Onglets premium ops / IA (même langage visuel) ===== */}
            <div
              role="tablist"
              aria-label={t.nav_dash}
              className="mt-4 flex w-full overflow-hidden rounded-lg p-1"
              style={{background:"rgba(28,26,23,0.05)", border:"1px solid rgba(175,140,60,0.18)"}}
            >
              {([
                ["ops", t.dash_tab_ops ?? "Vue opérationnelle"],
                ["ia", t.dash_tab_ai ?? "Analyse IA"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={cn(
                    "flex min-h-[40px] flex-1 items-center justify-center rounded-md px-2 py-2 text-center font-serif text-[11.5px] font-bold uppercase tracking-[0.18em] transition-all duration-200",
                    view === id
                      ? "shadow-sm"
                      : "hover:text-[#8A6D1B]",
                  )}
                  style={view === id
                    ? {background:"#FFFFFF", color:"#8A6D1B", border:"1px solid rgba(201,168,76,0.38)", boxShadow:"0 8px 24px -14px rgba(138,109,27,0.55)"}
                    : {color:"#1C1A17/55"}
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </PremiumCard>
        </div>
      </header>

      {/* ===== Section label : grilles de tuiles ===== */}
      <div className="shrink-0 px-0.5">
        <SectionLabel eyebrow="TABLEAU DE BORD" label={view === "ops" ? "CARTOGRAPHIE OPÉRATIONNELLE" : "CONSCIENCE SITUATIONNELLE IA"} />
      </div>

      {view === "ia" ? (
        <PremiumCard tone="light" className="flex min-h-0 flex-1 flex-col p-3 sm:p-4 lg:p-5">
          <header className="mb-2 shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-[13px] font-semibold text-[#1C1A17] sm:text-[14px]">
                {t.dash_ai_title}
              </h3>
              {kpiSA ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-serif text-[9.5px] font-bold uppercase tracking-[0.22em]" style={{background: kpiSA.subColor === "text-red-500" ? "rgba(239,68,68,0.09)" : kpiSA.subColor === "text-amber-500" ? "rgba(245,158,11,0.11)" : kpiSA.subColor === "text-green-600" ? "rgba(16,185,129,0.11)" : "rgba(59,130,246,0.1)", color: kpiSA.subColor === "text-red-500" ? "#B91C1C" : kpiSA.subColor === "text-amber-500" ? "#B45309" : kpiSA.subColor === "text-green-600" ? "#047857" : "#1D4ED8"}}>
                  Score {kpiSA.score} / 100
                </span>
              ) : null}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto pe-1">
            <SituationalAwarenessPanel bare />
          </div>
        </PremiumCard>
      ) : (
      <>
      {/* Grille de tuiles ops : casualties (2 cols / row1), puis toutes les 5 autres
           - Mobile : 1 colonne · hauteurs naturelles
           - Tablette md : 2 colonnes
           - Desktop lg : 3 colonnes × 3 rows (row1=row2=1fr, row3=1.35fr incidents)
           - Layout : R1 · casualties(2) + moyens(1)
                      R2 · evolution(1) + hospitals(1) + severity(1)
                      R3 · feed(1) + incidents(2) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:gap-5 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
        {/* Row 1 */}
        <DashTile id="casualties" title={titleOf.casualties} onExpand={setExpanded} label={t.dash_expand} className="lg:col-span-2">{body("casualties")}</DashTile>
        <DashTile id="moyens" title={titleOf.moyens} onExpand={setExpanded} label={t.dash_expand}>{body("moyens")}</DashTile>
        {/* Row 2 — 3 tuiles égales */}
        <DashTile id="evolution" title={titleOf.evolution} onExpand={setExpanded} label={t.dash_expand}>{body("evolution")}</DashTile>
        <DashTile id="hospitals" title={titleOf.hospitals} onExpand={setExpanded} label={t.dash_expand}>{body("hospitals")}</DashTile>
        <DashTile id="severity" title={titleOf.severity} onExpand={setExpanded} label={t.dash_expand}>{body("severity")}</DashTile>
        {/* Row 3 — feed 1 col · incidents 2 cols (total 3 → affiche correctement) */}
        <DashTile id="feed" title={titleOf.feed} onExpand={setExpanded} label={t.dash_expand}>{body("feed")}</DashTile>
        <DashTile id="incidents" title={titleOf.incidents} className="lg:col-span-2 min-h-[320px] sm:min-h-[360px] lg:min-h-0" onExpand={setExpanded} label={t.dash_expand}>
          {body("incidents")}
        </DashTile>
      </div>
      </>
      )}

      {/* Tuile agrandie · taille 2XL · `dvh` (et non `vh`) pour ne pas passer
          sous la barre d'adresse mobile */}
      <Modal open={expanded !== null} size="2xl" title={expanded ? titleOf[expanded] : ""} onClose={() => setExpanded(null)}>
        <div className="h-[65dvh] sm:h-[72dvh] lg:h-[85dvh]">{expanded && body(expanded)}</div>
      </Modal>

      {/* Modale détail d'incident (clic ligne / clic catégorie) */}
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
    <PremiumCard tone="light" className={cn("flex min-h-0 flex-col", className)}>
      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between gap-2 border-b px-4 pb-2.5 pt-3 sm:px-5" style={{borderColor:"rgba(175,140,60,0.14)"}}>
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{background:"#C9A84C"}}/>
          <h3 className="min-w-0 truncate font-serif text-[12.5px] font-bold tracking-tight text-[#1C1A17] sm:text-[13px]">
            {title}
          </h3>
        </div>

        <button
          onClick={() => onExpand(id)}
          title={label}
          aria-label={label}
          className="cible-tactile shrink-0 inline-flex items-center justify-center rounded-full p-1.5 transition-colors"
          style={{
            border: "1px solid rgba(175,140,60,0.22)",
            background: "rgba(251,248,239,0.55)",
            color: "#8A6D1B",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(201,168,76,0.12)";
            e.currentTarget.style.color = "#6B4F10";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(251,248,239,0.55)";
            e.currentTarget.style.color = "#8A6D1B";
          }}
        >
          <Icon path={UI_ICONS.expand} size={12} strokeWidth={2.25} />
        </button>
      </header>

      {/* ===== CONTENU ===== */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5 sm:px-5 sm:py-3">
        {children}
      </div>
    </PremiumCard>
  );
}
