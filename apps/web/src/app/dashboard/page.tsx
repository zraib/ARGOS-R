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
import { occBarClass } from "@/lib/helpers";
import { HealthGlyph } from "@/components/health/HealthGlyph";
import type { HospitalKind } from "@/lib/types";
import SituationalAwarenessPanel from "@/components/dashboard/SituationalAwarenessPanel";

interface Kpi {
  label: string;
  val: string;
  sub: string;
  subColor: string;
  icon: string;
  iconWrap: string;
}

type TileId = "evolution" | "casualties" | "moyens" | "hospitals" | "severity" | "feed" | "predictions";

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

  const [expanded, setExpanded] = useState<TileId | null>(null);

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

  const titleOf: Record<TileId, string> = {
    evolution: t.dash_evolution,
    casualties: m.orsec.casualties,
    moyens: t.chart_moyens,
    hospitals: t.dash_hosp,
    severity: m.analytics.severity_dist,
    feed: t.feed,
    predictions: "Conscience situationnelle à base d'IA",
  };

  /** Corps (bare) d'une tuile, réutilisé dans la grille et dans la modale. */
  const body = (id: TileId): ReactNode => {
    switch (id) {
      case "evolution":
        return dashStats ? (
          <LineAreaChart bare titre={t.dash_evolution} data={dashStats.evolution} labelOpened={t.dash_opened} labelClosed={t.dash_closed} />
        ) : <Empty />;
      case "casualties":
        return dashStats ? (
          <div className="grid h-full grid-cols-2 gap-2.5">
            {[
              { label: m.orsec.n_dead, val: dashStats.casualties.dead, cls: "text-danger-500" },
              { label: m.orsec.n_injured, val: dashStats.casualties.injured, cls: "text-or-500" },
              { label: m.orsec.n_missing, val: dashStats.casualties.missing, cls: "text-gray-500 dark:text-rdia-300" },
              { label: m.orsec.n_rescued, val: dashStats.casualties.rescued, cls: "text-green-600 dark:text-green-400" },
            ].map((c) => (
              <div key={c.label} className="flex min-w-0 flex-col justify-center rounded-lg bg-gray-50 px-3 py-2 dark:bg-rdia-800/50">
                <span className={`text-2xl font-bold leading-tight tabular-nums ${c.cls}`}>{c.val}</span>
                <span className="truncate text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400 sm:text-[10px]">{c.label}</span>
              </div>
            ))}
          </div>
        ) : <Empty />;
      case "moyens":
        return <DonutChart bare titre={t.chart_moyens} data={chartMoyens} />;
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
      case "predictions":
        return (
          // Le panneau de conscience situationnelle a besoin de hauteur, mais
          // 920 px sur un téléphone forceraient un défilement interminable :
          // la réserve grandit avec la largeur disponible.
          <div className="h-full min-h-[560px] w-full sm:min-h-[720px] lg:min-h-[920px]">
            <SituationalAwarenessPanel bare />
          </div>
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

      {/* Grille de tuiles : remplit l'écran restant à partir de `lg`.
           - Téléphone : une colonne, hauteurs naturelles (les graphiques
             gardent une hauteur explicite pour ne pas s'écraser).
           - Tablette (`md`) : deux colonnes, les blocs larges s'étendent.
           - Rangée 3 = CONSCIENCE SITUATIONNELLE IA (lg:col-span-4)
           - ratios : row1 (1.22fr) + row2 (1.22fr) + row3 (1.15fr) → blocs du haut PLUS GRANDS */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-4 lg:grid-rows-[minmax(0,1.22fr)_minmax(0,1.22fr)_minmax(0,1.15fr)]">
        <DashTile id="evolution" title={titleOf.evolution} className="h-64 sm:h-72 md:col-span-2 lg:h-auto lg:col-span-2" onExpand={setExpanded} label={t.dash_expand}>{body("evolution")}</DashTile>
        <DashTile id="casualties" title={titleOf.casualties} onExpand={setExpanded} label={t.dash_expand}>{body("casualties")}</DashTile>
        <DashTile id="moyens" title={titleOf.moyens} className="h-60 sm:h-64 lg:h-auto" onExpand={setExpanded} label={t.dash_expand}>{body("moyens")}</DashTile>
        <DashTile id="hospitals" title={titleOf.hospitals} className="md:col-span-2 lg:col-span-2" onExpand={setExpanded} label={t.dash_expand}>{body("hospitals")}</DashTile>
        <DashTile id="severity" title={titleOf.severity} className="h-44 sm:h-48 lg:h-auto" onExpand={setExpanded} label={t.dash_expand}>{body("severity")}</DashTile>
        <DashTile id="feed" title={titleOf.feed} className="h-64 lg:h-auto" onExpand={setExpanded} label={t.dash_expand}>{body("feed")}</DashTile>
        <DashTile id="predictions" title={titleOf.predictions} className="md:col-span-2 lg:col-span-4" onExpand={setExpanded} label={t.dash_expand}>{body("predictions")}</DashTile>
      </div>

      {/* Tuile agrandie · taille 2XL · `dvh` (et non `vh`) pour ne pas passer
          sous la barre d'adresse mobile */}
      <Modal open={expanded !== null} size="2xl" title={expanded ? titleOf[expanded] : ""} onClose={() => setExpanded(null)}>
        <div className="h-[65dvh] sm:h-[72dvh] lg:h-[85dvh]">{expanded && body(expanded)}</div>
      </Modal>
    </section>
  );
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-xs text-gray-400 dark:text-rdia-400">…</div>;
}

/** Cadre de tuile : carte + titre + bouton « Agrandir » en haut à droite. */
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
    <div className={`carte flex min-h-0 flex-col p-3 sm:p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-rdia-600 dark:text-rdia-50">{title}</h3>
        <button
          onClick={() => onExpand(id)}
          title={label}
          aria-label={label}
          // `cible-tactile` : 44 px au doigt sous `lg`, densité d'origine ensuite.
          className="cible-tactile -me-1 flex shrink-0 items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600 dark:hover:text-or-400"
        >
          <Icon path={UI_ICONS.expand} size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pe-1">{children}</div>
    </div>
  );
}
