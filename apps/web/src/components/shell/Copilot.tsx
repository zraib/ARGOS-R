"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import {
  AI_ENABLED,
  AI_REFUS_RESPONSE,
  AI_SYSTEM_PROMPT,
  cleanFinalText,
  detectInjection,
  detectLeakedPrompt,
  isSafeGreeting,
  resolveProvider,
} from "@/lib/ai/config";
import { chatStream, probeProvider } from "@/lib/ai/provider";
import {
  buildLlmUserMessage,
  enrichFromHistory,
  interpret,
  type AiAnswer,
  type AiContext,
  type AiAnswerStats,
} from "@/lib/ai/assistant";
import type { RiskPrediction } from "@/lib/ai/risk/types";

type ProviderStatus = "checking" | "online" | "offline";

const SAFE_GREETING_RESPONSES: string[] = [
  "Bonjour opérateur. Prêt pour la **plateforme ARGOS** : incidents, unités, hôpitaux, ORSEC, logistique, sismologie. Que souhaitez-vous consulter ?",
  "Bonjour ! Je suis prêt pour la **plateforme ARGOS**. Demande-moi une vue globale, un détail d'incident, un croisement de données ou un SITREP.",
  "Salut opérateur, à votre service sur la **plateforme ARGOS** 🫡. Quelle situation voulez-vous analyser ?",
  "Bonsoir. À votre disposition sur la **plateforme ARGOS** : incidents, unités, hôpitaux, ORSEC, logistique, sismologie.",
  "Hello ! Disponible immédiatement sur la **plateforme ARGOS** pour toute interrogation opérationnelle.",
  "Pris en compte, opérateur. Je suis prêt sur la **plateforme ARGOS** — formulez votre demande.",
];
function pickGreetingResponse(): string {
  // Évite de retomber 2x sur le même message (quand on a 2+ éléments).
  const i = Math.floor(Math.random() * SAFE_GREETING_RESPONSES.length);
  return SAFE_GREETING_RESPONSES[i] ?? SAFE_GREETING_RESPONSES[0];
}

