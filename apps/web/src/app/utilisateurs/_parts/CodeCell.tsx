"use client";

import { useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";


/** Mot de passe provisoire : masqué par défaut, révélable et copiable. */
export function CodeCell({
  hasCode, code, onReveal, onCopy,
}: {
  hasCode: boolean;
  code?: string;
  onReveal: () => void;
  onCopy: () => void;
}) {
  const m = useModules();
  if (!hasCode) return <span className="text-gray-300 dark:text-rdia-500">{m.users.no_code}</span>;
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-xs text-or-600 dark:text-or-400">{code ?? "••••-••••"}</span>
      <button title={code ? m.users.hide : m.users.reveal} aria-label={code ? m.users.hide : m.users.reveal} className="cible-tactile flex items-center justify-center rounded-md p-1.5 text-gray-400 transition-colors hover:text-or-500" onClick={onReveal}>
        <Icon path={code ? UI_ICONS.eyeOff : UI_ICONS.eye} size={15} />
      </button>
      <button title={m.users.copy_code} aria-label={m.users.copy_code} className="cible-tactile flex items-center justify-center rounded-md p-1.5 text-gray-400 transition-colors hover:text-or-500" onClick={onCopy}>
        <Icon path={UI_ICONS.copy} size={14} />
      </button>
    </div>
  );
}
