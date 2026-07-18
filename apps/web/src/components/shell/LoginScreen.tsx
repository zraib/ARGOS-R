"use client";

import Image from "next/image";
import { useState, type KeyboardEvent } from "react";
import { useArgos, useDict, type Role } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { LanguageSwitch } from "@/components/shell/LanguageSwitch";
import { api, loadSessionContext, type LoginResult } from "@/lib/api";

/**
 * Porte d'authentification plein écran. La connexion passe EXCLUSIVEMENT par
 * l'API ARGOS (`POST /auth/login`, registre serveur) : matricule + code
 * temporaire ou mot de passe → jeton + état du cycle de vie. En production :
 * Keycloak OIDC + MFA (MASTER_PLAN §4.3).
 */
export function LoginScreen() {
  const t = useDict();
  const dark = useArgos((s) => s.dark);
  const toggleTheme = useArgos((s) => s.toggleTheme);
  const beginSession = useArgos((s) => s.beginSession);
  const setFlags = useArgos((s) => s.setFlags);
  const setRoleFeatures = useArgos((s) => s.setRoleFeatures);
  const showToast = useArgos((s) => s.showToast);
  const [user, setUser] = useState("k.benjelloun");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = !(user.trim() && pass) || busy;

  const submit = async () => {
    if (!(user.trim() && pass) || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.login({ matricule: user.trim(), password: pass });
      if (res.error || !res.data) {
        setError(t.lg_badpass);
        return;
      }
      const d = res.data as LoginResult;
      // Pose le jeton avant de charger le contexte (flags + fonctionnalités).
      beginSession({
        token: d.access_token,
        role: d.role as Role,
        sessionUser: { matricule: d.matricule, nom: d.nom, roles: d.roles as Role[], photo: d.photo },
        mustChangePassword: d.mustChangePassword,
        mustChooseRole: d.mustChooseRole,
      });
      const ctx = await loadSessionContext();
      if (ctx.flags) setFlags(ctx.flags);
      if (ctx.roleFeatures) setRoleFeatures(ctx.roleFeatures as Record<Role, Record<string, boolean>>);
      showToast(t.lg_toast);
    } catch {
      setError(t.lg_api_down);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void submit();
  };

  return (
    <section
      className="relative flex h-screen w-full items-center justify-center p-6"
      style={{
        // Fond thème-conscient : voile vert militaire sur sombre OU clair.
        background: dark
          ? "radial-gradient(ellipse at 32% 45%, rgb(27 77 46 / 0.6), transparent 60%), rgb(15 31 20)"
          : "radial-gradient(ellipse at 32% 45%, rgb(27 77 46 / 0.14), transparent 60%), rgb(243 244 246)",
      }}
    >
      {/* Bascule clair/sombre, disponible avant connexion */}
      <button
        onClick={toggleTheme}
        title="Mode"
        className="absolute top-4 rounded-lg p-2 text-gray-500 transition-colors hover:text-or-600 dark:text-rdia-200 dark:hover:text-or-400"
        style={{ insetInlineEnd: 16 }}
      >
        <Icon path={dark ? UI_ICONS.sun : UI_ICONS.moon} size={18} />
      </button>
      <div
        className="grid w-full animate-fade-in-up items-center gap-4"
        style={{
          maxWidth: 880,
          gridTemplateColumns: "minmax(320px, 400px) minmax(320px, 400px)",
          justifyContent: "center",
        }}
      >
        <div className="flex min-w-0 flex-col items-center gap-6">
          <Image
            src="/argos-logo.png"
            alt="ARGOS"
            width={320}
            height={360}
            priority
            className="w-full"
            style={{
              objectFit: "contain",
              maxWidth: 320,
              maxHeight: 360,
              filter: dark ? "drop-shadow(0 24px 48px rgba(0,0,0,0.55))" : "drop-shadow(0 16px 32px rgba(15,45,26,0.25))",
            }}
          />
          <div className="text-center">
            <div className="text-3xl font-bold tracking-wide text-rdia-600 dark:text-rdia-50">ARGOS</div>
            <div className="mt-2 text-xs uppercase tracking-wider text-or-600 dark:text-or-500">{t.appSub}</div>
          </div>
        </div>

        <div className="carte flex w-full flex-col items-center gap-5 p-8">
          <div className="text-center">
            <div className="text-lg font-bold text-rdia-600 dark:text-rdia-50">{t.lg_welcome}</div>
          </div>
          <div className="flex w-full items-center gap-2 rounded-lg bg-or-500/10 px-3 py-2">
            <Icon path={UI_ICONS.shield} size={14} className="shrink-0 text-or-500" />
            <span className="text-[11px] font-semibold text-or-500">{t.lg_restricted}</span>
          </div>
          <div className="flex w-full flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{t.lg_user}</label>
              <input className="input-champ text-sm" value={user} onChange={(e) => { setUser(e.target.value); setError(null); }} onKeyDown={onKey} autoComplete="username" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{t.lg_pass}</label>
              <input type="password" className="input-champ text-sm" value={pass} onChange={(e) => { setPass(e.target.value); setError(null); }} onKeyDown={onKey} autoComplete="current-password" />
            </div>
            {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
            <button className="btn-primaire mt-2 w-full text-sm" onClick={() => void submit()} disabled={disabled}>
              {busy ? "…" : t.lg_btn}
            </button>
          </div>
          <div className="w-full">
            <LanguageSwitch variant="login" />
          </div>
          <div className="text-center text-[10px] text-gray-400 dark:text-rdia-400">{t.lg_footer}</div>
        </div>
      </div>
    </section>
  );
}
