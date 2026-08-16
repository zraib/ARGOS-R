import { detectCodeKind, normalizeCode } from "@/modules/aviation/aircraft.types";
import type { AircraftPosition, TrackedAircraft } from "@/modules/aviation/aircraft.types";
import { matches, resolvePositions, statusOf } from "@/modules/aviation/aircraft.matching";

// ============================================================================
// ARGOS — appariement aérien
//
// L'enjeu de sécurité est ici : afficher le MAUVAIS appareil sous le libellé
// « Canadair 01 » est pire que n'afficher aucun appareil. Ces tests gardent la
// règle d'appariement.
// ============================================================================

function aircraft(over: Partial<TrackedAircraft> = {}): TrackedAircraft {
  return {
    id: "acft-test",
    code: "CNTZS",
    codeKind: "registration",
    label: "Canadair 01",
    role: "waterbomber",
    archived: false,
    addedAt: "2026-08-14T10:00:00.000Z",
    addedBy: "opcom",
    ...over,
  };
}

function position(over: Partial<AircraftPosition> = {}): AircraftPosition {
  return {
    icao24: "02a101",
    callsign: "CNTZS",
    lat: 35.1,
    lon: -5.2,
    ll: [-5.2, 35.1],
    altitude: 800,
    heading: 120,
    velocity: 70,
    verticalRate: 0,
    onGround: false,
    squawk: "7001",
    lastContact: "2026-08-14T10:00:00.000Z",
    originCountry: "Morocco",
    ...over,
  };
}

describe("normalisation et détection du code", () => {
  it("ignore casse, espaces et tirets", () => {
    expect(normalizeCode(" cn-tzs ")).toBe("CNTZS");
    expect(normalizeCode("CN TZS")).toBe("CNTZS");
  });

  it("reconnaît chaque nature de code à sa forme", () => {
    expect(detectCodeKind("7001")).toBe("squawk");
    expect(detectCodeKind("02A101")).toBe("icao24");
    expect(detectCodeKind("CNTZS")).toBe("registration");
    expect(detectCodeKind("GRM01")).toBe("callsign");
  });

  it("ne prend pas un squawk pour une adresse OACI", () => {
    // 4 chiffres octaux : c'est un code IFF, pas une adresse 24 bits.
    expect(detectCodeKind("7777")).toBe("squawk");
  });
});

describe("appariement", () => {
  it("apparie une immatriculation à l'indicatif émis", () => {
    // L'ADS-B ne transmet pas l'immatriculation : en aviation d'État, l'équipage
    // l'émet comme indicatif.
    expect(matches(aircraft(), position({ callsign: "CNTZS  " }))).toBe(true);
  });

  it("refuse un appareil différent", () => {
    expect(matches(aircraft(), position({ callsign: "CNTZB" }))).toBe(false);
  });

  it("fait primer l'adresse OACI sur l'indicatif", () => {
    const a = aircraft({ icao24: "02a101" });
    // Indicatif changé en vol : l'appareil reste identifié par son adresse.
    expect(matches(a, position({ callsign: "GRM09" }))).toBe(true);
  });

  it("n'apparie un squawk que faute d'adresse OACI connue", () => {
    const parSquawk = aircraft({ code: "7001", codeKind: "squawk" });
    expect(matches(parSquawk, position())).toBe(true);

    // Un squawk est réattribué d'un vol à l'autre : dès qu'une adresse OACI est
    // connue, elle seule fait foi, sinon on afficherait un intrus.
    const avecOaci = aircraft({ code: "7001", codeKind: "squawk", icao24: "02a999" });
    expect(matches(avecOaci, position({ icao24: "02a101" }))).toBe(false);
  });
});

describe("résolution sur la flotte", () => {
  it("ne retient que les appareils inscrits", () => {
    const fleet = [aircraft({ id: "a1", code: "CNTZS" })];
    const echoes = [position({ callsign: "CNTZS" }), position({ icao24: "3c6444", callsign: "DLH1234" })];

    const resolved = resolvePositions(fleet, echoes);

    expect(resolved.size).toBe(1);
    expect(resolved.get("a1")?.callsign).toBe("CNTZS");
  });

  it("garde le contact le plus récent en cas d'échos multiples", () => {
    const fleet = [aircraft({ id: "a1" })];
    const echoes = [
      position({ lastContact: "2026-08-14T10:00:00.000Z", altitude: 100 }),
      position({ lastContact: "2026-08-14T10:05:00.000Z", altitude: 900 }),
    ];

    expect(resolvePositions(fleet, echoes).get("a1")?.altitude).toBe(900);
  });

  it("laisse sans position un appareil inscrit mais silencieux", () => {
    const fleet = [aircraft({ id: "a1", code: "CNTZX" })];
    expect(resolvePositions(fleet, [position({ callsign: "CNTZS" })]).size).toBe(0);
    expect(statusOf(null)).toBe("no_signal");
  });

  it("distingue en vol et au sol", () => {
    expect(statusOf(position({ onGround: false }))).toBe("airborne");
    expect(statusOf(position({ onGround: true }))).toBe("ground");
  });
});
