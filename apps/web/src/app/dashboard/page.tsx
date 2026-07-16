"use client";

import { useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { KPI_ICONS } from "@/lib/icons";
import { ChartCard, type ChartDatum } from "@/components/charts/ChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { ListCard } from "@/components/charts/ListCard";
import { MoroccoSituation } from "@/components/dashboard/MoroccoSituation";

interface Kpi {
  label: string;
  val: string;
  sub: string;
  subColor: string;
  icon: string;
  iconWrap: string;
}

function FeedList({ dense = false }: { dense?: boolean }) {
  const feed = useArgos((s) => s.feed);
  return (
    <div className="flex flex-col gap-2">
      {feed.map((f, i) => (
        <div key={`${f.time}-${i}`} className={`flex gap-3 border-b border-gray-100 py-1 dark:border-rdia-700/50 ${dense ? "items-start" : "items-center"}`}>
          <span className="w-10 shrink-0 font-mono text-[10px] text-gray-400 dark:text-rdia-400">{f.time}</span>
          <span className={`h-2 w-2 shrink-0 rounded-full ${f.c} ${dense ? "mt-1" : ""}`} />
          <span className={`min-w-0 flex-1 text-xs text-gray-700 dark:text-rdia-100 ${dense ? "" : "truncate"}`}>{f.txt}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const t = useDict();
  const [dash, setDash] = useState<"a" | "b">("a");
  const incidents = useArgos((s) => s.incidents);
  const hospitals = useArgos((s) => s.hospitals);
  const fieldHosps = useArgos((s) => s.fieldHosps);

  const activeInc = incidents.filter((i) => i.st !== "closed").length;
  const bedsFixed = hospitals.reduce((a, h) => a + (h.lits - h.occ), 0);
  const bedsField = fieldHosps.reduce((a, f) => a + (f.cap - f.occ), 0);

  const kpis: Kpi[] = [
    { label: t.kpi_inc, val: String(activeInc), sub: "+2 · 24h", subColor: "text-danger-500", icon: KPI_ICONS.incidents, iconWrap: "bg-danger-500/10 text-danger-500" },
    { label: t.kpi_pers, val: "1 043", sub: "+320 · 24h", subColor: "text-or-500", icon: KPI_ICONS.personnel, iconWrap: "bg-or-500/15 text-or-500" },
    { label: t.kpi_beds, val: String(bedsFixed + bedsField), sub: `+${bedsField} HMC`, subColor: "text-green-600", icon: KPI_ICONS.beds, iconWrap: "bg-green-500/10 text-green-600" },
    { label: t.kpi_units, val: "4", sub: `2 ${t.u_deployed.toLowerCase()}`, subColor: "text-blue-500", icon: KPI_ICONS.units, iconWrap: "bg-blue-500/10 text-blue-500" },
  ];

  const chartTypes: ChartDatum[] = [
    { label: t.ty_earthquake, value: 3, couleur: "#EF4444" },
    { label: t.ty_flood, value: 5, couleur: "#3B82F6" },
    { label: t.ty_wildfire, value: 4, couleur: "#C9A84C" },
    { label: t.ty_landslide, value: 2, couleur: "#8B5CF6" },
    { label: t.ty_epidemic, value: 1, couleur: "#10B981" },
    { label: t.ty_industrial, value: 2, couleur: "#6B7280" },
  ];
  const chartRegions: ChartDatum[] = [
    { label: "Marrakech-Safi", value: 6, couleur: "#EF4444" },
    { label: "Tanger-Tétouan", value: 3, couleur: "#C9A84C" },
    { label: "Drâa-Tafilalet", value: 3, couleur: "#8B5CF6" },
    { label: "Oriental", value: 2, couleur: "#3B82F6" },
    { label: "Casa-Settat", value: 2, couleur: "#10B981" },
    { label: "Souss-Massa", value: 1, couleur: "#6B7280" },
  ];
  const chartMoyens: ChartDatum[] = [
    { label: "Véhicules terrestres", value: 86, couleur: "#C9A84C" },
    { label: "Ambulances", value: 76, couleur: "#EF4444" },
    { label: "Engins de génie", value: 24, couleur: "#3B82F6" },
    { label: "Hélicoptères", value: 12, couleur: "#10B981" },
  ];
  const ops = [
    { id: 1, title: "Op. SALAMA — secours Al Haouz", color: "#C9A84C", progression: 65 },
    { id: 2, title: "Pont aérien Agadir–Amizmiz", color: "#3B82F6", progression: 40 },
    { id: 3, title: "Évacuation vallée de l'Ourika", color: "#EF4444", progression: 82 },
    { id: 4, title: "Rétablissement axes RN7 / RP2010", color: "#10B981", progression: 30 },
  ];

  const btnCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      active ? "bg-or-500 text-rdia-600" : "border border-gray-200 bg-white text-gray-500 hover:text-or-500 dark:border-rdia-600 dark:bg-rdia-800 dark:text-rdia-300"
    }`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center justify-end gap-2">
        <button className={btnCls(dash === "a")} onClick={() => setDash("a")}>{t.layoutA}</button>
        <button className={btnCls(dash === "b")} onClick={() => setDash("b")}>{t.layoutB}</button>
      </div>

      {/* Rangée de KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="carte flex items-center gap-3 p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${k.iconWrap}`}>
              <Icon path={k.icon} size={20} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs text-gray-500 dark:text-rdia-300">{k.label}</div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold leading-none tabular-nums text-rdia-600 dark:text-rdia-50">{k.val}</span>
                <span className={`text-[10px] font-semibold ${k.subColor}`}>{k.sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {dash === "a" ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="min-w-0"><ChartCard titre={t.chart_types} type="bars" data={chartTypes} /></div>
            <div className="min-w-0"><ChartCard titre={t.chart_regions} type="column3d" data={chartRegions} /></div>
            <div className="min-w-0"><DonutChart titre={t.chart_moyens} data={chartMoyens} /></div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="min-w-0"><ListCard titre={t.ops} items={ops} /></div>
            <div className="carte col-span-1 p-4 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{t.feed}</h3>
              <FeedList />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="carte col-span-1 flex flex-col p-4 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{t.overview}</h3>
              <MoroccoSituation />
            </div>
            <div className="carte min-w-0 p-4">
              <h3 className="mb-3 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{t.feed}</h3>
              <FeedList dense />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="min-w-0"><ChartCard titre={t.chart_types} type="bars" data={chartTypes} /></div>
            <div className="min-w-0"><ChartCard titre={t.chart_regions} type="column3d" data={chartRegions} /></div>
            <div className="min-w-0"><ListCard titre={t.ops} items={ops} /></div>
          </div>
        </>
      )}
    </section>
  );
}
