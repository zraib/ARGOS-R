import { describe, expect, it } from "vitest";
import {
  EMPTY_FORM,
  buildCasualties,
  buildIncidentBody,
  buildNrbc,
  canNext,
  casualtySecondary,
  choosePlace,
  clearLocation,
  coordsText,
  formFromIncident,
  locationLocks,
  matchPlace,
  parseCount,
  placePoint,
  rankByDistance,
  resolvePlace,
  typeAddress,
  typeCoords,
  withPoint,
  type WizardForm,
  needsMorgue,
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
  it("chaque étape exige la sienne : le type, puis le point ; le bilan et les détails ne bloquent pas", () => {
    // Ordre : 1 Type → 2 Localisation → 3 Victimes et moyens → 4 Détails (titre et
    // description générés à l'arrivée sur l'étape ; un titre vide a un repli).
    expect(canNext(1, EMPTY_FORM)).toBe(false);
    expect(canNext(1, { ...EMPTY_FORM, type: "flood" })).toBe(true);
    expect(canNext(2, { ...EMPTY_FORM, type: "flood" })).toBe(false);
    expect(canNext(2, withPoint({ ...EMPTY_FORM, type: "flood" }, [-8, 31.6]))).toBe(true);
    expect(canNext(3, EMPTY_FORM)).toBe(true);
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

describe("localisation : une seule source de vérité", () => {
  const geo = { provinces, cities };

  it("un point posé remplit région, province, ville et coordonnées, sans rien verrouiller", () => {
    const f = placePoint(EMPTY_FORM, [-8.01, 31.62], geo);
    expect(f).toMatchObject({ region: "Marrakech-Safi", prov: "Marrakech", city: "Marrakech", lat: "31.62000", lng: "-8.01000", locMode: "point" });
    expect(locationLocks(f)).toEqual({ admin: false, coords: false });
    // Loin de toute ville : la province la plus proche, aucune ville inventée.
    expect(placePoint(EMPTY_FORM, [-7.5, 31.2], geo)).toMatchObject({ prov: "Marrakech", city: "" });
  });

  it("un lieu choisi pose le point de la ville, sinon du chef-lieu, et verrouille les coordonnées", () => {
    const ville = choosePlace(EMPTY_FORM, { region: "Marrakech-Safi", province: "Marrakech", city: "Marrakech" }, geo);
    expect(ville.pt).toEqual([-8.0, 31.63]);
    expect(locationLocks(ville)).toEqual({ admin: false, coords: true });
    const prov = choosePlace(EMPTY_FORM, { region: "Rabat-Salé-Kénitra", province: "Rabat", city: "" }, geo);
    expect(prov.pt).toEqual([-6.84, 34.02]);
    expect(prov.locMode).toBe("admin");
    // Une région seule ne localise rien : pas de point, pas de verrou.
    const region = choosePlace(ville, { region: "Rabat-Salé-Kénitra", province: "", city: "" }, geo);
    expect(region).toMatchObject({ region: "Rabat-Salé-Kénitra", prov: "", city: "", pt: null, lat: "", locMode: "none" });
  });

  it("des coordonnées saisies déduisent le découpage et verrouillent la cascade ; vidées, elles rendent la main", () => {
    const partiel = typeCoords(EMPTY_FORM, { lat: "31.6" }, geo);
    expect(partiel).toMatchObject({ lat: "31.6", pt: null, locMode: "coords" });
    expect(locationLocks(partiel)).toEqual({ admin: true, coords: false });
    const complet = typeCoords(partiel, { lng: "-8.01" }, geo);
    expect(complet).toMatchObject({ lat: "31.6", lng: "-8.01", region: "Marrakech-Safi", prov: "Marrakech", city: "Marrakech", locMode: "coords" });
    expect(complet.pt).toEqual([-8.01, 31.6]);
    // À 70 km de toute ville : la province est déduite, aucune ville n'est inventée.
    expect(typeCoords(EMPTY_FORM, { lat: "31", lng: "-8.01" }, geo)).toMatchObject({ prov: "Marrakech", city: "" });
    expect(typeCoords(complet, { lat: "", lng: "" }, geo)).toMatchObject({ pt: null, region: "", prov: "", city: "", locMode: "none" });
  });

  it("l'adresse libre pose le point d'un lieu reconnu, sauf quand un choix explicite le tient déjà", () => {
    expect(typeAddress(EMPTY_FORM, "marrak", geo)).toMatchObject({ adresse: "marrak", city: "Marrakech", prov: "Marrakech", locMode: "point" });
    const choisi = choosePlace(EMPTY_FORM, { region: "Marrakech-Safi", province: "Marrakech", city: "Marrakech" }, geo);
    const apres = typeAddress(choisi, "Marrakech, route de Safi", geo);
    expect(apres.adresse).toBe("Marrakech, route de Safi");
    expect(apres.pt).toEqual(choisi.pt);
    expect(apres.locMode).toBe("admin");
  });

  it("effacer retire tout sauf l'adresse tapée à la main", () => {
    const f = clearLocation({ ...placePoint(EMPTY_FORM, [-8.0, 31.63], geo), adresse: "Bab Doukkala" });
    expect(f).toMatchObject({ adresse: "Bab Doukkala", region: "", prov: "", city: "", lat: "", lng: "", pt: null, locMode: "none" });
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

  it("les morgues cochées ne partent qu'avec un décès déclaré, comme intervenants", () => {
    const base = { ...rempli, dead: "0", morgues: ["M1"] };
    expect(needsMorgue(base)).toBe(false);
    expect(buildIncidentBody(base, ctx)?.responders).toEqual({ units: ["u1"], hospitals: [] });
    const avecDeces = { ...base, dead: "2" };
    expect(needsMorgue(avecDeces)).toBe(true);
    expect(buildIncidentBody(avecDeces, ctx)?.responders).toEqual({ units: ["u1"], hospitals: [], morgues: ["M1"] });
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

  it("avec le référentiel, le découpage administratif est relu sur le point de la fiche", () => {
    const inc = { id: "INC-2", type: "flood", titre: "Crue", ll: [-8.0, 31.63], region: "Marrakech-Safi" } as unknown as Incident;
    expect(formFromIncident(inc, { provinces, cities })).toMatchObject({ region: "Marrakech-Safi", prov: "Marrakech", city: "Marrakech", locMode: "point" });
    // Sans référentiel, la région de la fiche est gardée telle quelle.
    expect(formFromIncident(inc)).toMatchObject({ region: "Marrakech-Safi", prov: "", locMode: "none" });
  });
});
