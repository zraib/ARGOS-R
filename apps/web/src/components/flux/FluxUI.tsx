"use client";

// ============================================================================
// ARGOS — primitives partagées des pages de flux (sismologie & météo)
// Garantissent une cohérence visuelle stricte entre les deux écrans et avec le
// langage de l'app : tuile d'indicateur (même style que les KPI du tableau de
// bord), contrôle segmenté, pastille « en direct », pied de source.
// ============================================================================

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/** Micro-libellé (majuscules espacées) — style commun de toute l'app. */
export const MICRO = "text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";

/**
 * Tuile d'indicateur : carré d'icône teinté + libellé + valeur (chiffres
 * tabulaires) + sous-texte optionnel. Reprend le gabarit des KPI du tableau de
 * bord pour une cohérence directe.
 */
export function StatTile({
  icon, iconWrap, label, value, sub, subColor = "text-gray-400 dark:text-rdia-400", valueColor = "text-gray-800 dark:text-rdia-50",
}: {
  icon: string;
  iconWrap: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subColor?: string;
  valueColor?: string;
}) {
  return (
    // `.carte` n'a pas de padding : on l'ajoute ici (inset régulier sur tous les bords).
    <div className="carte flex items-center gap-3.5 p-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
        <Icon path={icon} size={20} />
      </span>
      <div className="min-w-0">
        <div className={`${MICRO} truncate`}>{label}</div>
        <div className={`text-xl font-bold leading-tight tabular-nums ${valueColor}`}>{value}</div>
        {sub != null && <div className={`truncate text-[11px] font-medium ${subColor}`}>{sub}</div>}
      </div>
    </div>
  );
}

/** Groupe de boutons segmentés (fond pilule) — style commun des filtres. */
export function Seg({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-rdia-800/60">{children}</div>;
}

export function SegBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${on ? "bg-or-500 text-rdia-600" : "text-gray-500 hover:text-or-500 dark:text-rdia-300"}`}
    >
      {children}
    </button>
  );
}

/** Pastille « en direct » (point pulsé). */
export function LivePill({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-danger-500/10 px-2.5 py-1 text-[11px] font-semibold text-danger-500">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger-500" /> {label}
    </span>
  );
}

/** Interrupteur libellé compact (on/off) — couche carte, options de flux. */
export function ToggleChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-or-500/40 lg:min-h-0 dark:border-rdia-600 dark:text-rdia-200"
    >
      <span className={`inline-flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 transition-colors ${on ? "bg-or-500" : "bg-gray-300 dark:bg-rdia-600"}`}>
        <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${on ? "translate-x-3" : ""}`} />
      </span>
      {label}
    </button>
  );
}

/** Pied de page « source du flux » — même style sur les deux écrans. */
export function SourceNote({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-gray-400 dark:text-rdia-500">{children}</p>;
}
