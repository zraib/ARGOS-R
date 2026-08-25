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
                const shortLabel = k.label.length > 7 ? k.label.slice(0, 7) : k.label;
                return (
                  <div
                    key={k.key}
                    className={`flex min-w-0 flex-col items-center justify-center rounded-md border-t-2 ${k.color.br} ${k.color.bg} px-1.5 py-1.5 text-center`}
                  >
                    <span className={`text-[22px] font-black leading-none tabular-nums ${k.color.text}`}>{k.value}</span>
                    <span className={`mt-1 truncate text-[10px] font-bold uppercase tracking-wider ${k.color.text}`}>
                      {shortLabel}
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

  return (
    // Sous `lg`, la grille ne peut plus tenir dans une seule hauteur d'écran :
    // la page reprend un flux vertical normal et c'est `<main>` qui défile.
    <section className="flex flex-col gap-3 animate-fade-in lg:h-full">
      {/* Rangée de KPI (compacte) — 2 colonnes tiennent dès 375 px */}
      <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="carte flex items-center gap-2.5 p-3 sm:gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${k.iconWrap}`}>
              <Icon path={k.icon} size={20} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs text-gray-500 dark:text-rdia-300">{k.label}</div>
              {/* `flex-wrap` + `whitespace-nowrap` : sur une demi-largeur de
                  téléphone, le delta passe à la ligne au lieu de couper le
                  nombre en deux. */}
              <div className="flex flex-wrap items-end gap-x-2">
                <span className="whitespace-nowrap text-xl font-bold leading-none tabular-nums text-rdia-600 dark:text-rdia-50 sm:text-2xl">{k.val}</span>
                <span className={`whitespace-nowrap text-[11px] font-semibold sm:text-[10px] ${k.subColor}`}>{k.sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Onglets : même langage visuel que ceux de /utilisateurs (cohérence de
          navigation). L'état actif est marqué par fond + couleur, pas par la
          couleur seule. */}
      <div role="tablist" aria-label={t.nav_dash} className="flex w-fit max-w-full shrink-0 gap-1 overflow-hidden rounded-lg bg-gray-100 p-1 dark:bg-rdia-800/60">
        {([["ops", t.dash_tab_ops], ["ia", t.dash_tab_ai]] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`min-h-11 rounded-md px-3 py-2.5 text-xs font-semibold transition-colors lg:min-h-0 lg:py-1.5 ${
              view === id ? "bg-white text-or-600 shadow-sm dark:bg-rdia-600 dark:text-or-400" : "text-gray-500 hover:text-or-500 dark:text-rdia-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "ia" ? (
        <div role="tabpanel" className="carte flex min-h-0 flex-1 flex-col p-3 sm:p-4">
          <h3 className="mb-2 shrink-0 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{t.dash_ai_title}</h3>
          <div className="min-h-0 flex-1 overflow-y-auto pe-1">
            <SituationalAwarenessPanel bare />
          </div>
        </div>
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

/** Cadre de tuile : carte + titre + bouton « Agrandir » en haut à droite.
 *  Design neutre · sans cadre coloré. */
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
    <div
      className={cn(
        "group flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-rdia-800/60 dark:hover:border-white/20",
        className,
      )}
    >
      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-3.5 pb-2 pt-2.5 dark:border-white/5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate text-[12.5px] font-bold text-gray-800 dark:text-rdia-50 sm:text-[13px]">
            {title}
          </h3>
        </div>

        <button
          onClick={() => onExpand(id)}
          title={label}
          aria-label={label}
          className="cible-tactile shrink-0 inline-flex items-center justify-center rounded-full border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:border-white/10 dark:text-rdia-300 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Icon path={UI_ICONS.expand} size={12} strokeWidth={2.25} />
        </button>
      </header>

      {/* ===== CONTENU ===== */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5 sm:px-4 sm:py-3">
        {children}
      </div>
    </div>
  );
}
