// ============================================================================
// ARGOS — invariants du parcours d'identification des victimes (DVI)
//
// Testés à NU, sans NestJS ni HTTP : les règles vivent dans un fichier pur
// (`dvi.rules.ts`), donc leur vérification n'a besoin d'aucune infrastructure.
// ============================================================================

import { checkRecordUpdate, nextStatuses } from "@/modules/domain/dvi.rules";
import type { MortuaryRecord } from "@/modules/domain/domain.service";

const base = (over: Partial<MortuaryRecord> = {}): MortuaryRecord => ({
  id: "DVI-99",
  mid: "M3",
  reference: "AH-2026-099",
  status: "unidentified",
  samples: [],
  admittedAt: "2026-08-09T06:00:00Z",
  updatedAt: "2026-08-09T06:00:00Z",
  ...over,
});

describe("Parcours DVI — invariants du registre mortuaire", () => {
  it("accepte le passage en cours d'identification", () => {
    expect(checkRecordUpdate(base(), { status: "in_progress" })).toBeNull();
  });

  it("autorise l'identification directe (reconnaissance formelle immédiate)", () => {
    expect(checkRecordUpdate(base(), { status: "identified", identifiedAs: "M. B. Ait Oussaid" })).toBeNull();
  });

  it("EXIGE une identité confirmée pour passer à « identifié »", () => {
    expect(checkRecordUpdate(base(), { status: "identified" })).toMatch(/identité confirmée est obligatoire/);
  });

  it("refuse une restitution sans destinataire tracé", () => {
    const rec = base({ status: "identified", identifiedAs: "M. B. Ait Oussaid" });
    expect(checkRecordUpdate(rec, { status: "released" })).toMatch(/indiquez à qui le corps est remis/);
  });

  it("accepte la restitution complète", () => {
    const rec = base({ status: "identified", identifiedAs: "M. B. Ait Oussaid" });
    expect(checkRecordUpdate(rec, { status: "released", releasedTo: "Famille Ait Oussaid" })).toBeNull();
  });

  it("interdit de sauter directement de « non identifié » à « restitué »", () => {
    expect(
      checkRecordUpdate(base(), { status: "released", identifiedAs: "X", releasedTo: "Y" }),
    ).toMatch(/Transition interdite/);
  });

  it("GÈLE un dossier clos : un corps restitué n'est plus modifiable", () => {
    const rec = base({ status: "released", identifiedAs: "X", releasedTo: "Y" });
    expect(checkRecordUpdate(rec, { ageRange: "30-40" })).toMatch(/clos/);
    expect(checkRecordUpdate(rec, { status: "identified" })).toMatch(/clos/);
  });

  it("permet de revenir en arrière tant que le dossier est ouvert", () => {
    // Une identification infirmée doit pouvoir être reprise.
    expect(checkRecordUpdate(base({ status: "in_progress" }), { status: "unidentified" })).toBeNull();
    const ident = base({ status: "identified", identifiedAs: "X" });
    expect(checkRecordUpdate(ident, { status: "in_progress" })).toBeNull();
  });

  it("laisse enregistrer des prélèvements sans changer d'étape", () => {
    expect(checkRecordUpdate(base(), { samples: ["dna", "dental"] })).toBeNull();
  });

  it("expose les étapes atteignables (pilotage de l'IHM)", () => {
    expect(nextStatuses("unidentified")).toEqual(["in_progress", "identified"]);
    expect(nextStatuses("released")).toEqual([]);
  });
});
