import { describe, expect, it } from "vitest";
import {
  EMPTY_FORM,
  buildCasualties,
  buildIncidentBody,
  buildNrbc,
  canNext,
  casualtySecondary,
  coordsText,
  formFromIncident,
  matchPlace,
  parseCount,
  rankByDistance,
  resolvePlace,
  withPoint,
  type WizardForm,
} from "@/lib/incidents/wizard";
import type { City, Incident, Province } from "@/lib/types";

// ============================================================================
// Assistant « Signaler un incident » — la logique, sans l'écran
//
// Ce que ces tests verrouillent : ce que l'opérateur ne peut pas envoyer
// (étape non validée), ce qui part à l'API (charge exacte), et ce qui revient
// dans le formulaire quand on rouvre une fiche. Le parcours à l'écran, lui, est
// rejoué au navigateur ; il n'a plus de logique à lui.
// ============================================================================

const provinces: Province[] = [
  { v: "Marrakech", region: "Marrakech-Safi", x: 0, y: 0, ll: [-8.0, 31.63] },
  { v: "Rabat", region: "Rabat-Salé-Kénitra", x: 0, y: 0, ll: [-6.84, 34.02] },
];
const cities: City[] = [
  { v: "Marrakech", province: "Marrakech", region: "Marrakech-Safi", ll: [-8.0, 31.63] },
  { v: "Salé", province: "Salé", region: "Rabat-Salé-Kénitra", ll: [-6.8, 34.04] },
  // Safi est dans la RÉGION de Marrakech mais pas dans sa province : c'est
  // exactement la différence que le filtre des villes doit faire.
  { v: "Safi", province: "Safi", region: "Marrakech-Safi", ll: [-9.23, 32.3] },
];
const ctx = { cities, provinces, incidentTypes: [], lang: "fr" as const };

describe("validation par étape", () => {
  it("chaque étape exige la sienne : type, puis titre, puis point", () => {
    expect(canNext(1, EMPTY_FORM)).toBe(false);
    expect(canNext(1, { ...EMPTY_FORM, type: "flood" })).toBe(true);
    expect(canNext(2, { ...EMPTY_FORM, title: "   " })).toBe(false);
    expect(canNext(2, { ...EMPTY_FORM, title: "Crue" })).toBe(true);
    expect(canNext(3, EMPTY_FORM)).toBe(false);
    expect(canNext(3, withPoint(EMPTY_FORM, [-8, 31.6]))).toBe(true);
    expect(canNext(4, EMPTY_FORM)).toBe(true);
  });

  it("le point pose aussi les coordonnées affichées, à cinq décimales", () => {
    const f = withPoint(EMPTY_FORM, [-8.012345678, 31.6]);
    expect(f.lng).toBe("-8.01235");
    expect(f.lat).toBe("31.60000");
    expect(coordsText(f.pt)).toBe("31.600° N · 8.012° W");
    expect(coordsText(null)).toBe("—");
  });
});

describe("géographie", () => {
  it("apparie une adresse : exact, puis préfixe, sans accents, villes avant provinces", () => {
    expect(matchPlace("sale", cities, provinces)).toEqual([-6.8, 34.04]);
    expect(matchPlace("SAF", cities, provinces)).toEqual([-9.23, 32.3]);
    expect(matchPlace("Rabat", cities, provinces)).toEqual([-6.84, 34.02]);
    // Sous trois caractères on ne devine pas.
    expect(matchPlace("ra", cities, provinces)).toBeNull();
    expect(matchPlace("Tombouctou", cities, provinces)).toBeNull();
  });

  it("classe les moyens du plus proche au plus loin ; sans point, ordre d'origine et km inconnu", () => {
    const moyens = [
      { id: "loin", ll: [-6.8, 34.0] as [number, number] },
      { id: "pres", ll: [-8.0, 31.6] as [number, number] },
    ];
    const ranges = rankByDistance(moyens, [-8.0, 31.63]);
    expect(ranges.map((m) => m.id)).toEqual(["pres", "loin"]);
    expect(ranges[0].km).toBeLessThan(10);
    expect(rankByDistance(moyens, null).map((m) => [m.id, m.km])).toEqual([["loin", null], ["pres", null]]);
  });

  it("rattache à la ville choisie, sinon à la province choisie, sinon à la province la plus proche du point", () => {
    expect(resolvePlace({ pt: null, prov: "", city: "Salé" }, ctx)).toEqual({ region: "Rabat-Salé-Kénitra", place: "Salé" });
    expect(resolvePlace({ pt: null, prov: "Marrakech", city: "" }, ctx)).toEqual({ region: "Marrakech-Safi", place: "Marrakech" });
    expect(resolvePlace({ pt: [-6.85, 34.0], prov: "", city: "" }, ctx)).toEqual({ region: "Rabat-Salé-Kénitra", place: "Rabat" });
    expect(resolvePlace({ pt: null, prov: "", city: "" }, ctx)).toEqual({ region: undefined, place: undefined });
  });
});

