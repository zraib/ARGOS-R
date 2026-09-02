"use client";

import { useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { sevBadge, subTypeLabel} from "@/lib/helpers";
import { canReportIncident } from "@/lib/roles";
import type { Incident, SubIncident } from "@/lib/types";
import {
  llTxt,
  } from "@/app/incidents/_parts/shared";


/**
 * Carte d'un sous-incident (gravité, type, précision, heure, bilan, moyens,
 * retrait). Partagée entre la modale de détails et l'arborescence de la liste.
 */
export function SubIncidentCard({ incident, sub }: { incident: Incident; sub: SubIncident }) {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const role = useArgos((s) => s.role);
  const subCatalog = useArgos((s) => s.subCatalog);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const canEdit = canReportIncident(role);
  const [busy, setBusy] = useState(false);

  const sb = sevBadge(sub.sev, t);
  const su = units.filter((u) => sub.responders?.units.includes(u.id));
  const sh = hospitals.filter((h) => sub.responders?.hospitals.includes(h.id));
  const meta: string[] = [];
  if (sub.casualties) meta.push(`${sub.casualties.dead} ${t.wz_dead.toLowerCase()} · ${sub.casualties.injured} ${t.wz_injured.toLowerCase()} · ${sub.casualties.missing} ${t.wz_missing.toLowerCase()}`);
  if (sub.ll) meta.push(llTxt(sub.ll));

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.removeSubIncident(incident.id, sub.id);
      await loadDomain();
      showToast(t.si_removed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-white px-2.5 py-1.5 dark:border-rdia-600/50 dark:bg-rdia-700/40">
      {/* La ligne d'en-tête passe à la ligne : à 375 px gravité + type + note +
          heure ne tiennent pas côte à côte. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge type={sb.type} label={sb.label} />
        <span className="min-w-0 break-words text-sm font-medium text-gray-800 dark:text-rdia-50">{subTypeLabel(sub.type, subCatalog.types, lang)}</span>
        {sub.note && <span className="min-w-0 break-words text-xs text-gray-500 dark:text-rdia-300">· {sub.note}</span>}
        <span className="ms-auto font-mono text-[11px] text-gray-400 dark:text-rdia-400">{sub.time}</span>
        {canEdit && (
          <button
            onClick={() => void remove()}
            disabled={busy}
            className="cible-tactile inline-flex shrink-0 items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:text-danger-500 disabled:opacity-40"
            aria-label={t.si_removed}
          >
            <Icon path={UI_ICONS.close} size={13} strokeWidth={2.5} />
          </button>
        )}
      </div>
      {meta.length > 0 && (
        <div className="ps-1 font-mono text-[10px] text-gray-400 dark:text-rdia-400">{meta.join("   ")}</div>
      )}
      {(su.length > 0 || sh.length > 0) && (
        <div className="flex flex-wrap gap-1 ps-1">
          {su.map((u) => <span key={u.id} className="rounded bg-or-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-or-600 dark:text-or-400">{u.nom}</span>)}
          {sh.map((h) => <span key={h.id} className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">{h.nom}</span>)}
        </div>
      )}
    </div>
  );
}
