"use client";

import { useCallback, useEffect, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { UI_ICONS, NAV_ICONS, INCIDENT_ICON_CHOICES } from "@/lib/icons";
import { FLAGGABLE_KEYS, navLabel } from "@/lib/nav";
import { AI_PROVIDERS, AI_DEFAULT_SETTINGS, resolveProvider, type LlmProviderId } from "@/lib/ai/config";
import { probeProvider, listModels } from "@/lib/ai/provider";
import { api } from "@/lib/api";
import type { AuthorityContact, SeismicAlertConfig, SeismicNotification } from "@/lib/types";

interface AuditRow {
  seq: number;
  ts: string;
  actor: string;
  role: string;
  method: string;
  path: string;
  hash: string;
}

type DetectStatus = "idle" | "checking" | "online" | "offline";

export default function ParametresPage() {
  const t = useDict();
  const m = useModules();
  const role = useArgos((s) => s.role);
  const aiSettings = useArgos((s) => s.aiSettings);
  const setAiSettings = useArgos((s) => s.setAiSettings);
  const flags = useArgos((s) => s.flags);
  const setFlag = useArgos((s) => s.setFlag);
  const setFlags = useArgos((s) => s.setFlags);
  const apiConnected = useArgos((s) => s.apiConnected);

  const [status, setStatus] = useState<DetectStatus>("idle");
  const [models, setModels] = useState<string[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [chain, setChain] = useState<{ valid: boolean; count: number } | null>(null);
  // Navigation par section (rail à gauche + panneau à droite) plutôt qu'un mur
  // de cartes : on ne voit que la rubrique sélectionnée.
  const [tab, setTab] = useState<"ai" | "types" | "flags" | "seis" | "audit">("ai");

  // Synchronise les flags et le journal d'audit avec l'API (si session API).
  const loadAudit = useCallback(async () => {
    if (!apiConnected) return;
    try {
      const a = await api.getAudit(6);
      if (a.data) setAudit(a.data as unknown as AuditRow[]);
      const v = await api.verifyAudit();
      if (v.data) setChain(v.data as unknown as { valid: boolean; count: number });
    } catch {
      /* API indisponible */
    }
  }, [apiConnected]);

  useEffect(() => {
    if (!apiConnected) return;
    api.getFlags().then((r) => r.data && setFlags(r.data as Record<string, boolean>)).catch(() => {});
    loadAudit();
  }, [apiConnected, setFlags, loadAudit]);

  const toggleFlag = async (key: string, on: boolean) => {
    if (apiConnected) {
      try {
        const res = await api.setFlag(key, !on);
        if (res.data) {
          setFlags(res.data as Record<string, boolean>);
          void loadAudit();
          return;
        }
      } catch {
        /* repli local */
      }
    }
    setFlag(key, !on);
  };

  const detect = useCallback(async () => {
    setStatus("checking");
    setModels([]);
    const cfg = resolveProvider(useArgos.getState().aiSettings);
    const ok = await probeProvider(cfg);
    if (!ok) {
      setStatus("offline");
      return;
    }
    setStatus("online");
    const list = await listModels(cfg);
    setModels(list);
    // Si aucun modèle saisi n'existe, on aligne sur le premier détecté.
    const cur = useArgos.getState().aiSettings.model;
    if (list.length > 0 && !list.includes(cur)) setAiSettings({ model: list[0] });
  }, [setAiSettings]);

  useEffect(() => {
    detect();
  }, [detect]);

  // Accès refusé (défense en profondeur — l'entrée de menu est déjà masquée).
  if (role !== "superadmin") {
    // Hauteur en `dvh` et non `vh` : la barre d'adresse mobile fausse `vh`.
    return (
      <section className="flex min-h-[60dvh] animate-fade-in items-center justify-center">
        <div className="carte flex w-full max-w-[420px] flex-col items-center gap-3 p-6 text-center sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-500/10 text-danger-500">
            <Icon path={UI_ICONS.shield} size={22} />
          </div>
          <h2 className="text-base font-bold text-rdia-600 dark:text-rdia-50">{t.nav_settings}</h2>
          <p className="text-sm text-gray-500 dark:text-rdia-300">{m.settings.reserved}</p>
        </div>
      </section>
    );
  }

  const statusPill =
    status === "online"
      ? { tone: "green" as const, label: m.settings.status_connected }
      : status === "offline"
        ? { tone: "amber" as const, label: m.settings.status_offline }
        : { tone: "gray" as const, label: m.settings.status_checking };

  const changeProvider = (id: LlmProviderId) => {
    const base = AI_PROVIDERS[id];
    setAiSettings({ providerId: id, endpoint: base.endpoint, model: base.model });
    setModels([]);
    setStatus("idle");
  };

  // 16 px sur mobile (sous ce seuil iOS zoome au focus et décale la page),
  // densité d'origine à partir de `md`.
  const inputCls = "input-champ text-base md:text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  // Rubriques du rail de navigation (l'audit n'apparaît qu'avec une session API).
  const sections: { id: typeof tab; label: string; icon: string; hidden?: boolean }[] = [
    { id: "ai", label: m.settings.ai_title, icon: NAV_ICONS.assistant },
    { id: "types", label: m.settings.types_title, icon: NAV_ICONS.incidents },
    { id: "flags", label: m.settings.flags_title, icon: NAV_ICONS.dashboard },
    { id: "seis", label: m.settings.seis_title, icon: NAV_ICONS.seismic, hidden: !apiConnected },
    { id: "audit", label: m.settings.audit_title, icon: NAV_ICONS.reports, hidden: !apiConnected },
  ];
  const activeTab = (tab === "audit" || tab === "seis") && !apiConnected ? "ai" : tab;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* En-tête pleine largeur — le badge passe à la ligne s'il ne tient pas. */}
      <div className="carte flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
          <Icon path={NAV_ICONS.settings} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{t.nav_settings}</h2>
          <p className="truncate text-xs text-gray-500 dark:text-rdia-300">{m.settings.reserved}</p>
        </div>
        <span className="shrink-0 rounded-md bg-or-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-or-500">{m.roles.superadmin}</span>
      </div>

      {/* Disposition « réglages » : rail de rubriques à gauche, contenu à droite.
          Sur mobile, le rail devient une barre horizontale défilante. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[224px_1fr]">
        {/* Rail de navigation des rubriques */}
        <nav className="carte flex flex-row gap-1 overflow-x-auto p-2 lg:sticky lg:top-6 lg:flex-col">
          {sections.filter((s) => !s.hidden).map((s) => {
            const on = activeTab === s.id;
            // `min-h-11` : 44 px de cible tactile sous `lg`, densité d'origine au-dessus.
            return (
              <button
                key={s.id}
                onClick={() => setTab(s.id)}
                aria-current={on}
                className={`flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-start text-sm font-medium transition-colors lg:min-h-0 ${
                  on
                    ? "bg-or-500/15 text-or-600 dark:text-or-400"
                    : "text-gray-500 hover:bg-gray-100 hover:text-or-500 dark:text-rdia-300 dark:hover:bg-rdia-700/50"
                }`}
              >
                <Icon path={s.icon} size={16} className="shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Panneau : seule la rubrique active est rendue */}
        <div className="min-w-0">

      {/* Section : Assistant IA / LLM */}
      {activeTab === "ai" && (
      <div className="carte flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
            <Icon path={NAV_ICONS.assistant} size={16} className="shrink-0 text-or-500" />
            <span className="min-w-0 truncate">{m.settings.ai_title}</span>
          </h3>
          <Pill tone={statusPill.tone} label={statusPill.label} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{m.settings.provider}</label>
            <select className={inputCls} value={aiSettings.providerId} onChange={(e) => changeProvider(e.target.value as LlmProviderId)}>
              {(Object.keys(AI_PROVIDERS) as LlmProviderId[]).map((id) => (
                <option key={id} value={id}>{AI_PROVIDERS[id].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.settings.endpoint}</label>
            <input className={`${inputCls} font-mono`} value={aiSettings.endpoint} onChange={(e) => setAiSettings({ endpoint: e.target.value })} spellCheck={false} />
          </div>
        </div>

        <div>
          <label className={labelCls}>{m.settings.model}</label>
          {/* Empilé sur mobile : côte à côte, le champ de modèle descendrait
              sous une largeur utilisable à 375 px. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {models.length > 0 ? (
              // Liste déroulante des modèles détectés — le tag courant reste
              // sélectionnable même s'il a disparu du point d'accès.
              <select
                className={`${inputCls} min-w-0 font-mono`}
                value={aiSettings.model}
                onChange={(e) => setAiSettings({ model: e.target.value })}
              >
                {!models.includes(aiSettings.model) && <option value={aiSettings.model}>{aiSettings.model}</option>}
                {models.map((mo) => (
                  <option key={mo} value={mo}>{mo}</option>
                ))}
              </select>
            ) : (
              <input className={`${inputCls} min-w-0 font-mono`} value={aiSettings.model} onChange={(e) => setAiSettings({ model: e.target.value })} placeholder={m.settings.model_ph} spellCheck={false} />
            )}
            <button className="btn-secondaire cible-tactile w-full shrink-0 text-xs sm:w-auto" onClick={detect} disabled={status === "checking"}>
              {m.settings.detect}
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-gray-400 dark:text-rdia-400">
            {models.length > 0 ? `${models.length} ${m.settings.llm_model_list_hint}` : m.settings.llm_model_manual}
          </p>
        </div>

        {/* Température : bornée à la saisie (0–2), défaut opérationnel 0,2. */}
        <div className="sm:max-w-xs">
          <label className={labelCls} htmlFor="llm-temp">{m.settings.llm_temp}</label>
          <input
            id="llm-temp"
            type="number"
            inputMode="decimal"
            min={0}
            max={2}
            step={0.1}
            className={`${inputCls} font-mono`}
            value={aiSettings.temperature ?? 0.2}
            onChange={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              setAiSettings({ temperature: v === undefined || Number.isNaN(v) ? undefined : Math.min(2, Math.max(0, v)) });
            }}
          />
          <p className="mt-1 text-[11px] leading-snug text-gray-400 dark:text-rdia-400">{m.settings.llm_temp_hint}</p>
        </div>

        {/* Prompt système : vide = prompt ARGOS par défaut (règles de sécurité). */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className={labelCls} htmlFor="llm-sysprompt">{m.settings.llm_sysprompt}</label>
            {(aiSettings.systemPrompt ?? "") !== "" && (
              <button
                className="cible-tactile inline-flex items-center justify-center rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:text-or-500 dark:text-rdia-400"
                onClick={() => setAiSettings({ systemPrompt: undefined })}
              >
                {m.settings.llm_sysprompt_reset}
              </button>
            )}
          </div>
          <textarea
            id="llm-sysprompt"
            rows={5}
            className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
            value={aiSettings.systemPrompt ?? ""}
            onChange={(e) => setAiSettings({ systemPrompt: e.target.value || undefined })}
            spellCheck={false}
          />
          <p className="mt-1 text-[11px] leading-snug text-gray-400 dark:text-rdia-400">{m.settings.llm_sysprompt_hint}</p>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-or-500/10 px-3 py-2">
          <Icon path={UI_ICONS.shield} size={13} className="mt-0.5 shrink-0 text-or-500" />
          <span className="min-w-0 text-xs leading-snug text-or-600 sm:text-[11px] dark:text-or-300">{m.settings.note}</span>
        </div>

        <div className="flex justify-end">
          <button className="cible-tactile inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-or-500 dark:border-rdia-600 dark:text-rdia-300" onClick={() => { setAiSettings(AI_DEFAULT_SETTINGS); setStatus("idle"); setModels([]); }}>
            {m.settings.reset}
          </button>
        </div>
      </div>
      )}

      {/* Section : gestion des types d'incident (paramétrable) */}
      {activeTab === "types" && <IncidentTypesPanel />}

      {/* Section : alertes sismiques (seuils + autorités notifiées) */}
      {activeTab === "seis" && <SeismicAlertsPanel />}

      {/* Section : matrice de feature flags (§6.15) */}
      {activeTab === "flags" && (
      <div className="carte flex flex-col gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
            <Icon path={NAV_ICONS.dashboard} size={16} className="shrink-0 text-or-500" />
            {m.settings.flags_title}
            <Pill tone={apiConnected ? "green" : "gray"} label={apiConnected ? "API" : "local"} />
          </h3>
          <p className="mt-0.5 text-xs text-gray-400 sm:text-[11px] dark:text-rdia-400">{m.settings.flags_hint}</p>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
          {FLAGGABLE_KEYS.map((k) => {
            const on = flags[k] !== false;
            return (
              <button
                key={k}
                onClick={() => toggleFlag(k, on)}
                className="flex min-h-11 items-center justify-between gap-2 border-b border-gray-100 py-2 text-start text-sm transition-colors last:border-0 lg:min-h-0 dark:border-rdia-700/50"
              >
                <span className={`min-w-0 truncate ${on ? "text-gray-700 dark:text-rdia-100" : "text-gray-400 line-through dark:text-rdia-400"}`}>{navLabel(k, t)}</span>
                <span className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${on ? "bg-or-500" : "bg-gray-300 dark:bg-rdia-600"}`}>
                  {/* Propriété logique : en RTL le curseur doit glisser vers la gauche. */}
                  <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ insetInlineStart: on ? 18 : 2 }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Section : journal d'audit (depuis l'API, chaîné par hash) */}
      {activeTab === "audit" && apiConnected && (
        <div className="carte flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
              <Icon path={NAV_ICONS.reports} size={16} className="shrink-0 text-or-500" />
              {m.settings.audit_title}
              {chain && <Pill tone={chain.valid ? "green" : "red"} label={chain.valid ? `${m.settings.audit_intact} · ${chain.count}` : m.settings.audit_broken} />}
            </h3>
            <button className="cible-tactile inline-flex items-center text-xs font-semibold text-or-500 hover:underline sm:text-[11px]" onClick={() => void loadAudit()}>{m.settings.audit_refresh}</button>
          </div>
          {audit.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-rdia-400">{m.settings.audit_empty}</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100 dark:divide-rdia-700/50">
              {/* Entrée d'audit : une seule ligne dès `sm`. Sous ce seuil, le
                  hash passe à la ligne plutôt que d'être masqué — la trace doit
                  rester vérifiable au téléphone. */}
              {audit.map((e) => (
                <div key={e.seq} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-xs sm:gap-x-3 sm:py-1.5">
                  <span className="shrink-0 font-mono text-gray-400 dark:text-rdia-400">#{e.seq}</span>
                  <span className="w-14 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-gray-500 dark:bg-rdia-600 dark:text-rdia-200">{e.method}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-gray-600 dark:text-rdia-200">{e.path}</span>
                  <span className="min-w-0 max-w-[40%] truncate text-gray-400 dark:text-rdia-400">{e.actor}</span>
                  <span className="w-full shrink-0 truncate font-mono text-[11px] text-gray-300 sm:w-24 sm:text-[10px] dark:text-rdia-500">{e.hash.slice(0, 12)}…</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

        </div>
      </div>
    </section>
  );
}

/** Panneau de gestion des types d'incident : liste + ajout avec sélecteur d'icône. */
/**
 * Panneau « Alertes sismiques » : seuil national (SMS + e-mail aux autorités),
 * seuil mondial (notification app), liste des autorités et derniers envois.
 * La surveillance et l'envoi s'exécutent CÔTÉ SERVEUR (voir apps/api,
 * SeismicAlertsService) — ce panneau ne fait que configurer.
 */
function SeismicAlertsPanel() {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const setSeisConfig = useArgos((s) => s.setSeisConfig);
  const [maMin, setMaMin] = useState("4.0");
  const [glMin, setGlMin] = useState("5.5");
  const [contacts, setContacts] = useState<AuthorityContact[]>([]);
  const [notifs, setNotifs] = useState<SeismicNotification[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.getSeismicAlertConfig().then((r) => {
      const cfg = r.data as SeismicAlertConfig | undefined;
      if (!cfg) return;
      setMaMin(String(cfg.maMinMag));
      setGlMin(String(cfg.globalMinMag));
      setContacts(cfg.contacts);
    }).catch(() => {});
    void api.getSeismicNotifications()
      .then((r) => setNotifs(((r.data as SeismicNotification[] | undefined) ?? []).slice(0, 5)))
      .catch(() => {});
  }, []);

  const setC = (i: number, k: keyof AuthorityContact, v: string) =>
    setContacts((a) => a.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  const save = async () => {
    const ma = parseFloat(maMin), gl = parseFloat(glMin);
    if (!Number.isFinite(ma) || !Number.isFinite(gl) || busy) return;
    setBusy(true);
    try {
      // Lignes vides ignorées ; le serveur valide le reste (DTO).
      const body = {
        maMinMag: ma,
        globalMinMag: gl,
        contacts: contacts.filter((c) => c.name.trim() && c.phone.trim() && c.email.trim()),
      };
      const res = await api.updateSeismicAlertConfig(body);
      const saved = res.data as SeismicAlertConfig | undefined;
      if (saved) {
        setSeisConfig(saved); // les seuils s'appliquent aussitôt aux alertes de l'app
        setContacts(saved.contacts);
        showToast(m.settings.seis_saved);
      }
    } finally {
      setBusy(false);
    }
  };

  // 16 px sur mobile (évite le zoom automatique d'iOS au focus), densité d'origine ensuite.
  const inputCls = "input-champ text-base md:text-sm";
  const lblCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  const microCls = "mt-1 text-xs text-gray-400 sm:text-[10px] dark:text-rdia-400";
  const fmtWhen = (iso: string) => (iso.length >= 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso);

  return (
    <div className="carte flex flex-col gap-4 p-4 sm:p-5">
      <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
        <Icon path={NAV_ICONS.seismic} size={16} className="shrink-0 text-or-500" />
        <span className="min-w-0 truncate">{m.settings.seis_title}</span>
      </h3>

      <div className="flex items-start gap-2 rounded-lg bg-or-500/10 px-3 py-2">
        <Icon path={UI_ICONS.shield} size={13} className="mt-0.5 shrink-0 text-or-500" />
        <span className="min-w-0 text-xs leading-snug text-or-600 sm:text-[11px] dark:text-or-300">{m.settings.seis_hint}</span>
      </div>

      {/* Seuils : national (rouge — déclenche les envois) / mondial (app) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={lblCls}>{m.settings.seis_ma_lbl}</label>
          <input className={`${inputCls} border-danger-500/40`} type="number" step="0.1" min="1" max="9" value={maMin} onChange={(e) => setMaMin(e.target.value)} />
          <p className={microCls}>{m.settings.seis_ma_hint}</p>
        </div>
        <div>
          <label className={lblCls}>{m.settings.seis_world_lbl}</label>
          <input className={inputCls} type="number" step="0.1" min="1" max="9" value={glMin} onChange={(e) => setGlMin(e.target.value)} />
          <p className={microCls}>{m.settings.seis_world_hint}</p>
        </div>
      </div>

      {/* Autorités notifiées (SMS + e-mail) */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label className="min-w-0 text-xs font-semibold text-gray-600 dark:text-rdia-200">{m.settings.seis_contacts} ({contacts.length})</label>
          <button
            className="btn-secondaire cible-tactile flex shrink-0 items-center gap-1.5 text-xs"
            onClick={() => setContacts((a) => [...a, { name: "", phone: "", email: "" }])}
          >
            <Icon path={UI_ICONS.plus} size={13} /> {m.settings.seis_add}
          </button>
        </div>
        {/* Trois champs sur une ligne tombent à ~100 px chacun sur un téléphone :
            sous `md`, chaque autorité devient une fiche empilée encadrée. */}
        <div className="flex flex-col gap-3 md:gap-2">
          {contacts.map((c, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-gray-100 p-2 md:flex-row md:items-center md:rounded-none md:border-0 md:p-0 dark:border-rdia-700/50"
            >
              <input className={`${inputCls} min-w-0 md:flex-1`} placeholder={m.settings.seis_c_name} value={c.name} onChange={(e) => setC(i, "name", e.target.value)} />
              <input className={`${inputCls} min-w-0 font-mono md:flex-1`} placeholder={m.settings.seis_c_phone} value={c.phone} onChange={(e) => setC(i, "phone", e.target.value)} dir="ltr" />
              <input className={`${inputCls} min-w-0 font-mono md:flex-1`} placeholder={m.settings.seis_c_email} value={c.email} onChange={(e) => setC(i, "email", e.target.value)} dir="ltr" />
              <button
                className="cible-tactile flex shrink-0 items-center justify-center self-end rounded-md p-1.5 text-gray-400 transition-colors hover:text-danger-500 md:self-auto"
                onClick={() => setContacts((a) => a.filter((_, j) => j !== i))}
                aria-label={m.settings.seis_c_name}
              >
                <Icon path={UI_ICONS.close} size={14} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-primaire cible-tactile w-full text-sm disabled:opacity-50 sm:w-auto" onClick={() => void save()} disabled={busy}>
          {m.settings.seis_save}
        </button>
      </div>

      {/* Derniers envois SMS/e-mail (historique serveur) */}
      <div className="border-t border-gray-100 pt-3 dark:border-rdia-700/50">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.settings.seis_log}</div>
        {notifs.length === 0 && <div className="text-xs text-gray-400 dark:text-rdia-400">{m.settings.seis_log_empty}</div>}
        {/* Ligne d'envoi : la date et le nombre de destinataires passent à la
            ligne sur mobile plutôt que d'écraser le nom de région. */}
        {notifs.map((n) => (
          <div key={n.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-xs text-gray-600 dark:text-rdia-200">
            <span className="shrink-0 rounded bg-danger-500 px-1.5 py-0.5 text-[10px] font-bold text-white">M{n.mag.toFixed(1)}</span>
            <span className="min-w-0 flex-1 truncate">{n.region}</span>
            <span className="shrink-0 font-mono text-[11px] text-gray-400 sm:text-[10px] dark:text-rdia-400">{fmtWhen(n.sentAt)}</span>
            <span className="shrink-0 text-[11px] font-semibold text-or-500 sm:text-[10px]">{n.contacts} {m.settings.seis_sent_to}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IncidentTypesPanel() {
  const m = useModules();
  const lang = useArgos((s) => s.lang);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const apiConnected = useArgos((s) => s.apiConnected);

  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [fr, setFr] = useState("");
  const [ar, setAr] = useState("");
  const [en, setEn] = useState("");
  const [icon, setIcon] = useState(INCIDENT_ICON_CHOICES[0].path);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const filtered = incidentTypes.filter(
    (d) => !needle || d.id.includes(needle) || Object.values(d.labels).some((l) => l.toLowerCase().includes(needle)),
  );

  const slug = id.trim().toLowerCase().replace(/\s+/g, "_");
  const exists = incidentTypes.some((x) => x.id === slug);
  const canAdd = !!slug && !!fr.trim() && !!en.trim() && !exists && !busy;

  const reset = () => { setId(""); setFr(""); setAr(""); setEn(""); setIcon(INCIDENT_ICON_CHOICES[0].path); setErr(null); };

  const submit = async () => {
    if (!canAdd) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.registerIncidentType({ id: slug, labels: { fr: fr.trim(), ar: ar.trim() || fr.trim(), en: en.trim() }, icon });
      if (res.error) { setErr(m.settings.type_exists); return; }
      await loadDomain(); // rafraîchit le catalogue → visible aussitôt dans l'assistant
      showToast(m.settings.type_added);
      reset();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  return (
    <div className="carte flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
            <Icon path={NAV_ICONS.incidents} size={16} className="shrink-0 text-or-500" />
            {m.settings.types_title}
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:bg-rdia-600 dark:text-rdia-200">{incidentTypes.length}</span>
          </h3>
          <p className="mt-0.5 text-xs text-gray-400 sm:text-[11px] dark:text-rdia-400">{m.settings.types_hint}</p>
        </div>
        {!open && (
          <button className="btn-secondaire cible-tactile flex shrink-0 items-center gap-1.5 text-xs disabled:opacity-50" onClick={() => setOpen(true)} disabled={!apiConnected}>
            <Icon path={UI_ICONS.plus} size={13} /> {m.settings.type_add}
          </button>
        )}
      </div>

      {/* Recherche — 16 px sur mobile pour éviter le zoom automatique d'iOS. */}
      <input className="input-champ text-base md:text-sm" placeholder={m.settings.types_search} value={q} onChange={(e) => setQ(e.target.value)} />

      {/* Catalogue actuel : liste par lignes (icône · libellé · identifiant · badge) */}
      <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100 dark:border-rdia-700/50">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-400 dark:text-rdia-400">{m.settings.types_empty}</p>
        ) : (
          filtered.map((def) => (
            <div key={def.id} className="flex items-center gap-2.5 border-b border-gray-100 px-3 py-2 last:border-0 sm:gap-3 dark:border-rdia-700/50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-or-500/10 text-or-500">
                <Icon path={def.icon} size={17} strokeWidth={1.6} />
              </span>
              {/* Sous `sm`, l'identifiant passe sous le libellé au lieu d'être
                  masqué : aucune donnée ne disparaît sur téléphone. */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-800 dark:text-rdia-50">{def.labels[lang]}</span>
                <span className="block truncate font-mono text-[11px] text-gray-400 sm:hidden dark:text-rdia-400">{def.id}</span>
              </span>
              <span className="hidden shrink-0 font-mono text-[10px] text-gray-400 dark:text-rdia-400 sm:block">{def.id}</span>
              {def.builtin && (
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:bg-rdia-600 dark:text-rdia-300">{m.settings.type_builtin}</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Formulaire d'ajout : modale dédiée */}
      <Modal open={open} title={m.settings.type_add} onClose={() => { reset(); setOpen(false); }} size="lg">
        <div className="flex flex-col gap-4">
          {/* Champs à 16 px sur mobile (`text-base`) : sous ce seuil, iOS zoome
              au focus et la modale part hors de l'écran. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{m.settings.type_id}</label>
              <input className="input-champ font-mono text-base md:text-sm" value={id} onChange={(e) => setId(e.target.value)} placeholder={m.settings.type_id_ph} spellCheck={false} />
            </div>
            <div>
              <label className={labelCls}>{m.settings.label_fr}</label>
              <input className="input-champ text-base md:text-sm" value={fr} onChange={(e) => setFr(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{m.settings.label_en}</label>
              <input className="input-champ text-base md:text-sm" value={en} onChange={(e) => setEn(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{m.settings.label_ar}</label>
              <input className="input-champ text-base md:text-sm" dir="rtl" value={ar} onChange={(e) => setAr(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>{m.settings.type_icon}</label>
            {/* 6 colonnes sur téléphone : à 8, chaque case tomberait sous 40 px. */}
            <div className="grid max-h-48 grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-gray-100 p-2 sm:max-h-56 sm:grid-cols-8 md:grid-cols-10 dark:border-rdia-700/50">
              {INCIDENT_ICON_CHOICES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setIcon(c.path)}
                  aria-label={c.key}
                  aria-pressed={icon === c.path}
                  className={`flex aspect-square items-center justify-center rounded-lg border-2 transition-colors ${
                    icon === c.path
                      ? "border-or-500 bg-or-500/10 text-or-500"
                      : "border-transparent text-gray-500 hover:border-or-500/40 hover:text-or-500 dark:text-rdia-300"
                  }`}
                >
                  <Icon path={c.path} size={20} strokeWidth={1.6} />
                </button>
              ))}
            </div>
          </div>

          {exists && <p className="text-xs text-danger-500">{m.settings.type_exists}</p>}
          {err && <p className="text-xs text-danger-500">{err}</p>}

          {/* Pied de modale : aperçu au-dessus des actions sur mobile, les deux
              sur une ligne dès `sm`. */}
          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2 dark:border-rdia-700/50">
            {/* Aperçu de la tuile telle qu'elle apparaîtra dans l'assistant */}
            <div className="flex min-w-0 items-center gap-2 self-start rounded-lg border-2 border-or-500/40 px-3 py-1.5">
              <Icon path={icon} size={20} strokeWidth={1.6} className="shrink-0 text-or-500" />
              <span className="min-w-0 truncate text-xs font-semibold text-gray-700 dark:text-rdia-100">{fr.trim() || m.settings.label_fr}</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondaire cible-tactile flex-1 text-xs sm:flex-none" onClick={() => { reset(); setOpen(false); }}>{m.settings.reset}</button>
              <button className="btn-primaire cible-tactile flex-1 text-xs disabled:opacity-50 sm:flex-none" onClick={submit} disabled={!canAdd}>{m.settings.type_add}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
