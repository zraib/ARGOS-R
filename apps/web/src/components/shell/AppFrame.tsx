"use client";

import { useEffect, type ReactNode } from "react";
import { warmModel } from "@/lib/ai/provider";
import { AI_ENABLED, resolveProvider, aiSystemPrompt } from "@/lib/ai/config";
import { usePathname } from "next/navigation";
import { useArgos, useModules, type Role } from "@/lib/store";
import { LIVE_SIM, SIM_INTERVAL } from "@/lib/config";
import { keyForPath, moduleOpen } from "@/lib/nav";
import { api, getStoredToken, loadSessionContext } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { LoginScreen } from "@/components/shell/LoginScreen";
import { ChangePasswordScreen } from "@/components/shell/ChangePasswordScreen";
import { RoleChooserScreen } from "@/components/shell/RoleChooserScreen";
import { Sidebar } from "@/components/shell/Sidebar";
import { Header } from "@/components/shell/Header";
import { Toast } from "@/components/shell/Toast";
import { Copilot } from "@/components/shell/Copilot";
import { ChatDock } from "@/components/shell/chat/ChatDock";
import { primeAudio } from "@/lib/sound";
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
  const applySessionContext = useArgos((s) => s.applySessionContext);
  const loadDomain = useArgos((s) => s.loadDomain);
  const rtConnect = useArgos((s) => s.rtConnect);
  const rtDisconnect = useArgos((s) => s.rtDisconnect);
  const simTick = useArgos((s) => s.simTick);
  const toggleCopilot = useArgos((s) => s.toggleCopilot);
  const navOpen = useArgos((s) => s.navOpen);
  const closeNav = useArgos((s) => s.closeNav);
  const myModules = useArgos((s) => s.myModules);
  const aiVisible = moduleOpen("assistant", flags, roleFeatures[role], myModules);
  // Le dock des conversations suit le module de communication : coupé
  // globalement, pour le rôle ou pour le compte, il disparaît avec lui.
  const commsVisible = moduleOpen("comms", flags, roleFeatures[role], myModules);
  const ready = authed && !mustChangePassword && !mustChooseRole;
  const pathname = usePathname();
  const moduleKey = keyForPath(pathname);
  // Module verrouillé si coupé globalement (flag) ou non autorisé pour le rôle actif.
  const moduleDisabled = moduleKey !== null && !moduleOpen(moduleKey, flags, roleFeatures[role], myModules);

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
        applySessionContext(ctx);
      })
      .catch(() => {});
  }, [hydratePrefs, setSession, applySessionContext]);

  // Charge le domaine (incidents, unités, hôpitaux, fil) dès que la session est
  // prête — après le login comme après une restauration de session.
  useEffect(() => {
    if (!ready) return;
    void loadDomain();
    // PRÉCHAUFFAGE DU MODÈLE, dès la session ouverte. Mesuré ici : le premier
    // appel à froid coûtait ~80 s (chargement de 23 Go) + ~1 s de consigne
    // système ; réchauffer maintenant, avec la vraie consigne, met les deux en
    // cache avant que l'opérateur ait posé sa première question. Appel perdu,
    // jamais affiché, sans effet s'il échoue. Uniquement pour un runtime LOCAL :
    // on ne réveille pas un service qu'on ne possède pas.
    if (AI_ENABLED) {
      const st = useArgos.getState();
      const cfg = resolveProvider(st.aiSettings);
      if (cfg.local) void warmModel(cfg, aiSystemPrompt(st.lang, st.aiSettings.systemPrompt));
    }
  }, [ready, loadDomain]);

  // Les signatures sonores s'amorcent au premier geste : sans cela le premier
  // message reçu après le chargement restait muet.
  useEffect(() => {
    if (ready) primeAudio();
  }, [ready]);

  // Flux temps réel : ouvert avec la session, fermé avec elle. C'est CE FLUX
  // qui fait la présence — un compte est en ligne tant qu'il est ouvert. Le
  // brancher ici plutôt que sur l'écran de communication est délibéré : la
  // cloche doit compter les messages même quand on regarde la carte, et un
  // officier reste joignable où qu'il soit dans l'application.
  useEffect(() => {
    if (!ready) return;
    rtConnect();
    return () => rtDisconnect();
  }, [ready, rtConnect, rtDisconnect]);

  // Boucles ouvertes : effet PROPRE, lié à la session et non à la simulation.
  // Les greffer sur le tick de simulation les aurait éteintes avec elle —
  // or un ordre reçu doit apparaître même simulation coupée (ADR 0007, P1-b).
  // Pas de WebSocket ni de dépendance nouvelle ; EMQX prendra le relais en
  // production sans changer le contrat de `/missions/inbox`.
  useEffect(() => {
    if (!ready) return;
    void useArgos.getState().loadMissions();
    // Posture nationale + comptes rendus manquants (lot P3).
    void useArgos.getState().loadPosture();
    const missionsId = setInterval(() => {
      void useArgos.getState().loadMissions();
      void useArgos.getState().loadPosture();
    }, 15_000);
    return () => clearInterval(missionsId);
  }, [ready]);

  // Simulation d'activité (fil fictif, mouvements) : seulement si le build
  // l'autorise ET que l'API sert le profil « demo » (ADR 0015).
  const dataProfile = useArgos((s) => s.dataProfile);
  useEffect(() => {
    if (!LIVE_SIM || dataProfile !== "demo") return;
    const id = setInterval(simTick, SIM_INTERVAL);
    return () => clearInterval(id);
  }, [simTick, dataProfile]);

  // Raccourci global ⌘K / Ctrl+K → ouvre/ferme le Copilot si le module est visible.
  useEffect(() => {
    if (!ready || !aiVisible) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCopilot();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, aiVisible, toggleCopilot]);

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
      // `h-dvh` et non `h-screen` : sur mobile la barre d'adresse se rétracte et
      // `100vh` déborde alors de l'écran, coupant le bas de la page.
      className={`flex h-dvh w-full overflow-hidden bg-gray-100 font-sans text-gray-800 dark:bg-rdia-900 dark:text-rdia-50 ${fontCls}`}
    >
      <Sidebar />
      {/* Voile du tiroir mobile : assombrit le contenu et le referme au toucher.
          Absent au clavier de la navigation (aria-hidden) car le tiroir offre
          déjà sa propre fermeture. */}
      {navOpen && (
        <div
          onClick={closeNav}
          aria-hidden
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] lg:hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        {/* Marges resserrées sur mobile : 24 px de gouttière sur un écran de
            375 px amputerait le contenu de 13 %. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4 lg:p-6">
          {moduleDisabled ? <DisabledNotice /> : children}
        </main>
      </div>
      <IncidentWizard />
      <QuakeAlert />
      <Toast />
      {commsVisible && <ChatDock besideCopilot={aiVisible} />}
      {aiVisible && <Copilot />}
    </div>
  );
}
