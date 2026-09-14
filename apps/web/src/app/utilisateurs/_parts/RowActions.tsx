"use client";

import { useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";


/** Actions d'un compte : (dés)activation, réinitialisation du mot de passe, édition, suppression. */
export function RowActions({
  active, showPower, canManage, canReset, resetPending, canDelete, onToggleActive, onReset, onEdit, onDelete,
}: {
  active: boolean;
  showPower: boolean;
  canManage: boolean;
  /** Régénérer un code provisoire — jamais pour soi-même ni pour un compte qu'on ne gère pas. */
  canReset: boolean;
  /** Le compte a demandé de l'aide : la clé s'allume. */
  resetPending: boolean;
  canDelete: boolean;
  onToggleActive: (next: boolean) => void;
  onReset: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const m = useModules();
  const btn = "cible-tactile flex items-center justify-center rounded-md p-1.5 transition-colors disabled:opacity-30";
  return (
    <>
      {showPower && (
        active ? (
          <button title={m.users.deactivate} aria-label={m.users.deactivate} onClick={() => onToggleActive(false)} className={`${btn} text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-rdia-700`}>
            <Icon path={UI_ICONS.power} size={15} />
          </button>
        ) : (
          <button title={m.users.activate} aria-label={m.users.activate} onClick={() => onToggleActive(true)} className={`${btn} text-green-500 hover:bg-green-500/10`}>
            <Icon path={UI_ICONS.check} size={15} />
          </button>
        )
      )}
      {canReset && (
        <button
          title={m.users.reset_pw}
          aria-label={m.users.reset_pw}
          onClick={onReset}
          className={`${btn} ${resetPending ? "text-amber-500 hover:bg-amber-500/10" : "text-gray-400 hover:bg-or-500/10 hover:text-or-500"}`}
        >
          <Icon path={UI_ICONS.key} size={15} />
        </button>
      )}
      <button title={m.users.edit} aria-label={m.users.edit} disabled={!canManage} onClick={onEdit} className={`${btn} text-gray-400 hover:bg-or-500/10 hover:text-or-500`}>
        <Icon path={UI_ICONS.edit} size={15} />
      </button>
      <button title={m.users.delete} aria-label={m.users.delete} disabled={!canDelete} onClick={onDelete} className={`${btn} text-gray-400 hover:bg-danger-500/10 hover:text-danger-500`}>
        <Icon path={UI_ICONS.trash} size={15} />
      </button>
    </>
  );
}
