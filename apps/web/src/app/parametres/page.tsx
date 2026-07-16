"use client";

import { useCallback, useEffect, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { UI_ICONS, NAV_ICONS } from "@/lib/icons";
import { FLAGGABLE_KEYS, navLabel } from "@/lib/nav";
import { AI_PROVIDERS, AI_DEFAULT_SETTINGS, resolveProvider, type LlmProviderId } from "@/lib/ai/config";
import { probeProvider, listModels } from "@/lib/ai/provider";
import { api } from "@/lib/api";

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
    return (
      <section className="flex animate-fade-in items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="carte flex flex-col items-center gap-3 p-8 text-center" style={{ maxWidth: 420 }}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-500/10 text-danger-500">
            <Icon path={UI_ICONS.shield} size={22} />
          </div>
          <h2 className="text-base font-bold text-rdia-600 dark:text-rdia-50">{t.nav_settings}</h2>
          <p className="text-sm text-gray-500 dark:text-rdia-300">{m.settings.reserved}</p>
        </div>
      </section>
    );
  }

  const cfg = resolveProvider(aiSettings);
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

  const inputCls = "input-champ text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 animate-fade-in">
      {/* En-tête */}
      <div className="carte flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
          <Icon path={NAV_ICONS.settings} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{t.nav_settings}</h2>
          <p className="truncate text-xs text-gray-500 dark:text-rdia-300">{m.settings.reserved}</p>
        </div>
        <span className="rounded-md bg-or-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-or-500">Super Admin</span>
      </div>

      {/* Section : Assistant IA / LLM */}
      <div className="carte flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
            <Icon path={NAV_ICONS.assistant} size={16} className="text-or-500" />
            {m.settings.ai_title}
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
          <div className="flex items-center gap-2">
            <input className={`${inputCls} font-mono`} value={aiSettings.model} onChange={(e) => setAiSettings({ model: e.target.value })} placeholder={m.settings.model_ph} spellCheck={false} />
            <button className="btn-secondaire shrink-0 text-xs" onClick={detect} disabled={status === "checking"}>
              {m.settings.detect}
            </button>
          </div>
          {models.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-400 dark:text-rdia-400">{models.length} {m.settings.detected}</div>
              <div className="flex flex-wrap gap-1.5">
                {models.map((mo) => (
                  <button
                    key={mo}
                    onClick={() => setAiSettings({ model: mo })}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors ${
                      aiSettings.model === mo
                        ? "border-or-500 bg-or-500/10 text-or-500"
                        : "border-gray-200 text-gray-500 hover:border-or-500/50 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-300"
                    }`}
                  >
                    {mo}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-or-500/10 px-3 py-2">
          <Icon path={UI_ICONS.shield} size={13} className="mt-0.5 shrink-0 text-or-500" />
          <span className="text-[11px] leading-snug text-or-600 dark:text-or-300">{m.settings.note}</span>
        </div>

        <div className="flex justify-end">
          <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-or-500 dark:border-rdia-600 dark:text-rdia-300" onClick={() => { setAiSettings(AI_DEFAULT_SETTINGS); setStatus("idle"); setModels([]); }}>
            {m.settings.reset}
          </button>
        </div>
      </div>

      {/* Section : matrice de feature flags (§6.15) */}
      <div className="carte flex flex-col gap-3 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
            <Icon path={NAV_ICONS.dashboard} size={16} className="text-or-500" />
            {m.settings.flags_title}
            <Pill tone={apiConnected ? "green" : "gray"} label={apiConnected ? "API" : "local"} />
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-400 dark:text-rdia-400">{m.settings.flags_hint}</p>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
          {FLAGGABLE_KEYS.map((k) => {
            const on = flags[k] !== false;
            return (
              <button
                key={k}
                onClick={() => toggleFlag(k, on)}
                className="flex items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm transition-colors last:border-0 dark:border-rdia-700/50"
              >
                <span className={on ? "text-gray-700 dark:text-rdia-100" : "text-gray-400 line-through dark:text-rdia-400"}>{navLabel(k, t)}</span>
                <span className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${on ? "bg-or-500" : "bg-gray-300 dark:bg-rdia-600"}`}>
                  <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section : journal d'audit (depuis l'API, chaîné par hash) */}
      {apiConnected && (
        <div className="carte flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
              <Icon path={NAV_ICONS.reports} size={16} className="text-or-500" />
              Journal d'audit
              {chain && <Pill tone={chain.valid ? "green" : "red"} label={chain.valid ? `chaîne intègre · ${chain.count}` : "chaîne rompue"} />}
            </h3>
            <button className="text-[11px] font-semibold text-or-500 hover:underline" onClick={() => void loadAudit()}>Actualiser</button>
          </div>
          {audit.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-rdia-400">Aucune entrée — basculez un module ci-dessus pour générer une trace.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100 dark:divide-rdia-700/50">
              {audit.map((e) => (
                <div key={e.seq} className="flex items-center gap-3 py-1.5 text-xs">
                  <span className="w-6 shrink-0 font-mono text-gray-400 dark:text-rdia-400">#{e.seq}</span>
                  <span className="w-14 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-gray-500 dark:bg-rdia-600 dark:text-rdia-200">{e.method}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-gray-600 dark:text-rdia-200">{e.path}</span>
                  <span className="shrink-0 text-gray-400 dark:text-rdia-400">{e.actor}</span>
                  <span className="hidden w-24 shrink-0 truncate font-mono text-[10px] text-gray-300 dark:text-rdia-500 sm:block">{e.hash.slice(0, 12)}…</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section : à venir (extensibilité) */}
      <div className="carte flex flex-col gap-2 p-5 opacity-70">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
          <Icon path={NAV_ICONS.settings} size={16} className="text-gray-400 dark:text-rdia-400" />
          {m.settings.future_title}
        </h3>
        <p className="text-xs text-gray-500 dark:text-rdia-300">{m.settings.future_hint}</p>
      </div>
    </section>
  );
}
