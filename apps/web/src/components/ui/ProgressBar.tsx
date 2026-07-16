// Rail fin + barre remplie. Hauteur et couleur de remplissage configurables :
// disponibilité d'unité (or), occupation d'hôpital (vert/or/rouge), progression d'opération.

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  /** Classes Tailwind pour le remplissage (ex. "bg-or-500", "bg-danger-500"). */
  fill?: string;
  /** utilitaire de hauteur du rail, ex. "h-1.5" | "h-2" */
  height?: string;
}

export function ProgressBar({ value, fill = "bg-or-500", height = "h-1.5" }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`w-full ${height} overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
