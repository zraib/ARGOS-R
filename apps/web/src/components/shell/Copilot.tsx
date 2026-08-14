"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import {
  AI_ENABLED,
  AI_REFUS_RESPONSE,
  AI_SYSTEM_PROMPT,
  detectInjection,
  detectLeakedPrompt,
  resolveProvider,
} from "@/lib/ai/config";
import { chatStream, probeProvider } from "@/lib/ai/provider";
import {
  buildLlmUserMessage,
  enrichFromHistory,
  interpret,
  type AiContext,
  type AiAnswerStats,
} from "@/lib/ai/assistant";

type ProviderStatus = "checking" | "online" | "offline";

const SEV_COLORS: Record<string, string> = {
  faible: "text-emerald-500",
  moyenne: "text-amber-500",
  élevée: "text-or-500",
  élevÉe: "text-or-500",
  info: "text-blue-500",
  critique: "text-red-500",
};

function sevBadge(sev?: string) {
  if (!sev) return "text-gray-500";
  const key = sev.toLowerCase();
  return SEV_COLORS[key] ?? "text-gray-500";
}

function toneForLevel(v: number) {
  if (v < 0.33) return "text-emerald-500";
  if (v < 0.66) return "text-amber-500";
  return "text-red-500";
}

export function Copilot() {
  const m = useModules();
  const path = usePathname() ?? "";

  const copilotOpen = useArgos((s) => s.copilotOpen);
  const closeCopilot = useArgos((s) => s.closeCopilot);

  const incidents = useArgos((s) => s.incidents);
  const movements = useArgos((s) => s.movements);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const quakes = useArgos((s) => s.quakes);
  const dashStats = useArgos((s) => s.dashStats);
  const catalog = useArgos((s) => s.catalog);
  const selUnit = useArgos((s) => s.selUnit);
  const selHosp = useArgos((s) => s.selHosp);
  const selMarker = useArgos((s) => s.selMarker);

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
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    setStatus("checking");
    probeProvider(cfg).then((ok) => alive && setStatus(ok ? "online" : "offline"));
    return () => {
      alive = false;
    };
  }, [aiSettings.providerId, aiSettings.endpoint, aiSettings.model]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [aiLog, busy]);

  useEffect(() => {
    if (copilotOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [copilotOpen]);

  // Suggestions contextuelles selon écran courant + sélections
  const suggestions = useMemo(() => {
    const base: string[] = [
      "Situation globale opérationnelle",
      "Tendances incidents 30 derniers jours",
      "SITREP incidents en cours",
      "État des hôpitaux",
    ];
    const incMatch = path.match(/\/incidents\/(INC-\d+)/i);
    const focusedIncId = incMatch?.[1] ?? (selMarker?.kind === "inc" ? selMarker.id : null);
    const focusedInc = incidents.find((i) => i.id === focusedIncId) ?? null;
    if (focusedInc) {
      base.unshift(`Analyse croisée ${focusedInc.id}`);
      base.unshift(`Détail de ${focusedInc.id}`);
    }
    if (selUnit) {
      const u = units.find((x) => x.id === selUnit);
      base.push(`Statut unité ${u?.nom ?? selUnit}`);
    }
    if (selHosp) {
      const h = hospitals.find((x) => x.id === selHosp);
      base.push(`Statut hôpital ${h?.nom ?? selHosp}`);
    }
    if (path.startsWith("/seism")) base.unshift("Activité sismique récente");
    if (path.includes("orsec") || path.includes("plan")) base.unshift("Synthèse ORSEC");
    if (path.startsWith("/command") || path.startsWith("/dash") || path.startsWith("/tableau")) {
      base.unshift("Bilan humain global");
      base.unshift("Posture globale des unités FAR");
    }
    return Array.from(new Set(base)).slice(0, 8);
  }, [path, incidents, units, hospitals, selUnit, selHosp, selMarker]);

  const ask = useCallback(
    async (query: string) => {
      const qRaw = query.trim();
      if (!qRaw || busy) return;
      setInput("");
      pushAi({ role: "user", text: qRaw });

      // 🧠 Mémoire Couche 1 : enrichit les questions vagues
      const enriched = enrichFromHistory(qRaw, aiLog);
      const q = enriched.query;

      if (detectInjection(q)) {
        pushAi({
          role: "assistant",
          text: AI_REFUS_RESPONSE,
          provider: "Garde-fou sécurité",
          refused: true,
        });
        return;
      }

      const pathInc = path.match(/\/incidents\/(INC-\d+)/i)?.[1];
      const currentIncidentId =
        enriched.targetIncidentId ||
        pathInc ||
        (selMarker?.kind === "inc" ? selMarker.id : undefined);

      const ctx: AiContext = {
        incidents,
        movements,
        units,
        hospitals,
        quakes,
        dashStats,
        equipment: catalog.equipment,
        orsec: catalog.orsec,
        currentPath: path,
        currentIncidentId,
      };
      const answer = interpret(q, ctx);

      // --- 🎯 INTENTS COURTS (pas besoin de LLM, réponse naturelle déjà 1 phrase)
      const skipLlmIntents: Record<string, boolean> = {
        help: true,
        greeting: true,
        social: true,
      };
      const shortIntent = skipLlmIntents[answer.intent] === true;

      if (shortIntent) {
        pushAi({
          role: "assistant",
          text: answer.text,
          layer1: answer.layer1,
          units: answer.units,
          incidents: answer.incidents,
          hospitals: answer.hospitals,
          quakes: answer.quakes,
          equipment: answer.topEquip,
          stats: answer.stats,
          cross: answer.cross,
          suggestions: answer.suggestions,
        });
        return;
      }

      // --- 🌟 UX QWEN D'ABORD : pushAi initial = AUCUN bloc structuré affiché.
      // On NE montre à l'utilisateur QUE le texte "Traitement en cours…" + provider.
      // Les blocs (incidents, hôpitaux, unités, quakes, équipements, stats, cross, suggestions)
      // SONT AJOUTÉS À LA FIN UNIQUEMENT :
      //   1) si stream LLM termine → texte final Qwen + blocs montés EN MÊME TEMPS
      //   2) si fallback timeout/erreur → texte Couche1 + blocs montés EN MÊME TEMPS
      // BUT : utilisateur NE VOIT PLUS JAMAIS "réponse Couche1" avant traitement,
      // il voit : Traitement → stream Qwen mot par mot → puis blocs structurés ajoutés en dessous.
      const msgId = pushAi({
        role: "assistant",
        text: "Traitement en cours…",
        provider: `${cfg.label} · ${cfg.model}`,
      });

      setBusy(true);
      try {
        // 🔥 TIMEOUT PATIENCE : Ollama local qwen2.5:14b a besoin de 4-8s pour le 1er token (modèle 9GB).
        //    — Jamais moins de 15s, même si probeProvider a dit "offline".
        //    — Statut online confirmé → 25s pour longues réponses.
        const baseTimeoutMs = status === "online" ? 25000 : 15000;
        //    — Si la taille de la question implique une réponse longue, on rallonge.
        const qWords = q.trim().split(/\s+/).filter(Boolean).length;
        const timeoutMs = Math.max(baseTimeoutMs, qWords > 6 ? 30000 : baseTimeoutMs);
        let finished = false;
        let llmText = "";

        // Historique conversation
        const maxTurns = 10;
        const historySlice = aiLog.slice(-(maxTurns * 2));
        const llmHistory: { role: "system" | "user" | "assistant"; content: string }[] = [];
        for (const hm of historySlice) {
          if (!hm.text || !hm.text.trim()) continue;
          if (hm.refused) continue;
          if (hm.role === "user") llmHistory.push({ role: "user", content: hm.text });
          else if (hm.role === "assistant") llmHistory.push({ role: "assistant", content: hm.text });
        }

        const streamProviderPrefix = "…";
        let leaked = false;
        const applyLeakRefusal = () => {
          if (leaked) return;
          leaked = true;
          // Même en refus fuite : on affiche AUCUN bloc structuré (fuite, pas de data à montrer)
          updateAi(msgId, {
            text: AI_REFUS_RESPONSE,
            provider: "Garde-fou sécurité (fuite prompt détectée)",
            refused: true,
          });
        };
        const res = await Promise.race([
          chatStream(
            cfg,
            [
              { role: "system", content: AI_SYSTEM_PROMPT },
              ...llmHistory,
              { role: "user", content: buildLlmUserMessage(q, answer) },
            ],
            {
              onToken: (acc) => {
                try {
                  if (finished || leaked) return;
                  // 🛡️ LIVE GUARD : dès qu'un token divulgue prompt/règles → STOP + REFUS immédiat
                  if (detectLeakedPrompt(acc)) {
                    applyLeakRefusal();
                    return;
                  }
                  llmText = acc;
                  // PENDANT STREAM : on ne met QUE à jour text + provider (PAS de blocs structurés,
                  // sinon l'utilisateur voit l'overview Couche1 s'afficher au milieu du stream).
                  updateAi(msgId, {
                    text: acc,
                    provider: `${streamProviderPrefix} · ${cfg.label} (${cfg.model})`,
                  });
                } catch {
                  /* ignore token-level errors so streaming never breaks the whole call */
                }
              },
            },
          ),
          new Promise<{ ok: false; text: ""; aborted: true }>((resolve) =>
            setTimeout(() => resolve({ ok: false, text: "", aborted: true }), timeoutMs),
          ),
        ]);
        finished = true;
        const llmEmpty = !("ok" in res) || !res.ok || !llmText || !llmText.trim();
        if (leaked) {
          // déjà remplacé par REFUS via applyLeakRefusal() live → rien à faire
        } else if (detectLeakedPrompt(llmText)) {
          // 🛡️ FINAL GUARD : post-stream check (si live a raté le dernier token)
          applyLeakRefusal();
        } else if (llmEmpty) {
          // ⚠️ LLM KO → FALLBACK : affiche texte Couche 1 + BLOCS STRUCTURÉS (montés ici, pas avant)
          updateAi(msgId, {
            text: answer.text,
            provider: `Données ARGOS · (${cfg.model} indisponible — réponse déterministe)`,
            layer1: answer.layer1,
            units: answer.units,
            incidents: answer.incidents,
            hospitals: answer.hospitals,
            quakes: answer.quakes,
            equipment: answer.topEquip,
            stats: answer.stats,
            cross: answer.cross,
            suggestions: answer.suggestions,
          });
        } else {
          // ✅ LLM OK : stream terminé → texte final Qwen + BLOCS STRUCTURÉS (montés EN MÊME TEMPS)
          updateAi(msgId, {
            text: llmText,
            provider: `${cfg.label} · ${cfg.model}`,
            units: answer.units,
            incidents: answer.incidents,
            hospitals: answer.hospitals,
            quakes: answer.quakes,
            equipment: answer.topEquip,
            stats: answer.stats,
            cross: answer.cross,
            suggestions: answer.suggestions,
          });
        }
      } catch (_err) {
        // ⚠️ ERREUR runtime → fallback Couche 1 + blocs (ici aussi, montés ici, pas avant)
        updateAi(msgId, {
          text: answer.text,
          provider: `Données ARGOS · (${cfg.model} indisponible — réponse déterministe)`,
          layer1: answer.layer1,
          units: answer.units,
          incidents: answer.incidents,
          hospitals: answer.hospitals,
          quakes: answer.quakes,
          equipment: answer.topEquip,
          stats: answer.stats,
          cross: answer.cross,
          suggestions: answer.suggestions,
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, aiLog, pushAi, incidents, movements, units, hospitals, quakes, dashStats, catalog, path, selMarker, status, cfg, updateAi],
  );

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  };

  const statusChip =
    status === "online"
      ? { tone: "green" as const, label: `Copilot ARGOS · ${cfg.label} opérationnel` }
      : status === "offline"
        ? { tone: "amber" as const, label: `${cfg.label} hors-ligne · mode déterministe` }
        : { tone: "gray" as const, label: "…" };

  if (!AI_ENABLED) return null;

  return (
    <Modal open={copilotOpen} onClose={closeCopilot} title="" size="xl">
      <div className="flex h-[82vh] flex-col gap-3">
        <div className="-mt-1 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
            <Icon path={NAV_ICONS.assistant} size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">Copilot ARGOS</h2>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Pill tone={statusChip.tone} label={statusChip.label} />
            <div className="flex items-center gap-2">
              <span className="max-w-[200px] truncate font-mono text-[10px] text-gray-400 dark:text-rdia-400">{cfg.label} · {cfg.model}</span>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="carte flex-1 overflow-y-auto p-4">
          {aiLog.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-or-500/15 text-or-500">
                <Icon path={NAV_ICONS.assistant} size={26} />
              </div>
              <div>
                <p className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">Bienvenue dans le Copilot</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-gray-500 dark:text-rdia-300">Pose ta question en langage naturel — incidents, hôpitaux, unités, ORSEC, logistique, sismologie.</p>
              </div>
              <div className="mt-2 flex max-w-2xl flex-wrap justify-center gap-2">
                {suggestions.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => ask(ex)}
                    disabled={busy}
                    className="rounded-full border border-gray-200 bg-white/60 px-3 py-1.5 text-[11px] text-gray-600 transition-colors hover:border-or-500/60 hover:text-or-500 disabled:opacity-40 dark:border-rdia-600 dark:bg-rdia-700/60 dark:text-rdia-200"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {aiLog.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-rdia-600 px-3.5 py-2 text-sm text-white dark:bg-or-500 dark:text-rdia-900">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-or-500">
                        <Icon path={NAV_ICONS.assistant} size={13} />
                      </div>
                      <span className="font-mono text-[10px] text-gray-300 dark:text-rdia-500">{msg.at}</span>
                      {msg.refused && <Pill tone="red" label="Refus sécurité" />}
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-gray-50 px-3.5 py-2.5 dark:bg-rdia-800/50">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-rdia-50">{msg.text}</p>

                      {msg.stats?.items && msg.stats.items.length > 0 && <StatsGrid stats={msg.stats} />}

                      {msg.incidents && msg.incidents.length > 0 && (
                        <BlockTable title="Incidents" icon={NAV_ICONS.incidents}>
                          <thead>
                            <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
                              <th className="px-2.5 py-1.5 text-left font-medium">ID</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">Titre</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">Région</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">Sév.</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {msg.incidents.map((i) => (
                              <tr key={i.id} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                                <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[11px] text-gray-500 dark:text-rdia-400">{i.id}</td>
                                <td className="px-2.5 py-1.5 text-sm font-medium text-gray-800 dark:text-rdia-100">{i.titre}</td>
                                <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{i.region || "—"}</td>
                                <td className={`px-2.5 py-1.5 text-xs font-semibold ${sevBadge(i.sev)}`}>{i.sev || "—"}</td>
                                <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{i.st || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </BlockTable>
                      )}

                      {msg.units && msg.units.length > 0 && (
                        <BlockTable title="Unités recommandées" icon={NAV_ICONS.units}>
                          <tbody>
                            {msg.units.slice(0, 10).map((u) => (
                              <tr key={u.id} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                                <td className="px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{u.nom}</td>
                                <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{u.ville}</td>
                                <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-600 dark:text-rdia-200">{u.etaMin} min</td>
                                <td className="w-6 px-2.5 py-1.5 text-center">
                                  {u.within ? <span className="text-green-500">✓</span> : <span className="text-gray-300 dark:text-rdia-600">·</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </BlockTable>
                      )}

                      {msg.hospitals && msg.hospitals.length > 0 && (
                        <BlockTable title="Établissements de santé" icon={NAV_ICONS.hospitals}>
                          <thead>
                            <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
                              <th className="px-2.5 py-1.5 text-left font-medium">Établissement</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">Ville</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">Lits</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">Occup.</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">REA libre</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">Dist.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {msg.hospitals.map((h) => {
                              const reaLibre = Math.max(0, h.rea - Math.round(h.rea * h.icuPct / 100));
                              return (
                                <tr key={h.id} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                                  <td className="px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{h.nom}</td>
                                  <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{h.ville || "—"}</td>
                                  <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-700 dark:text-rdia-200">{h.lits}</td>
                                  <td className={`px-2.5 py-1.5 text-end font-mono tabular-nums ${h.occPct >= 90 ? "text-red-500" : h.occPct >= 70 ? "text-amber-500" : "text-emerald-500"}`}>{h.occPct}%</td>
                                  <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{reaLibre}</td>
                                  <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-500 dark:text-rdia-400">{h.distanceKm != null ? `${h.distanceKm.toFixed(1)} km` : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </BlockTable>
                      )}

                      {msg.equipment && msg.equipment.length > 0 && (
                        <BlockTable title="Inventaire & équipements" icon={UI_ICONS.archive}>
                          <thead>
                            <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
                              <th className="px-2.5 py-1.5 text-left font-medium">Équipement</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">Catégorie</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">Unité</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">Stock</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">Seuil</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">État</th>
                            </tr>
                          </thead>
                          <tbody>
                            {msg.equipment.map((e, idx) => {
                              const sousSeuil = e.seuil != null && e.stock <= e.seuil;
                              const isHS = /hs|hors|servis|oos|répar/i.test(e.cond);
                              const alert = isHS ? "red" : sousSeuil ? "amber" : "green";
                              const label = isHS ? "HS" : sousSeuil ? "Sous seuil" : "OK";
                              return (
                                <tr key={`${e.id}-${idx}`} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                                  <td className="px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{e.desig}</td>
                                  <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{e.cat}</td>
                                  <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{e.unit || "—"}</td>
                                  <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-700 dark:text-rdia-200">{e.stock}</td>
                                  <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-400 dark:text-rdia-500">{e.seuil ?? "—"}</td>
                                  <td className="px-2.5 py-1.5"><Pill tone={alert as "green" | "amber" | "red"} label={label} /></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </BlockTable>
                      )}

                      {msg.quakes && msg.quakes.length > 0 && (
                        <BlockTable title="Sismicité récente" icon={NAV_ICONS.seismic}>
                          <thead>
                            <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
                              <th className="px-2.5 py-1.5 text-left font-medium">Date</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">Région</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">Mag.</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">Prof.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {msg.quakes.map((q) => (
                              <tr key={q.id} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                                <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[11px] text-gray-500 dark:text-rdia-400">
                                  {new Date(q.time).toLocaleString("fr-FR", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="px-2.5 py-1.5 text-sm text-gray-800 dark:text-rdia-100">{q.region}</td>
                                <td className={`px-2.5 py-1.5 text-end font-mono tabular-nums font-semibold ${q.mag >= 5.5 ? "text-red-500" : q.mag >= 4 ? "text-or-500" : "text-amber-500"}`}>{q.mag.toFixed(1)}</td>
                                <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-600 dark:text-rdia-300">{q.depth} km</td>
                              </tr>
                            ))}
                          </tbody>
                        </BlockTable>
                      )}

                      {msg.cross && (
                        <div className="mt-3 space-y-3">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-or-500">
                            <Icon path={UI_ICONS.branch} size={12} /> Analyse croisée
                          </div>
                          {msg.cross.incident && (
                            <div className="rounded-lg border border-gray-100 p-2.5 text-xs dark:border-rdia-700">
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-rdia-400">1 · Incident cible</div>
                              <div className="text-sm font-semibold text-gray-800 dark:text-rdia-100">{msg.cross.incident.id} — {msg.cross.incident.titre}</div>
                              <div className="mt-0.5 text-[11px] text-gray-500 dark:text-rdia-300">
                                {msg.cross.incident.region}{msg.cross.incident.lieu ? ` · ${msg.cross.incident.lieu}` : ""}
                                {msg.cross.incident.coords ? ` · (${msg.cross.incident.coords[0].toFixed(2)}, ${msg.cross.incident.coords[1].toFixed(2)})` : ""}
                                {msg.cross.incident.sev ? ` · ${msg.cross.incident.sev}` : ""}
                              </div>
                            </div>
                          )}
                          {msg.cross.recommendedUnits && msg.cross.recommendedUnits.length > 0 && (
                            <BlockTable title="2 · Unités recommandées (scores décomposés)" icon={NAV_ICONS.units}>
                              <thead>
                                <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
                                  <th className="px-2.5 py-1.5 text-left font-medium">Unité</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Score</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Temps</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Cap.</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Région</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Dispo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {msg.cross.recommendedUnits.map((u, idx) => (
                                  <tr key={`cr-${idx}-${u.unit.id}`} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                                    <td className="px-2.5 py-1.5">
                                      <div className="font-medium text-gray-800 dark:text-rdia-100">{u.unit.nom}</div>
                                      <div className="text-[10px] text-gray-400 dark:text-rdia-500">{u.unit.ville}{u.unit.type ? ` · ${u.unit.type}` : ""}</div>
                                    </td>
                                    <td className="px-2.5 py-1.5 text-end font-mono tabular-nums font-bold text-or-500">{u.score.toFixed(1)}</td>
                                    <td className={`px-2.5 py-1.5 text-end font-mono tabular-nums ${u.timeScore >= 0.7 ? "text-emerald-500" : u.timeScore >= 0.4 ? "text-amber-500" : "text-red-500"}`}>{u.timeScore.toFixed(2)}</td>
                                    <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-blue-500">{u.capScore.toFixed(2)}</td>
                                    <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-purple-500">{u.regionScore.toFixed(2)}</td>
                                    <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-green-600">{u.dispoScore.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </BlockTable>
                          )}
                          {msg.cross.hospitals && msg.cross.hospitals.length > 0 && (
                            <BlockTable title="3 · Hôpitaux proches & capacité" icon={NAV_ICONS.hospitals}>
                              <thead>
                                <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
                                  <th className="px-2.5 py-1.5 text-left font-medium">Hôpital</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Dist.</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Occup.</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Lits libres</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">REA libre</th>
                                </tr>
                              </thead>
                              <tbody>
                                {msg.cross.hospitals.map((h) => {
                                  const litsLibres = Math.max(0, h.lits - Math.round(h.lits * h.occPct / 100));
                                  const reaLibre = Math.max(0, h.rea - Math.round(h.rea * h.icuPct / 100));
                                  return (
                                    <tr key={`ch-${h.id}`} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                                      <td className="px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{h.nom}</td>
                                      <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-600 dark:text-rdia-300">{h.distanceKm?.toFixed(1)} km</td>
                                      <td className={`px-2.5 py-1.5 text-end font-mono tabular-nums ${h.occPct >= 90 ? "text-red-500" : "text-emerald-500"}`}>{h.occPct}%</td>
                                      <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-700 dark:text-rdia-200">{litsLibres}</td>
                                      <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{reaLibre}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </BlockTable>
                          )}
                          {msg.cross.unitEquipment && msg.cross.unitEquipment.length > 0 && (
                            <BlockTable title="4 · Inventaire rattaché aux unités TOP" icon={UI_ICONS.archive}>
                              <tbody>
                                {msg.cross.unitEquipment.map((x, idx) => (
                                  <tr key={`cue-${idx}`} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                                    <td className="w-32 px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{x.unitName}</td>
                                    <td className="px-2.5 py-1.5 text-sm text-gray-700 dark:text-rdia-200">
                                      {x.equipment.length
                                        ? x.equipment.map((e) => `${e.stock}× ${e.desig}${e.cond !== "OK" ? ` (${e.cond})` : ""}`).join(" · ")
                                        : <span className="text-gray-400 dark:text-rdia-500 italic text-xs">Aucun équipement rattaché</span>
                                      }
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </BlockTable>
                          )}
                          {msg.cross.quakes && msg.cross.quakes.length > 0 && (
                            <div className="rounded-lg border border-gray-100 p-2.5 text-xs dark:border-rdia-700">
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-rdia-400">5 · Séismes &lt; 100 km</div>
                              <ul className="space-y-0.5">
                                {msg.cross.quakes.map((q) => (
                                  <li key={q.id} className="flex justify-between gap-2">
                                    <span className="font-mono text-[11px] text-gray-500 dark:text-rdia-400 shrink-0">
                                      {new Date(q.time).toLocaleString("fr-FR", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                    <span className="flex-1 truncate text-gray-700 dark:text-rdia-200">{q.region}</span>
                                    <span className={`shrink-0 font-mono tabular-nums ${(q as unknown as { mag?: number }).mag != null && (q as unknown as { mag: number }).mag >= 5 ? "text-red-500" : "text-or-500"}`}>
                                      M{(q as unknown as { mag?: number }).mag?.toFixed(1) ?? "?"}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2.5 dark:border-rdia-700/50">
                          <span className="self-center pr-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-rdia-400">Suggérés :</span>
                          {msg.suggestions.map((s) => {
                            const qlabel = typeof s === "string" ? s : s.label;
                            const qquery = typeof s === "string" ? s : s.query;
                            const prio = typeof s === "string" ? false : s.priority === "primary";
                            return (
                              <button
                                key={qlabel}
                                onClick={() => ask(qquery)}
                                disabled={busy}
                                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:border-or-500/60 hover:text-or-500 disabled:opacity-40 ${
                                  prio
                                    ? "border-or-500/40 text-or-500"
                                    : "border-gray-200 text-gray-500 dark:border-rdia-600 dark:text-rdia-300"
                                }`}
                              >
                                {qlabel}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {aiLog.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 4).map((ex) => (
              <button
                key={ex}
                onClick={() => ask(ex)}
                disabled={busy}
                className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 transition-colors hover:border-or-500/50 hover:text-or-500 disabled:opacity-40 dark:border-rdia-600 dark:text-rdia-300"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {aiLog.length > 0 && (
            <button className="btn-secondaire shrink-0 text-sm" onClick={clearAi} disabled={busy}>{m.ai.clear}</button>
          )}
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 dark:border-rdia-600 dark:bg-rdia-700/50">
            <kbd className="hidden shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 dark:border-rdia-600 dark:bg-rdia-700 sm:block">⌘K</kbd>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-gray-400 dark:text-rdia-50"
              placeholder={m.ai.placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={busy}
            />
          </div>
          <button className="btn-primaire shrink-0 text-sm" onClick={() => ask(input)} disabled={busy || !input.trim()}>
            <Icon path={UI_ICONS.send} size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </Modal>
  );
}

function StatsGrid({ stats }: { stats: AiAnswerStats }) {
  if (!stats.items) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.items.map((k) => (
        <div key={k.label} className="rounded-lg border border-gray-100 bg-white p-2 text-center dark:border-rdia-700 dark:bg-rdia-700/50">
          <div className={`text-lg font-bold tabular-nums ${toneForLevel(k.level)}`}>{k.value}</div>
          <div className="truncate text-[10px] text-gray-500 dark:text-rdia-300">{k.label}</div>
        </div>
      ))}
    </div>
  );
}

function BlockTable({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-gray-100 dark:border-rdia-700">
      <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-rdia-700/40 dark:text-rdia-300">
        <Icon path={icon} size={12} />
        {title}
      </div>
      <table className="w-full text-xs">{children}</table>
    </div>
  );
}
