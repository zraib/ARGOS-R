import { describe, expect, it } from "vitest";
import { buildPdfReport, isReportableMessage } from "@/lib/ai/copilot/pdf";
import type { AiMessage } from "@/lib/store/shared";

// ============================================================================
// Export PDF du copilote — le fichier produit est un PDF lisible, sans aucune
// dépendance ; seules les synthèses de situation proposent l'export.
// ============================================================================

const sitrep: AiMessage = {
  id: "a1",
  role: "assistant",
  at: "2026-09-15T10:00:00Z",
  intent: "sitrep",
  provider: "Données IRIS",
  text: [
    "## Situation générale",
    "",
    "- 3 incidents actifs, dont 1 critique à Kénitra (crue du Sebou).",
    "- 12 unités engagées, 2 hôpitaux en tension.",
    "",
    "Décès : 2 · Blessés : 14 · Disparus : 1 — bilan provisoire à 09:45.",
  ].join("\n"),
};

describe("copilote — export PDF", () => {
  it("une synthèse de situation est exportable, une question de l'opérateur ne l'est pas", () => {
    expect(isReportableMessage(sitrep)).toBe(true);
    expect(isReportableMessage({ id: "u1", role: "user", at: sitrep.at, text: "SITREP ?" })).toBe(false);
    expect(isReportableMessage({ id: "a2", role: "assistant", at: sitrep.at, intent: "social", text: "Bonjour !" })).toBe(false);
  });

  it("produit un PDF valide : en-tête, pages, texte encodé, fin de fichier", () => {
    const { bytes, filename } = buildPdfReport(sitrep, "Donne-moi le SITREP", { operatorName: "Cne Zraib" });
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 8));
    const body = new TextDecoder("latin1").decode(bytes);
    expect(head.startsWith("%PDF-")).toBe(true);
    expect(body).toContain("/Type /Page");
    expect(body).toContain("/Type /Catalog");
    expect(body.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(filename.toLowerCase().endsWith(".pdf")).toBe(true);
    // Le contenu est écrit en flux (Contents) : des pages non vides.
    expect(bytes.byteLength).toBeGreaterThan(2_000);
  });
});
