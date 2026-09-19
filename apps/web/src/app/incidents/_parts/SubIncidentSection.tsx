"use client";

import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { Incident } from "@/lib/types";
import { SubIncidentCard } from "@/app/incidents/_parts/SubIncidentCard";

/** Section « sous-incidents » de la modale de détails : liste en lecture seule + bouton d'ajout (ouvre une modale SÉPARÉE). */
export function SubIncidentSection({ incident, onAdd }: { incident: Incident; onAdd: () => void }) {
  const t = useDict();
  const role = useArgos((s) => s.role);
  // La permission servie (« Sous-incidents : ajouter, modifier, supprimer »), commutable par rôle.
  const can = useArgos((s) => s.can);
  const canEdit = can("subincidents:create") || role === "superadmin";
  const subs = incident.subIncidents ?? [];

  return (
    <div className="border-t border-gray-100 pt-3 dark:border-rdia-700/50">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
          {t.si_title} ({subs.length})
        </div>
        {canEdit && (
          <button className="btn-secondaire cible-tactile flex items-center gap-1.5 text-xs" onClick={onAdd}>
            <Icon path={UI_ICONS.plus} size={13} /> {t.si_add}
          </button>
        )}
      </div>

      {subs.length === 0 && (
        <div className="text-xs text-gray-400 dark:text-rdia-400">{t.si_none}</div>
      )}

      {subs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {subs.map((s) => <SubIncidentCard key={s.id} incident={incident} sub={s} />)}
        </div>
      )}
    </div>
  );
}
