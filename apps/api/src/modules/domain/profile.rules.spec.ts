import { pruneDemo, type DomainCollections } from "@/modules/domain/profile.rules";
import type { Incident, MorgueSite, MortuaryRecord, Unit } from "@/modules/domain/domain.types";

// ============================================================================
// Profil de données — ce que l'élagage garantit : les graines partent avec
// tout ce qui n'existait que par elles ; les hôpitaux et ce que les opérateurs
// ont créé restent ; la purge ne garde que le réseau hospitalier.
// ============================================================================

const inc = (id: string, extra: Partial<Incident> = {}): Incident =>
  ({ id, titre: id, type: "earthquake", sev: "high", st: "active", time: "10:00", region: "Marrakech-Safi", ll: [-8, 31.6], ...extra }) as Incident;
const unit = (id: string, extra: Partial<Unit> = {}): Unit =>
  ({ id, nom: id, ville: "Rabat", cmdt: "—", eff: 10, dispo: "ready", readiness: 80, x: 0, y: 0, ll: [-6.8, 34], ...extra }) as Unit;
const site = (id: string, hospitalId?: string): MorgueSite => ({ id, nom: id, ville: "Rabat", capacity: 10, staff: 1, statut: "op", hospitalId });
const record = (id: string, mid: string, incidentId?: string): MortuaryRecord =>
  ({ id, mid, reference: id, status: "unidentified", samples: [], admittedAt: "", updatedAt: "", incidentId }) as MortuaryRecord;

const base: DomainCollections = {
  incidents: [inc("INC-2612", { seeded: true }), inc("INC-2595"), inc("INC-9001")],
  units: [unit("U1", { seeded: true }), unit("U99")],
  hospitals: [{ id: "H1" } as DomainCollections["hospitals"][number], { id: "HX" } as DomainCollections["hospitals"][number]],
  fieldHospitals: [{ hid: "H1", nom: "HMC", cap: 10, occ: 2, statut: "op", depuis: "", kind: "mil_field" } as DomainCollections["fieldHospitals"][number]],
  wards: [{ id: "W-101", hid: "H1" } as DomainCollections["wards"][number]],
  shelters: [{ id: "AB-01", nom: "a", ville: "x", capacity: 1, occupants: 0, staff: 0 } as DomainCollections["shelters"][number], { id: "AB-77", nom: "b", ville: "y", capacity: 1, occupants: 0, staff: 0 } as DomainCollections["shelters"][number]],
  morgues: [site("M1", "H1"), site("MM9")],
  mortuaryRecords: [record("DVI-1", "M1"), record("DVI-9", "MM9", "INC-9001"), record("DVI-8", "MM9", "INC-2612")],
  victims: [
    { id: "VIC-1", incidentId: "INC-2612", kind: "dead", sex: "unknown", createdAt: "", updatedAt: "", by: "x" },
    { id: "VIC-2", incidentId: "INC-9001", kind: "injured", sex: "unknown", createdAt: "", updatedAt: "", by: "x" },
  ],
  equipment: [{ id: "EQ-1012", unitId: "U1", unit: "U1", desig: "x", cat: "y", stock: 1, threshold: 0, cond: "ok" }, { id: "EQ-5", unitId: "U99", unit: "U99", desig: "x", cat: "y", stock: 1, threshold: 0, cond: "ok" }],
  feed: [{ time: "10:00", c: "", txt: "graine" }, { time: "10:01", c: "", txt: "INC-2612", incidentId: "INC-2612" }, { time: "10:02", c: "", txt: "INC-9001", incidentId: "INC-9001" }],
  posts: [
    { id: "P1", incidentId: "INC-2612", kind: "opcom", ll: [0, 0], createdBy: "", createdAt: "", updatedAt: "" },
    { id: "P2", incidentId: "INC-9001", kind: "shelter", entityId: "AB-01", ll: [0, 0], createdBy: "", createdAt: "", updatedAt: "" },
    { id: "P3", incidentId: "INC-9001", kind: "equipment", entityId: "U99", ll: [0, 0], createdBy: "", createdAt: "", updatedAt: "" },
  ],
};