describe("bilan humain", () => {
  it("un compteur est un entier positif ; le reste vaut zéro", () => {
    expect(parseCount("12")).toBe(12);
    expect(parseCount("-3")).toBe(0);
    expect(parseCount("")).toBe(0);
    expect(parseCount("abc")).toBe(0);
  });

  it("aucun compteur renseigné : aucun bilan envoyé (pas un bilan à zéro)", () => {
    expect(buildCasualties(EMPTY_FORM)).toBeUndefined();
  });

  it("infectés et contaminés ne figurent que s'ils sont non nuls", () => {
    expect(buildCasualties({ ...EMPTY_FORM, dead: "2", injured: "5" })).toEqual({ dead: 2, injured: 5, missing: 0 });
    expect(buildCasualties({ ...EMPTY_FORM, infected: "7" })).toEqual({ dead: 0, injured: 0, missing: 0, infected: 7 });
  });

  it("le champ central suit le type : contaminés en NRBC, infectés en épidémie, blessés sinon", () => {
    expect(casualtySecondary("nrbc").field).toBe("contaminated");
    expect(casualtySecondary("epidemic").field).toBe("infected");
    expect(casualtySecondary("earthquake").field).toBe("injured");
    expect(casualtySecondary(null).field).toBe("injured");
  });
});

describe("volet NRBC", () => {
  it("n'existe que pour le type dédié avec une famille choisie", () => {
    expect(buildNrbc({ ...EMPTY_FORM, type: "flood", nrbcFamily: "C" })).toBeUndefined();
    expect(buildNrbc({ ...EMPTY_FORM, type: "nrbc", nrbcFamily: null })).toBeUndefined();
  });

  it("substance, ampleur et rejet n'ont de sens qu'en chimique", () => {
    const c = { ...EMPTY_FORM, type: "nrbc", nrbcFamily: "C" as const, nrbcSubstance: "chlore", nrbcSpill: "small" as const };
    expect(buildNrbc(c)).toEqual({ family: "C", substanceId: "chlore", spill: "small", release: "instant" });
    const n = { ...c, nrbcFamily: "N" as const };
    expect(buildNrbc(n)).toEqual({ family: "N", substanceId: undefined, spill: undefined, release: undefined });
  });
});

describe("la charge envoyée à l'API", () => {
  const rempli: WizardForm = withPoint(
    { ...EMPTY_FORM, type: "flood", title: "  Crue de l'oued  ", desc: "Montée rapide", city: "Marrakech", dead: "1", units: ["u1"] },
    [-8.0, 31.63],
  );

  it("sans point ou sans région résolvable, rien ne part", () => {
    expect(buildIncidentBody({ ...rempli, pt: null }, ctx)).toBeNull();
    expect(buildIncidentBody(withPoint(EMPTY_FORM, [-8, 31.6]), { ...ctx, provinces: [], cities: [] })).toBeNull();
  });

  it("titre et adresse sont nettoyés, la région vient de la ville, les blocs vides sont omis", () => {
    const body = buildIncidentBody(rempli, ctx);
    expect(body).toMatchObject({
      type: "flood",
      titre: "Crue de l'oued",
      region: "Marrakech-Safi",
      desc: "Montée rapide",
      ll: [-8.0, 31.63],
      casualties: { dead: 1, injured: 0, missing: 0 },
      responders: { units: ["u1"], hospitals: [] },
    });
    expect(body?.adresse).toBeUndefined();
    expect(body?.nrbc).toBeUndefined();
    expect(typeof body?.x).toBe("number");
  });

  it("sans titre, un titre de repli « type — lieu » est fabriqué", () => {
    const types = [{ id: "flood", labels: { fr: "Inondation", ar: "فيضان", en: "Flood" } } as never];
    const body = buildIncidentBody({ ...rempli, title: "" }, { ...ctx, incidentTypes: types });
    expect(body?.titre).toBe("Inondation — Marrakech");
  });
});

describe("rouvrir une fiche", () => {
  it("recharge tout, la description comprise, et laisse vides les compteurs absents", () => {
    const inc = {
      id: "INC-1",
      type: "epidemic",
      titre: "Foyer",
      desc: "Cas groupés",
      adresse: "Zagora",
      ll: [-5.84, 30.33],
      casualties: { dead: 0, injured: 0, missing: 2, infected: 40 },
      responders: { units: ["u2"], hospitals: ["h1"] },
    } as unknown as Incident;
    const f = formFromIncident(inc);
    expect(f).toMatchObject({ type: "epidemic", title: "Foyer", desc: "Cas groupés", adresse: "Zagora", missing: "2", infected: "40", contaminated: "", units: ["u2"], hospitals: ["h1"] });
    expect(f.pt).toEqual([-5.84, 30.33]);
    expect(f.lat).toBe("30.33000");
    // Une fiche sans bilan ne remplit pas de zéros.
    expect(formFromIncident({ ...inc, casualties: undefined } as Incident).dead).toBe("");
    expect(formFromIncident({ ...inc, desc: undefined } as Incident).desc).toBe("");
  });
});
