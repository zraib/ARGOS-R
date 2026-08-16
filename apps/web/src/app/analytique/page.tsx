"use client";

import { useArgos, useModules, useDict } from "@/lib/store";
import { StatTile } from "@/components/ui/StatTile";
import { ChartCard, type ChartDatum } from "@/components/charts/ChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { KPI_ICONS, NAV_ICONS } from "@/lib/icons";

/**
 * Hauteur des cartes de graphique : explicite et croissante avec la largeur.
 * Sans hauteur définie, un conteneur en flux vertical laisse le SVG se replier
 * sur son ratio intrinsèque — imprévisible et écrasé sur un téléphone.
 */
const CHART_BOX = "h-64 min-w-0 sm:h-72 lg:h-80";

export default function AnalytiquePage() {
  const catalog = useArgos((s) => s.catalog);
  const ANALYTICS = catalog.analytics;
  const m = useModules();
  const t = useDict();
  const incidents = useArgos((s) => s.incidents);
  const a = ANALYTICS;

  const severityDist: ChartDatum[] = [
    { label: t.sev_high, value: incidents.filter((i) => i.sev === "high").length, couleur: "#EF4444" },
    { label: t.sev_med, value: incidents.filter((i) => i.sev === "medium").length, couleur: "#F59E0B" },
    { label: t.sev_low, value: incidents.filter((i) => i.sev === "low").length, couleur: "#9CA3AF" },
  ];

  return (
    <section className="flex flex-col gap-3 animate-fade-in sm:gap-4">
      {/* Les libellés d'indicateur sont longs (« Délai moyen alerte→sur site ») :
          une seule colonne sous `sm`, sinon ils seraient tronqués à deux mots. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatTile label={m.analytics.kpi_response} value={`${a.kpis.avgResponse} ${m.analytics.minutes}`} icon={KPI_ICONS.incidents} tint="or" />
        <StatTile label={m.analytics.kpi_evac_admit} value={`${a.kpis.evacAdmit} ${m.analytics.minutes}`} icon={KPI_ICONS.beds} tint="danger" />
        <StatTile label={m.analytics.kpi_closed} value={`${a.kpis.closedRate}%`} icon={KPI_ICONS.units} tint="green" />
        <StatTile label={m.analytics.kpi_util} value={`${a.kpis.util}%`} icon={NAV_ICONS.res} tint="blue" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className={CHART_BOX}><ChartCard titre={m.analytics.response_times} type="bars" data={a.responseTimes} /></div>
        <div className={CHART_BOX}><ChartCard titre={m.analytics.incident_trend} type="column3d" data={a.incidentTrend} /></div>
        <div className={CHART_BOX}><DonutChart titre={m.analytics.triage_outcomes} data={a.triageOutcomes} /></div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className={CHART_BOX}><ChartCard titre={m.analytics.resource_util} type="bars" data={a.resourceUtil} /></div>
        <div className={CHART_BOX}><ChartCard titre={m.analytics.hospital_sat} type="bars" data={a.hospitalSat} /></div>
        <div className={CHART_BOX}><DonutChart titre={m.analytics.severity_dist} data={severityDist} /></div>
      </div>
    </section>
  );
}
