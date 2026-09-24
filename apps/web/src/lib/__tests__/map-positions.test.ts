import { describe, expect, it } from "vitest";
import { entityLL, layerOf, mapMarkerOffsets, morgueLL, shelterLL, spreadOffsets, type PositionSource } from "@/lib/map/positions";
import type { LayerState } from "@/lib/store/shared";
import type { City, FieldHospital, Hospital, Incident, MorgueSite, Unit } from "@/lib/types";
import type { Shelter } from "@/lib/data/modules";

// ADR 0036 — une seule position par élément : le marqueur, le recentrage et
// le bouton « Afficher sur la carte » lisent la même.

const cities = [
  { v: "Asni", province: "Al Haouz", region: "Marrakech-Safi", ll: [-7.98, 31.25] },
  { v: "Tamri", province: "Agadir-Ida-Ou-Tanane", region: "Souss-Massa", ll: [-9.82, 30.7] },
  { v: "Tamri", province: "Essaouira", region: "Marrakech-Safi", ll: [-9.6, 31.1] },
] as City[];

const hospitals = [
  { id: "H1", nom: "Hôpital Militaire d'Instruction Mohammed V", kind: "mil", ville: "Rabat", ll: [-6.85, 34.01] },
  { id: "H2", nom: "CHP Al Haouz", kind: "civ", ville: "Tahannaout", ll: [-7.95, 31.35] },
  { id: "H3", nom: "Hôpital de campagne d'Amizmiz", kind: "mil_field", ville: "Amizmiz", ll: [-8.24, 31.22] },
] as unknown as Hospital[];

const fieldHosps = [
  { id: "HDC-08", hid: "H1", nom: "HMC Rabat — Détachement 2", cap: 40, occ: 0, statut: "partial", depuis: "J+0", kind: "mil_field", ll: [-7.98, 31.25] },
] as FieldHospital[];

const morgues = [
  { id: "M1", nom: "IML Marrakech", ville: "Marrakech", capacity: 60, staff: 8, statut: "op", kind: "fixed", ll: [-8.0, 31.63] },
  { id: "MM1", nom: "Morgue mobile 1", ville: "Asni", capacity: 20, staff: 4, statut: "op", kind: "mobile", ll: [-7.5, 33.5], deployment: { site: "Asni", ll: [-7.98, 31.25], at: "", by: "x" } },
  { id: "MM2", nom: "Morgue mobile 2", ville: "Rabat", capacity: 20, staff: 4, statut: "closed", kind: "mobile", ll: [-6.85, 34.01], deployment: null },
] as MorgueSite[];

const shelters = [
  { id: "AB-05", nom: "Foyer Asni", ville: "Asni", capacity: 100, occupants: 10 },
  { id: "AB-07", nom: "Camp posé", ville: "Asni", capacity: 50, occupants: 0, ll: [-7.9, 31.3] },
  { id: "AB-09", nom: "Abri sans commune connue", ville: "Nulle-Part", capacity: 10, occupants: 0 },
] as unknown as Shelter[];

const incidents = [{ id: "INC-1", titre: "Séisme", ll: [-7.98, 31.25] }] as unknown as Incident[];
const units = [{ id: "U1", nom: "3e Bataillon du Génie", ll: [-7.6, 33.5] }] as unknown as Unit[];

const src: PositionSource = { mapIncidents: incidents, units, hospitals, fieldHosps, morgues, shelters, cities, trackers: [], posts: [], placed: [] };
const tout: LayerState = { units: true, posts: true, placed: true, hospitals: true, hospitalsCiv: false, incidents: true, vehicles: true, field: true, aircraft: true, missions: true, morgues: true, shelters: true, trackers: true };

