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
      // `min-h-dvh` (et non `100vh`) + centrage par `my-auto` : avec quinze rôles
      // la colonne dépasse un écran de téléphone, elle doit rester défilable.
      className="flex min-h-dvh w-full flex-col items-center p-3 sm:p-6"
      style={{
        background: dark
          ? "radial-gradient(ellipse at 32% 45%, rgb(27 77 46 / 0.6), transparent 60%), rgb(15 31 20)"
          : "radial-gradient(ellipse at 32% 45%, rgb(27 77 46 / 0.14), transparent 60%), rgb(243 244 246)",
      }}
    >
      <div className="my-auto flex w-full max-w-3xl animate-fade-in-up flex-col items-center gap-6 sm:gap-8">
        <div className="text-center">
          <div className="text-xl font-bold text-rdia-600 sm:text-2xl dark:text-rdia-50">{m.users.rc_title}</div>
          <p className="mt-1.5 text-sm text-or-600 dark:text-or-500">{m.users.rc_hint}</p>
          {sessionUser && (
            <p className="mt-1 break-words text-xs text-gray-500 dark:text-rdia-200">{sessionUser.nom} · <span className="font-mono">{sessionUser.matricule}</span></p>
          )}
        </div>

        {/* Une colonne au téléphone (la tuile devient une rangée icône + libellé,
            entièrement cliquable), deux puis trois colonnes ensuite. Le
            double-clic reste l'accès direct au pointeur. */}
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {roles.map((r) => {
            const on = picked === r;
            return (
              <button
                key={r}
                onClick={() => setPicked(r)}
                onDoubleClick={() => void confirm(r)}
                className={`carte flex w-full min-h-[56px] items-center gap-3 p-3 transition-all duration-150 sm:min-h-0 sm:flex-col sm:gap-4 sm:p-6 lg:p-8 ${
                  on
                    ? "shadow-2xl ring-2 ring-or-500 shadow-or-500/20 sm:scale-105"
                    : "opacity-75 hover:opacity-100 hover:shadow-xl sm:hover:scale-[1.02]"
                }`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors sm:h-16 sm:w-16 lg:h-20 lg:w-20 ${on ? "bg-or-500 text-rdia-600 shadow-lg shadow-or-500/40" : "bg-or-500/15 text-or-500"}`}>
                  {/* Le glyphe suit la taille de la pastille (CSS prime sur les
                      attributs width/height du SVG). */}
                  <Icon path={ROLE_ICONS[r]} size={22} className="h-[22px] w-[22px] sm:h-8 sm:w-8 lg:h-[38px] lg:w-[38px]" />
                </span>
                <span className="min-w-0 text-start text-sm font-bold leading-snug text-rdia-600 sm:text-center dark:text-rdia-50">{m.roles[r]}</span>
              </button>
            );
          })}
        </div>

        <button
          className="btn-primaire min-h-[44px] w-full max-w-xs text-sm"
          disabled={!picked || busy}
          onClick={() => picked && void confirm(picked)}
        >
          {busy ? "…" : m.users.rc_enter}
        </button>
      </div>
    </section>
  );
}
