import { describe, expect, it } from "vitest";
import { EVERY_MS, MOVE_M, metersBetween, shouldSend } from "@/lib/tracking/share";

// ============================================================================
// Partage de position par l'application — la cadence d'envoi : un mouvement
// notable ou le délai écoulé, jamais un martèlement à l'arrêt.
// ============================================================================

describe("partage de position — cadence", () => {
  const casa: [number, number] = [-7.6, 33.58];
  it("mesure des distances plausibles", () => {
    expect(metersBetween(casa, casa)).toBe(0);
    // Un dixième de degré de latitude ≈ 11,1 km.
    expect(Math.round(metersBetween(casa, [-7.6, 33.68]) / 100) * 100).toBe(11_100);
  });
  it("première position : envoyée ; à l'arrêt : attend le délai ; en mouvement : envoie", () => {
    const t0 = 1_000_000;
    expect(shouldSend(null, casa, t0)).toBe(true);
    const prev = { at: t0, ll: casa };
    expect(shouldSend(prev, casa, t0 + 5_000)).toBe(false);
    expect(shouldSend(prev, casa, t0 + EVERY_MS)).toBe(true);
    // 25 m vers le nord ≈ 0,000225° de latitude.
    const bouge: [number, number] = [casa[0], casa[1] + (MOVE_M + 2) / 111_320];
    expect(shouldSend(prev, bouge, t0 + 5_000)).toBe(true);
    const peu: [number, number] = [casa[0], casa[1] + 5 / 111_320];
    expect(shouldSend(prev, peu, t0 + 5_000)).toBe(false);
  });
});