describe("positions de la carte (ADR 0036)", () => {
  it("un abri se lit à sa position, sinon à sa commune — la province départage les homonymes", () => {
    expect(shelterLL(shelters[1], cities)).toEqual({ ll: [-7.9, 31.3], fromCity: false });
    expect(shelterLL(shelters[0], cities)).toEqual({ ll: [-7.98, 31.25], fromCity: true });
    expect(shelterLL({ ville: "Tamri", province: "Essaouira" }, cities)?.ll).toEqual([-9.6, 31.1]);
    expect(shelterLL(shelters[2], cities)).toBeNull();
  });

  it("une morgue mobile se lit là où elle est déployée ; repliée, elle n'est pas sur la carte", () => {
    expect(morgueLL(morgues[0])).toEqual([-8.0, 31.63]);
    expect(morgueLL(morgues[1])).toEqual([-7.98, 31.25]);
    expect(morgueLL(morgues[2])).toBeNull();
  });

  it("chaque élément allume sa couche — un établissement de type « campagne » celle des hôpitaux de campagne", () => {
    expect(layerOf(src, "hosp", "H1")).toBe("hospitals");
    expect(layerOf(src, "hosp", "H2")).toBe("hospitalsCiv");
    expect(layerOf(src, "hosp", "H3")).toBe("field");
    expect(layerOf(src, "field", "HDC-08")).toBe("field");
    expect(layerOf(src, "shelter", "AB-05")).toBe("shelters");
    expect(layerOf(src, "morgue", "MM1")).toBe("morgues");
    expect(layerOf(src, "unit", "U1")).toBe("units");
  });

  it("la position d'un élément est celle de son marqueur — hôpital de campagne par identifiant ou par nom", () => {
    expect(entityLL(src, "field", "HDC-08")).toEqual([-7.98, 31.25]);
    expect(entityLL(src, "field", "HMC Rabat — Détachement 2")).toEqual([-7.98, 31.25]);
    expect(entityLL(src, "shelter", "AB-05")).toEqual([-7.98, 31.25]);
    expect(entityLL(src, "shelter", "AB-09")).toBeNull();
    expect(entityLL(src, "morgue", "MM2")).toBeNull();
    expect(entityLL(src, "hosp", "H3")).toEqual([-8.24, 31.22]);
    expect(entityLL(src, "veh", "V1")).toBeNull();
  });
});

describe("marqueurs au même point (ADR 0036)", () => {
  it("le premier garde sa place, les autres s'écartent assez pour ne pas le chevaucher", () => {
    const o = spreadOffsets([
      { key: "a", ll: [-7.98, 31.25] },
      { key: "b", ll: [-7.98, 31.25] },
      { key: "c", ll: [-7.98, 31.25] },
      { key: "seul", ll: [-7.0, 31.0] },
      // ~50 m plus loin : pas « au même point ».
      { key: "voisin", ll: [-7.9805, 31.25] },
    ]);
    expect(o.has("a")).toBe(false);
    expect(o.has("seul")).toBe(false);
    expect(o.has("voisin")).toBe(false);
    for (const k of ["b", "c"]) {
      const [dx, dy] = o.get(k)!;
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(33);
    }
    expect(o.get("b")).not.toEqual(o.get("c"));
  });

  it("un hôpital de campagne déployé sur le point de l'incident s'écarte de lui, un abri posé à la même commune aussi", () => {
    const o = mapMarkerOffsets({ ...src, layers: tout });
    // L'incident garde sa place exacte ; le détachement, la morgue mobile et l'abri se rangent autour.
    expect(o.has("inc:INC-1")).toBe(false);
    expect(o.get("field:HDC-08")).toBeDefined();
    expect(o.get("morgue:MM1")).toBeDefined();
    expect(o.get("shelter:AB-05")).toBeDefined();
    // Couche éteinte : elle ne pousse personne.
    const sansIncidents = mapMarkerOffsets({ ...src, layers: { ...tout, incidents: false } });
    expect(sansIncidents.has("field:HDC-08")).toBe(false);
    expect(sansIncidents.get("morgue:MM1")).toBeDefined();
  });
});
