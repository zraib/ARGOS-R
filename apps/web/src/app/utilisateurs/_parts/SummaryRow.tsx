"use client";

import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";


/** Ligne « libellé / valeur » du récapitulatif, avec copie optionnelle. */
export function SummaryRow({
  label, value, mono, onCopy, copyLabel,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  copyLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</dt>
      <dd className="flex items-center gap-1.5">
        <span className={`min-w-0 break-all text-sm text-gray-800 dark:text-rdia-50 ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : undefined}>{value}</span>
        {onCopy && (
          <button title={copyLabel} aria-label={copyLabel} className="cible-tactile flex shrink-0 items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:text-or-500" onClick={onCopy}>
            <Icon path={UI_ICONS.copy} size={13} />
          </button>
        )}
      </dd>
    </div>
  );
}
