"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { sevBadge, stBadge, typeLabel } from "@/lib/helpers";
import { canReportIncident } from "@/lib/roles";

const TH = "px-4 py-3 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
const TD = "px-4 py-2.5";

export default function IncidentsPage() {
  const t = useDict();
  const router = useRouter();
  const incidents = useArgos((s) => s.incidents);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const lang = useArgos((s) => s.lang);
  const role = useArgos((s) => s.role);
  const openWizard = useArgos((s) => s.openWizard);
  const select = useArgos((s) => s.select);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return incidents.filter((i) => !needle || `${i.titre}${i.region}${i.id}`.toLowerCase().includes(needle));
  }, [incidents, q]);

  const toMap = (id: string) => {
    select("inc", id);
    router.push("/map");
  };

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <input className="input-champ max-w-sm text-sm" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="font-mono text-xs text-gray-400 dark:text-rdia-400">
          {rows.length} / {incidents.length}
        </span>
        <div className="flex-1" />
        {canReportIncident(role) && (
          <button className="btn-primaire flex items-center gap-1.5 whitespace-nowrap text-sm" onClick={() => openWizard()}>
            <Icon path={UI_ICONS.plus} size={15} />
            {t.report}
          </button>
        )}
      </div>

      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-rdia-600">
              <th className={TH}>{t.col_id}</th>
              <th className={TH}>{t.col_incident}</th>
              <th className={TH}>{t.h_typev}</th>
              <th className={TH}>{t.col_region}</th>
              <th className={TH}>{t.col_sev}</th>
              <th className={TH}>{t.col_status}</th>
              <th className={TH}>{t.col_time}</th>
              <th className={TH}>{t.col_actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const sb = sevBadge(i.sev, t);
              const st = stBadge(i.st, t);
              return (
                <tr key={i.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-rdia-700/50 dark:hover:bg-rdia-700/30">
                  <td className={`${TD} font-mono text-xs text-gray-500 dark:text-rdia-300`}>{i.id}</td>
                  <td className={`${TD} font-medium text-gray-800 dark:text-rdia-50`}>{i.titre}</td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{typeLabel(i.type, incidentTypes, lang)}</td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{i.region}</td>
                  <td className={TD}><Badge type={sb.type} label={sb.label} /></td>
                  <td className={TD}><Badge type={st.type} label={st.label} /></td>
                  <td className={`${TD} font-mono text-xs text-gray-500 dark:text-rdia-300`}>{i.time}</td>
                  <td className={TD}>
                    <button className="btn-secondaire text-xs" onClick={() => toMap(i.id)}>{t.to_map}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