describe("profil de données — élagage des graines", () => {
  it("profil « empty » : les graines et leurs orphelins partent, le reste et les hôpitaux restent", () => {
    const ids = new Set(["INC-2595", "U1", "AB-01", "M1", "DVI-1", "EQ-1012"]);
    const r = pruneDemo(base, { ids, seeded: true, fieldHospitals: true, orphanFeed: true });
    expect(r.next.incidents.map((i) => i.id)).toEqual(["INC-9001"]);
    expect(r.removedIncidentIds.sort()).toEqual(["INC-2595", "INC-2612"]);
    expect(r.next.units.map((u) => u.id)).toEqual(["U99"]);
    expect(r.next.hospitals.map((h) => h.id)).toEqual(["H1", "HX"]);
    expect(r.next.wards).toHaveLength(1);
    expect(r.next.fieldHospitals).toEqual([]);
    expect(r.next.shelters.map((s) => s.id)).toEqual(["AB-77"]);
    expect(r.next.morgues.map((m) => m.id)).toEqual(["MM9"]);
    // DVI-1 : graine ; DVI-8 : son incident est parti ; DVI-9 : reste.
    expect(r.next.mortuaryRecords.map((x) => x.id)).toEqual(["DVI-9"]);
    expect(r.next.victims.map((v) => v.id)).toEqual(["VIC-2"]);
    expect(r.next.equipment.map((e) => e.id)).toEqual(["EQ-5"]);
    // Le fil ne garde que ce qui parle d'un incident conservé.
    expect(r.next.feed.map((f) => f.txt)).toEqual(["INC-9001"]);
    // P1 (incident parti), P2 (abri parti) tombent ; P3 reste.
    expect(r.next.posts.map((p) => p.id)).toEqual(["P3"]);
    // 2 incidents, 1 unité, 1 hôpital de campagne, 1 abri, 1 site, 2 dossiers, 1 victime, 1 article, 2 lignes du fil, 2 postes.
    expect(r.total).toBe(14);
  });

  it("profil « demo » avec pierres tombales : seule la graine supprimée part, avec ce qui en dépend", () => {
    const r = pruneDemo(base, { ids: new Set(["M1"]) });
    expect(r.next.morgues.map((m) => m.id)).toEqual(["MM9"]);
    expect(r.next.mortuaryRecords.map((x) => x.id)).toEqual(["DVI-9", "DVI-8"]);
    expect(r.next.incidents).toHaveLength(3);
    expect(r.next.units).toHaveLength(2);
    expect(r.next.feed).toHaveLength(3);
    expect(r.next.fieldHospitals).toHaveLength(1);
    expect(r.removedIncidentIds).toEqual([]);
    expect(r.total).toBe(2);
  });

  it("purge : tout part, sauf les hôpitaux et leurs services", () => {
    const r = pruneDemo(base, { ids: new Set(), all: true });
    expect(r.next.hospitals).toHaveLength(2);
    expect(r.next.wards).toHaveLength(1);
    for (const k of ["incidents", "units", "fieldHospitals", "shelters", "morgues", "mortuaryRecords", "victims", "equipment", "feed", "posts"] as const) {
      expect(r.next[k]).toEqual([]);
    }
    expect(r.removedIncidentIds.sort()).toEqual(["INC-2595", "INC-2612", "INC-9001"]);
  });

  it("rien à retirer : les collections sortent identiques", () => {
    const r = pruneDemo(base, { ids: new Set() });
    expect(r.total).toBe(0);
    expect(r.next.incidents).toHaveLength(3);
    expect(r.next.feed).toHaveLength(3);
    expect(r.removedIncidentIds).toEqual([]);
  });
});
