import { describe, expect, it } from "vitest";
import { etaMinutes, haversineKm, rankShelters, rankUnits, shelterPosition } from "@/lib/ai/opsnetAffecteur";
import type { Shelter } from "@/lib/data/modules";
import type { City, Unit } from "@/lib/types";

// ============================================================================
// OPSnet — le classement est calculé, il doit donc être VÉRIFIABLE.
// ============================================================================

const CASA: [number, number] = [-7.59, 33.57];
const RABAT: [number, number] = [-6.85, 34.02];
const MARRAKECH: [number, number] = [-7.99, 31.63];

const unite = (id: string, ll: [number, number], eff: number, dispo: Unit["dispo"], readiness = 90): Unit => ({
  id, nom: id, ville: "—", cmdt: "—", eff, dispo, readiness, x: 0, y: 0, ll,
});
const abri = (id: string, ville: string, capacity: number, occupants: number, supplies: Shelter["supplies"]): Shelter => ({
  id, nom: id, ville, capacity, occupants, staff: 5, supplies, needs: "—", adults: 0, children: 0, elderly: 0,
});
const villes: City[] = [{ v: "Casablanca", region: "r", ll: CASA }, { v: "Rabat", region: "r", ll: RABAT }];

describe("géodésie", () => {
  it("Casablanca–Rabat ≈ 87 km, et l'ETA est prudent (45 km/h)", () => {
    const km = haversineKm(CASA, RABAT);
    expect(km).toBeGreaterThan(80);
    expect(km).toBeLessThan(95);
    expect(etaMinutes(CASA, RABAT)).toBe(Math.round((km / 45) * 60));
  });
});

describe("rankUnits — engager", () => {
  const units = [unite("proche", CASA, 100, "ready"), unite("loin", MARRAKECH, 400, "ready"), unite("deployee", CASA, 300, "deployed")];

  it("classe la plus proche en tête et couvre le besoin au bon rang", () => {
    const r = rankUnits({ ll: CASA, effectif: 120 }, units);
    expect(r.rows[0].unit.id).toBe("proche");
    // 100 ne couvre pas 120 ; 100 + 400 oui → couvert au rang 2.
    expect(r.couvertAuRang).toBe(2);
    expect(r.cumul).toEqual([100, 500]);
  });

  it("écarte les déployées par défaut, et les reprend sur demande", () => {
    expect(rankUnits({ ll: CASA, effectif: 50 }, units).ecartes.map((e) => e.ecarte)).toEqual(["déployée"]);
    const avec = rankUnits({ ll: CASA, effectif: 50, includeDeployed: true }, units);
    expect(avec.ecartes).toHaveLength(0);
    expect(avec.rows.map((x) => x.unit.id)).toContain("deployee");
  });

  it("écarte hors rayon et DIT que le besoin n'est pas couvert", () => {
    const r = rankUnits({ ll: CASA, effectif: 150, radiusKm: 30 }, units);
    expect(r.ecartes.find((e) => e.unit.id === "loin")?.ecarte).toBe("hors-rayon");
    expect(r.couvertAuRang).toBeNull();
  });

  it("le sous-score d'effectif est plafonné au besoin — 400 pour 50 ne vaut pas 8×", () => {
    const r = rankUnits({ ll: MARRAKECH, effectif: 50 }, [unite("grosse", MARRAKECH, 400, "ready")]);
    expect(r.rows[0].parts.strength).toBe(100);
  });
});

describe("rankShelters — héberger", () => {
  const abris = [
    abri("libre", "Rabat", 500, 100, "ok"),
    abri("sature", "Casablanca", 300, 296, "ok"),
    abri("sans-position", "Moulay Brahim", 400, 100, "low"),
  ];

  it("écarte un abri saturé (≥ 98 %) plutôt que d'y entasser", () => {
    const r = rankShelters({ ll: CASA, personnes: 100 }, abris, villes);
    expect(r.ecartes.map((e) => e.shelter.id)).toEqual(["sature"]);
  });

  it("une commune absente du référentiel donne une position INCONNUE, pas inventée", () => {
    expect(shelterPosition(abris[2], villes)).toBeNull();
    const r = rankShelters({ ll: CASA, personnes: 100 }, abris, villes);
    const row = r.rows.find((x) => x.shelter.id === "sans-position")!;
    expect(row.km).toBeNull();
    expect(row.etaMin).toBeNull();
    expect(r.sansPosition).toBe(1);
    // Non pénalisé sur ce qu'on ignore : score de trajet neutre.
    expect(row.parts.travel).toBe(50);
  });

  it("couvre le besoin par le cumul des places LIBRES", () => {
    const r = rankShelters({ ll: RABAT, personnes: 450 }, abris, villes);
    // libre : 400 places ; sans-position : 300 → 700 ≥ 450 au rang 2.
    expect(r.couvertAuRang).toBe(2);
  });

  it("la rupture d'approvisionnement pèse : à places égales, l'abri pourvu passe devant", () => {
    const r = rankShelters({ ll: RABAT, personnes: 100 }, [abri("pourvu", "Rabat", 300, 100, "ok"), abri("rupture", "Rabat", 300, 100, "critical")], villes);
    expect(r.rows.map((x) => x.shelter.id)).toEqual(["pourvu", "rupture"]);
  });
});
