import { DomainService } from "@/modules/domain/domain.service";

// ============================================================================
// Qui sert un incident — la donnée que la doctrine de visibilité reçoit
//
// Le responsable de morgue est classé « multi-incidents » : il voit les
// opérations où SON site sert. Or un site mortuaire n'est jamais inscrit dans
// la fiche d'incident ; il sert dès qu'un corps de cet incident lui est
// admis. Sans cette lecture, la liste ne nommait jamais une morgue, et le
// responsable ne voyait rien — un default-deny qui passait pour une panne.
// ============================================================================

describe("entitiesOnIncident — unités, hôpitaux et sites mortuaires", () => {
  const d = new DomainService();
  const inc = d.listIncidents()[0];
  const morgue = d.listMorgues()[0];

  it("nomme les moyens déclarés sur la fiche, et aucune morgue tant qu'aucun corps n'y est admis", () => {
    const serving = d.entitiesOnIncident(inc.id);
    for (const u of inc.responders?.units ?? []) expect(serving).toContain(u);
    for (const h of inc.responders?.hospitals ?? []) expect(serving).toContain(h);
    expect(serving).not.toContain(morgue.id);
  });

  it("nomme un site mortuaire dès qu'un corps de l'incident y est admis — une seule fois", () => {
    d.admitBody(morgue.id, { reference: "REF-T1", incidentId: inc.id });
    d.admitBody(morgue.id, { reference: "REF-T2", incidentId: inc.id });
    const serving = d.entitiesOnIncident(inc.id);
    expect(serving.filter((e) => e === morgue.id)).toHaveLength(1);
    // Un corps d'un AUTRE incident n'engage pas le site sur celui-ci.
    expect(d.entitiesOnIncident("INC-0000")).not.toContain(morgue.id);
  });

  it("un incident inconnu ne sert à personne", () => {
    expect(d.entitiesOnIncident("INC-0000")).toEqual([]);
  });
});
