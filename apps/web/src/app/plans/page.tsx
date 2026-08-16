"use client";

import { useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { type PlanStatus } from "@/lib/data/modules";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Table, TR, TD, TD_MUTED, TD_MONO, TD_STRONG } from "@/components/ui/Table";

const STATUS: Record<PlanStatus, { tone: Tone; key: "st_active" | "st_draft" | "st_review" | "st_expired" }> = {
  active: { tone: "green", key: "st_active" },
  draft: { tone: "gray", key: "st_draft" },
  review: { tone: "amber", key: "st_review" },
  expired: { tone: "red", key: "st_expired" },
};

export default function PlansPage() {
  const catalog = useArgos((s) => s.catalog);
  const PLANS = catalog.plans;
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const [q, setQ] = useState("");
  const rows = PLANS.filter((p) => !q || `${p.name}${p.type}${p.zone}${p.id}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="flex flex-col gap-3 animate-fade-in sm:gap-4">
      {/* `text-base` sous `md` : en dessous de 16 px, iOS zoome à la mise au
          point du champ et décale toute la page. */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input-champ w-full text-base sm:max-w-xs md:text-sm"
          placeholder={m.common.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="font-mono text-xs text-gray-400 dark:text-rdia-400">{rows.length} / {PLANS.length}</span>
      </div>

      {/* Tableau : à partir de `md`, la densité redevient lisible. */}
      <div className="hidden md:block">
        <Table headers={[m.common.ref, m.plans.col_plan, m.plans.col_type, m.common.zone, m.plans.col_version, m.common.updated, m.common.status, m.common.actions]}>
          {rows.map((p) => {
            const st = STATUS[p.status];
            return (
              <tr key={p.id} className={TR}>
                <td className={TD_MONO}>{p.id}</td>
                <td className={TD_STRONG}>{p.name}</td>
                <td className={TD_MUTED}>{p.type}</td>
                <td className={TD_MUTED}>{p.zone}</td>
                <td className={TD_MONO}>{p.version}</td>
                <td className={TD_MONO}>{p.updated}</td>
                <td className={TD}><Pill tone={st.tone} label={m.plans[st.key]} /></td>
                <td className={TD}>
                  <button className="btn-secondaire text-xs disabled:opacity-40" disabled={p.status === "expired"} onClick={() => showToast(`${m.plans.activate} — ${p.name}`)}>
                    {m.plans.activate}
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
      </div>

      {/* Sous `md` : une carte par plan — mêmes colonnes et même action. */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((p) => {
          const st = STATUS[p.status];
          return (
            <div key={p.id} className="carte flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-gray-400 dark:text-rdia-400">{p.id}</div>
                  <div className="break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{p.name}</div>
                </div>
                <span className="shrink-0"><Pill tone={st.tone} label={m.plans[st.key]} /></span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                <Champ label={m.plans.col_type} value={p.type} />
                <Champ label={m.common.zone} value={p.zone} />
                <Champ label={m.plans.col_version} value={p.version} mono />
                <Champ label={m.common.updated} value={p.updated} mono />
              </dl>
              <button
                className="btn-secondaire cible-tactile w-full text-sm disabled:opacity-40"
                disabled={p.status === "expired"}
                onClick={() => showToast(`${m.plans.activate} — ${p.name}`)}
              >
                {m.plans.activate}
              </button>
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