const DEFAULT_EMPTY_SUGGESTIONS: { label: string; query: string }[] = [
  { label: "Quelle est la situation actuelle ?", query: "Quelle est la situation actuelle ?" },
  { label: "Quels sont les incidents critiques ?", query: "Quels sont les incidents critiques ?" },
  { label: "Résume-moi les dernières 24 heures", query: "Résume-moi les incidents des dernières 24 heures" },
  { label: "Prédictions IA de risques", query: "Quelles sont les prédictions de risques IA ?" },
];

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
  type OllamaTag = { name: string; size: number; modified_at: string; digest: string };
  const [ollamaTags, setOllamaTags] = useState<OllamaTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [manualModelMode, setManualModelMode] = useState(false);
  const [manualModelInput, setManualModelInput] = useState(aiSettings.model);
  const [showSettings, setShowSettings] = useState(false);
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

      // 🛡️ Garde-fou sécurité : DÉTECTER D'ABORD SUR LE TEXTE BRUT UTILISATEUR
      // (avant pushAi, avant enrichFromHistory, avant tout traitement).
      // → évite que l'enrichissement / préfixage casse la liste blanche de salutations.
      if (detectInjection(qRaw)) {
        setInput("");
        pushAi({ role: "user", text: qRaw });
        pushAi({
          role: "assistant",
          text: AI_REFUS_RESPONSE,
          provider: "Garde-fou sécurité",
          refused: true,
        });
        return;
      }

      // 🤝 SALUTATIONS DÉTACHÉES (bonjour / salut / hello / merci etc.)
      // → COURT-CIRCUIT COMPLET : PAS d'appel interpret, PAS d'appel LLM/Ollama.
      //   Raisons:
      //   1. GARANTIE la forme "plateforme ARGOS" + interdit "Aucune donnée transmise".
      //   2. 0 ms de réponse (pas de stream LLM pour un bonjour).
      //   3. Évite 0-risk de fuite prompt / écho JSON sur données vides.
      //   4. Économise GPU/RAM de l'utilisateur.
      if (isSafeGreeting(qRaw)) {
        setInput("");
        pushAi({ role: "user", text: qRaw });
        pushAi({
          role: "assistant",
          text: pickGreetingResponse(),
          provider: "Copilot ARGOS",
        });
        return;
      }

      setInput("");
      pushAi({ role: "user", text: qRaw });

      // 🧠 Mémoire Couche 1 : enrichit les questions vagues
      const enriched = enrichFromHistory(qRaw, aiLog);
      const q = enriched.query;

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
        riskPredictions,
      };
      const answer = interpret(q, ctx);

      // 🔥 🔥 RACCORCI D'INTENTION SOCIALE / SALUTATION / ÉQUIPEMENT :
      // Si la Couche 1 a identifié intent=greeting OU intent=social →
      // → On NE PASSE PAS AU LLM (évite hallucinations type "hôpitaux militaires 100/100"
      //   + économise GPU + délais). On affiche DIRECTEMENT la réponse Couche 1.
      // → De même pour intent=equipment_search : LA COUCHE 1 POSSEDE DÉJÀ L'ÉTAT COMPLET
      //   (ruptures HS / sous seuil) depuis ctx.equipment. Le LLM a TENDANCE À RÉPONDRE
      //   « Donnée absente » ou d'inventer des stocks non conformes sur ce type de requête
      //   → on court-circuite complètement et on rend la Couche 1 structurée.
      if (answer.intent === "greeting" || answer.intent === "social") {
        setInput("");
        const socialMsgId = pushAi({
          role: "assistant",
          text: cleanFinalText(answer.text),
          provider: "Copilot ARGOS",
          suggestions: answer.suggestions,
        });
        void socialMsgId;
        setBusy(false);
        return;
      }
      if (answer.intent === "equipment_search" || answer.intent === "equipment_critical_status") {
        setInput("");
        const equipMsgId = pushAi({
          role: "assistant",
          text: cleanFinalText(answer.text),
          provider: "Données ARGOS · inventaire & stocks",
          deterministic: true,
          layer1: answer.layer1,
          suggestions: answer.suggestions,
          units: answer.units,
          incidents: answer.incidents,
          hospitals: answer.hospitals,
          quakes: answer.quakes,
          equipment: answer.topEquip,
          stats: answer.stats,
          cross: answer.cross,
        });
        void equipMsgId;
        setBusy(false);
        return;
      }
      // 🔥 RACCourci CROSS ANALYSIS (dispositif / équipements pour INC / fiche 360) :
      //    crossAnalysis contient TOUT le dispositif (unités reco + hôpitaux + équipements liés)
      //    en Couche 1 (recommandations réelles, 100% ARGOS). Le LLM tend à diluer ça en
      //    texte trop long / hors sujet → on affiche direct Couche1.
      if (answer.intent === "cross_analysis") {
        setInput("");
        const crossMsgId = pushAi({
          role: "assistant",
          text: cleanFinalText(answer.text),
          provider: "ARGOS · dispositif & recommandations",
          deterministic: true,
          layer1: answer.layer1,
          suggestions: answer.suggestions,
          units: answer.units,
          incidents: answer.incidents,
          hospitals: answer.hospitals,
          quakes: answer.quakes,
          equipment: answer.topEquip,
          stats: answer.stats,
          cross: answer.cross,
        });
        void crossMsgId;
        setBusy(false);
        return;
      }
      // 🔥 RACCourci POTENTIEL MOBILISABLE (géographique périmètre / région / ville / rayon km)
      if (answer.intent === "mobilizable_potential") {
        setInput("");
        const mobMsgId = pushAi({
          role: "assistant",
          text: cleanFinalText(answer.text),
          provider: "ARGOS · potentiel mobilisable",
          deterministic: true,
          layer1: answer.layer1,
          suggestions: answer.suggestions,
          units: answer.units,
          incidents: answer.incidents,
          hospitals: answer.hospitals,
          quakes: answer.quakes,
          equipment: answer.topEquip,
          stats: answer.stats,
          cross: answer.cross,
        });
        void mobMsgId;
        setBusy(false);
        return;
      }
      // Attachement de riskPredictions sur la réponse → utilisé par buildLlmUserMessage (ctxNotes français)
      // NOTE: on ne JAMAIS l'injecter dans data JSON → pas d'écho "valeur issue de xxx"
      // (buildLlmUserMessage lit `_riskCtx` et l'envoie uniquement dans CONTEXTE GLOBAL naturel)
      const withRiskCtx = answer as AiAnswer & { _riskCtx?: RiskPrediction[] };
      withRiskCtx._riskCtx = riskPredictions;

      // ---  UX QWEN D'ABORD : pushAi initial = AUCUN bloc structuré affiché.
      // On NE montre à l'utilisateur QUE le texte "Traitement en cours…" + provider.
      // Les blocs (incidents, hôpitaux, unités, quakes, équipements, stats, cross, suggestions)
      // SONT AJOUTÉS À LA FIN UNIQUEMENT :
      //   1) si stream LLM termine → texte final Qwen + blocs montés EN MÊME TEMPS
      //   2) si fallback timeout/erreur → texte Couche1 + (si known intent) blocs montés EN MÊME TEMPS
      // BUT : utilisateur NE VOIT PLUS JAMAIS "réponse Couche1" avant traitement,
      // il voit : Traitement → stream Qwen mot par mot → puis blocs structurés ajoutés en dessous.
      const msgId = pushAi({
        role: "assistant",
        text: "Traitement en cours…",
        provider: `${cfg.label} · ${cfg.model}`,
      });

      setBusy(true);
      const t0 = Date.now();
      // 🛡️ Guard ultime: si la question utilisateur est une salutation innocente
      // (bonjour/hello/salut/merci etc.) → on DÉSACTIVE LE GARDE-FOU NIVEAU 2
      // (detectLeakedPrompt) pour laisser le LLM répondre poliment normalement.
      // → Évite "fuite prompt détectée» sur les formules de politesse classiques.
      const skipLeakGuard = isSafeGreeting(qRaw);
      try {
        // 🔥🔥🔥 MIN TIMEOUT Qwen2.5:14b (9GB Ollama local) = 40s MÍNIMUM.
        //      1er token : chauffe GPU/RAM + load modèle, souvent 20-35s.
        //      Les anciens timeouts 15s (offline) / 25s (online) étaient TOUJOURS < 1er token →
        //      systématiquement Couche1 fallback.
        const baseTimeoutMs = status === "online" ? 90_000 : 70_000;
        const qWords = q.trim().split(/\s+/).filter(Boolean).length;
        const timeoutMs = Math.max(baseTimeoutMs, qWords > 6 ? 120_000 : baseTimeoutMs);
        let finished = false;
        let llmText = "";
        let firstTokenAt: number | null = null;

        // Historique conversation
        // ⚠️ CRITIQUE 13/08/26 : Qwen2.5:14b = 32 768 tokens TOTAL FENÊTRE (n_ctx_train=32768 IMPOSÉ PAR LE GGUF).
        // Ollama REFUSE num_ctx>32768: WARN "requested context size too large for model".
        // → BUDGET TOTAL FENÊTRE :
        //   system prompt : ~1500 tokens
        //   historique    : max 2 turns (4 messages), ~250 tokens/msg = ~1 000 tokens
        //   user message  : max ~3 500 tokens (LLM_MAX_ROWS=2, summary 600c)
        //   réponse       : max 4 000 tokens
        //   = TOTAL ~10 000 tokens — bien SOUS 32768 (facteur sécurité ×3).
        const maxTurns = 2;
        const aiLogLen = aiLog.length;
        if (aiLogLen > 8) {
          // PURGE DOUCE AUTO: plus de 8 messages (4 turns) → on ne garde QUE les 4 derniers (2 turns).
          // Évite accumulation historique 40 msg = 100K tokens.
          const purgeFrom = aiLogLen - 4;
          try {
            const keepIds = aiLog.slice(purgeFrom).map((m) => m.id);
            const all = useArgos.getState().aiLog;
            const purged = all.filter((m) => keepIds.includes(m.id) || !m.id.startsWith("ai-"));
            if (purged.length !== all.length) {
              useArgos.setState({ aiLog: purged });
            }
          } catch { /* ignore purge errors */ }
        }
        const historySlice = aiLog.slice(-(maxTurns * 2));
        const llmHistory: { role: "system" | "user" | "assistant"; content: string }[] = [];
        for (const hm of historySlice) {
          if (!hm.text || !hm.text.trim()) continue;
          if (hm.refused) continue;
          // 🔥 TRONCATURE DURE SÉCURITÉ historique: assistant 800 chars MAX / user 600 chars MAX.
          // → jamais 40K tokens d'ancien markdown answer.text dans l'historique.
          let content = hm.text;
          if (hm.role === "assistant" && content.length > 800) content = content.slice(0, 800) + "\n[…tronqué…]";
          if (hm.role === "user" && content.length > 600) content = content.slice(0, 600) + "\n[…trop long tronqué…]";
          if (hm.role === "user") llmHistory.push({ role: "user", content });
          else if (hm.role === "assistant") llmHistory.push({ role: "assistant", content });
        }

        const streamProviderPrefix = "…";
        let leaked = false;
        const applyLeakRefusal = () => {
          if (leaked || skipLeakGuard) return;
          leaked = true;
          updateAi(msgId, {
            text: AI_REFUS_RESPONSE,
            provider: "🛡️ Garde-fou sécurité (fuite prompt détectée)",
            refused: true,
          });
        };
        const res = await Promise.race([
          chatStream(
            cfg,
            [
              { role: "system", content: AI_SYSTEM_PROMPT },
              ...llmHistory,
              { role: "user", content: buildLlmUserMessage(q, withRiskCtx) },
            ],
            {
              onToken: (acc) => {
                try {
                  if (finished || leaked) return;
                  if (!skipLeakGuard && detectLeakedPrompt(acc)) {
                    applyLeakRefusal();
                    return;
                  }
                  // 1er token reçu : horodatage (diagnostic + provider)
                  if (firstTokenAt === null) firstTokenAt = Date.now();
                  llmText = acc;
                  // On n'affiche QUE text + provider pendant stream (pas de blocs structurés).
                  // 🔥 Nettoyage PENDANT stream aussi (phrases "Aucune donnée...")
                  const firstTokenSec = firstTokenAt ? ((firstTokenAt - t0) / 1000).toFixed(1) : null;
                  updateAi(msgId, {
                    text: cleanFinalText(acc),
                    provider: firstTokenSec
                      ? `${streamProviderPrefix} · ${cfg.label} (${cfg.model}) · 1er token T+${firstTokenSec}s`
                      : `${streamProviderPrefix} · ${cfg.label} (${cfg.model}) · attente 1er token…`,
                  });
                } catch (e) {
                  // Ne pas cacher l'erreur : logger en console pour dev.
                  // eslint-disable-next-line no-console
                  console.warn("[Copilot] onToken error:", e);
                }
              },
            },
          ),
          new Promise<{ ok: false; text: ""; aborted: true }>((resolve) =>
            setTimeout(() => resolve({ ok: false, text: "", aborted: true }), timeoutMs),
          ),
        ]);
        finished = true;
        const durationSec = ((Date.now() - t0) / 1000).toFixed(1);
        const llmEmpty = !("ok" in res) || !res.ok || !llmText || !llmText.trim();
        const timeoutHit = !("ok" in res) || (res as { aborted?: boolean }).aborted === true;
        const httpError = "ok" in res && !res.ok && typeof (res as { error?: string }).error === "string";
        // 🚨 QWEN D'ABORD : on n'ajoute LES BLOCS STRUCTURÉS (units/incidents/hospitals/quakes/stats)
        //    QU'EN CAS DE SUCCÈS LLM (intent != unknown) OR intent reconnu explicitement
        //    par Couche1. Si intent === "unknown" (regex n'a pas compris) → on LAISSE QWEN
        //    répondre avec contexte. Si LLM échoue (timeout/err) → ON NE MONTE PAS LES BLOCS
        //    pour ne pas afficher 30 lignes de VUE GLOBALE à tort.
        const isUnknown = answer.intent === "unknown";
        const mountStructured = !isUnknown;
        if (leaked) {
          /* déjà refus via applyLeakRefusal */
        } else if (!skipLeakGuard && detectLeakedPrompt(llmText)) {
          applyLeakRefusal();
        } else if (llmEmpty) {
          const errRaw = httpError ? (res as { error?: string }).error : undefined;
          const llmError = timeoutHit
            ? `⏱️ Délai ${durationSec}s expiré`
            : httpError && errRaw
              ? errRaw
              : `réponse vide`;
          updateAi(msgId, {
            text: cleanFinalText(answer.text),
            provider: `Données ARGOS · ${answer.intent === "unknown" ? "données partielles" : "réponse détaillée"}`,
            deterministic: true,
            llmError: `🤖 ${cfg.label} : ${llmError}`,
            layer1: answer.layer1,
            units: mountStructured ? answer.units : undefined,
            incidents: mountStructured ? answer.incidents : undefined,
            hospitals: mountStructured ? answer.hospitals : undefined,
            quakes: mountStructured ? answer.quakes : undefined,
            equipment: mountStructured ? answer.topEquip : undefined,
            stats: mountStructured ? answer.stats : undefined,
            cross: mountStructured ? answer.cross : undefined,
            suggestions: answer.suggestions,
          });
        } else {
          // ✅ LLM OK — montée blocs si intent reconnu (sinon Qwen a déjà parlé)
          const first = firstTokenAt ? `1er token T+${((firstTokenAt - t0) / 1000).toFixed(1)}s · ` : "";
          updateAi(msgId, {
            text: cleanFinalText(llmText),
            provider: `🤖 ${cfg.label} · ${cfg.model} · ${first}durée ${durationSec}s`,
            units: mountStructured ? answer.units : undefined,
            incidents: mountStructured ? answer.incidents : undefined,
            hospitals: mountStructured ? answer.hospitals : undefined,
            quakes: mountStructured ? answer.quakes : undefined,
            equipment: mountStructured ? answer.topEquip : undefined,
            stats: mountStructured ? answer.stats : undefined,
            cross: mountStructured ? answer.cross : undefined,
            suggestions: answer.suggestions,
          });
        }
      } catch (err) {
        const durationSec = ((Date.now() - t0) / 1000).toFixed(1);
        const msg = err instanceof Error ? err.message : "erreur inconnue";
        // eslint-disable-next-line no-console
        console.error("[Copilot] ask() runtime error:", err);
        const isUnknown = answer.intent === "unknown";
        const mountStructured = !isUnknown;
        // ⚠️ ERREUR RUNTIME → fallback Couche 1
        updateAi(msgId, {
          text: answer.text,
          provider: `Données ARGOS · ${answer.intent === "unknown" ? "données partielles" : "réponse détaillée"}`,
          deterministic: true,
          llmError: `⛔ ERREUR T+${durationSec}s : ${msg}`,
          layer1: answer.layer1,
          units: mountStructured ? answer.units : undefined,
          incidents: mountStructured ? answer.incidents : undefined,
          hospitals: mountStructured ? answer.hospitals : undefined,
          quakes: mountStructured ? answer.quakes : undefined,
          equipment: mountStructured ? answer.topEquip : undefined,
          stats: mountStructured ? answer.stats : undefined,
          cross: mountStructured ? answer.cross : undefined,
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

  const statusDot =
    status === "online"
      ? { bg: "bg-emerald-500", ring: "bg-emerald-500/20", title: "Copilot prêt" }
      : status === "offline"
        ? { bg: "bg-amber-500", ring: "bg-amber-500/20", title: "Mode déterministe seul" }
        : { bg: "bg-gray-400", ring: "bg-gray-200", title: "Vérification…" };

  if (!AI_ENABLED) return null;

  // Nombre de messages AI non lus (pour badge du trigger)
  const unreadBadge = Math.min(99, aiLog.filter((m) => m.role === "assistant").length);

  return (
    <>
      {/* 🌟 BOUTON FLOTTANT (FAB) — visible quand Copilot fermé */}
      {!copilotOpen && (
        <button
          aria-label="Ouvrir le Copilot ARGOS (⌘K)"
          title="Ouvrir le Copilot ARGOS (⌘K)"
          onClick={() => useArgos.getState().openCopilot()}
          className="fixed bottom-6 right-6 z-50 group"
        >
          <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-or-500 via-rdia-500 to-red-500 blur opacity-40 group-hover:opacity-70 transition-opacity duration-300" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-or-500 to-rdia-500 text-white shadow-2xl shadow-or-500/40 ring-4 ring-white dark:ring-rdia-800 transition-transform duration-200 group-hover:scale-110 active:scale-95">
            <Icon path={UI_ICONS.copilot} size={24} strokeWidth={2} />
            {unreadBadge > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white dark:border-rdia-800">
                {unreadBadge}
              </span>
            )}
          </span>
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-rdia-800 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-rdia-700">
            Copilot · ⌘K
          </span>
        </button>
      )}

      {/* 🎬 BACKDROP (overlay quand Copilot ouvert) — click → fermer */}
      {copilotOpen && (
        <div
          onClick={closeCopilot}
          aria-hidden
          className="fixed inset-0 z-[60] animate-fade-in bg-rdia-900/40 backdrop-blur-sm dark:bg-black/50 sm:bg-rdia-900/20"
          style={{ animationDuration: "180ms" }}
        />
      )}

      {/* 📱 PANEL LATÉRAL DROIT (drawer flottant) */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Copilot ARGOS"
        className={`fixed z-[70] flex flex-col bg-white shadow-2xl ring-1 ring-gray-200/70 transition-transform duration-300 ease-out dark:bg-rdia-800 dark:ring-rdia-700/60
          ${copilotOpen ? "translate-x-0" : "translate-x-[110%] pointer-events-none"}
          top-0 right-0 h-full w-[100vw] sm:w-[460px] md:w-[500px]`}
      >
        {/* ========= HEADER PANEL (MINIMALISTE) ========= */}
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-100/70 bg-white/80 px-4 py-3 backdrop-blur dark:border-rdia-700/50 dark:bg-rdia-800/80">
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-or-500/15 text-or-500 ring-1 ring-or-500/20">
              <Icon path={NAV_ICONS.assistant} size={18} />
              <span
                title={statusDot.title}
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${statusDot.bg} ring-2 ring-white dark:ring-rdia-800`}
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold leading-none text-rdia-600 dark:text-rdia-50">Copilot ARGOS</h2>
              <p className="mt-0.5 text-[10px] text-gray-400 dark:text-rdia-400 truncate">Assistant opérationnel</p>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              disabled={busy}
              title={showSettings ? "Masquer les paramètres" : "Paramètres (modèle…)"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                showSettings
                  ? "bg-or-500/10 text-or-500 ring-1 ring-or-500/25"
                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-rdia-700/50 dark:hover:text-rdia-100"
              } disabled:opacity-40`}
              aria-label="Paramètres"
            >
              <Icon path={UI_ICONS.sliders} size={15} />
            </button>
            <button
              type="button"
              onClick={clearAi}
              disabled={busy || aiLog.length === 0}
              title={aiLog.length === 0 ? "Historique vide" : "Vider l'historique"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rdia-700/50 dark:hover:text-red-400"
              aria-label="Vider l'historique"
            >
              <Icon path={UI_ICONS.trash} size={14} />
            </button>
            <button
              type="button"
              aria-label="Fermer"
              title="Fermer (Échap)"
              onClick={closeCopilot}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-rdia-700/50 dark:hover:text-rdia-100"
            >
              <Icon path={UI_ICONS.close} size={15} />
            </button>
          </div>
        </header>

        {/* ===== PARAMÈTRES DÉPLOIABLES (choix modèle) — CACHÉ PAR DÉFAUT ===== */}
        {showSettings && (
          <div className="shrink-0 border-b border-gray-100/70 bg-gray-50/70 px-4 py-3 text-[11px] dark:border-rdia-700/50 dark:bg-rdia-900/50 animate-fade-in">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300">
              <Icon path={NAV_ICONS.assistant} size={10} />
              Modèle
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white/80 px-2 py-1.5 dark:border-rdia-700/60 dark:bg-rdia-800/70">
              {!manualModelMode ? (
                <select
                  id="copilot-model-select"
                  value={aiSettings.model}
                  onChange={(e) => setAiSettings({ model: e.target.value })}
                  disabled={busy || !cfg.local}
                  className="w-full truncate rounded-md border-0 bg-transparent px-1 py-0 font-mono text-[11px] text-gray-700 focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-rdia-100"
                  title="Modèle Ollama courant"
                >
                  {ollamaTags.length === 0 && (
                    <option value={aiSettings.model}>
                      {loadingTags ? "… chargement" : aiSettings.model}
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
                    placeholder="ex: ministral-3:8b"
                    className="w-full rounded-md border-0 bg-transparent px-1 py-0 font-mono text-[11px] text-gray-700 outline-none focus:ring-0 disabled:opacity-60 dark:text-rdia-100"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={busy || !manualModelInput.trim() || !cfg.local}
                    title="Valider"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
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
                    title="Annuler"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:text-red-500 disabled:opacity-40"
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
                title={manualModelMode ? "Revenir à la liste" : "Saisir manuellement le tag"}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:text-or-500 disabled:opacity-40"
              >
                <Icon path={UI_ICONS.edit} size={11} />
              </button>
              <button
                type="button"
                onClick={loadOllamaTags}
                disabled={loadingTags || !cfg.local}
                title="Actualiser la liste des modèles"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:text-or-500 disabled:cursor-wait disabled:opacity-40"
              >
                <Icon path={UI_ICONS.refresh} size={11} />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400 dark:text-rdia-400">
              Modèle actuel : <span className="font-mono text-gray-600 dark:text-rdia-200">{aiSettings.model}</span>
              {cfg.local ? " · local" : ""}
            </p>
          </div>
        )}

        {/* ========= CORPS CONVERSATION ========= */}
        <div ref={scrollRef} className="carte m-0 flex-1 overflow-y-auto rounded-none border-0 bg-gray-50/50 p-3.5 dark:bg-rdia-900/40 sm:p-4">
          {aiLog.length === 0 ? (
            <div className="flex h-full min-h-[520px] flex-col items-center justify-center gap-8 py-6">
              <div className="w-full max-w-md text-center">
                <p className="text-[15px] font-semibold leading-snug text-rdia-600 dark:text-rdia-50">
                  Bonjour, je suis le Copilot ARGOS.
                </p>
                <p className="mt-1 text-[15px] font-medium text-rdia-600 dark:text-rdia-50">
                  Comment puis-je vous aider ?
                </p>
                <p className="mt-2 text-[11.5px] leading-relaxed text-gray-500 dark:text-rdia-300">
                  Posez votre question ou choisissez un point de départ.
                </p>
              </div>
              <div className="flex w-full max-w-md flex-col items-center gap-2 px-2">
                {DEFAULT_EMPTY_SUGGESTIONS.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => ask(ex.query)}
                    disabled={busy}
                    className="group flex w-full max-w-[320px] items-center justify-between rounded-lg border border-gray-200/70 bg-white/70 px-3 py-2 text-left text-[12px] text-gray-700 transition-all duration-150 hover:border-or-500/40 hover:bg-or-500/5 hover:text-or-600 hover:shadow-sm active:scale-[0.99] disabled:opacity-40 dark:border-rdia-600/50 dark:bg-rdia-700/30 dark:text-rdia-100 dark:hover:text-or-400 dark:hover:border-or-500/40 dark:hover:bg-rdia-700/40"
                  >
                    <span className="font-medium leading-snug">{ex.label}</span>
                    <span
                      aria-hidden
                      className="ml-3 shrink-0 text-[11px] text-gray-300 transition-all duration-150 group-hover:text-or-500/70 dark:text-rdia-500 dark:group-hover:text-or-400"
                    >
                      →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {aiLog.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[86%] rounded-2xl rounded-br-sm bg-rdia-600 px-3.5 py-2 text-sm text-white dark:bg-or-500 dark:text-rdia-900">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-or-500">
                        <Icon path={NAV_ICONS.assistant} size={13} />
                      </div>
                      {msg.provider && (
                        <span className="font-mono text-[9px] text-gray-500 dark:text-rdia-400 max-w-[60%] truncate">
                          {msg.provider}
                        </span>
                      )}
                      {msg.deterministic && (
                        <Pill tone="amber" label="Données uniquement" size="sm" />
                      )}
                      <span className="ml-auto font-mono text-[10px] text-gray-300 dark:text-rdia-500">{msg.at}</span>
                      {msg.refused && <Pill tone="red" label="Refus sécurité" size="sm" />}
                    </div>
                    {msg.llmError && (
                      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400/90">
                        ℹ️ Synthèse LLM indisponible : {msg.llmError}
                      </div>
                    )}
                    <div className="rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-gray-100 dark:bg-rdia-800/70 dark:ring-rdia-700/60">
                      <div className="ai-markdown prose prose-sm max-w-none text-sm leading-relaxed text-gray-800 dark:text-rdia-50 prose-headings:mb-2 prose-headings:mt-4 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-ol:my-1 prose-strong:text-gray-900 dark:prose-invert dark:prose-strong:text-rdia-0 prose-blockquote:text-rdia-600 dark:prose-blockquote:text-rdia-200 prose-blockquote:border-l-or-500 prose-table:my-2 prose-th:bg-gray-50 dark:prose-th:bg-rdia-700/40 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-td:border-gray-200 dark:prose-border-rdia-700">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text || ""}</ReactMarkdown>
                      </div>

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
                                  <td className="px-2.5 py-1.5"><Pill tone={alert as "green" | "amber" | "red"} label={label} size="sm" /></td>
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

                      {(() => {
                        const mf = msg.cross?.mapFocus;
                        const incCoords = msg.cross?.incident?.coords;
                        const incId = msg.cross?.incident?.id ?? mf?.incidentId;
                        const hasMapAction =
                          !!mf || (!!incCoords && !!incId);
                        if (!hasMapAction) return null;
                        const label = mf?.label ?? `Localiser`;
                        const doAction = () => {
                          if (mf?.incidentId) {
                            const inc = incidents.find((i) => i.id === mf.incidentId);
                            if (inc) return focusIncident(inc);
                          }
                          if (incCoords && incId) {
                            const inc = incidents.find((i) => i.id === incId);
                            if (inc) return focusIncident(inc);
                          }
                          if (mf?.ll) {
                            setMapCenter(mf.ll as [number, number], mf.zoom ?? 9, mf.label);
                          } else if (incCoords) {
                            setMapCenter(incCoords as [number, number], 10, msg.cross?.incident?.titre ?? "Incident");
                          }
                        };
                        return (
                          <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-2.5 dark:border-rdia-700/50">
                            <button
                              type="button"
                              onClick={doAction}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-or-500/30 bg-or-500/10 px-3 py-1.5 text-xs font-semibold text-or-500 transition-colors hover:bg-or-500/20 disabled:opacity-40"
                            >
                              <span className="text-sm leading-none">🗺️</span>
                              <span>Afficher sur la carte</span>
                              {label && label !== "Localiser" && <span className="text-[11px] text-or-500/70">· {label}</span>}
                            </button>
                          </div>
                        );
                      })()}

                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2.5 dark:border-rdia-700/50">
                          <span className="self-center pr-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-rdia-400">Suggérés :</span>
                          {msg.suggestions.map((s) => {
                            const qlabel = typeof s === "string" ? s : s.label;
                            const qquery = typeof s === "string" ? s : s.query;
                            const prio = typeof s === "string" ? false : s.priority === "primary";
                            const hasMapHint = qlabel.startsWith("🗺️") || qlabel.includes("sur la carte");
                            const isMapFocus = hasMapHint && (msg.cross?.mapFocus || (msg.cross?.incident?.coords && msg.cross?.incident?.id));
                            const onClick = () => {
                              if (isMapFocus) {
                                const mf = msg.cross?.mapFocus;
                                if (mf?.incidentId) {
                                  const inc = incidents.find((i) => i.id === mf.incidentId);
                                  if (inc) return focusIncident(inc);
                                }
                                if (msg.cross?.incident?.coords && msg.cross?.incident?.id) {
                                  const inc = incidents.find((i) => i.id === msg.cross!.incident!.id);
                                  if (inc) return focusIncident(inc);
                                }
                                if (mf?.ll) {
                                  setMapCenter(mf.ll as [number, number], mf.zoom ?? 9, mf.label);
                                } else if (msg.cross?.incident?.coords) {
                                  setMapCenter(msg.cross.incident.coords as [number, number], 10, msg.cross.incident.titre ?? "Incident");
                                }
                                return;
                              }
                              ask(qquery);
                            };
                            return (
                              <button
                                key={qlabel}
                                onClick={onClick}
                                disabled={busy}
                                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:border-or-500/60 hover:text-or-500 disabled:opacity-40 ${
                                  prio || isMapFocus
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

        {/* ========= SUGGESTIONS RAPIDES ========= */}
        {aiLog.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-gray-100 bg-white/70 px-4 py-2 dark:border-rdia-700/60 dark:bg-rdia-800/70">
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

        {/* ========= INPUT ========= */}
        <footer className="shrink-0 border-t border-gray-100 bg-white/90 px-3 py-2.5 backdrop-blur dark:border-rdia-700/60 dark:bg-rdia-800/90 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 dark:border-rdia-600 dark:bg-rdia-700/50">
              <kbd className="hidden shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 dark:border-rdia-600 dark:bg-rdia-700 sm:block">⌘K</kbd>
              <input
                ref={inputRef}
                className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-gray-400 dark:text-rdia-50"
                placeholder="Posez votre question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                disabled={busy}
              />
            </div>
            <button className="btn-primaire shrink-0 text-sm px-3 py-2" onClick={() => ask(input)} disabled={busy || !input.trim()}>
              <Icon path={UI_ICONS.send} size={16} strokeWidth={2} />
            </button>
          </div>
        </footer>
      </aside>
    </>
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
