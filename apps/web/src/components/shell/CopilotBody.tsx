"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import {
  AI_ENABLED,
  AI_REFUS_RESPONSE,
  aiSystemPrompt,
  cleanFinalText,
  detectInjection,
  isSafeGreeting,
  resolveProvider,
} from "@/lib/ai/config";
import { probeProvider } from "@/lib/ai/provider";
import {
  buildLlmHistory,
  layer1Shortcut,
  llmTimeoutMs,
  purgeLog,
  runLlmTurn,
  structuredBlocks,
  type LlmMessage,
} from "@/lib/ai/copilot";
import {
  buildLlmUserMessage,
  enrichFromHistory,
  interpret,
  type AiAnswer,
  type AiContext,
} from "@/lib/ai/assistant";
import type { RiskPrediction } from "@/lib/ai/risk/types";
import { CopilotFab } from "@/components/shell/copilot/CopilotFab";
import { CopilotHeader, type ProviderStatus } from "@/components/shell/copilot/CopilotHeader";
import { CopilotEmptyState } from "@/components/shell/copilot/CopilotEmptyState";
import { CopilotMessage } from "@/components/shell/copilot/CopilotMessage";
import { CopilotComposer } from "@/components/shell/copilot/CopilotComposer";
import type { MapFocusAction } from "@/components/shell/copilot/mapFocus";

/**
 * Le Copilot ARGOS — le tiroir de conversation.
 *
 * Ce fichier tient le magasin, l'état de la session (saisie, occupation, état
 * du fournisseur) et le tour de parole `ask` ; ce qui se voit est dans
 * `shell/copilot/` — bouton flottant, en-tête, réglages, message et ses blocs
 * structurés, composeur — et ce qui se calcule dans `lib/ai/copilot/`.
 * Monté sur chaque écran, chargé au premier ⌘K (voir Copilot.tsx).
 */

function pickGreetingResponse(pool: string[]): string {
  const i = Math.floor(Math.random() * pool.length);
  return pool[i] ?? pool[0] ?? "";
}

