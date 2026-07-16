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
    <section className="flex flex-col gap-4 animate-fade-in">
      <p className="text-xs text-gray-500 dark:text-rdia-300">
        {m.ics.col_incident} : <span className="font-mono font-semibold text-or-500">INC-2607</span> · Séisme M5.9 — Al Haouz
      </p>
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
    </section>
  );
}
