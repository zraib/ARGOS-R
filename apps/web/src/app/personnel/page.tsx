"use client";

import { useMemo, useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { type Availability } from "@/lib/data/modules";
import { StatTile } from "@/components/ui/StatTile";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Table, TR, TD, TD_MUTED, TD_MONO, TD_STRONG } from "@/components/ui/Table";
import { KPI_ICONS } from "@/lib/icons";

const AV: Record<Availability, { tone: Tone; key: "av_available" | "av_deployed" | "av_rest" | "av_unavailable" }> = {
  available: { tone: "green", key: "av_available" },
  deployed: { tone: "amber", key: "av_deployed" },
  rest: { tone: "blue", key: "av_rest" },
  unavailable: { tone: "gray", key: "av_unavailable" },
};

export default function PersonnelPage() {
  const catalog = useArgos((s) => s.catalog);
  const ROSTER = catalog.roster;
  const m = useModules();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Availability | "all">("all");

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return ROSTER.filter((p) => (filter === "all" || p.av === filter) && (!n || `${p.nom}${p.unit}${p.fonction}${p.spec}${p.id}`.toLowerCase().includes(n)));
  }, [q, filter, ROSTER]);

  const total = ROSTER.length;
  const deployed = ROSTER.filter((p) => p.av === "deployed").length;
  const available = ROSTER.filter((p) => p.av === "available").length;

  const chip = (v: Availability | "all") =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      filter === v ? "bg-or-500 text-rdia-600" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
    }`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={m.personnel.kpi_total} value={total} icon={KPI_ICONS.personnel} tint="or" />
        <StatTile label={m.personnel.kpi_deployed} value={deployed} icon={KPI_ICONS.personnel} tint="amber" />
        <StatTile label={m.personnel.kpi_available} value={available} icon={KPI_ICONS.personnel} tint="green" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={chip("all")} onClick={() => setFilter("all")}>{m.common.all}</button>
        <button className={chip("available")} onClick={() => setFilter("available")}>{m.personnel.av_available}</button>
        <button className={chip("deployed")} onClick={() => setFilter("deployed")}>{m.personnel.av_deployed}</button>
        <button className={chip("rest")} onClick={() => setFilter("rest")}>{m.personnel.av_rest}</button>
        <input className="input-champ ml-auto max-w-xs text-sm" placeholder={m.personnel.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="font-mono text-xs text-gray-400 dark:text-rdia-400">{rows.length} / {ROSTER.length}</span>
      </div>

      <Table headers={[m.personnel.col_matricule, "Grade", "Nom", m.common.unit, "Fonction", "Spécialité", m.personnel.col_availability]}>
        {rows.map((p) => {
          const a = AV[p.av];
          return (
            <tr key={p.id} className={TR}>
              <td className={TD_MONO}>{p.id}</td>
              <td className={TD_MUTED}>{p.grade}</td>
              <td className={TD_STRONG}>{p.nom}</td>
              <td className={TD_MUTED}>{p.unit}</td>
              <td className={TD_MUTED}>{p.fonction}</td>
              <td className={TD_MUTED}>{p.spec}</td>
              <td className={TD}><Pill tone={a.tone} label={m.personnel[a.key]} /></td>
            </tr>
          );
        })}
      </Table>
    </section>
  );
}
