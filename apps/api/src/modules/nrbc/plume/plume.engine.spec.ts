import {
  ATP45_DANGER_KM,
  ATP45_HAZARD_KM,
  ATP45_LOW_WIND_KMH,
  atp45Zones,
  circleRing,
  destination,
  ergZones,
} from "@/modules/nrbc/plume/plume.engine";
import type { ErgDistances } from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — tests du moteur de panache (ADR 0005)
//
// Ces gabarits guident des décisions d'évacuation : les tests verrouillent le
// seuil de vent ATP-45, le choix jour/nuit ERG, l'orientation SOUS LE VENT
// (direction météo = d'où vient le vent), la fermeture des anneaux et le
// déterminisme (mêmes entrées → mêmes polygones, au chiffre près).
// ============================================================================

/** Point d'essai : Casablanca (port industriel — scénario chlore plausible). */
const CASA: [number, number] = [-7.59, 33.57];

/** Distances du chlore, grand déversement (CAMEO/NOAA, ERG 2024). */
const CHLORINE_LARGE: ErgDistances = { isolationM: 914, protectDayKm: 9.65, protectNightKm: 11.27 };

/** Distance géodésique approchée entre deux [lon, lat], en km (contrôle). */
function distKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

describe("géométrie sphérique", () => {
  it("destination : 10 km plein nord ≈ +0,09° de latitude, même longitude", () => {
    const [lon, lat] = destination(CASA, 0, 10);
    expect(lat).toBeCloseTo(CASA[1] + 10 / 111.195, 3);
    expect(lon).toBeCloseTo(CASA[0], 4);
  });

  it("circleRing : anneau fermé dont chaque sommet est au rayon demandé", () => {
    const ring = circleRing(CASA, 2);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBe(65); // 64 sommets + fermeture
    for (const p of ring) expect(distKm(CASA, p)).toBeCloseTo(2, 2);
  });
});

