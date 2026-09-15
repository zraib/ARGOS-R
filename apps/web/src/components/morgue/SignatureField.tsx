"use client";

import { useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { inputCls, labelCls } from "@/components/morgue/IdentityFields";

/**
 * La signature d'un geste sur un dossier mortuaire : le mot de passe du compte
 * connecté, exigé par l'API (step-up) pour identifier, corriger ou restituer.
 * Le champ dit pourquoi il est là ; l'erreur vient du serveur (403), jamais
 * d'une vérification locale — le navigateur n'a pas le mot de passe.
 */
export function SignatureField({ value, onChange, error, disabled = false }: { value: string; onChange: (v: string) => void; error?: string | null; disabled?: boolean }) {
  const m = useModules();
  return (
    <div className="rounded-lg border border-or-500/30 bg-or-500/5 p-3">
      <div className="mb-2 flex items-start gap-2 text-[11.5px] leading-snug text-gray-600 dark:text-rdia-200">
        <Icon path={UI_ICONS.shield} size={13} className="mt-0.5 shrink-0 text-or-500" />
        <span>{m.morgue.pw_hint}</span>
      </div>
      <label className={labelCls}>{m.morgue.pw_label}</label>
      <input type="password" className={inputCls} value={value} autoComplete="current-password" disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      {error && <p className="mt-1 text-xs font-semibold text-danger-500">{error}</p>}
    </div>
  );
}
