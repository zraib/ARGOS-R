"use client";

import { useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import {
  ROLE_ICONS,
  type Role,
} from "@/lib/roles";


// ---------------------------------------------------------------------------
// Fragments partagés par la ligne de tableau (≥ md) et la carte (< md) : ils
// garantissent que la version mobile ne perd ni donnée ni action.
// ---------------------------------------------------------------------------
export 
/** Étiquettes des rôles d'un compte. */
function RoleChips({ roles }: { roles: Role[] }) {
  const m = useModules();
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span key={r} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-rdia-700/60 dark:text-rdia-100">
          <Icon path={ROLE_ICONS[r]} size={11} className="text-or-500" />
          {m.roles[r]}
        </span>
      ))}
    </div>
  );
}
