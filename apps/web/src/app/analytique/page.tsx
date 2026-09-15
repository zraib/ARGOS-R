"use client";

import { useMemo, type ReactNode } from "react";
import { useArgos, useModules, useDict } from "@/lib/store";
import { StatTile } from "@/components/ui/StatTile";
import { Icon } from "@/components/ui/Icon";
import { Pill, type Tone } from "@/components/ui/Pill";
import { ChartCard, type ChartDatum } from "@/components/charts/ChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { KPI_ICONS, NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";

// ============================================================================
// Analytique — la synthèse chiffrée du système, dans la grammaire du produit
//
// Même vocabulaire visuel que le tableau de bord, Hospinet et OPSnet : les
// tuiles `.carte`, les `StatTile`, une barre de titre avec son icône or, des
// titres de bloc en petites capitales, les pastilles du design system pour
// les états. Pas de police de titre à part, pas de couleur hors palette, pas
// de filet décoratif au-dessus des titres : ce qui se lit est le chiffre.
// ============================================================================

const MICRO = "text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
const CHART_BOX = "h-64 min-w-0 sm:h-72 lg:h-80";

/** Titre de bloc : petites capitales, et rien d'autre. */
function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={MICRO}>{titre}</h2>
      {children}
    </section>
  );
}

/** Un petit chiffre encadré — le même que la fiche d'un établissement. */
function Chiffre({ label, value, unit, tone = "text-rdia-600 dark:text-rdia-50" }: { label: string; value: string | number; unit?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-rdia-800/50">
      <div className={MICRO}>{label}</div>
      <div className={`text-xl font-bold tabular-nums ${tone}`}>
        {value}
        {unit && <span className="ms-1 text-[11px] font-semibold text-gray-400 dark:text-rdia-400">{unit}</span>}
      </div>
    </div>
  );
}

