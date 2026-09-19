"use client";

import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { Incident } from "@/lib/types";
import { SubIncidentCard } from "@/app/incidents/_parts/SubIncidentCard";

/**
 * Arborescence des sous-incidents affichée sous la ligne de l'incident dans le
 * tableau (guide vertical + connecteurs horizontaux, feuille « ajouter »).
 */
export function SubIncidentTree({ incident, onAddSub, children = [], onOpen }: { incident: Incident; onAddSub: () => void; children?: Incident[]; onOpen?: (inc: Incident) => void }) {
  const t = useDict();
  const role = useArgos((s) => s.role);
  // La permission servie (« Sous-incidents : ajouter, modifier, supprimer »), commutable par rôle.
  const can = useArgos((s) => s.can);
  const openWizardNested = useArgos((s) => s.openWizardNested);
  const canEdit = can("subincidents:create") || role === "superadmin";
  const subs = incident.subIncidents ?? [];

  // Indentation réduite sous md : à 375 px chaque pixel d'indentation est pris
  // sur la largeur utile des cartes filles.
  return (
    <div className="ps-0 animate-fade-in md:ps-6">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
        <Icon path={UI_ICONS.branch} size={12} strokeWidth={2} />
        {t.si_title} ({subs.length + children.length})
      </div>
      <div className="ms-1.5 flex flex-col gap-2 border-s-2 border-or-500/30 ps-3 md:ps-4">
        {/* Incidents RATTACHÉS : des incidents entiers, déclarés avec les mêmes étapes, présentés sous le parent. */}
        {children.map((c) => (
          <div key={c.id} className="relative min-w-0 max-w-3xl">
            <span aria-hidden="true" className="absolute -start-3 top-4 h-px w-2.5 bg-or-500/30 md:-start-4 md:w-3.5" />
            <button
              type="button"
              onClick={() => onOpen?.(c)}
              className="flex w-full items-center gap-2 rounded-lg border border-or-500/30 bg-white px-3 py-2 text-start text-sm transition-colors hover:border-or-500 dark:bg-rdia-800"
            >
              <span className="font-mono text-xs text-gray-500 dark:text-rdia-300">{c.id}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-rdia-50">{c.titre}</span>
              <span className="text-[10px] uppercase tracking-wider text-or-500">{t.wiz_nested_badge}</span>
            </button>
          </div>
        ))}
        {subs.map((s) => (
          <div key={s.id} className="relative min-w-0 max-w-3xl">
            <span aria-hidden="true" className="absolute -start-3 top-4 h-px w-2.5 bg-or-500/30 md:-start-4 md:w-3.5" />
            <SubIncidentCard incident={incident} sub={s} />
          </div>
        ))}
        {canEdit && (
          <div className="relative">
            <span aria-hidden="true" className="absolute -start-3 top-1/2 h-px w-2.5 bg-or-500/30 md:-start-4 md:w-3.5" />
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondaire flex items-center gap-1.5 text-xs" onClick={onAddSub}>
                <Icon path={UI_ICONS.plus} size={13} /> {t.si_add}
              </button>
              {/* Un incident entier sous celui-ci — mêmes étapes que la déclaration. */}
              {!incident.parentId && (
                <button className="btn-secondaire flex items-center gap-1.5 text-xs" onClick={() => openWizardNested(incident)}>
                  <Icon path={UI_ICONS.plus} size={13} /> {t.wiz_nested_add}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
