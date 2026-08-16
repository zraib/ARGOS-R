"use client";

import { useMemo, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
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
  const t = useDict();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Availability | "all">("all");

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return ROSTER.filter((p) => (filter === "all" || p.av === filter) && (!n || `${p.nom}${p.unit}${p.fonction}${p.spec}${p.id}`.toLowerCase().includes(n)));
  }, [q, filter, ROSTER]);

  const total = ROSTER.length;
  const deployed = ROSTER.filter((p) => p.av === "deployed").length;
  const available = ROSTER.filter((p) => p.av === "available").length;

  // `cible-tactile` : 44 px au doigt sous `lg`, densité d'origine au-dessus.
  const chip = (v: Availability | "all") =>
    `cible-tactile shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      filter === v ? "bg-or-500 text-rdia-600" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
    }`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={m.personnel.kpi_total} value={total} icon={KPI_ICONS.personnel} tint="or" />
        <StatTile label={m.personnel.kpi_deployed} value={deployed} icon={KPI_ICONS.personnel} tint="amber" />
        <StatTile label={m.personnel.kpi_available} value={available} icon={KPI_ICONS.personnel} tint="green" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Quatre filtres ne tiennent pas de front sur un téléphone : bandeau
            défilable plutôt qu'un empilement qui repousse le tableau. */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <button className={chip("all")} onClick={() => setFilter("all")}>{m.common.all}</button>
          <button className={chip("available")} onClick={() => setFilter("available")}>{m.personnel.av_available}</button>
          <button className={chip("deployed")} onClick={() => setFilter("deployed")}>{m.personnel.av_deployed}</button>
          <button className={chip("rest")} onClick={() => setFilter("rest")}>{m.personnel.av_rest}</button>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:ms-auto">
          {/* 16 px sur mobile : sous cette taille, iOS zoome à la mise au point. */}
          <input
            className="input-champ min-h-[44px] w-full min-w-0 text-base sm:max-w-xs md:min-h-0 md:text-sm"
            placeholder={m.personnel.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="shrink-0 font-mono text-xs text-gray-400 dark:text-rdia-400">{rows.length} / {ROSTER.length}</span>
        </div>
      </div>

      {/* Tableau : à partir de `md`, la densité redevient lisible. */}
      <div className="hidden md:block">
        <Table headers={[m.personnel.col_matricule, t.h_grade, t.h_name, m.common.unit, t.h_role, t.h_spec, m.personnel.col_availability]}>
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
      </div>

      {/* Sous `md` : une carte par agent — mêmes colonnes, rien de perdu. */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((p) => {
          const a = AV[p.av];
          return (
            <div key={p.id} className="carte flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{p.nom}</div>
                  <div className="text-[11px] text-gray-400 dark:text-rdia-400">{p.grade}</div>
                </div>
                <span className="shrink-0"><Pill tone={a.tone} label={m.personnel[a.key]} /></span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                <Champ label={m.personnel.col_matricule} value={p.id} mono />
                <Champ label={m.common.unit} value={p.unit} />
                <Champ label={t.h_role} value={p.fonction} />
                <Champ label={t.h_spec} value={p.spec} />
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Couple libellé/valeur d'une carte mobile (équivalent d'une cellule du tableau). */
function Champ({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</dt>
      <dd className={`break-words text-gray-700 dark:text-rdia-100 ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}
