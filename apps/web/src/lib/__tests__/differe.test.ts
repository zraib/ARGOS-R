import { describe, expect, it, vi } from "vitest";
import { differe } from "../differe";

// Composants chargés à part, sans Suspense (ADR 0038) : un seul téléchargement,
// partagé par tous les demandeurs ; un échec se retente.
describe("differe", () => {
  it("ne charge le module qu'une fois, même demandé plusieurs fois en même temps", async () => {
    const composant = () => null;
    const charger = vi.fn(() => Promise.resolve(composant));
    const d = differe(charger);
    expect(d.charge()).toBeNull();
    const [a, b] = await Promise.all([d.obtenir(), d.obtenir()]);
    expect(a).toBe(composant);
    expect(b).toBe(composant);
    expect(await d.obtenir()).toBe(composant);
    expect(d.charge()).toBe(composant);
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it("retente après un échec au lieu de le garder pour toujours", async () => {
    const composant = () => null;
    const charger = vi.fn().mockRejectedValueOnce(new Error("réseau")).mockResolvedValueOnce(composant);
    const d = differe(charger);
    await expect(d.obtenir()).rejects.toThrow("réseau");
    expect(d.charge()).toBeNull();
    expect(await d.obtenir()).toBe(composant);
    expect(charger).toHaveBeenCalledTimes(2);
  });
});
