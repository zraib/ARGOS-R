"use client";

import { useCallback, useEffect, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { MODULE_KEYS, navLabel, type ModuleKey } from "@/lib/nav";
import {
  ROLES,
  ROLE_ICONS,
  type Role,
} from "@/lib/roles";
import { DEFAULT_ROLE_FEATURES } from "@/lib/data/users";


// ===========================================================================
// Onglet Rôles & fonctionnalités (via l'API)
// ===========================================================================
export 
function RolesTab() {
  const t = useDict();
  const m = useModules();
  const roleFeatures = useArgos((s) => s.roleFeatures);
  const setRoleFeatures = useArgos((s) => s.setRoleFeatures);

  const [selected, setSelected] = useState<Role>("strategic");
  // Les défauts font foi côté API (dérivés de la matrice RBAC) ; la table
  // locale n'est que le repli hors connexion.
  const [defaults, setDefaults] = useState<Record<Role, Record<string, boolean>>>(DEFAULT_ROLE_FEATURES);

  const refresh = useCallback(async () => {
    const res = await api.getRoleFeatures();
    if (res.data) setRoleFeatures(res.data as Record<Role, Record<string, boolean>>);
  }, [setRoleFeatures]);

  useEffect(() => {
    void refresh();
    api.getDefaultRoleFeatures().then((r) => { if (r.data) setDefaults(r.data as Record<Role, Record<string, boolean>>); }).catch(() => {});
  }, [refresh]);

  const locked = selected === "superadmin" || selected === "admin";
  const feats = roleFeatures[selected] ?? {};
  const def = defaults[selected] ?? {};
  const allowedCount = MODULE_KEYS.filter((k) => feats[k]).length;

  const toggle = async (feature: ModuleKey, enabled: boolean) => {
    await api.setRoleFeature(selected, feature, enabled);
    await refresh();
  };

  const reset = async () => {
    await api.resetRoleFeatures(selected);
    await refresh();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="carte flex shrink-0 flex-col gap-1 p-3 lg:w-64 lg:overflow-auto">
        <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400 dark:text-rdia-400">{m.users.select_role}</p>
        {/* Sous `lg` : bandeau défilable horizontalement — quinze rôles empilés
            repousseraient la matrice des fonctionnalités hors de l'écran. */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-x-visible lg:px-0 lg:pb-0">
          {ROLES.map((r) => {
            const on = r === selected;
            const count = MODULE_KEYS.filter((k) => (roleFeatures[r] ?? {})[k]).length;
            return (
              <button key={r} onClick={() => setSelected(r)} className={`flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors lg:min-h-0 lg:w-full ${on ? "bg-or-500/15 text-or-600 dark:text-or-400" : "text-gray-600 hover:bg-gray-100 dark:text-rdia-200 dark:hover:bg-rdia-700/50"}`}>
                <Icon path={ROLE_ICONS[r]} size={16} className="shrink-0" />
                <span className="whitespace-nowrap text-start font-medium lg:flex-1 lg:truncate">{m.roles[r]}</span>
                <span className="text-[10px] text-gray-400 dark:text-rdia-400">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="carte flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5 lg:overflow-auto">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
              <Icon path={ROLE_ICONS[selected]} size={16} className="text-or-500" />
              {m.roles[selected]}
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-rdia-400">{locked ? m.users.locked_all : `${allowedCount} ${m.users.modules_count}`}</p>
          </div>
          {!locked && (
            <button className="cible-tactile flex items-center justify-center px-1 text-xs font-semibold text-or-500 hover:underline lg:px-0 lg:text-[11px]" onClick={() => void reset()}>{m.users.reset_role}</button>
          )}
        </div>

        <p className="text-[11px] text-gray-400 dark:text-rdia-400">{m.users.role_features_hint}</p>

        <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:gap-x-8">
          {MODULE_KEYS.map((k) => {
            const on = locked ? true : feats[k] === true;
            const isDefault = def[k] ?? false;
            return (
              <button key={k} disabled={locked} onClick={() => void toggle(k, !on)} className="flex min-h-[44px] items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm transition-colors last:border-0 disabled:cursor-not-allowed lg:min-h-0 dark:border-rdia-700/50">
                <span className="flex min-w-0 items-center gap-1.5 text-start">
                  <span className={on ? "text-gray-700 dark:text-rdia-100" : "text-gray-400 line-through dark:text-rdia-400"}>{navLabel(k, t)}</span>
                  {!locked && on !== isDefault && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-or-500" title={m.settings.modified} />
                  )}
                </span>
                <span className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${on ? "bg-or-500" : "bg-gray-300 dark:bg-rdia-600"} ${locked ? "opacity-60" : ""}`}>
                  <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ insetInlineStart: on ? 18 : 2 }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
