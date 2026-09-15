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

  it("les sites suivent la logique des hôpitaux : un échelon, une région, un établissement de rattachement", () => {
    const sites = d.listMorgues();
    expect(sites.filter((m) => m.level === "regional").length).toBeGreaterThanOrEqual(3);
    expect(sites.find((m) => m.id === "M2")).toMatchObject({ level: "city", hospitalId: "H4", region: "Marrakech-Safi" });
    expect(d.regionOfEntity("morgue", "M3")).toBe("Marrakech-Safi");
    const cree = d.createMorgue({ nom: "Chambre mortuaire — Hôpital Militaire Hassan II", type: "hospital", level: "city", region: "Laâyoune-Sakia El Hamra", province: "Laâyoune", ville: "Laâyoune", hospitalId: "H6", capacity: 20 });
    expect(cree.site).toMatchObject({ kind: "fixed", level: "city", hospitalId: "H6", statut: "op", code: "LAA" });
    expect(cree.site?.ll).toEqual(d.listHospitals().find((h) => h.id === "H6")?.ll);
    expect(d.regionOfEntity("morgue", cree.site!.id)).toBe("Laâyoune-Sakia El Hamra");
    expect(d.createMorgue({ nom: "X", type: "temporary", level: "city", region: "R", ville: "V", hospitalId: "H-inconnu", capacity: 5 }).error).toMatch(/introuvable/);
    expect(d.nextReference(cree.site!)).toBe(`LAA-${new Date().getUTCFullYear()}-001`);
  });

  it("le bilan nommé : une victime décédée, affectée à une morgue, ouvre son dossier là-bas avec sa préliminaire", () => {
    const inc = d.listIncidents()[0];
    const avant = inc.casualties?.dead ?? 0;
    const v = d.addVictim(inc.id, { kind: "dead", lastName: "Alaoui", firstName: "Karim", cni: "AB123456", sex: "m", age: 42, deathAt: "2026-09-15T06:30:00Z", note: "Retrouvé sous les décombres" }, "c.bleue")!;
    expect(v.id).toMatch(/^VIC-\d+$/);
    expect(d.listVictims(inc.id)).toHaveLength(1);
    // Les compteurs ne disent jamais moins que les victimes nommées.
    expect(d.findIncident(inc.id)?.casualties?.dead).toBeGreaterThanOrEqual(Math.max(1, avant));
    // Un blessé ne s'affecte pas à une morgue ; un décédé, oui — une fois.
    const blesse = d.addVictim(inc.id, { kind: "injured", firstName: "Sara" }, "c.bleue")!;
    expect(d.assignVictimMorgue(inc.id, blesse.id, "M1", "c.bleue").error).toMatch(/décédé/);
    const res = d.assignVictimMorgue(inc.id, v.id, "M5", "c.bleue");
    expect(res.error).toBeUndefined();
    expect(res.record).toMatchObject({ mid: "M5", pendingReceipt: true, status: "in_progress", lastName: "Alaoui", firstName: "Karim", cni: "AB123456", age: 42, deathAt: "2026-09-15T06:30:00Z", victimId: v.id, incidentId: inc.id });
    expect(res.record?.custody?.map((c) => c.step)).toEqual(["recovered", "transferred"]);
    expect(res.record?.origin?.kind).toBe("field");
    expect(res.victim).toMatchObject({ morgueId: "M5", recordId: res.record?.id });
    expect(d.assignVictimMorgue(inc.id, v.id, "M1", "c.bleue").error).toMatch(/déjà affecté/);
    expect(d.entitiesOnIncident(inc.id)).toContain("M5");
    // Une correction du terrain suit jusqu'à la morgue tant qu'elle n'a pas confirmé ; retirer est refusé.
    d.updateVictim(inc.id, v.id, { age: 43 }, "c.bleue");
    expect(d.listMortuaryRecords("M5").find((r) => r.id === res.record?.id)?.age).toBe(43);
    expect(d.removeVictim(inc.id, v.id).error).toMatch(/affecté/);
    expect(d.updateVictim(inc.id, v.id, { kind: "missing" }, "c.bleue").error).toMatch(/nature/);
    expect(d.removeVictim(inc.id, blesse.id).ok).toBe(true);
  });

  it("les compteurs sont un plancher recalculé, pas un cliquet : reclasser ou retirer redescend", () => {
    const inc = d.listIncidents()[1];
    d.updateIncident(inc.id, { casualties: { dead: 0, injured: 0, missing: 0 } });
    const a = d.addVictim(inc.id, { kind: "dead" }, "c.bleue")!;
    expect(d.findIncident(inc.id)?.casualties).toMatchObject({ dead: 1, injured: 0 });
    // Reclassé blessé : plus de décès, un blessé — pas les deux.
    d.updateVictim(inc.id, a.id, { kind: "injured" }, "c.bleue");
    expect(d.findIncident(inc.id)?.casualties).toMatchObject({ dead: 0, injured: 1 });
    // Retiré : tout redescend au chiffre déclaré.
    d.removeVictim(inc.id, a.id);
    expect(d.findIncident(inc.id)?.casualties).toMatchObject({ dead: 0, injured: 0 });
    // Un chiffre déclaré plus haut que les nommés reste ce que l'opérateur a dit.
    d.updateIncident(inc.id, { casualties: { dead: 5, injured: 2, missing: 1 } });
    d.addVictim(inc.id, { kind: "dead" }, "c.bleue");
    expect(d.findIncident(inc.id)?.casualties).toMatchObject({ dead: 5, injured: 2, missing: 1 });
  });

  it("la morgue reçoit, puis identifie : nom et prénom composent l'identité confirmée ; le site plein se lit « plein »", () => {
    const rec = d.listMortuaryRecords("M5").find((r) => r.victimId)!;
    expect(d.receiveBody("M5", rec.id, "m.legiste").record?.pendingReceipt).toBe(false);
    const res = d.updateMortuaryRecord("M5", rec.id, { status: "identified", lastName: "Alaoui", firstName: "Karim", cni: "AB123456", sex: "m", age: 43, deathAt: "2026-09-15T06:10:00Z", idMethod: "fingerprint", identifiedAt: "2026-09-15T10:00:00Z", identifiedBy: "Dr. Benali", note: "Empreintes concordantes" }, "m.legiste");
    expect(res.error).toBeUndefined();
    expect(res.record).toMatchObject({ status: "identified", identifiedAs: "Alaoui Karim", idMethod: "fingerprint", identifiedBy: "Dr. Benali", deathAt: "2026-09-15T06:10:00Z" });
    // Une fois confirmée, la préliminaire du terrain ne l'écrase plus.
    const v = d.listVictims(d.listIncidents()[0].id).find((x) => x.recordId === rec.id)!;
    d.updateVictim(v.incidentId, v.id, { age: 50 }, "c.bleue");
    expect(d.listMortuaryRecords("M5").find((r) => r.id === rec.id)?.age).toBe(43);
    // « Plein » se lit, ne se saisit pas.
    const petite = d.deployMobileMorgue({ nom: "Cellule 1 place", capacity: 1, ll: [-8, 31], site: "Douar" }, "m.zraib");
    expect(petite.type).toBe("truck");
    expect(d.listMorgues().find((m) => m.id === petite.id)?.statut).toBe("op");
    d.admitBody(petite.id, {}, "t.mobile");
    expect(d.listMorgues().find((m) => m.id === petite.id)?.statut).toBe("full");
    expect(d.listMorgues().find((m) => m.id === "M1")?.type).toBe("hospital");
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
