"use client";

import { useArgos, useModules } from "@/lib/store";
import { type IcsStatus } from "@/lib/data/modules";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Table, TR, TD, TD_MUTED, TD_MONO, TD_STRONG } from "@/components/ui/Table";

const STATUS: Record<IcsStatus, { tone: Tone; key: "st_draft" | "st_review" | "st_approved" }> = {
  draft: { tone: "gray", key: "st_draft" },
  review: { tone: "amber", key: "st_review" },
  approved: { tone: "green", key: "st_approved" },
};

export default function IcsPage() {
  const catalog = useArgos((s) => s.catalog);
  const ICS_FORMS = catalog.ics;
  const m = useModules();
  return (
    <section className="flex flex-col gap-3 animate-fade-in sm:gap-4">
      <p className="break-words text-xs text-gray-500 dark:text-rdia-300">
        {m.ics.col_incident} : <span className="font-mono font-semibold text-or-500">INC-2607</span> · Séisme M5.9 — Al Haouz
      </p>

      {/* Tableau : à partir de `md`, la densité redevient lisible. */}
      <div className="hidden md:block">
        <Table headers={[m.ics.col_code, m.ics.col_title, m.common.status, m.common.updated, m.common.author]}>
          {ICS_FORMS.map((f) => {
            const st = STATUS[f.status];
            return (
              <tr key={f.code} className={TR}>
                <td className={`${TD} font-mono text-xs font-bold text-or-500`}>{f.code}</td>
                <td className={TD_STRONG}>{m.ics[f.titleKey]}</td>
                <td className={TD}><Pill tone={st.tone} label={m.ics[st.key]} /></td>
                <td className={TD_MONO}>{f.updated}</td>
                <td className={TD_MUTED}>{f.author}</td>
              </tr>
            );
          })}
        </Table>
      </div>

      {/* Sous `md` : une carte par formulaire — mêmes colonnes, rien de masqué. */}
      <div className="flex flex-col gap-2 md:hidden">
        {ICS_FORMS.map((f) => {
          const st = STATUS[f.status];
          return (
            <div key={f.code} className="carte flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-bold text-or-500">{f.code}</div>
                  <div className="break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{m.ics[f.titleKey]}</div>
                </div>
                <span className="shrink-0"><Pill tone={st.tone} label={m.ics[st.key]} /></span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.common.updated}</dt>
                  <dd className="break-words font-mono tabular-nums text-gray-700 dark:text-rdia-100">{f.updated}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.common.author}</dt>
                  <dd className="break-words text-gray-700 dark:text-rdia-100">{f.author}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}
