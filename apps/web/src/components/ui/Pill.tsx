export type Tone = "red" | "amber" | "gold" | "green" | "blue" | "gray" | "purple";
export type PillSize = "sm" | "md";

const TONES: Record<Tone, string> = {
  red: "bg-danger-500/15 text-danger-500",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  gold: "bg-or-500/15 text-or-500",
  green: "bg-green-500/15 text-green-600 dark:text-green-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  gray: "bg-gray-400/20 text-gray-500 dark:text-rdia-200",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

// Un cran plus grand sur téléphone (9 px ne se lit pas au bras tendu) ;
// densité d'origine à partir de sm.
const SIZES: Record<PillSize, string> = {
  sm: "px-1.5 py-px text-[10px] sm:text-[9px]",
  md: "px-2 py-0.5 text-[11px] sm:text-[10px]",
};

/** Petite pastille de statut colorée pour les statuts hors des six types de Badge. */
export function Pill({ tone, label, size = "md" }: { tone: Tone; label: string; size?: PillSize }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md font-bold uppercase tracking-wide ${TONES[tone]} ${SIZES[size]}`}>
      {label}
    </span>
  );
}

/** Petite pastille + libellé, utilisée dans les légendes et tableaux de flux. */
export function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
