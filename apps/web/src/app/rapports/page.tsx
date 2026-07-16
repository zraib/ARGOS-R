"use client";

import { useArgos, useModules } from "@/lib/store";
import { type ReportStatus } from "@/lib/data/modules";
import { StatTile } from "@/components/ui/StatTile";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Table, TR, TD, TD_MUTED, TD_MONO, TD_STRONG } from "@/components/ui/Table";
import { NAV_ICONS } from "@/lib/icons";

const STATUS: Record<ReportStatus, { tone: Tone; key: "st_draft" | "st_published" }> = {
  draft: { tone: "gray", key: "st_draft" },
  published: { tone: "green", key: "st_published" },
};

export default function RapportsPage() {
  const catalog = useArgos((s) => s.catalog);
  const REPORTS = catalog.reports;
  const m = useModules();
  const published = REPORTS.filter((r) => r.status === "published").length;
  const drafts = REPORTS.filter((r) => r.status === "draft").length;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-1 gap-4">
          <div className="min-w-[180px] flex-1"><StatTile label={m.reports.kpi_published} value={published} icon={NAV_ICONS.reports} tint="green" /></div>
          <div className="min-w-[180px] flex-1"><StatTile label={m.reports.kpi_draft} value={drafts} icon={NAV_ICONS.reports} tint="gray" /></div>
        </div>
        <span className="rounded-md bg-danger-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-danger-500">
          {m.reports.classification}
        </span>
      </div>

      <Table headers={[m.reports.col_number, m.reports.col_title, m.reports.col_incident, m.reports.col_period, m.common.author, m.common.status, m.reports.col_published]}>
        {REPORTS.map((r) => {
          const st = STATUS[r.status];
          return (
            <tr key={r.id} className={TR}>
              <td className={`${TD} font-mono text-xs font-bold text-or-500`}>{r.id}</td>
              <td className={TD_STRONG}>{r.title}</td>
              <td className={TD_MONO}>{r.incident}</td>
              <td className={TD_MUTED}>{r.period}</td>
              <td className={TD_MUTED}>{r.author}</td>
              <td className={TD}><Pill tone={st.tone} label={m.reports[st.key]} /></td>
              <td className={TD_MONO}>{r.published}</td>
            </tr>
          );
        })}
      </Table>
    </section>
  );
}
