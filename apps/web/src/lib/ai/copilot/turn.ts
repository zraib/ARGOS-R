// ============================================================================
// lib/ai/copilot/turn.ts — un tour de parole avec le modèle, en flux
//
// CE QUE CE MODULE FAIT : lance le flux, le rend à cadence fixe, surveille la
// fuite d'invite, borne le délai, et QUALIFIE l'issue (texte reçu, réponse
// vide, délai expiré, erreur HTTP, fuite détectée). Il ne touche ni au
// magasin ni à React : l'appelant reçoit des rappels de rendu et un verdict,
// et décide de ce qu'il écrit dans le journal.
//
// RENDU CADENCÉ. Le modèle produit ~45 jetons/s ; rendre à chaque jeton
// relançait à cette cadence les ~30 expressions régulières de `cleanFinalText`
// et `detectLeakedPrompt` sur TOUT le texte accumulé (coût quadratique), puis
// une réécriture complète du journal dans `localStorage`. L'œil ne distingue
// rien sous ~80 ms : on rend à cette cadence, et l'appelant ne persiste qu'à
// la fin.
// ============================================================================

import { cleanFinalText, detectLeakedPrompt } from "@/lib/ai/config";
import { chatStream, type LlmStats } from "@/lib/ai/provider";
import type { LlmMessage } from "./history";

/** Cadence de rendu du flux à l'écran. */
export const RENDU_MS = 80;

/**
 * Délai accordé au modèle avant de retomber sur la Couche 1.
 *
 * Le premier jeton d'un modèle local de 9 Go arrive souvent après 20–35 s
 * (chargement, chauffe). Les anciens délais de 15/25 s étaient TOUJOURS sous
 * le premier jeton : on retombait systématiquement sur la Couche 1. Une
 * question longue (> 6 mots) reçoit plus de marge.
 */
export function llmTimeoutMs(online: boolean, question: string): number {
  const base = online ? 90_000 : 70_000;
  const mots = question.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(base, mots > 6 ? 120_000 : base);
}

/** Le libellé de mesure ajouté sous une réponse réussie — des chiffres du runtime, pas une estimation. */
export function measureLabel(stats: LlmStats | undefined): string {
  if (!stats) return "";
  const prompt = `prompt ${stats.promptTokens} jetons${stats.promptSec >= 0.05 ? ` en ${stats.promptSec.toFixed(1)}s` : " (cache)"}`;
  const debit = stats.outputSec > 0 ? (stats.outputTokens / stats.outputSec).toFixed(0) : "?";
  return ` · ${prompt} · ${stats.outputTokens} jetons à ${debit}/s`;
}

export interface TurnOptions {
  /** Rendu intermédiaire : texte nettoyé + secondes jusqu'au premier jeton (null tant qu'aucun). */
  onRender: (text: string, firstTokenSec: string | null) => void;
  /** La fuite d'invite est détectée : l'appelant remplace le message par le refus. */
  onLeak: () => void;
  /** Vrai pour une salutation innocente : on laisse le modèle répondre poliment sans garde-fou. */
  skipLeakGuard: boolean;
  timeoutMs: number;
}

export type TurnOutcome =
  | { kind: "leaked"; durationSec: string }
  | { kind: "empty"; reason: "timeout" | "http" | "blank"; error?: string; durationSec: string }
  | { kind: "ok"; text: string; stats?: LlmStats; firstTokenSec: string | null; durationSec: string };

/** Un tour complet : flux, rendu cadencé, garde-fou, délai, verdict. */
export async function runLlmTurn(
  cfg: Parameters<typeof chatStream>[0],
  messages: LlmMessage[],
  opts: TurnOptions,
): Promise<TurnOutcome> {
  const t0 = Date.now();
  const sec = (ms: number) => (ms / 1000).toFixed(1);
  let finished = false;
  let leaked = false;
  let llmText = "";
  let firstTokenAt: number | null = null;
  let renduPrevu: ReturnType<typeof setTimeout> | null = null;
  let dernierRendu = 0;

  const fuite = () => {
    if (leaked || opts.skipLeakGuard) return;
    leaked = true;
    opts.onLeak();
  };

  const res = await Promise.race([
    chatStream(cfg, messages, {
      onToken: (acc) => {
        if (finished || leaked) return;
        if (firstTokenAt === null) firstTokenAt = Date.now();
        llmText = acc;
        if (renduPrevu) return; // un rendu est déjà programmé
        const attente = Math.max(0, RENDU_MS - (Date.now() - dernierRendu));
        renduPrevu = setTimeout(() => {
          renduPrevu = null;
          dernierRendu = Date.now();
          try {
            if (finished || leaked) return;
            if (!opts.skipLeakGuard && detectLeakedPrompt(llmText)) {
              fuite();
              return;
            }
            opts.onRender(cleanFinalText(llmText), firstTokenAt ? sec(firstTokenAt - t0) : null);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[Copilot] rendu du flux :", e);
          }
        }, attente);
      },
    }),
    new Promise<{ ok: false; text: ""; aborted: true }>((resolve) =>
      setTimeout(() => resolve({ ok: false, text: "", aborted: true }), opts.timeoutMs),
    ),
  ]);
  finished = true;
  if (renduPrevu) clearTimeout(renduPrevu);
  const durationSec = sec(Date.now() - t0);

  if (leaked) return { kind: "leaked", durationSec };
  if (!opts.skipLeakGuard && detectLeakedPrompt(llmText)) {
    fuite();
    return { kind: "leaked", durationSec };
  }
  if (!res.ok || !llmText.trim()) {
    const aborted = (res as { aborted?: boolean }).aborted === true;
    const error = (res as { error?: string }).error;
    if (aborted) return { kind: "empty", reason: "timeout", durationSec };
    if (!res.ok && typeof error === "string") return { kind: "empty", reason: "http", error, durationSec };
    return { kind: "empty", reason: "blank", durationSec };
  }
  return {
    kind: "ok",
    text: llmText,
    stats: res.stats,
    firstTokenSec: firstTokenAt ? sec(firstTokenAt - t0) : null,
    durationSec,
  };
}
