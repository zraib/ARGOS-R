"use client";

import { useDict, useModules } from "@/lib/store";
import type { Shelter } from "@/lib/data/modules";
import type { Unit } from "@/lib/types";

// ============================================================================
// OPSnet — les petits rendus que la liste et les fiches partagent : l'état
// d'une unité, le niveau d'approvisionnement d'un abri. La couleur ne porte
// jamais seule : l'état est écrit.
// ============================================================================

export function EtatUnite({ dispo }: { dispo: Unit["dispo"] }) {
  const t = useDict();
  const style: Record<Unit["dispo"], string> = {
    ready: "bg-green-500/12 text-green-600",
    standby: "bg-or-500/15 text-or-600 dark:text-or-400",
    deployed: "bg-blue-500/12 text-blue-500",
  };
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${style[dispo]}`}>
      {t[`ops_${dispo}` as const]}
    </span>
  );
}

export function EtatAppro({ niveau }: { niveau: Shelter["supplies"] }) {
  const m = useModules();
  const style: Record<Shelter["supplies"], string> = {
    ok: "bg-green-500/12 text-green-600",
    low: "bg-or-500/15 text-or-600 dark:text-or-400",
    critical: "bg-danger-500/15 text-danger-500",
  };
  const label: Record<Shelter["supplies"], string> = { ok: m.shelters.sup_ok, low: m.shelters.sup_low, critical: m.shelters.sup_critical };
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${style[niveau]}`}>{label[niveau]}</span>;
}
