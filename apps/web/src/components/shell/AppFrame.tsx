"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useArgos, useModules, type Role } from "@/lib/store";
import { LIVE_SIM, SIM_INTERVAL } from "@/lib/config";
import { keyForPath } from "@/lib/nav";
import { api, getStoredToken, loadSessionContext } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { LoginScreen } from "@/components/shell/LoginScreen";
import { ChangePasswordScreen } from "@/components/shell/ChangePasswordScreen";
import { RoleChooserScreen } from "@/components/shell/RoleChooserScreen";
import { Sidebar } from "@/components/shell/Sidebar";
import { Header } from "@/components/shell/Header";
import { Toast } from "@/components/shell/Toast";
import { IncidentWizard } from "@/components/incidents/IncidentWizard";
import { QuakeAlert } from "@/components/flux/QuakeAlert";

/** Écran de blocage quand un module est désactivé par un feature flag. */
function DisabledNotice() {
  const m = useModules();
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="carte flex flex-col items-center gap-3 p-8 text-center" style={{ maxWidth: 420 }}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-400/15 text-gray-400">
          <Icon path={UI_ICONS.stub} size={22} />
        </div>
        <p className="text-sm text-gray-500 dark:text-rdia-300">{m.settings.module_disabled}</p>
      </div>
    </div>
  );
}

/**
 * Coquille cliente de premier niveau. Gère l'hydratation des préférences, la
 * boucle de simulation en direct, la direction RTL/police et la porte d'auth.
 * Chaque écran se rend dans <main> via le routage de Next (`children`).
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const authed = useArgos((s) => s.authed);
  const mustChangePassword = useArgos((s) => s.mustChangePassword);
  const mustChooseRole = useArgos((s) => s.mustChooseRole);
  const lang = useArgos((s) => s.lang);
  const flags = useArgos((s) => s.flags);
  const role = useArgos((s) => s.role);
  const roleFeatures = useArgos((s) => s.roleFeatures);
  const hydratePrefs = useArgos((s) => s.hydratePrefs);
  const setSession = useArgos((s) => s.setSession);
  const setFlags = useArgos((s) => s.setFlags);
  const setRoleFeatures = useArgos((s) => s.setRoleFeatures);
  const loadDomain = useArgos((s) => s.loadDomain);
  const simTick = useArgos((s) => s.simTick);
  const ready = authed && !mustChangePassword && !mustChooseRole;
  const pathname = usePathname();
  const moduleKey = keyForPath(pathname);
  // Module verrouillé si coupé globalement (flag) ou non autorisé pour le rôle actif.
  const moduleDisabled =
    moduleKey !== null && (flags[moduleKey] === false || roleFeatures[role]?.[moduleKey] === false);

  useEffect(() => {
    hydratePrefs();
    // Restaure la session API (rôle résolu serveur + flags + fonctionnalités)
    // depuis le jeton si présent — survit au rafraîchissement et à la nav dure.
    const token = getStoredToken();
    if (!token) return;
    api.me()
      .then((r) => {
        const resolved = (r.data as { role?: Role } | undefined)?.role;
        if (resolved) setSession(token, resolved);
      })
      .catch(() => {});
    loadSessionContext()
      .then((ctx) => {
        if (ctx.flags) setFlags(ctx.flags);
        if (ctx.roleFeatures) setRoleFeatures(ctx.roleFeatures as Record<Role, Record<string, boolean>>);
      })
      .catch(() => {});
  }, [hydratePrefs, setSession, setFlags, setRoleFeatures]);

  // Charge le domaine (incidents, unités, hôpitaux, fil) dès que la session est
  // prête — après le login comme après une restauration de session.
  useEffect(() => {
    if (ready) void loadDomain();
  }, [ready, loadDomain]);

  useEffect(() => {
    if (!LIVE_SIM) return;
    const id = setInterval(simTick, SIM_INTERVAL);
    return () => clearInterval(id);
  }, [simTick]);

  const dir = lang === "ar" ? "rtl" : "ltr";
  const fontCls = lang === "ar" ? "font-arabe" : "";

  if (!authed) {
    return (
      <div dir={dir} className={fontCls}>
        <LoginScreen />
        <Toast />
      </div>
    );
  }

  // Étapes post-login : changement du mot de passe temporaire, puis sélection
  // du rôle pour les comptes multi-rôles, avant l'accès à la plateforme.
  if (mustChangePassword) {
    return (
      <div dir={dir} className={fontCls}>
        <ChangePasswordScreen />
        <Toast />
      </div>
    );
  }
  if (mustChooseRole) {
    return (
      <div dir={dir} className={fontCls}>
        <RoleChooserScreen />
        <Toast />
      </div>
    );
  }

  return (
    <div
      dir={dir}
      className={`flex h-screen w-full overflow-hidden bg-gray-100 font-sans text-gray-800 dark:bg-rdia-900 dark:text-rdia-50 ${fontCls}`}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{moduleDisabled ? <DisabledNotice /> : children}</main>
      </div>
      <IncidentWizard />
      <QuakeAlert />
      <Toast />
    </div>
  );
}
