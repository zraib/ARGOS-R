import { describe, expect, it } from "vitest";
import { buildLlmHistory, purgeLog, MAX_TURNS } from "@/lib/ai/copilot/history";
import { layer1Shortcut, shouldMountBlocks, structuredBlocks } from "@/lib/ai/copilot/blocks";
import { llmTimeoutMs, measureLabel } from "@/lib/ai/copilot/turn";
import type { AiAnswer } from "@/lib/ai/assistant";

// ============================================================================
// Orchestration du Copilot (lib/ai/copilot)
//
// Ces règles vivaient dans le composant, hors de portée des tests. Elles
// protègent trois choses : la fenêtre de contexte du modèle (historique borné),
// l'honnêteté de l'affichage (pas de blocs sous une intention incomprise) et
// la patience accordée à un modèle local (délais réalistes).
// ============================================================================

const msg = (role: string, text: string, extra: Partial<{ id: string; refused: boolean }> = {}) => ({
  id: extra.id ?? `ai-${Math.random()}`,
  role,
  text,
  refused: extra.refused,
});

describe("historique montré au modèle", () => {
  it("ne garde que les deux derniers tours", () => {
    const log = Array.from({ length: 10 }, (_, i) => msg(i % 2 ? "assistant" : "user", `m${i}`));
    const h = buildLlmHistory(log);
    expect(h).toHaveLength(MAX_TURNS * 2);
    expect(h[0].content).toBe("m6");
  });

  it("exclut les refus du garde-fou et les messages vides", () => {
    const h = buildLlmHistory([msg("user", "q"), msg("assistant", "refus", { refused: true }), msg("assistant", "   ")]);
    expect(h).toEqual([{ role: "user", content: "q" }]);
  });

  it("tronque DUR : jamais 40 000 caractères d'ancien markdown", () => {
    const h = buildLlmHistory([msg("assistant", "x".repeat(5000)), msg("user", "y".repeat(5000))]);
    expect(h[0].content.length).toBeLessThan(900);
    expect(h[0].content).toMatch(/tronqué/);
    expect(h[1].content.length).toBeLessThan(700);
  });
});

describe("purge douce du journal", () => {
  it("ne touche à rien sous le seuil", () => {
    const all = Array.from({ length: 8 }, (_, i) => msg("user", `m${i}`, { id: `ai-${i}` }));
    expect(purgeLog(all, all)).toBe(all);
  });

  it("au-delà, garde les quatre derniers messages IA et tout ce qui n'est pas IA", () => {
    const all = [msg("system", "salut", { id: "sys-1" }), ...Array.from({ length: 9 }, (_, i) => msg("user", `m${i}`, { id: `ai-${i}` }))];
    const p = purgeLog(all, all);
    expect(p.map((m) => m.id)).toEqual(["sys-1", "ai-5", "ai-6", "ai-7", "ai-8"]);
  });
});

describe("blocs structurés", () => {
  const answer = { intent: "hospitals", units: [1], hospitals: [2], topEquip: [3] } as unknown as AiAnswer;

  it("aucun bloc sous une intention incomprise", () => {
    expect(shouldMountBlocks({ intent: "unknown" } as unknown as AiAnswer)).toBe(false);
    expect(structuredBlocks({ ...answer, intent: "unknown" } as AiAnswer)).toEqual({});
  });

  it("les équipements sont renommés `equipment` pour le journal", () => {
    expect(structuredBlocks(answer)).toMatchObject({ units: [1], hospitals: [2], equipment: [3] });
  });

  it("les intentions servies par la Couche 1 seule sont nommées", () => {
    expect(layer1Shortcut({ intent: "greeting" } as unknown as AiAnswer)).toBe("social");
    expect(layer1Shortcut({ intent: "equipment_critical_status" } as unknown as AiAnswer)).toBe("equipment");
    expect(layer1Shortcut({ intent: "cross_analysis" } as unknown as AiAnswer)).toBe("cross_analysis");
    expect(layer1Shortcut({ intent: "hospitals" } as unknown as AiAnswer)).toBeNull();
  });
});

describe("délais et mesures", () => {
  it("un modèle local reçoit au moins 70 s, une question longue 120 s", () => {
    expect(llmTimeoutMs(false, "état hôpitaux")).toBe(70_000);
    expect(llmTimeoutMs(true, "état hôpitaux")).toBe(90_000);
    expect(llmTimeoutMs(true, "quel est l'état des hôpitaux de la région nord")).toBe(120_000);
  });

  it("la mesure dit « cache » quand l'invite n'a rien coûté", () => {
    expect(measureLabel({ promptTokens: 2100, promptSec: 0.01, outputTokens: 90, outputSec: 2 })).toContain("(cache)");
    expect(measureLabel({ promptTokens: 2100, promptSec: 3.2, outputTokens: 90, outputSec: 2 })).toMatch(/en 3\.2s.*45\/s/);
    expect(measureLabel(undefined)).toBe("");
  });
});
