"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent } from "react";
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
  const [user, setUser] = useState("m.zraib");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // « Mot de passe oublié » : fermé, ouvert (explication + envoi), ou envoyé.
  const [forgot, setForgot] = useState<"closed" | "open" | "sent">("closed");
  const [busyForgot, setBusyForgot] = useState(false);

  // Les gestionnaires de mots de passe remplissent le DOM SANS déclencher
  // onChange : l'état React restait vide et le bouton restait verrouillé alors
  // que les champs semblaient remplis. Le bouton n'est donc plus conditionné au
  // contenu ; la validation lit les valeurs réelles du DOM à la soumission.
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const disabled = busy;

  const submit = async () => {
    if (busy) return;
    const u = (userRef.current?.value ?? user).trim();
    const p = passRef.current?.value ?? pass;
    if (!u || !p) {
      setError(t.lg_fill);
      return;
    }
    // Resynchronise l'état avec ce que l'opérateur voit réellement.
    setUser(u);
    setPass(p);
    setError(null);
    setBusy(true);
    try {
      const res = await api.login({ matricule: u, password: p });
      if (res.error || !res.data) {
        // 429 : la borne des échecs de l'API (dix par compte et par quart d'heure) — dire d'attendre, pas « incorrect ».
        setError(res.response?.status === 429 ? t.lg_too_many : t.lg_badpass);
        return;
      }
      const d = res.data as LoginResult;
      // Pose le jeton avant de charger le contexte (flags + fonctionnalités).
      beginSession({
        token: d.access_token,
        role: d.role as Role,
        sessionUser: { matricule: d.matricule, nom: d.nom, roles: d.roles as Role[], photo: d.photo, assignments: d.assignments },
        mustChangePassword: d.mustChangePassword,
        mustChooseRole: d.mustChooseRole,
      });
      const ctx = await loadSessionContext();
      if (ctx.flags) setFlags(ctx.flags);
      if (ctx.roleFeatures) setRoleFeatures(ctx.roleFeatures as Record<Role, Record<string, boolean>>);
      showToast(t.lg_toast);
    } catch (e) {
      // Trace développeur : sans elle, toute exception (réseau, code, URL) se
      // déguise en « API injoignable » et devient indiagnosticable.
      console.error("[connexion]", e);
      setError(t.lg_api_down);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void submit();
  };

  /**
   * Demande un code provisoire à l'administration, pour le nom d'utilisateur
   * saisi. La réponse de l'API est la même que le compte existe ou non : ce
   * que l'écran affiche ensuite ne révèle rien non plus.
   */
  const askReset = async () => {
    if (busyForgot) return;
    const u = (userRef.current?.value ?? user).trim();
    if (!u) {
      setError(t.lg_fill);
      return;
    }
    setError(null);
    setBusyForgot(true);
    try {
      const res = await api.requestPasswordReset(u);
      if (res.error) {
        setError(t.lg_api_down);
        return;
      }
      setForgot("sent");
    } catch (e) {
      console.error("[mot de passe oublié]", e);
      setError(t.lg_api_down);
    } finally {
      setBusyForgot(false);
    }
  };

  // Champ de saisie : 16 px sur mobile (sous 16 px, iOS zoome au focus et décale
  // toute la page), densité d'origine à partir de md. Hauteur ≥ 44 px au doigt.
  const champCls = "input-champ text-base md:text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  return (
    <section
      // `min-h-dvh` et non `h-screen` : sur mobile la barre d'adresse se rétracte,
      // `100vh` déborde alors de l'écran et coupe le bas de la carte. Le centrage
      // vertical se fait par `my-auto` sur l'enfant (et non `items-center`) :
      // ainsi, sur un écran court, le haut de la carte reste atteignable.
      className="relative flex min-h-dvh w-full flex-col items-center p-3 sm:p-6"
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
        className="cible-tactile absolute end-2 top-2 flex items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:text-or-600 sm:end-4 sm:top-4 dark:text-rdia-200 dark:hover:text-or-400"
      >
        <Icon path={dark ? UI_ICONS.sun : UI_ICONS.moon} size={18} />
      </button>

      {/* Mobile : une seule colonne (identité au-dessus, formulaire dessous).
          À partir de lg seulement il y a la place pour les deux côte à côte. */}
      <div className="my-auto grid w-full max-w-[880px] animate-fade-in-up items-center justify-items-center gap-6 lg:grid-cols-2 lg:gap-4">
        <div className="flex w-full min-w-0 max-w-sm flex-col items-center gap-4 sm:gap-6">
          <Image
            src="/iris-logo.png"
            alt="IRIS — Forces Armées Royales"
            width={320}
            height={320}
            priority
            // Le logo se réduit avec l'écran plutôt que d'imposer 320 px de large.
            className="h-auto w-32 max-w-full object-contain sm:w-44 lg:w-full lg:max-w-[320px]"
            style={{
              filter: dark ? "drop-shadow(0 24px 48px rgba(0,0,0,0.55))" : "drop-shadow(0 16px 32px rgba(15,45,26,0.25))",
            }}
          />
          <div className="text-center">
            <div className="text-2xl font-bold tracking-wide text-rdia-600 sm:text-3xl dark:text-rdia-50">{t.app}</div>
            <div className="mt-2 text-xs uppercase tracking-wider text-or-600 dark:text-or-500">{t.appSub}</div>
          </div>
        </div>

        <div className="carte flex w-full max-w-sm flex-col items-center gap-4 p-5 sm:gap-5 sm:p-8">
          <div className="text-center">
            <div className="text-lg font-bold text-rdia-600 dark:text-rdia-50">{t.lg_welcome}</div>
          </div>
          <div className="flex w-full items-center gap-2 rounded-lg bg-or-500/10 px-3 py-2">
            <Icon path={UI_ICONS.shield} size={14} className="shrink-0 text-or-500" />
            <span className="min-w-0 text-[11px] font-semibold text-or-500">{t.lg_restricted}</span>
          </div>
          <div className="flex w-full flex-col gap-3">
            <div>
              <label className={labelCls}>{t.lg_user}</label>
              <input ref={userRef} className={champCls} value={user} onChange={(e) => { setUser(e.target.value); setError(null); }} onKeyDown={onKey} autoComplete="username" />
            </div>
            <div>
              <label className={labelCls}>{t.lg_pass}</label>
              <input ref={passRef} type="password" className={champCls} value={pass} onChange={(e) => { setPass(e.target.value); setError(null); }} onKeyDown={onKey} autoComplete="current-password" />
            </div>
            {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
            <button className="btn-primaire mt-2 min-h-[44px] w-full text-sm" onClick={() => void submit()} disabled={disabled}>
              {busy ? "…" : t.lg_btn}
            </button>
            {/* Mot de passe oublié : pas d'e-mail ni de lien secret sur un réseau
                isolé — la demande part à l'administration, qui remet un code
                provisoire par la voie hiérarchique. Le nom d'utilisateur est
                celui du champ ci-dessus. */}
            {forgot === "closed" ? (
              <button
                type="button"
                className="min-h-[44px] self-center text-[11.5px] font-semibold text-gray-500 underline-offset-2 hover:text-or-500 hover:underline lg:min-h-0 dark:text-rdia-300"
                onClick={() => { setForgot("open"); setError(null); }}
              >
                {t.lg_forgot}
              </button>
            ) : (
              <div
                className="flex flex-col gap-2 rounded-lg border border-or-500/40 bg-or-500/10 p-3 animate-fade-in"
                role={forgot === "sent" ? "status" : undefined}
              >
                <p className="flex items-start gap-2 text-[11.5px] leading-snug text-gray-600 dark:text-rdia-200">
                  <Icon path={forgot === "sent" ? UI_ICONS.check : UI_ICONS.key} size={14} className="mt-0.5 shrink-0 text-or-500" />
                  <span>{forgot === "sent" ? t.lg_forgot_sent : t.lg_forgot_hint}</span>
                </p>
                {forgot === "open" && (
                  <button className="btn-secondaire min-h-[44px] w-full text-sm" onClick={() => void askReset()} disabled={busyForgot}>
                    {busyForgot ? "…" : t.lg_forgot_send}
                  </button>
                )}
                <button
                  type="button"
                  className="min-h-[44px] self-center text-[11.5px] font-semibold text-gray-500 hover:text-or-500 lg:min-h-0 dark:text-rdia-300"
                  onClick={() => setForgot("closed")}
                >
                  {t.lg_forgot_back}
                </button>
              </div>
            )}
          </div>
          {/* Les trois boutons de langue sont des cibles tactiles : on impose la
              hauteur depuis le parent, le composant restant partagé avec la
              barre latérale (densité d'origine à partir de lg). */}
          <div className="w-full [&_button]:min-h-[44px] lg:[&_button]:min-h-0">
            <LanguageSwitch variant="login" />
          </div>
          <div className="text-center text-[10px] text-gray-400 dark:text-rdia-400">{t.lg_footer}</div>
        </div>
      </div>
    </section>
  );
}
