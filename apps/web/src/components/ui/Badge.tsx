// Recrée le <Badge type label /> d'AminDesign utilisé dans tout le prototype.
// L'union `type` couvre la gravité (high/medium/low) et le statut de workflow
// (active/on_hold/completed) : un seul composant sert toutes les tables et cartes.

export type BadgeType =
  | "high"
  | "medium"
  | "low"
  | "active"
  | "on_hold"
  | "completed";

const STYLES: Record<BadgeType, string> = {
  high: "bg-danger-500/15 text-danger-500",
  medium: "bg-or-500/15 text-or-500",
  low: "bg-slate-400/20 text-slate-500 dark:text-slate-300",
  active: "bg-green-500/15 text-green-600 dark:text-green-400",
  on_hold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-gray-400/20 text-gray-500 dark:text-rdia-200",
};

export function Badge({ type, label }: { type: BadgeType; label: string }) {
  return (
    // 11 px sur téléphone : à 10 px, une pastille en majuscules devient
    // illisible à bout de bras. Densité d'origine à partir de sm.
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide sm:text-[10px] ${STYLES[type]}`}
    >
      {label}
    </span>
  );
}
