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
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <input className="input-champ max-w-xs text-sm" placeholder={m.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="font-mono text-xs text-gray-400 dark:text-rdia-400">{rows.length} / {PLANS.length}</span>
      </div>
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
    </section>
  );
}
