"use client";

import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS } from "@/lib/icons";
import { entityLL } from "@/lib/map/positions";
import type { MarkerKind } from "@/lib/types";

// ============================================================================
// « Afficher sur la carte » — le même bouton dans toutes les fiches (ADR 0036)
//
// Unités, établissements de santé et hôpitaux de campagne, abris, sites
// mortuaires et morgues mobiles : chaque fiche mène à l'élément sur la carte.
// Le bouton allume sa couche, le sélectionne — la carte s'y recentre et
// ouvre son détail — puis ouvre la carte. Sans position connue, il reste là
// mais inactif et dit pourquoi, plutôt que de disparaître sans explication.
// ============================================================================

export function ShowOnMapButton({ kind, id, compact = false }: { kind: MarkerKind; id: string; compact?: boolean }) {
  const t = useDict();
  const router = useRouter();
  const showOnMap = useArgos((s) => s.showOnMap);
  // Un booléen, pas la position : un sélecteur qui rendrait un tableau neuf à chaque lecture relancerait le rendu sans fin.
  const located = useArgos((s) => entityLL(s, kind, id) !== null);
  const title = located ? t.show_on_map : t.show_on_map_none;
  return (
    <button
      type="button"
      disabled={!located}
      title={title}
      aria-label={title}
      onClick={() => {
        showOnMap(kind, id);
        router.push("/map");
      }}
      className="cible-tactile inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 transition-colors hover:border-or-400 hover:text-or-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600 dark:border-rdia-600 dark:text-rdia-200 dark:disabled:hover:border-rdia-600 dark:disabled:hover:text-rdia-200"
    >
      <Icon path={NAV_ICONS.map} size={14} />
      {!compact && <span className="hidden sm:inline">{t.show_on_map}</span>}
    </button>
  );
}
