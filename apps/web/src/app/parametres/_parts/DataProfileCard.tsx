"use client";

import { useCallback, useEffect, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api, apiBase } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { UI_ICONS } from "@/lib/icons";

// ============================================================================
// Paramètres › Profil de données (ADR 0015)
//
// Ce que la station SERT : « démonstration » (le jeu d'exemple est reconstruit
// au démarrage) ou « station vide » (seuls restent les référentiels et ce que
// les opérateurs créent). Le profil se règle par `DATA_PROFILE` côté serveur ;
// cet écran le LIT, montre le volume du domaine et ce qu'il reste de graines,
// et offre le geste qui fait d'une station de démonstration une station en
// service : la remise à zéro, signée par le mot de passe du Super
// Administrateur. Le réseau hospitalier, les comptes et la base restent.
// ============================================================================

type AppMode = "demo" | "exercise" | "operational";

interface Volume {
  profile: "demo" | "empty";
  /** Mode en service et mode demandé (appliqué au redémarrage), ADR 0016. */
  mode: AppMode;
  pending: AppMode | null;
  counts: Record<string, number>;
  seededLeft: number;
}

const MODES: AppMode[] = ["demo", "exercise", "operational"];

const COUNT_KEYS = ["incidents", "units", "shelters", "morgues", "hospitals", "mortuaryRecords", "victims", "equipment", "posts"] as const;
type CountKey = (typeof COUNT_KEYS)[number];

