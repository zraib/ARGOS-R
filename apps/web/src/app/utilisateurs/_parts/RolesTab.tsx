"use client";

import { useCallback, useEffect, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { MODULE_KEYS, isCoreModule, moduleLabel, type ModuleKey } from "@/lib/nav";
import {
  ROLE_ICONS,
  rolesOfProfile,
  type Role,
} from "@/lib/roles";
import { DEFAULT_ROLE_FEATURES } from "@/lib/data/users";

// ===========================================================================
// Onglet Rôles & fonctionnalités (via l'API)
//
// Deux matrices par rôle, réglées ici et appliquées côté API dès la requête
// suivante :
//   - les MODULES du menu (ADR 0017) : ce que le rôle voit ;
//   - les FONCTIONNALITÉS de l'API (ADR 0022, lot 2) : les 43 lignes de la
//     matrice RBAC, dont « Sous-incidents (ajouter, modifier, supprimer) » —
//     coupée, une fonctionnalité retire toutes ses actions au rôle (403).
// Les rôles du mode de l'application en service : l'autre profil n'existe
// pas sous ce mode — l'API ne sert que celui-là.
// ===========================================================================

/** Les fonctionnalités de l'API, dans l'ordre de la matrice ; le cœur est verrouillé. */
const FEATURE_KEYS = [
  "dashboard", "dash_incident", "dash_hospital", "dash_shelter", "dash_morgue", "dash_unit",
  "map", "incidents", "subincidents", "victims", "hospinet", "shelters", "morgue", "units",
  "equipment", "teams", "comms", "reports", "analytics", "assistant", "users", "settings",
  "assign", "deploy", "resources", "weather", "plume",
  "dispatch", "triage", "ics", "damage", "orsec", "plans", "personnel", "workorders", "seismic",
  "audit", "aviation", "nrbc", "missions", "tracking", "comms_admin", "map_edit",
] as const;
type FeatureKey = (typeof FEATURE_KEYS)[number];
const CORE_FEATURES: readonly FeatureKey[] = ["users", "settings", "audit"];

type Grants = Record<string, Record<string, boolean>>;

export function RolesTab() {
  const t = useDict();
  const m = useModules();
  const roleFeatures = useArgos((s) => s.roleFeatures);
  const setRoleFeatures = useArgos((s) => s.setRoleFeatures);
  const sessionProfile = useArgos((s) => s.profile);

  const profile = sessionProfile;
  const roles = rolesOfProfile(profile);
  const [selected, setSelected] = useState<Role>(sessionProfile === "direx" ? "direx_chef" : "strategic");
  // Les défauts font foi côté API (dérivés de la matrice RBAC) ; la table
  // locale n'est que le repli hors connexion.
  const [defaults, setDefaults] = useState<Record<Role, Record<string, boolean>>>(DEFAULT_ROLE_FEATURES);
  const [grants, setGrants] = useState<Grants>({});
  const [grantDefaults, setGrantDefaults] = useState<Grants>({});

  const refresh = useCallback(async () => {
    const res = await api.getRoleFeatures();
    if (res.data) setRoleFeatures(res.data as Record<Role, Record<string, boolean>>);
    const g = await api.getRoleGrants();
    if (g.data) setGrants(g.data as Grants);
  }, [setRoleFeatures]);

  useEffect(() => {
    void refresh();
    api.getDefaultRoleFeatures().then((r) => { if (r.data) setDefaults(r.data as Record<Role, Record<string, boolean>>); }).catch(() => {});
    api.getDefaultRoleGrants().then((r) => { if (r.data) setGrantDefaults(r.data as Grants); }).catch(() => {});
  }, [refresh]);

  const locked = selected === "superadmin" || selected === "admin";
  const def = defaults[selected] ?? {};
  // Le cœur (comptes, supervision, paramètres) figure dans la liste mais suit
  // le RBAC : il compte quand le rôle l'a, il ne se bascule pas (ADR 0017).
  // Les lignes verrouillées des administrateurs montrent leurs défauts — tout,
  // sauf ce que le RBAC ne leur donne pas (la supervision et le mode édition
  // pour l'Administrateur).
  const isOn = (role: Role, k: ModuleKey): boolean =>
    isCoreModule(k) || role === "superadmin" || role === "admin" ? (defaults[role] ?? {})[k] === true : (roleFeatures[role] ?? {})[k] === true;
  const allowedCount = MODULE_KEYS.filter((k) => isOn(selected, k)).length;
  // Une fonctionnalité : ouverte si le rôle la détient dans la matrice et
  // qu'elle n'a pas été coupée ; les administrateurs et le cœur suivent le RBAC.
  const grantDefault = (role: Role, f: FeatureKey): boolean => (grantDefaults[role] ?? {})[f] === true;
  const isGranted = (role: Role, f: FeatureKey): boolean =>
    role === "superadmin" || role === "admin" || CORE_FEATURES.includes(f) ? grantDefault(role, f) : (grants[role] ?? {})[f] === true;
  const grantedCount = FEATURE_KEYS.filter((f) => isGranted(selected, f)).length;

  const toggle = async (feature: ModuleKey, enabled: boolean) => {
    await api.setRoleFeature(selected, feature, enabled);
    await refresh();
  };
  const toggleGrant = async (feature: FeatureKey, enabled: boolean) => {
    await api.setRoleGrant(selected, feature, enabled);
    await refresh();
  };

  const reset = async () => {
    await api.resetRoleFeatures(selected);
    await api.resetRoleGrants(selected);
    await refresh();
  };

  const rowCls = "flex min-h-[44px] items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm transition-colors last:border-0 disabled:cursor-not-allowed lg:min-h-0 dark:border-rdia-700/50";
  const Switch = ({ on, frozen }: { on: boolean; frozen: boolean }) => (
    <span className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${on ? "bg-or-500" : "bg-gray-300 dark:bg-rdia-600"} ${frozen ? "opacity-60" : ""}`}>
      <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ insetInlineStart: on ? 18 : 2 }} />
    </span>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="carte flex shrink-0 flex-col gap-1 p-3 lg:w-64 lg:overflow-auto">
        <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400 dark:text-rdia-400">
          {m.users.select_role}
          <span className="ms-1 font-bold text-or-500" title={t.profile_title}>· {profile === "direx" ? t.lg_mode_direx : t.lg_mode_classique}</span>
        </p>
        {/* Sous `lg` : bandeau défilable horizontalement — quinze rôles empilés
            repousseraient la matrice des fonctionnalités hors de l'écran. */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-x-visible lg:px-0 lg:pb-0">
          {roles.map((r) => {
            const on = r === selected;
            const count = MODULE_KEYS.filter((k) => isOn(r, k)).length;
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
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-rdia-400">
              {locked ? m.users.locked_all : `${allowedCount} ${m.users.modules_count} · ${grantedCount}/${FEATURE_KEYS.length}`}
            </p>
          </div>
          {!locked && (
            <button className="cible-tactile flex items-center justify-center px-1 text-xs font-semibold text-or-500 hover:underline lg:px-0 lg:text-[11px]" onClick={() => void reset()}>{m.users.reset_role}</button>
          )}
        </div>

        {/* --- modules du menu (ADR 0017) ------------------------------------ */}
        <div>
          <p className="text-[12px] font-semibold text-gray-700 dark:text-rdia-100">{m.users.modules_title}</p>
          <p className="text-[11px] text-gray-400 dark:text-rdia-400">{m.users.role_features_hint}</p>
        </div>
        {/* Tout le menu, dans son ordre (ADR 0017) : les modules qui se
            basculent, puis le cœur, verrouillé sur l'état que lui donne le
            RBAC — on voit qu'il existe et à qui il revient. */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:gap-x-8">
          {MODULE_KEYS.map((k) => {
            const core = isCoreModule(k);
            const on = isOn(selected, k);
            const isDefault = def[k] ?? false;
            const frozen = locked || core;
            return (
              <button
                key={k}
                disabled={frozen}
                title={core ? m.users.core_locked : undefined}
                onClick={() => void toggle(k, !on)}
                className={rowCls}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-start">
                  <span className={on ? "text-gray-700 dark:text-rdia-100" : "text-gray-400 line-through dark:text-rdia-400"}>{moduleLabel(k, t, selected)}</span>
                  {core && <Icon path={UI_ICONS.lock} size={11} className="shrink-0 text-gray-400 dark:text-rdia-400" />}
                  {!frozen && on !== isDefault && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-or-500" title={m.settings.modified} />
                  )}
                </span>
                <Switch on={on} frozen={frozen} />
              </button>
            );
          })}
        </div>

        {/* --- fonctionnalités de l'API (ADR 0022, lot 2) --------------------- */}
        <div className="mt-2 border-t border-gray-100 pt-3 dark:border-rdia-700/50">
          <p className="text-[12px] font-semibold text-gray-700 dark:text-rdia-100">{m.users.features_title}</p>
          <p className="text-[11px] text-gray-400 dark:text-rdia-400">{m.users.features_hint}</p>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:gap-x-8">
          {FEATURE_KEYS.map((f) => {
            const core = CORE_FEATURES.includes(f);
            const on = isGranted(selected, f);
            const isDefault = grantDefault(selected, f);
            // Une fonctionnalité que la matrice RBAC ne donne pas au rôle ne s'ouvre pas ici : la matrice se règle dans le code.
            const frozen = locked || core || !isDefault;
            return (
              <button
                key={f}
                disabled={frozen}
                title={core ? m.users.feature_locked : undefined}
                onClick={() => void toggleGrant(f, !on)}
                className={rowCls}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-start">
                  <span className={on ? "text-gray-700 dark:text-rdia-100" : "text-gray-400 line-through dark:text-rdia-400"}>{m.features[f]}</span>
                  {core && <Icon path={UI_ICONS.lock} size={11} className="shrink-0 text-gray-400 dark:text-rdia-400" />}
                  {!frozen && on !== isDefault && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-or-500" title={m.settings.modified} />
                  )}
                </span>
                <Switch on={on} frozen={frozen} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