/** Une tuile de graphique : le titre, une pastille d'état, une ligne de contexte, le graphique. */
function Graphique({ titre, eyebrow, pill, tone, children }: { titre: string; eyebrow: string; pill: string; tone: Tone; children: ReactNode }) {
  return (
    <div className={`carte flex flex-col p-4 ${CHART_BOX}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-rdia-600 dark:text-rdia-50">{titre}</h3>
        <Pill tone={tone} label={pill} size="sm" />
      </div>
      <p className={`mt-0.5 ${MICRO}`}>{eyebrow}</p>
      <div className="mt-2 min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default function AnalytiquePage() {
  const catalog = useArgos((s) => s.catalog);
  const a = catalog.analytics;
  const m = useModules();
  const t = useDict();
  const incidents = useArgos((s) => s.incidents);
  const ma = m.analytics;

  const severityDist: ChartDatum[] = useMemo(
    () => [
      { label: t.sev_high, value: incidents.filter((i) => i.sev === "high").length, couleur: "#EF4444" },
      { label: t.sev_med, value: incidents.filter((i) => i.sev === "medium").length, couleur: "#F59E0B" },
      { label: t.sev_low, value: incidents.filter((i) => i.sev === "low").length, couleur: "#9CA3AF" },
    ],
    [incidents, t.sev_high, t.sev_med, t.sev_low],
  );

  const closedCount = useMemo(() => incidents.filter((i) => i.st === "closed").length, [incidents]);
  const progCount = useMemo(() => incidents.filter((i) => i.st === "prog").length, [incidents]);
  const openCount = incidents.length - closedCount;
  const highCount = severityDist[0].value;

  /** « [HC037] Nom · Ville… » → « Nom · Ville » : l'indicatif et les points de suspension ne se lisent pas. */
  const cleanLabel = (s: string) => s.replace(/^\[[^\]]+\]\s*/g, "").replace(/…\s*$/g, "").replace(/\.{3,}\s*$/g, "").trim();
  const hotHosps = useMemo(() => (a.hospitalSat ?? []).filter((h) => h.value >= 85).map((h) => cleanLabel(h.label)), [a.hospitalSat]);
  const peakSat = useMemo(() => Math.max(0, ...(a.hospitalSat ?? []).map((h) => h.value)), [a.hospitalSat]);
  const avgResponseSeg = useMemo(() => {
    const arr = a.responseTimes ?? [];
    return arr.length ? Math.round(arr.reduce((s, r) => s + r.value, 0) / arr.length) : 0;
  }, [a.responseTimes]);
  const lastTrend = a.incidentTrend?.[a.incidentTrend.length - 1]?.value ?? 0;
  const prevTrend = a.incidentTrend?.[a.incidentTrend.length - 2]?.value ?? lastTrend;
  const trendDelta = prevTrend === 0 ? 0 : Math.round(((lastTrend - prevTrend) / prevTrend) * 100);
  const slaOk = a.kpis.avgResponse <= 45;
  const saturation = (a.hospitalSat ?? []).some((h) => h.value >= 90);

  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const posture: { tone: Tone; label: string; texte: string } =
    peakSat >= 90 || highCount > 0
      ? {
          tone: "red",
          label: ma.st_attention,
          texte: peakSat >= 90 ? tpl(ma.synth_tension, { p: peakSat }) : tpl(ma.synth_critical, { n: highCount }),
        }
      : a.kpis.util < 70
        ? { tone: "green", label: ma.st_nominal, texte: tpl(ma.synth_nominal, { p: a.kpis.closedRate }) }
        : { tone: "gold", label: ma.st_monitor, texte: tpl(ma.synth_nominal, { p: a.kpis.closedRate }) };

  const kpis: { label: string; value: string; icon: string; tint: "or" | "danger" | "green" | "blue"; sub: string }[] = [
    { label: ma.kpi_response, value: `${a.kpis.avgResponse} ${ma.minutes}`, icon: KPI_ICONS.incidents, tint: slaOk ? "green" : "danger", sub: slaOk ? ma.kpi_sla_ok : ma.kpi_sla_over },
    { label: ma.kpi_evac_admit, value: `${a.kpis.evacAdmit} ${ma.minutes}`, icon: KPI_ICONS.beds, tint: "or", sub: ma.kpi_care },
    { label: ma.kpi_closed, value: `${a.kpis.closedRate} %`, icon: KPI_ICONS.units, tint: a.kpis.closedRate >= 50 ? "green" : "or", sub: tpl(ma.kpi_remaining, { n: openCount }) },
    { label: ma.kpi_util, value: `${a.kpis.util} %`, icon: NAV_ICONS.res, tint: a.kpis.util >= 80 ? "danger" : "blue", sub: a.kpis.util >= 80 ? ma.kpi_high_load : ma.kpi_margin },
  ];

  const graphiques: { titre: string; eyebrow: string; pill: string; tone: Tone; node: ReactNode }[] = [
    {
      titre: ma.response_times, eyebrow: tpl(ma.ch_segments, { n: avgResponseSeg }), pill: slaOk ? ma.ch_under_sla : ma.ch_over_sla, tone: slaOk ? "green" : "red",
      node: <ChartCard titre={ma.response_times} type="bars" data={a.responseTimes} bare />,
    },
    {
      titre: ma.incident_trend, eyebrow: lastTrend ? tpl(ma.ch_today, { n: lastTrend }) : ma.ch_window,
      pill: trendDelta > 0 ? tpl(ma.ch_vs_prev_up, { d: trendDelta }) : trendDelta < 0 ? tpl(ma.ch_vs_prev_down, { d: trendDelta }) : ma.ch_stable,
      tone: trendDelta > 0 ? "amber" : trendDelta < 0 ? "green" : "gray",
      node: <ChartCard titre={ma.incident_trend} type="column3d" data={a.incidentTrend} bare />,
    },
    {
      titre: ma.triage_outcomes, eyebrow: ma.ch_triage_zones,
      pill: (a.triageOutcomes?.[0]?.value ?? 0) > 0 ? ma.ch_priority : ma.ch_standard,
      tone: (a.triageOutcomes?.[0]?.value ?? 0) <= (a.triageOutcomes?.[2]?.value ?? 1) / 3 ? "green" : "amber",
      node: <DonutChart titre={ma.triage_outcomes} data={a.triageOutcomes} bare />,
    },
    {
      titre: ma.resource_util, eyebrow: ma.ch_weighted, pill: tpl(ma.ch_global, { p: a.kpis.util }), tone: a.kpis.util < 85 ? "green" : "amber",
      node: <ChartCard titre={ma.resource_util} type="bars" data={a.resourceUtil} bare />,
    },
    {
      titre: ma.hospital_sat, eyebrow: tpl(ma.ch_peak, { p: peakSat, n: (a.hospitalSat ?? []).length }), pill: saturation ? ma.ch_sat_crit : ma.ch_sat_ok, tone: saturation ? "red" : "green",
      node: (
        <ChartCard
          titre={ma.hospital_sat}
          type="bars"
          bare
          data={(a.hospitalSat ?? []).map((x) => {
            const full = cleanLabel(x.label);
            const idx = full.lastIndexOf("·");
            return { ...x, label: idx > -1 ? full.slice(0, idx).trim() : full, subtitle: idx > -1 ? full.slice(idx + 1).trim() : undefined };
          })}
        />
      ),
    },
    {
      titre: ma.severity_dist, eyebrow: tpl(ma.ch_ref, { n: incidents.length }), pill: highCount > 0 ? ma.ch_high_found : ma.ch_no_critical, tone: highCount > 0 ? "red" : "green",
      node: <DonutChart titre={ma.severity_dist} data={severityDist} bare />,
    },
  ];

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* --- bandeau : les quatre indicateurs, comme sur Hospinet -------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatTile key={k.label} label={k.label} value={k.value} icon={k.icon} tint={k.tint} sub={k.sub} />
        ))}
      </div>

      {/* --- barre de titre ------------------------------------------------- */}
      <div className="carte flex flex-wrap items-center gap-2 p-2.5">
        <h1 className="flex items-center gap-2 pe-2 text-sm font-bold text-rdia-600 dark:text-rdia-50">
          <Icon path={NAV_ICONS.analytics} size={17} className="text-or-500" />
          {ma.title}
        </h1>
        <span className="hidden text-xs text-gray-500 md:block dark:text-rdia-300">{ma.subtitle}</span>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Pill tone="gold" label={date} size="sm" />
          <Pill tone={posture.tone} label={posture.label} size="sm" />
        </div>
      </div>

      {/* --- synthèse ------------------------------------------------------- */}
      <div className="carte flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">{ma.synth_title}</h3>
          <span className="ms-auto flex items-center gap-1 text-[11px] font-semibold text-gray-500 dark:text-rdia-300">
            <Icon path={UI_ICONS.activity} size={12} className="text-or-500" />
            {ma.live}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-gray-700 dark:text-rdia-100">{posture.texte}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Chiffre label={ma.hero_incidents} value={incidents.length} />
          <Chiffre label={ma.hero_ongoing} value={progCount} tone="text-or-500" />
          <Chiffre label={ma.hero_closed} value={closedCount} tone="text-green-600" />
          <Chiffre label={ma.hero_high} value={highCount} tone={highCount > 0 ? "text-danger-500" : "text-rdia-600 dark:text-rdia-50"} />
          <Chiffre label={ma.lbl_response} value={a.kpis.avgResponse} unit={ma.minutes} />
          <Chiffre label={ma.lbl_closure} value={a.kpis.closedRate} unit="%" />
          <Chiffre label={ma.lbl_means} value={a.kpis.util} unit="%" />
        </div>
      </div>

      {/* --- graphiques ------------------------------------------------------ */}
      <Bloc titre={ma.section_charts}>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {graphiques.map((g) => (
            <Graphique key={g.titre} titre={g.titre} eyebrow={g.eyebrow} pill={g.pill} tone={g.tone}>
              {g.node}
            </Graphique>
          ))}
        </div>
      </Bloc>

      {/* --- notes de situation --------------------------------------------- */}
      <Bloc titre={ma.section_notes}>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
          <div className="carte flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">{ma.note_hosp}</h3>
              <Pill tone={peakSat >= 85 ? "red" : "green"} label={peakSat >= 85 ? ma.note_tension : ma.note_ok} size="sm" />
            </div>
            {hotHosps.length > 0 ? (
              <div className="text-sm text-gray-700 dark:text-rdia-100">
                <p className="mb-2">{ma.note_above}</p>
                <ul className="flex flex-col gap-1.5">
                  {hotHosps.map((name, k) => {
                    const idx = name.lastIndexOf("·");
                    const [nom, ville] = idx > -1 ? [name.slice(0, idx).trim(), name.slice(idx + 1).trim()] : [name, ""];
                    return (
                      <li key={`${name}-${k}`} className="flex items-start gap-2">
                        <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-or-500" />
                        <span className="min-w-0">
                          <span className="font-medium">{nom}</span>
                          {ville && <span className="text-gray-500 dark:text-rdia-300"> · {ville}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-gray-700 dark:text-rdia-100">{tpl(ma.note_none, { p: peakSat })}</p>
            )}
            <div className="mt-auto grid grid-cols-2 gap-3">
              <Chiffre label={ma.note_peak} value={peakSat} unit="%" tone={peakSat >= 85 ? "text-danger-500" : "text-rdia-600 dark:text-rdia-50"} />
              <Chiffre label={ma.note_sites} value={hotHosps.length} tone={hotHosps.length > 0 ? "text-or-500" : "text-green-600"} />
            </div>
          </div>

          <div className="carte flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">{ma.note_posture}</h3>
              <Pill tone={highCount > 0 ? "red" : "green"} label={highCount > 0 ? ma.note_fop : ma.note_watch} size="sm" />
            </div>
            <p className="text-sm leading-relaxed text-gray-700 dark:text-rdia-100">
              {highCount > 0
                ? tpl(ma.note_posture_high, { h: highCount, p: progCount, c: closedCount, u: a.kpis.util })
                : tpl(ma.note_posture_ok, { p: progCount, c: closedCount, r: a.kpis.closedRate })}
            </p>
            <div className="mt-auto grid grid-cols-3 gap-3">
              <Chiffre label={ma.lbl_open} value={openCount} />
              <Chiffre label={ma.lbl_ongoing} value={progCount} tone="text-or-500" />
              <Chiffre label={ma.lbl_closed} value={closedCount} tone="text-green-600" />
            </div>
          </div>
        </div>
      </Bloc>
    </section>
  );
}