export function DataProfileCard() {
  const t = useDict();
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  // Les libellés des compteurs : ceux des écrans que ces collections nourrissent.
  const countLabel: Record<CountKey, string> = {
    incidents: t.nav_inc, units: t.lg_units, shelters: t.lg_shelters, morgues: t.lg_morgues, hospitals: t.lg_hosp,
    mortuaryRecords: m.morgue.bodies, victims: t.wz_casualties, equipment: t.equipment, posts: t.lg_posts,
  };
  const loadDomain = useArgos((s) => s.loadDomain);
  const [vol, setVol] = useState<Volume | null>(null);
  const [password, setPassword] = useState("");
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Changement de mode (ADR 0016) : choix, signature, puis attente du redémarrage.
  const [modePick, setModePick] = useState<AppMode | null>(null);
  const [modePassword, setModePassword] = useState("");
  const [modeBusy, setModeBusy] = useState(false);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const modeLabel = (mo: AppMode) => ({ demo: t.mode_demo, exercise: t.mode_exercise, operational: t.mode_operational }[mo]);
  const modeHint = (mo: AppMode) => ({ demo: t.md_hint_demo, exercise: t.md_hint_exercise, operational: t.md_hint_operational }[mo]);

  const applyMode = async () => {
    if (!modePick || !modePassword || modeBusy) return;
    setModeBusy(true);
    setModeError(null);
    const res = await api.setMode(modePick, modePassword);
    if (res.error) {
      const msg = (res.error as { message?: string | string[] }).message;
      setModeError(Array.isArray(msg) ? msg.join(" · ") : (msg ?? t.md_failed));
      setModeBusy(false);
      return;
    }
    const out = res.data as { mode: AppMode; restarting: boolean } | undefined;
    setModePassword("");
    if (out?.restarting) {
      setModeNotice(t.md_restarting);
      // L'API s'arrête et renaît : on attend qu'elle réponde dans le nouveau
      // mode, puis on recharge la page pour repartir sur des données propres.
      const target = out.mode;
      const started = Date.now();
      const poll = async () => {
        try {
          const h = await fetch(`${apiBase()}/api/health`, { cache: "no-store" });
          const j = (await h.json()) as { appMode?: string };
          if (j.appMode === target) { window.location.reload(); return; }
        } catch { /* pas encore revenue */ }
        if (Date.now() - started < 120_000) setTimeout(() => void poll(), 3_000);
        else setModeBusy(false);
      };
      setTimeout(() => void poll(), 4_000);
    } else {
      setModeNotice(t.md_manual);
      setModeBusy(false);
      void load();
    }
  };

  const load = useCallback(async () => {
    const res = await api.getDataProfile();
    if (res.data) setVol(res.data as unknown as Volume);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const purge = async () => {
    if (!password || busy) return;
    setBusy(true);
    setErreur(null);
    const res = await api.purgeDomain(password);
    if (res.error) {
      const msg = (res.error as { message?: string | string[] }).message;
      setErreur(Array.isArray(msg) ? msg.join(" · ") : (msg ?? t.dp_purge_failed));
      setBusy(false);
      return;
    }
    const removed = (res.data as { removed?: number } | undefined)?.removed ?? 0;
    showToast(t.dp_purge_done.replace("{removed}", String(removed)));
    setPassword("");
    setArming(false);
    setBusy(false);
    void loadDomain({ ai: false });
    void load();
  };

  return (
    <div className="carte flex flex-col gap-4 p-4 sm:p-5">
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
          <Icon path={UI_ICONS.sliders} size={16} className="shrink-0 text-or-500" />
          {t.dp_title}
          {vol && <Pill tone={vol.profile === "empty" ? "green" : "amber"} label={vol.profile === "empty" ? t.dp_profile_empty : t.dp_profile_demo} />}
        </h3>
        <p className="mt-0.5 text-xs text-gray-400 sm:text-[11px] dark:text-rdia-400">{t.dp_hint}</p>
      </div>

      {vol && (
        <>
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.dp_counts}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {COUNT_KEYS.map((k) => (
                <div key={k} className="rounded-lg border border-gray-100 px-2.5 py-2 dark:border-rdia-700/50">
                  <div className="text-lg font-bold tabular-nums text-rdia-600 dark:text-rdia-50">{vol.counts[k] ?? 0}</div>
                  <div className="truncate text-[10px] text-gray-500 dark:text-rdia-300" title={countLabel[k]}>{countLabel[k]}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-rdia-300">{t.dp_seeded_left}</span>
            <span className={`font-semibold tabular-nums ${vol.seededLeft > 0 ? "text-or-500" : "text-green-600"}`}>{vol.seededLeft}</span>
          </div>
        </>
      )}

      {/* --- mode de la station (ADR 0016) ----------------------------------- */}
      <div className="rounded-lg border border-or-500/30 bg-or-500/5 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-or-600 dark:text-or-400">{t.md_title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-rdia-300">{t.md_hint}</p>
          </div>
          {vol && <Pill tone={vol.mode === "operational" ? "green" : "amber"} label={`${t.md_current} : ${modeLabel(vol.mode)}`} />}
        </div>
        {vol?.pending && <p className="mt-2 text-[11px] font-semibold text-or-500">{t.md_pending.replace("{mode}", modeLabel(vol.pending))}</p>}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODES.map((mo) => {
            const on = (modePick ?? vol?.mode) === mo;
            return (
              <button key={mo} type="button" onClick={() => setModePick(mo)} aria-pressed={on} disabled={modeBusy}
                className={`cible-tactile rounded-lg border p-3 text-start transition-colors ${on ? "border-or-500 bg-or-500/15" : "border-gray-200 hover:border-or-400 dark:border-rdia-600"}`}>
                <div className="text-sm font-semibold text-gray-800 dark:text-rdia-50">{modeLabel(mo)}</div>
                <div className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-rdia-300">{modeHint(mo)}</div>
              </button>
            );
          })}
        </div>
        {modePick && modePick !== vol?.mode && (
          <form className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void applyMode(); }}>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold text-gray-600 dark:text-rdia-200">
              {t.md_password}
              <input type="password" autoComplete="current-password" value={modePassword} onChange={(e) => setModePassword(e.target.value)} disabled={modeBusy} className="input-champ text-base md:text-sm" />
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn-secondaire cible-tactile text-xs" onClick={() => { setModePick(null); setModePassword(""); setModeError(null); }} disabled={modeBusy}>{t.cancel}</button>
              <button type="submit" disabled={!modePassword || modeBusy} className="btn-primaire cible-tactile inline-flex items-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                {modeBusy && <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-rdia-600/30 border-t-rdia-600 motion-reduce:animate-none" />}
                {t.md_confirm}
              </button>
            </div>
          </form>
        )}
        {modeNotice && <p role="status" className="mt-2 rounded-lg border border-or-500/30 bg-or-500/10 px-3 py-2 text-[12px] font-semibold text-or-600 dark:text-or-400">{modeNotice}</p>}
        {modeError && <p role="alert" className="mt-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-[12px] font-semibold text-danger-500">{modeError}</p>}
      </div>

      {/* --- remise à zéro : armée, puis signée ------------------------------ */}
      <div className="rounded-lg border border-danger-500/30 bg-danger-500/5 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-danger-600 dark:text-danger-400">{t.dp_purge}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-rdia-300">{t.dp_purge_hint}</p>
          </div>
          {!arming && (
            <button type="button" onClick={() => setArming(true)} className="cible-tactile shrink-0 rounded-lg border border-danger-500/40 px-3 py-1.5 text-xs font-semibold text-danger-500 hover:bg-danger-500/10">
              {t.dp_purge}
            </button>
          )}
        </div>
        {arming && (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => { e.preventDefault(); void purge(); }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold text-gray-600 dark:text-rdia-200">
              {t.dp_purge_password}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="input-champ text-base md:text-sm"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn-secondaire cible-tactile text-xs" onClick={() => { setArming(false); setPassword(""); setErreur(null); }} disabled={busy}>
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={!password || busy}
                className="cible-tactile inline-flex items-center gap-2 rounded-lg bg-danger-600 px-4 text-xs font-semibold text-white hover:bg-danger-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy && <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" />}
                {t.dp_purge_confirm}
              </button>
            </div>
          </form>
        )}
        {erreur && (
          <p role="alert" className="mt-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-[12px] font-semibold text-danger-500">
            {erreur}
          </p>
        )}
      </div>
    </div>
  );
}