describe("gabarit ATP-45", () => {
  it("vent faible (≤ 10 km/h) : cercle de danger 2 km + cercle de VIGILANCE 10 km", () => {
    const zones = atp45Zones(CASA, ATP45_LOW_WIND_KMH, 270);
    expect(zones.map((z) => z.level)).toEqual(["danger", "vigilance", "protection"]);
    expect(zones[0].radiusKm).toBe(ATP45_DANGER_KM);
    expect(zones[1].radiusKm).toBe(ATP45_HAZARD_KM);
    // Les deux cercles doctrinaux restent des cercles : la nappe s'AJOUTE.
    expect(zones[0].kind).toBe("circle");
    expect(zones[1].kind).toBe("circle");
  });

  it("sous le seuil, la nappe s'AJOUTE au cercle sans le remplacer", () => {
    // L'ATP-45 refuse de désigner un secteur sous 10 km/h : le cercle
    // omnidirectionnel reste la zone doctrinale, et c'est lui qu'on pose. Mais
    // un vent de 6 km/h A une direction, et un cercle de 10 km sur une
    // agglomération ne se tasque pas. On émet donc l'axe EN PLUS, marqué.
    const zones = atp45Zones(CASA, 6, 270);
    expect(zones.map((z) => z.level)).toEqual(["danger", "vigilance", "protection"]);
    const wedge = zones[2];
    expect(wedge.lowWind).toBe(true);
    expect(wedge.kind).toBe("wedge");
    // Le cercle de vigilance N'A PAS disparu.
    expect(zones[1].kind).toBe("circle");
    expect(zones[1].radiusKm).toBe(ATP45_HAZARD_KM);
  });

  it("l'ouverture de la nappe GRANDIT quand le vent faiblit", () => {
    // C'est la façon honnête de dire « voici l'axe, et voici combien j'en
    // doute » : une nappe étroite par vent nul affirmerait une direction que le
    // modèle refuse d'affirmer.
    const width = (kmh: number) => {
      const w = atp45Zones(CASA, kmh, 270).find((z) => z.kind === "wedge")!;
      // Écart angulaire entre les deux points les plus éloignés de l'arc aval.
      const far = w.ring.filter((p) => distKm(CASA, p) > ATP45_HAZARD_KM * 0.95);
      const ang = far.map((p) => Math.atan2(p[1] - CASA[1], p[0] - CASA[0]));
      return Math.max(...ang) - Math.min(...ang);
    };
    expect(width(1)).toBeGreaterThan(width(6));
    expect(width(6)).toBeGreaterThan(width(10));
    // Au-delà du seuil, l'ouverture est celle de l'ATP-45 et ne bouge plus.
    expect(width(25)).toBeCloseTo(width(45), 5);
  });

  it("au-dessus du seuil, PAS de cercle de vigilance ni de marque `lowWind`", () => {
    const zones = atp45Zones(CASA, 25, 270);
    expect(zones.map((z) => z.level)).toEqual(["danger", "protection"]);
    expect(zones.find((z) => z.kind === "wedge")!.lowWind).toBeUndefined();
  });

  it("vent établi (> 10 km/h) : cercle de danger + nappe de PROTECTION sous le vent", () => {
    // Vent D'OUEST (fromDeg = 270) : le panache part vers l'EST (+lon).
    const zones = atp45Zones(CASA, 25, 270);
    expect(zones.map((z) => z.level)).toEqual(["danger", "protection"]);
    const wedge = zones[1];
    expect(wedge.kind).toBe("wedge");
    expect(wedge.ring[0]).toEqual(wedge.ring[wedge.ring.length - 1]); // fermé
  });

  it("la nappe NE PART PAS d'un point : elle est tangente au cercle d'isolement", () => {
    // Le triangle à sommet sur le rejet donnait au danger une largeur NULLE à
    // cinquante mètres du déversement. Or le rejet occupe déjà le cercle
    // d'isolement (GMU 2024, « Mode d'emploi du tableau 1 », p. 284-285 : isoler
    // « dans TOUTES les directions », PUIS protéger sous le vent).
    const wedge = atp45Zones(CASA, 25, 270)[1];
    // Aucun sommet ne coïncide avec la source.
    for (const p of wedge.ring) {
      expect(distKm(CASA, p)).toBeGreaterThan(ATP45_DANGER_KM * 0.9);
    }
    // Les deux flancs partent du BORD du cercle d'isolement.
    expect(distKm(CASA, wedge.ring[0])).toBeCloseTo(ATP45_DANGER_KM, 1);
  });

  it("le fond de la nappe est un ARC à portée constante, pas une corde", () => {
    // Une corde droite sous-estimerait la portée en son milieu — de près de
    // 15 % à un demi-angle de 30°.
    const wedge = atp45Zones(CASA, 25, 270);
    const far = wedge[1].ring.filter((p) => distKm(CASA, p) > ATP45_HAZARD_KM * 0.95);
    expect(far.length).toBeGreaterThan(10);
    for (const p of far) {
      expect(distKm(CASA, p)).toBeCloseTo(ATP45_HAZARD_KM, 1);
      expect(p[0]).toBeGreaterThan(CASA[0]); // à l'EST
    }
  });

  it("sans prévision de vent : le seul cercle de danger, aucune zone inventée", () => {
    const zones = atp45Zones(CASA, null, null);
    expect(zones).toHaveLength(1);
    expect(zones[0].level).toBe("danger");
  });

  it("est déterministe : deux appels aux mêmes entrées rendent les mêmes polygones", () => {
    const a = atp45Zones(CASA, 25, 45);
    const b = atp45Zones(CASA, 25, 45);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("gabarit ERG 2024", () => {
  it("cercle d'isolement au rayon de la table + carré de protection sous le vent", () => {
    const zones = ergZones(CASA, CHLORINE_LARGE, true, 270);
    expect(zones.map((z) => z.level)).toEqual(["danger", "protection"]);
    expect(zones[0].radiusKm).toBeCloseTo(0.914, 3);
    const square = zones[1];
    expect(square.kind).toBe("square");
    expect(square.reachKm).toBe(CHLORINE_LARGE.protectDayKm);
    // Coins aval du carré à ~sqrt(D² + (D/2)²) du point, côté EST (vent d'ouest).
    const diag = Math.hypot(CHLORINE_LARGE.protectDayKm, CHLORINE_LARGE.protectDayKm / 2);
    for (const p of [square.ring[1], square.ring[2]]) {
      expect(distKm(CASA, p)).toBeCloseTo(diag, 1);
      expect(p[0]).toBeGreaterThan(CASA[0]);
    }
  });

  it("nuit : la distance de protection passe à la colonne nocturne (plus longue)", () => {
    const day = ergZones(CASA, CHLORINE_LARGE, true, 0);
    const night = ergZones(CASA, CHLORINE_LARGE, false, 0);
    expect(day[1].reachKm).toBe(9.65);
    expect(night[1].reachKm).toBe(11.27);
  });

  it("sans direction de vent : le seul isolement (pas de carré arbitraire)", () => {
    const zones = ergZones(CASA, CHLORINE_LARGE, true, null);
    expect(zones).toHaveLength(1);
    expect(zones[0].level).toBe("danger");
  });

  it("tous les anneaux rendus sont fermés et bornés (± 0,25° autour du point)", () => {
    for (const z of [...ergZones(CASA, CHLORINE_LARGE, false, 135), ...atp45Zones(CASA, 30, 135)]) {
      expect(z.ring[0]).toEqual(z.ring[z.ring.length - 1]);
      for (const [lon, lat] of z.ring) {
        expect(Math.abs(lon - CASA[0])).toBeLessThan(0.25);
        expect(Math.abs(lat - CASA[1])).toBeLessThan(0.25);
      }
    }
  });
});
