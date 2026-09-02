"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { useArgos, useDict, useModules } from "@/lib/store";
import { resolveProvider } from "@/lib/ai/config";

type OllamaTag = { name: string; size: number; modified_at: string; digest: string };

/**
 * Panneau de réglages déployable : choix du modèle parmi ceux du runtime local
 * (liste rafraîchissable) ou saisie manuelle. Il tient son propre état ; le
 * réglage retenu part dans le magasin (`aiSettings.model`).
 */
export function CopilotSettings({ busy }: { busy: boolean }) {
  const t = useDict();
  const m = useModules();
  const aiSettings = useArgos((s) => s.aiSettings);
  const setAiSettings = useArgos((s) => s.setAiSettings);
  const cfg = resolveProvider(aiSettings);
  const [ollamaTags, setOllamaTags] = useState<OllamaTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [manualModelMode, setManualModelMode] = useState(false);
  const [manualModelInput, setManualModelInput] = useState(aiSettings.model);
  useEffect(() => {
    setManualModelInput(aiSettings.model);
  }, [aiSettings.model]);
  const loadOllamaTags = useCallback(async () => {
    if (!cfg.local || !cfg.endpoint) return;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      setLoadingTags(true);
      controller = new AbortController();
      timer = setTimeout(() => controller?.abort(), 6000);
      const r = await fetch(`${cfg.endpoint.replace(/\/$/, "")}/api/tags`, {
        signal: controller.signal,
      });
      if (!r.ok) return;
      const j = (await r.json()) as { models: OllamaTag[] };
      setOllamaTags(Array.isArray(j?.models) ? j.models : []);
    } catch {
      /* ignorer (offline / endpoint invalide / abort) */
    } finally {
      if (timer) clearTimeout(timer);
      setLoadingTags(false);
    }
  }, [cfg.endpoint, cfg.local]);
  useEffect(() => {
    loadOllamaTags();
  }, [loadOllamaTags, cfg.endpoint, cfg.local]);
  return (
    <div className="shrink-0 border-b border-gray-100/70 bg-gray-50/70 px-4 py-3 text-[11px] dark:border-rdia-700/50 dark:bg-rdia-900/50 animate-fade-in">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300">
        <Icon path={NAV_ICONS.assistant} size={10} />
        {m.copilot.model}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white/80 px-2 py-1.5 dark:border-rdia-700/60 dark:bg-rdia-800/70">
        {!manualModelMode ? (
          <select
            id="copilot-model-select"
            value={aiSettings.model}
            onChange={(e) => setAiSettings({ model: e.target.value })}
            disabled={busy || !cfg.local}
            className="w-full truncate rounded-md border-0 bg-transparent px-1 py-0 font-mono text-[11px] text-gray-700 focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-rdia-100"
            title={t.cp_model_current}
          >
            {ollamaTags.length === 0 && (
              <option value={aiSettings.model}>
                {loadingTags ? "…" : aiSettings.model}
              </option>
            )}
            {ollamaTags.map((t) => {
              const gb = (t.size ?? 0) / (1024 * 1024 * 1024);
              const label = gb > 0.1 ? `${t.name} · ${gb.toFixed(1)} Go` : t.name;
              const warn = gb >= 8 ? " 🔴" : gb >= 5.5 ? " 🟠" : gb <= 5 ? " 🟢" : "";
              return (
                <option key={t.digest || t.name} value={t.name}>
                  {label}{warn}
                </option>
              );
            })}
            {ollamaTags.length > 0 && !ollamaTags.some((t) => t.name === aiSettings.model) && aiSettings.model && (
              <option value={aiSettings.model}>{aiSettings.model} (saisi)</option>
            )}
          </select>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = manualModelInput.trim();
              if (v) {
                setAiSettings({ model: v });
                setManualModelMode(false);
              }
            }}
            className="flex flex-1 items-center gap-1"
          >
            <input
              type="text"
              value={manualModelInput}
              onChange={(e) => setManualModelInput(e.target.value)}
              disabled={busy || !cfg.local}
              placeholder={t.cp_model_manual_ph}
              className="w-full rounded-md border-0 bg-transparent px-1 py-0 font-mono text-[11px] text-gray-700 outline-none focus:ring-0 disabled:opacity-60 dark:text-rdia-100"
              autoFocus
            />
            <button
              type="submit"
              disabled={busy || !manualModelInput.trim() || !cfg.local}
              title={m.copilot.confirm}
              className="cible-tactile flex h-5 w-5 shrink-0 items-center justify-center rounded text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
            >
              <Icon path={UI_ICONS.check} size={11} />
            </button>
            <button
              type="button"
              onClick={() => {
                setManualModelMode(false);
                setManualModelInput(aiSettings.model);
              }}
              disabled={busy}
              title={m.copilot.cancel}
              className="cible-tactile flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:text-red-500 disabled:opacity-40"
            >
              <Icon path={UI_ICONS.close} size={11} />
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={() => {
            if (manualModelMode) {
              setManualModelMode(false);
              setManualModelInput(aiSettings.model);
            } else {
              setManualModelMode(true);
              setManualModelInput(aiSettings.model);
            }
          }}
          disabled={busy || !cfg.local}
          title={manualModelMode ? t.cp_model_back_list : t.cp_model_manual}
          className="cible-tactile flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:text-or-500 disabled:opacity-40"
        >
          <Icon path={UI_ICONS.edit} size={11} />
        </button>
        <button
          type="button"
          onClick={loadOllamaTags}
          disabled={loadingTags || !cfg.local}
          title={t.cp_model_refresh}
          className="cible-tactile flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:text-or-500 disabled:cursor-wait disabled:opacity-40"
        >
          <Icon path={UI_ICONS.refresh} size={11} />
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-gray-400 dark:text-rdia-400">
        {m.copilot.model_current} <span className="font-mono text-gray-600 dark:text-rdia-200">{aiSettings.model}</span>
        {cfg.local ? " · local" : ""}
      </p>
    </div>
  );
}
