import { DomainService } from "@/modules/domain/domain.service";
import { checkTransfer, freePlaces, nextReference } from "@/modules/domain/morgue.rules";

// ============================================================================
// Service morgue — références, chaîne de garde hôpital → site, morgue mobile
//
// La doctrine (INTERPOL DVI, manuel OMS / OPS / CICR) : une référence unique
// jamais réattribuée ; chaque transfert daté et signé ; une réception confirmée
// par le site qui reçoit avant tout nouveau mouvement ; une morgue mobile qui
// ne se replie pas avec des corps dedans.
// ============================================================================

describe("règles du service morgue", () => {
  it("la référence suit code-année-numéro et ne réattribue jamais un numéro", () => {
    expect(nextReference("RBT", 2026, [])).toBe("RBT-2026-001");
    expect(nextReference("RBT", 2026, ["RBT-2026-001", "RBT-2026-007", "MRK-2026-030"])).toBe("RBT-2026-008");
  });

  it("un transfert exige un site ouvert, différent, un dossier ouvert et déjà réceptionné", () => {
    const from = { id: "M1", nom: "A", ville: "", capacity: 10, staff: 1, statut: "op" as const };
    const to = { ...from, id: "M2", nom: "B" };
    const rec = { id: "DVI-9", mid: "M1", reference: "R", status: "unidentified" as const, samples: [], admittedAt: "", updatedAt: "" };
    expect(checkTransfer(rec, from, undefined)).toMatch(/introuvable/);
    expect(checkTransfer(rec, from, from)).toMatch(/origine/);
    expect(checkTransfer(rec, from, { ...to, statut: "closed" })).toMatch(/fermé/);
    expect(checkTransfer({ ...rec, status: "released" }, from, to)).toMatch(/clos/);
    expect(checkTransfer({ ...rec, pendingReceipt: true }, from, to)).toMatch(/réception/);
    expect(checkTransfer(rec, from, to)).toBeNull();
    expect(freePlaces(from, [rec, { ...rec, id: "x", status: "released" }])).toBe(9);
  });
});

describe("décès en établissement, réception, transfert, morgue mobile", () => {
  const d = new DomainService();
  const hospital = d.listHospitals()[0];
  const institut = d.listMorgues().find((m) => m.id === "M1")!;

  it("l'hôpital annonce le décès : le dossier naît au site, identifié, réception à confirmer, chaîne de garde signée", () => {
    const res = d.declareHospitalDeath(hospital.id, { mid: institut.id, identifiedAs: "Patient X", incidentId: "INC-2607", note: "Service de réanimation" }, "h.alami");
    expect(res.error).toBeUndefined();
    const rec = res.record!;
    expect(rec.reference).toBe(`RBT-${new Date().getUTCFullYear()}-001`);
    expect(rec.status).toBe("identified");
    expect(rec.pendingReceipt).toBe(true);
    expect(rec.origin).toEqual({ kind: "hospital", id: hospital.id, label: hospital.nom });
    expect(rec.custody?.map((c) => c.step)).toEqual(["hospital", "transferred"]);
    expect(rec.custody?.[0]).toMatchObject({ by: "h.alami", to: hospital.nom, note: "Service de réanimation" });
    expect(rec.custody?.[1]).toMatchObject({ from: hospital.nom, to: institut.nom });
    // Le registre du service le liste ; celui de l'incident aussi ; un autre incident non.
    expect(d.listMortuaryRegistry().some((r) => r.id === rec.id)).toBe(true);
    expect(d.listMortuaryRegistry("INC-2607").some((r) => r.id === rec.id)).toBe(true);
    expect(d.listMortuaryRegistry("INC-0000").some((r) => r.id === rec.id)).toBe(false);
    // Tant que le site n'a pas confirmé, pas de transfert ; une seconde réception est refusée.
    const attente = d.listMortuaryRegistry("INC-2607").find((r) => r.id === rec.id)!;
    expect(d.transferBody(institut.id, attente.id, "M2", "m.legiste").error).toMatch(/réception/);
    expect(d.receiveBody(institut.id, attente.id, "m.legiste").record?.pendingReceipt).toBe(false);
    expect(d.receiveBody(institut.id, attente.id, "m.legiste").error).toMatch(/aucun transfert/);
    expect(attente.custody?.at(-1)).toMatchObject({ step: "received", by: "m.legiste", to: institut.nom });
  });

  it("une morgue mobile se déploie, reçoit un transfert, et ne se replie qu'une fois vide", () => {
    const mobile = d.deployMobileMorgue({ nom: "Morgue mobile n° 1", capacity: 20, ll: [-8.24, 31.22], site: "Stade d'Amizmiz", incidentId: "INC-2607" }, "m.zraib");
    expect(mobile).toMatchObject({ kind: "mobile", statut: "op", capacity: 20, ville: "Stade d'Amizmiz" });
    expect(mobile.deployment).toMatchObject({ incidentId: "INC-2607", by: "m.zraib" });
    expect(d.listMorgues().some((m) => m.id === mobile.id)).toBe(true);
    const rec = d.listMortuaryRegistry("INC-2607").find((r) => r.origin?.kind === "hospital")!;
    const t = d.transferBody(institut.id, rec.id, mobile.id, "m.legiste", "Rapprochement des familles");
    expect(t.error).toBeUndefined();
    expect(t.record).toMatchObject({ mid: mobile.id, pendingReceipt: true });
    expect(t.record?.custody?.at(-1)).toMatchObject({ step: "transferred", from: institut.nom, to: mobile.nom, note: "Rapprochement des familles" });
    // Le site d'origine ne le voit plus dans son registre ; la mobile, oui.
    expect(d.listMortuaryRecords(institut.id).some((r) => r.id === rec.id)).toBe(false);
    expect(d.listMortuaryRecords(mobile.id).some((r) => r.id === rec.id)).toBe(true);
    // Un corps à bord : pas de repli.
    expect(d.recallMorgue(mobile.id).error).toMatch(/encore présents/);
    d.receiveBody(mobile.id, rec.id, "t.mobile");
    expect(d.updateMortuaryRecord(mobile.id, rec.id, { status: "released", releasedTo: "Famille X" }, "t.mobile").record?.custody?.at(-1)).toMatchObject({ step: "released", to: "Famille X" });
    expect(d.recallMorgue(mobile.id).site).toMatchObject({ statut: "closed", deployment: null });
    expect(d.recallMorgue(institut.id).error).toMatch(/mobile/);
  });

  it("un site plein ou fermé ne reçoit pas ; l'admission directe attribue sa référence et sa première garde", () => {
    const petite = d.deployMobileMorgue({ nom: "Cellule 2 places", capacity: 1, ll: [-8, 31], site: "Douar" }, "m.zraib");
    expect(d.declareHospitalDeath(hospital.id, { mid: petite.id }, "h.alami").error).toBeUndefined();
    expect(d.declareHospitalDeath(hospital.id, { mid: petite.id }, "h.alami").error).toMatch(/plein/);
    const rec = d.admitBody(institut.id, { foundAt: "Piste RP2010" }, "m.legiste");
    expect(rec.reference).toMatch(/^RBT-\d{4}-\d{3}$/);
    expect(rec.custody).toHaveLength(1);
    expect(rec.custody?.[0]).toMatchObject({ step: "received", by: "m.legiste" });
    expect(d.declareHospitalDeath("H-inconnu", { mid: institut.id }, "x").missing).toBe("hospital");
    expect(d.declareHospitalDeath(hospital.id, { mid: "M-inconnu" }, "x").missing).toBe("morgue");
  });
});