export default function CopilotBody() {
  const t = useDict();
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
  // Module prédictions risques IA → transmis dans AiContext (Couche1 + buildLlmUserMessage)
  const riskPredictions = useArgos((s) => s.riskPredictions);
  const selUnit = useArgos((s) => s.selUnit);
  const selHosp = useArgos((s) => s.selHosp);
  const selMarker = useArgos((s) => s.selMarker);

  const aiLog = useArgos((s) => s.aiLog);
  const pushAi = useArgos((s) => s.pushAi);
  const updateAi = useArgos((s) => s.updateAi);
  const clearAi = useArgos((s) => s.clearAi);
  const aiSettings = useArgos((s) => s.aiSettings);
  const setAiSettings = useArgos((s) => s.setAiSettings);
  const setMapCenter = useArgos((s) => s.setMapCenter);
  const focusIncident = useArgos((s) => s.focusIncident);

  const cfg = resolveProvider(aiSettings);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ProviderStatus>("checking");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Salutations et suggestions dans la langue de session. La REQUÊTE envoyée au
  // moteur reste la formulation canonique française : la Couche 1 (analyse
  // d'intention) est réglée sur elle — le libellé affiché, lui, suit l'opérateur.
  const safeGreetings = useMemo(
    () => [t.cp_greet_1, t.cp_greet_2, t.cp_greet_3, t.cp_greet_4, t.cp_greet_5, t.cp_greet_6],
    [t],
  );
  const emptySuggestions = useMemo(
    () => [
      { label: t.cp_sugg_situation, query: "Quelle est la situation actuelle ?" },
      { label: t.cp_sugg_critical, query: "Quels sont les incidents critiques ?" },
      { label: t.cp_sugg_last24, query: "Résume-moi les incidents des dernières 24 heures" },
    ],
    [t],
  );

  // Migration transparente : endpoint "localhost" (IPv6 intermittent) → IP IPv4 fixe 127.0.0.1
  useEffect(() => {
    const ep = (aiSettings.endpoint || "").trim().toLowerCase();
    if (/\/\/localhost:11434(\/|$)/.test(ep) || /\/\/localhost:8000(\/|$)/.test(ep)) {
      const ip = ep.includes(":8000") ? "http://127.0.0.1:8000" : "http://127.0.0.1:11434";
      setAiSettings({ endpoint: ip });
    }
  }, [aiSettings.endpoint, setAiSettings]);

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

  // Échap ferme le tiroir. L'en-tête l'annonce déjà (« Fermer (Échap) ») mais
  // rien ne l'implémentait ; sur mobile le tiroir couvre tout l'écran, il faut
  // pouvoir en sortir autrement qu'en visant la croix.
  useEffect(() => {
    if (!copilotOpen) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeCopilot();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [copilotOpen, closeCopilot]);

  // Suggestions contextuelles selon écran courant + sélections
  const suggestions = useMemo(() => {
    // Paires { libellé localisé, requête canonique française } — voir note
    // au-dessus de `emptySuggestions`.
    const base: { label: string; query: string }[] = [
      { label: t.cp_ctx_global, query: "Situation globale opérationnelle" },
      { label: t.cp_ctx_trends, query: "Tendances incidents 30 derniers jours" },
      { label: t.cp_ctx_sitrep, query: "SITREP incidents en cours" },
      { label: t.cp_ctx_hospitals, query: "État des hôpitaux" },
    ];
    const incMatch = path.match(/\/incidents\/(INC-\d+)/i);
    const focusedIncId = incMatch?.[1] ?? (selMarker?.kind === "inc" ? selMarker.id : null);
    const focusedInc = incidents.find((i) => i.id === focusedIncId) ?? null;
    if (focusedInc) {
      base.unshift({ label: t.cp_ctx_cross.replace("{id}", focusedInc.id), query: `Analyse croisée ${focusedInc.id}` });
      base.unshift({ label: t.cp_ctx_detail.replace("{id}", focusedInc.id), query: `Détail de ${focusedInc.id}` });
    }
    if (selUnit) {
      const u = units.find((x) => x.id === selUnit);
      base.push({ label: t.cp_ctx_unit.replace("{nom}", u?.nom ?? selUnit), query: `Statut unité ${u?.nom ?? selUnit}` });
    }
    if (selHosp) {
      const h = hospitals.find((x) => x.id === selHosp);
      base.push({ label: t.cp_ctx_hosp.replace("{nom}", h?.nom ?? selHosp), query: `Statut hôpital ${h?.nom ?? selHosp}` });
    }
    if (path.startsWith("/seism")) base.unshift({ label: t.cp_ctx_seismic, query: "Activité sismique récente" });
    if (path.includes("orsec") || path.includes("plan")) base.unshift({ label: t.cp_ctx_orsec, query: "Synthèse ORSEC" });
    if (path.startsWith("/command") || path.startsWith("/dash") || path.startsWith("/tableau")) {
      base.unshift({ label: t.cp_ctx_toll, query: "Bilan humain global" });
      base.unshift({ label: t.cp_ctx_posture, query: "Posture globale des unités FAR" });
    }
    const seen = new Set<string>();
    return base.filter((x) => (seen.has(x.query) ? false : (seen.add(x.query), true))).slice(0, 8);
  }, [path, incidents, units, hospitals, selUnit, selHosp, selMarker]);

  const ask = useCallback(
    // `display` : texte montré dans le fil quand il diffère de la requête
    // envoyée au moteur (puce cliquée dans une autre langue que le français).
    async (query: string, display?: string) => {
      const qRaw = query.trim();
      if (!qRaw || busy) return;

      // 🛡️ Garde-fou : détecté D'ABORD sur le texte brut, avant tout
      // enrichissement — l'enrichissement casserait la liste blanche.
      if (detectInjection(qRaw)) {
        setInput("");
        pushAi({ role: "user", text: display ?? qRaw });
        pushAi({ role: "assistant", text: AI_REFUS_RESPONSE, provider: t.cp_guard, refused: true });
        return;
      }

      // 🤝 Salutation détachée : réponse immédiate, ni Couche 1 ni modèle.
      // Zéro délai, zéro risque de fuite d'invite sur des données vides.
      if (isSafeGreeting(qRaw)) {
        setInput("");
        pushAi({ role: "user", text: display ?? qRaw });
        pushAi({ role: "assistant", text: pickGreetingResponse(safeGreetings), provider: t.cp_title });
        return;
      }

      setInput("");
      pushAi({ role: "user", text: display ?? qRaw });

      // 🧠 Couche 1 : la question, enrichie de l'historique, est interprétée
      // sur les données ARGOS. C'est elle qui décide si le modèle est consulté.
      const enriched = enrichFromHistory(qRaw, aiLog);
      const q = enriched.query;
      const pathInc = path.match(/\/incidents\/(INC-\d+)/i)?.[1];
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
        currentIncidentId: enriched.targetIncidentId || pathInc || (selMarker?.kind === "inc" ? selMarker.id : undefined),
        riskPredictions,
        analytics: catalog.analytics ?? null,
      };
      const answer = interpret(q, ctx);

      // Intentions servies par la Couche 1 seule (voir lib/ai/copilot/blocks.ts).
      const raccourci = layer1Shortcut(answer);
      if (raccourci) {
        const provider =
          raccourci === "social"
            ? t.cp_title
            : raccourci === "cross_analysis"
              ? t.cp_provider_cross
              : raccourci === "mobilizable_potential"
                ? t.cp_provider_potential
                : t.cp_inv_src;
        pushAi({
          role: "assistant",
          text: cleanFinalText(answer.text),
          provider,
          intent: answer.intent,
          suggestions: answer.suggestions,
          ...(raccourci === "social" ? {} : { deterministic: true, layer1: answer.layer1, ...structuredBlocks(answer, true) }),
        });
        setBusy(false);
        return;
      }

      // Les prédictions de risque voyagent HORS du JSON de données : le
      // constructeur d'invite les lit ici et les rend en contexte naturel,
      // jamais en « valeur issue de … ».
      const withRiskCtx = answer as AiAnswer & { _riskCtx?: RiskPrediction[] };
      withRiskCtx._riskCtx = riskPredictions;

      // Le fil ne montre que « traitement en cours » : les blocs structurés
      // arrivent avec le texte final, jamais avant — l'utilisateur ne voit plus
      // une réponse Couche 1 remplacée sous ses yeux.
      const msgId = pushAi({ role: "assistant", text: t.cp_processing, provider: t.cp_provider_iris, intent: answer.intent });
      setBusy(true);
      // Priorité à l'opérateur : les recalculs IA de fond patientent le temps
      // de la réponse (mesuré : 26,9 s de premier jeton avec eux devant, 3,5 s sans).
      useArgos.getState().setAiOperatorBusy(true);
      const blocs = structuredBlocks(answer);
      const repli = (llmError: string) =>
        updateAi(msgId, {
          text: cleanFinalText(answer.text),
          provider: t.cp_provider_iris,
          deterministic: true,
          intent: answer.intent,
          llmError,
          layer1: answer.layer1,
          ...blocs,
          suggestions: answer.suggestions,
        });
      try {
        // Purge douce du journal avant de construire l'historique.
        const purged = purgeLog(useArgos.getState().aiLog, aiLog);
        if (purged !== useArgos.getState().aiLog) useArgos.setState({ aiLog: purged });
        const lang = useArgos.getState().lang;
        const messages: LlmMessage[] = [
          { role: "system", content: aiSystemPrompt(lang, aiSettings.systemPrompt) },
          ...buildLlmHistory(aiLog),
          { role: "user", content: buildLlmUserMessage(q, withRiskCtx, lang, ctx) },
        ];
        const issue = await runLlmTurn(cfg, messages, {
          skipLeakGuard: isSafeGreeting(qRaw),
          timeoutMs: llmTimeoutMs(status === "online", q),
          onLeak: () =>
            updateAi(msgId, {
              text: AI_REFUS_RESPONSE,
              provider: t.cp_guard_leak,
              refused: true,
            }),
          // Pendant le flux : texte + fournisseur seulement, SANS persistance.
          onRender: (text) =>
            updateAi(
              msgId,
              {
                text,
                provider: t.cp_streaming,
              },
              { persist: false },
            ),
        });
        useArgos.getState().setAiOperatorBusy(false);

        if (issue.kind === "leaked") return; // déjà remplacé par le refus
        if (issue.kind === "empty") {
          repli(t.cp_error_friendly);
          return;
        }
        // ✅ Modèle OK — texte du modèle, blocs si l'intention est reconnue.
        updateAi(msgId, {
          text: cleanFinalText(issue.text),
          provider: t.cp_provider_iris,
          intent: answer.intent,
          ...blocs,
          suggestions: answer.suggestions,
        });
      } catch (err) {
        useArgos.getState().setAiOperatorBusy(false);
        // eslint-disable-next-line no-console
        console.error("[Copilot] ask() runtime error:", err);
        repli(t.cp_error_friendly);
      } finally {
        setBusy(false);
      }
    },
    [busy, aiLog, pushAi, incidents, movements, units, hospitals, quakes, dashStats, catalog, path, selMarker, status, cfg, updateAi],
  );

  /** « Afficher sur la carte » : sélectionner l'incident s'il existe, sinon centrer. */
  const onFocus = (a: MapFocusAction) => {
    if (!a) return;
    if (a.kind === "incident") focusIncident(a.incident);
    else setMapCenter(a.ll, a.zoom, a.label);
  };

  if (!AI_ENABLED) return null;

  // Nombre de messages AI non lus (pour badge du trigger)
  const unreadBadge = Math.min(99, aiLog.filter((m) => m.role === "assistant").length);

  return (
    <>
      {!copilotOpen && <CopilotFab unread={unreadBadge} />}

      {/* Voile quand le Copilot est ouvert — clic → fermer */}
      {copilotOpen && (
        <div
          onClick={closeCopilot}
          aria-hidden
          className="fixed inset-0 z-[60] animate-fade-in bg-rdia-900/40 backdrop-blur-sm dark:bg-black/50 sm:bg-rdia-900/20"
          style={{ animationDuration: "180ms" }}
        />
      )}

      {/* Tiroir latéral droit — plein écran sous sm (hauteur en `dvh` pour ne pas
          passer sous la barre d'adresse mobile), largeur fixe ensuite. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t.cp_title}
        className={`fixed z-[70] flex flex-col bg-white shadow-2xl ring-1 ring-gray-200/70 transition-transform duration-300 ease-out dark:bg-rdia-800 dark:ring-rdia-700/60
          ${copilotOpen ? "translate-x-0" : "translate-x-[110%] pointer-events-none"}
          top-0 right-0 h-dvh w-full max-w-full sm:w-[460px] md:w-[500px]`}
      >
        <CopilotHeader
          status={status}
          busy={busy}
          canClear={aiLog.length > 0}
          onClear={clearAi}
          onClose={closeCopilot}
        />


        <div ref={scrollRef} className="carte m-0 flex-1 overflow-y-auto rounded-none border-0 bg-gray-50/50 p-3.5 dark:bg-rdia-900/40 sm:p-4">
          {aiLog.length === 0 ? (
            <CopilotEmptyState suggestions={emptySuggestions} busy={busy} onAsk={ask} />
          ) : (
            <div className="flex flex-col gap-4">
              {aiLog.map((msg) => (
                <CopilotMessage key={msg.id} msg={msg} incidents={incidents} busy={busy} onAsk={(q) => ask(q)} onFocus={onFocus} />
              ))}
            </div>
          )}
        </div>

        <CopilotComposer
          input={input}
          busy={busy}
          hasMessages={aiLog.length > 0}
          suggestions={suggestions.slice(0, 4)}
          inputRef={inputRef}
          onInput={setInput}
          onAsk={ask}
        />
      </aside>
    </>
  );
}
