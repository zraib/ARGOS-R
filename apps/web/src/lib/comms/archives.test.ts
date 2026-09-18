import { describe, expect, it } from "vitest";
import { exportFileName, fileSlug, formatStamp, isCommsExport, isImportOutcome } from "./archives";

// Traçabilité (ADR 0021) : ce que le navigateur vérifie et nomme lui-même.
describe("archives du centre de communication", () => {
  it("reconnaît un export du centre — et rien d'autre", () => {
    expect(isCommsExport({ format: "iris-comms/1", exportedAt: "2026-09-18T10:00:00.000Z", channels: [] })).toBe(true);
    expect(isCommsExport({ format: "autre", exportedAt: "2026-09-18", channels: [] })).toBe(false);
    expect(isCommsExport({ format: "iris-comms/1", channels: [] })).toBe(false);
    expect(isCommsExport({ format: "iris-comms/1", exportedAt: "x", channels: "non" })).toBe(false);
    expect(isCommsExport(null)).toBe(false);
    expect(isCommsExport("iris-comms/1")).toBe(false);
  });

  it("reconnaît le bilan d'un import", () => {
    expect(isImportOutcome({ channels: 1, messages: 12, skipped: 0 })).toBe(true);
    expect(isImportOutcome({ channels: "1" })).toBe(false);
    expect(isImportOutcome(undefined)).toBe(false);
  });

  it("nomme le fichier d'après le canal et le jour, sans accent ni caractère hasardeux", () => {
    expect(fileSlug("Crue de l'oued Ourika — traçabilité")).toBe("crue-de-l-oued-ourika-tracabilite");
    expect(fileSlug("   ")).toBe("canal");
    expect(fileSlug("x".repeat(80))).toHaveLength(48);
    expect(exportFileName("Séisme M5.9", new Date("2026-09-18T10:00:00Z"))).toBe("iris-comms-seisme-m5-9-2026-09-18.json");
  });

  it("rend un horodatage lisible, et tel quel s'il ne se lit pas", () => {
    expect(formatStamp("2026-09-18T10:05:00.000Z", "fr")).toMatch(/2026/);
    expect(formatStamp("pas une date", "fr")).toBe("pas une date");
  });
});
