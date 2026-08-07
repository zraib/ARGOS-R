"use client";

import { useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { ROLE_ICONS, type Role } from "@/lib/roles";
import { api, loadSessionContext } from "@/lib/api";

/**
 * Sélecteur de rôle affiché après le login d'un compte multi-rôles : des tuiles
 * (icônes) regroupent les rôles de l'utilisateur ; il en choisit un seul → l'API
 * émet un nouveau jeton portant ce rôle (`POST /auth/select-role`).
 */
export function RoleChooserScreen() {
  const m = useModules();
  const dark = useArgos((s) => s.dark);
  const sessionUser = useArgos((s) => s.sessionUser);
  const chooseRole = useArgos((s) => s.chooseRole);
  const setFlags = useArgos((s) => s.setFlags);
  const setRoleFeatures = useArgos((s) => s.setRoleFeatures);

  const roles = sessionUser?.roles ?? [];
  const [picked, setPicked] = useState<Role | null>(roles[0] ?? null);
  const [busy, setBusy] = useState(false);

  const confirm = async (role: Role) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.selectRole(role);
      const token = (res.data as { access_token?: string } | undefined)?.access_token;
      if (!token) return;
      chooseRole(token, role);
      // Recharge le contexte avec le rôle actif (flags + fonctionnalités).
      const ctx = await loadSessionContext();
      if (ctx.flags) setFlags(ctx.flags);
      if (ctx.roleFeatures) setRoleFeatures(ctx.roleFeatures as Record<Role, Record<string, boolean>>);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="flex h-screen w-full items-center justify-center p-6"
      style={{
        background: dark
          ? "radial-gradient(ellipse at 32% 45%, rgb(27 77 46 / 0.6), transparent 60%), rgb(15 31 20)"
          : "radial-gradient(ellipse at 32% 45%, rgb(27 77 46 / 0.14), transparent 60%), rgb(243 244 246)",
      }}
    >
      <div className="flex w-full max-w-3xl animate-fade-in-up flex-col items-center gap-8">
        <div className="text-center">
          <div className="text-2xl font-bold text-rdia-600 dark:text-rdia-50">{m.users.rc_title}</div>
          <p className="mt-1.5 text-sm text-or-600 dark:text-or-500">{m.users.rc_hint}</p>
          {sessionUser && (
            <p className="mt-1 text-xs text-gray-500 dark:text-rdia-200">{sessionUser.nom} · <span className="font-mono">{sessionUser.matricule}</span></p>
          )}
        </div>

        {/* Tuiles GRANDES et prononcées, centrées quelle que soit leur quantité
            (justify-center) — double-clic = accès direct. */}
        <div className="flex w-full flex-wrap justify-center gap-5">
          {roles.map((r) => {
            const on = picked === r;
            return (
              <button
                key={r}
                onClick={() => setPicked(r)}
                onDoubleClick={() => void confirm(r)}
                className={`carte flex w-52 flex-col items-center gap-4 p-8 transition-all duration-150 ${
                  on
                    ? "scale-105 shadow-2xl ring-2 ring-or-500 shadow-or-500/20"
                    : "opacity-75 hover:scale-[1.02] hover:opacity-100 hover:shadow-xl"
                }`}
              >
                <span className={`flex h-20 w-20 items-center justify-center rounded-full transition-colors ${on ? "bg-or-500 text-rdia-600 shadow-lg shadow-or-500/40" : "bg-or-500/15 text-or-500"}`}>
                  <Icon path={ROLE_ICONS[r]} size={38} />
                </span>
                <span className="text-center text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{m.roles[r]}</span>
              </button>
            );
          })}
        </div>

        <button
          className="btn-primaire w-full max-w-xs text-sm"
          disabled={!picked || busy}
          onClick={() => picked && void confirm(picked)}
        >
          {busy ? "…" : m.users.rc_enter}
        </button>
      </div>
    </section>
  );
}
