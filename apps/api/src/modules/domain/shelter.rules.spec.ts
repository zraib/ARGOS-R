import { DEFAULT_PER_TENT, resolveShelterTypology } from "@/modules/domain/shelter.rules";

// ============================================================================
// Typologie d'abri — la capacité d'un camp se DÉDUIT, celle d'un bâtiment se
// SAISIT, et chacun exige ce qui le définit.
// ============================================================================

describe("typologie d'abri", () => {
  it("un camp de tentes déduit sa capacité : tentes × personnes par tente", () => {
    const r = resolveShelterTypology({ kind: "tentes", tents: 40, perTent: 5 });
    expect(r).toEqual({ ok: true, value: { kind: "tentes", tents: 40, perTent: 5, capacity: 200 } });
  });

  it("sans capacité par tente, la valeur Sphère par défaut s'applique", () => {
    const r = resolveShelterTypology({ kind: "tentes", tents: 10 });
    expect(r.ok && r.value.capacity).toBe(10 * DEFAULT_PER_TENT);
  });

  it("un camp sans tente, ou avec zéro personne par tente, est refusé et dit pourquoi", () => {
    expect(resolveShelterTypology({ kind: "tentes" })).toMatchObject({ ok: false, reason: expect.stringContaining("nombre de tentes") });
    expect(resolveShelterTypology({ kind: "tentes", tents: 3, perTent: 0 })).toMatchObject({ ok: false, reason: expect.stringContaining("par tente") });
  });

  it("une capacité saisie à côté des tentes est IGNORÉE : un seul chiffre fait foi", () => {
    const r = resolveShelterTypology({ kind: "tentes", tents: 4, perTent: 6, capacity: 999 });
    expect(r.ok && r.value.capacity).toBe(24);
  });

  it("un abri en dur exige la nature du bâtiment et une capacité", () => {
    expect(resolveShelterTypology({ kind: "dur", capacity: 300 })).toMatchObject({ ok: false, reason: expect.stringContaining("nature du bâtiment") });
    expect(resolveShelterTypology({ kind: "dur", building: "lycee" })).toMatchObject({ ok: false, reason: expect.stringContaining("capacité") });
    expect(resolveShelterTypology({ kind: "dur", building: "lycee", capacity: 300 })).toEqual({ ok: true, value: { kind: "dur", building: "lycee", capacity: 300 } });
  });
});
