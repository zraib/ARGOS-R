// Aides partagées par les composants de HospinetIAPanel.tsx (extraites, exportées).

// ---------------------------------------------------------------------------
// Utilitaires graphe (SVG inline, aucune dépendance)
// ---------------------------------------------------------------------------

export const PAD = { top: 6, right: 10, bottom: 22, left: 26 };

export const PAD_XL = { top: 14, right: 18, bottom: 44, left: 48 };

export function fmtInt(n: number): string {
  if (n >= 1000) return n.toLocaleString("fr-FR");
  return String(n);
}

export function fmtPct(n: number): string {
  const c = Math.max(0, Math.min(100, Math.round(n)));
  return `${c} %`;
}

export function occTint(pct: number) {
  return pct >= 92 ? "#EF4444" : pct >= 75 ? "#F59E0B" : "#10B981";
}

/** Clé du libellé d'occupation dans `ModulesDict["hospinet"]` — traduit à l'affichage. */
export function occLabelKey(pct: number): "occ_saturated" | "occ_tight" | "occ_comfortable" {
  if (pct >= 92) return "occ_saturated";
  if (pct >= 75) return "occ_tight";
  return "occ_comfortable";
}

export function occChip(pct: number): string {
  if (pct >= 92)
    return "rounded-md bg-danger-500/15 px-2 py-0.5 text-[10.5px] font-bold text-danger-700 dark:text-danger-300";
  if (pct >= 75)
    return "rounded-md bg-or-500/15 px-2 py-0.5 text-[10.5px] font-bold text-or-700 dark:text-or-300";
  return "rounded-md bg-green-500/15 px-2 py-0.5 text-[10.5px] font-bold text-green-700 dark:text-green-300";
}

// ===========================================================================
// 4 · KPI
// ===========================================================================

export interface KpiProps {
  icon: string;
  label: string;
  primary: string;
  secondary?: string;
  tint?: "neutral" | "green" | "orange" | "red" | "blue";
}

export const TINT: Record<NonNullable<KpiProps["tint"]>, { chipBg: string; chipText: string; primary: string }> = {
  neutral: {
    chipBg: "bg-gray-100 dark:bg-rdia-600",
    chipText: "text-gray-500 dark:text-rdia-300",
    primary: "text-gray-800 dark:text-rdia-50",
  },
  green: {
    chipBg: "bg-green-500/12 dark:bg-green-500/20",
    chipText: "text-green-600 dark:text-green-400",
    primary: "text-green-700 dark:text-green-400",
  },
  orange: {
    chipBg: "bg-or-500/12 dark:bg-or-500/20",
    chipText: "text-or-600 dark:text-or-400",
    primary: "text-or-700 dark:text-or-400",
  },
  red: {
    chipBg: "bg-danger-500/12 dark:bg-danger-500/20",
    chipText: "text-danger-600 dark:text-danger-400",
    primary: "text-danger-700 dark:text-danger-400",
  },
  blue: {
    chipBg: "bg-blue-500/12 dark:bg-blue-500/20",
    chipText: "text-blue-600 dark:text-blue-400",
    primary: "text-blue-700 dark:text-blue-400",
  },
};

// ===========================================================================
// Composant principal
// ===========================================================================

export type ExpandedKey = "occ" | "svc" | "net" | null;
