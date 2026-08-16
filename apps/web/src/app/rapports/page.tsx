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
    <section className="flex flex-col gap-3 animate-fade-in sm:gap-4">
      {/* Les deux tuiles avaient un `min-w-[180px]` : 2 × 180 + gouttière
          dépassaient les 351 px utiles d'un écran de 375. Une grille les fait
          partager la largeur au lieu de la forcer. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:gap-4">
          <StatTile label={m.reports.kpi_published} value={published} icon={NAV_ICONS.reports} tint="green" />
          <StatTile label={m.reports.kpi_draft} value={drafts} icon={NAV_ICONS.reports} tint="gray" />
        </div>
        <span className="self-start rounded-md bg-danger-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-danger-500 sm:self-auto sm:text-[10px]">
          {m.reports.classification}
        </span>
      </div>

      {/* Tableau : à partir de `md`, la densité redevient lisible. */}
      <div className="hidden md:block">
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
      </div>

      {/* Sous `md` : une carte par rapport — mêmes colonnes, aucune donnée perdue. */}
      <div className="flex flex-col gap-2 md:hidden">
        {REPORTS.map((r) => {
          const st = STATUS[r.status];
          return (
            <div key={r.id} className="carte flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{r.title}</span>
                <span className="shrink-0"><Pill tone={st.tone} label={m.reports[st.key]} /></span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                <Champ label={m.reports.col_number} value={r.id} mono />
                <Champ label={m.reports.col_incident} value={r.incident} mono />
                <Champ label={m.reports.col_period} value={r.period} />
                <Champ label={m.common.author} value={r.author} />
                <Champ label={m.reports.col_published} value={r.published} mono />
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
