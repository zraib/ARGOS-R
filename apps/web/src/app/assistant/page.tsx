"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { UI_ICONS, NAV_ICONS } from "@/lib/icons";
import { StubScreen } from "@/components/shell/StubScreen";
import { AI_ENABLED, AI_SYSTEM_PROMPT, resolveProvider } from "@/lib/ai/config";
import { probeProvider, chatStream } from "@/lib/ai/provider";
import { interpret, buildLlmUserMessage, type AiContext } from "@/lib/ai/assistant";

type ProviderStatus = "checking" | "online" | "offline";

export default function AssistantPage() {
  const t = useDict();
  const m = useModules();
  const incidents = useArgos((s) => s.incidents);
  const movements = useArgos((s) => s.movements);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const dashStats = useArgos((s) => s.dashStats);
  const quakes = useArgos((s) => s.quakes);
  const catalog = useArgos((s) => s.catalog);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const aiLog = useArgos((s) => s.aiLog);
  const pushAi = useArgos((s) => s.pushAi);
  const updateAi = useArgos((s) => s.updateAi);
  const clearAi = useArgos((s) => s.clearAi);
  const aiSettings = useArgos((s) => s.aiSettings);
  const cfg = resolveProvider(aiSettings);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ProviderStatus>("checking");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Sonde le runtime configuré dans les Paramètres. Hors-ligne → repli déterministe.
  useEffect(() => {
    let alive = true;
    setStatus("checking");
    probeProvider(cfg).then((ok) => alive && setStatus(ok ? "online" : "offline"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSettings.providerId, aiSettings.endpoint, aiSettings.model]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [aiLog, busy]);

  if (!AI_ENABLED) return <StubScreen title={t.nav_assistant} />;

  const ask = async (query: string) => {
    const q = query.trim();
    if (!q || busy) return;
    setInput("");
    pushAi({ role: "user", text: q });
    setBusy(true);

    // 1) Couche 1 déterministe : traduit la requête et l'exécute (toujours).
    const ctx: AiContext = {
      incidents,
      movements,
      units,
      hospitals,
      dashStats,
      quakes,
      equipment: catalog.equipment,
      orsec: catalog.orsec,
      currentPath: pathname,
    };
    const answer = interpret(q, ctx);

    // 2) Si un LLM local est joignable, il REFORMULE le résultat en streaming
    //    (lecture seule). Sinon, on garde la réponse déterministe.
    const msgId = pushAi({
      role: "assistant",
      text: answer.text,
      provider: m.ai.mode_det,
      layer1: answer.layer1,
      units: answer.units,
      incidents: answer.incidents,
      hospitals: answer.hospitals,
      quakes: answer.quakes,
      equipment: answer.topEquip,
      stats: answer.stats,
      cross: answer.cross,
    });
    if (status === "online") {
      const res = await chatStream(
        cfg,
        [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: buildLlmUserMessage(q, answer) },
        ],
        { onToken: (acc) => updateAi(msgId, { text: acc, provider: `${m.ai.mode_llm} · ${cfg.label} (${cfg.model})` }) },
      );
      // Échec du LLM → on restaure la réponse déterministe.
      if (!res.ok || !res.text.trim()) {
        updateAi(msgId, { text: answer.text, provider: m.ai.mode_det });
      }
    }
    setBusy(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") ask(input);
  };

  const statusChip =
    status === "online"
      ? { tone: "green" as const, label: `${m.ai.provider_local} · ${m.ai.provider_online}` }
      : status === "offline"
        ? { tone: "amber" as const, label: m.ai.provider_offline }
        : { tone: "gray" as const, label: "…" };

  const examples = [m.ai.ex_reach, m.ai.ex_reach2, m.ai.ex_sitrep, m.ai.ex_anomaly];

  return (
    <section className="mx-auto flex h-full max-w-4xl flex-col gap-4 animate-fade-in">
      {/* En-tête + statut du fournisseur */}
      <div className="carte flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
          <Icon path={NAV_ICONS.assistant} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{t.nav_assistant}</h2>
          <p className="truncate text-xs text-gray-500 dark:text-rdia-300">{m.ai.subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Pill tone={statusChip.tone} label={statusChip.label} />
          <div className="flex items-center gap-2">
            <span className="max-w-[200px] truncate font-mono text-[10px] text-gray-400 dark:text-rdia-400">{cfg.label} · {cfg.model}</span>
            <Link href="/parametres" className="text-[10px] font-semibold text-or-500 hover:underline">{m.ai.configure}</Link>
          </div>
        </div>
      </div>

      {/* Garde-fous */}
      <div className="flex items-start gap-2 rounded-lg bg-or-500/10 px-3 py-2">
        <Icon path={UI_ICONS.shield} size={14} className="mt-0.5 shrink-0 text-or-500" />
        <span className="text-[11px] leading-snug text-or-600 dark:text-or-300">{m.ai.guardrail}</span>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="carte flex-1 overflow-y-auto p-4" style={{ minHeight: 280 }}>
        {aiLog.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
            <p className="text-sm text-gray-400 dark:text-rdia-400">{m.ai.empty}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {aiLog.map((msg) =>
              msg.role === "user" ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-rdia-600 px-3.5 py-2 text-sm text-white dark:bg-or-500 dark:text-rdia-900">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-or-500">
                      <Icon path={NAV_ICONS.assistant} size={13} />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-rdia-400">{msg.provider}</span>
                    <span className="font-mono text-[10px] text-gray-300 dark:text-rdia-500">{msg.at}</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-gray-50 px-3.5 py-2.5 dark:bg-rdia-800/50">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-rdia-50">{msg.text}</p>
                    {msg.units && msg.units.length > 0 && (
                      <div className="mt-2.5 overflow-hidden rounded-lg border border-gray-100 dark:border-rdia-700">
                        <table className="w-full text-xs">
                          <tbody>
                            {msg.units.slice(0, 6).map((u) => (
                              <tr key={u.id} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                                <td className="px-2.5 py-1.5 font-medium text-gray-700 dark:text-rdia-100">{u.nom}</td>
                                <td className="px-2.5 py-1.5 text-gray-400 dark:text-rdia-400">{u.ville}</td>
                                <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-600 dark:text-rdia-200">{u.etaMin} {m.dispatch.min}</td>
                                <td className="w-6 px-2.5 py-1.5 text-center">
                                  {u.within ? <span className="text-green-500">✓</span> : <span className="text-gray-300 dark:text-rdia-600">·</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {msg.layer1 && (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-gray-100 pt-2 dark:border-rdia-700/50">
                        <Icon path={NAV_ICONS.dispatch} size={11} className="shrink-0 text-gray-300 dark:text-rdia-500" />
                        <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{m.ai.layer1} : {msg.layer1}</span>
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && <div className="pl-8 text-xs italic text-gray-400 dark:text-rdia-400">{m.ai.thinking}</div>}
          </div>
        )}
      </div>

      {/* Exemples */}
      <div className="flex flex-wrap gap-2">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => ask(ex)}
            disabled={busy}
            className="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] text-gray-500 transition-colors hover:border-or-500/50 hover:text-or-500 disabled:opacity-40 dark:border-rdia-600 dark:text-rdia-300"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Saisie */}
      <div className="flex items-center gap-2">
        {aiLog.length > 0 && (
          <button className="btn-secondaire shrink-0 text-sm" onClick={clearAi} disabled={busy}>{m.ai.clear}</button>
        )}
        <input className="input-champ flex-1 text-sm" placeholder={m.ai.placeholder} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} disabled={busy} />
        <button className="btn-primaire shrink-0 text-sm" onClick={() => ask(input)} disabled={busy || !input.trim()}>
          <Icon path={UI_ICONS.send} size={16} strokeWidth={2} />
        </button>
      </div>
    </section>
  );
}
