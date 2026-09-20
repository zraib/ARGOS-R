import { describe, expect, it } from "vitest";
import { pixelLngLat, type DemGrid } from "@/lib/flood/grid";
import { FireSpread, fireBehaviour, headRos, lengthToBreadth, rosTowards, slopeFactor, type FireParams } from "@/lib/fire/spread";
import { FUEL_MODELS, equilibriumMoisture, rothermel, tacticalClass } from "@/lib/fire/rothermel";
import { FIRE_BURNT, FireRun, driveFireRun, fireState } from "@/lib/fire/run";
import { frameValue, paintSpread } from "@/lib/sim/spread";
import { firePalette } from "@/components/map/layers/fire";

function grille(w: number, h: number, f: (x: number, y: number) => number): DemGrid {
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elev[y * w + x] = f(x, y);
  return { z: 12, x0: 2000, y0: 1650, tx: 1, ty: 1, width: w, height: h, elev };
}

const CALME: FireParams = { fuel: "shrub", windKmh: 0, windFromDeg: 0, humidityPct: 30, tempC: 25 };

describe("Rothermel (1972) sur les modèles d'Anderson (1982)", () => {
  it("retrouve le tableau d'Anderson : vitesse à 5 mi/h de vent à mi-flamme et 8 % d'humidité, à ±35 % (±0,5 ch/h) — la plupart à quelques pour cent", () => {
    const attendu: Record<number, number> = { 1: 78, 2: 35, 3: 104, 4: 75, 5: 18, 6: 32, 7: 20, 8: 1.6, 9: 7.5, 10: 7.9, 11: 6, 12: 13, 13: 13.5 };
    const u = (5 * 5280) / 60 / 196.85; // 5 mi/h → m/s
    for (const fm of FUEL_MODELS) {
      const r = rothermel(fm, { d1h: 0.08, d10h: 0.08, d100h: 0.08, herb: 1.0, woody: 1.0 }, u, 0);
      const chh = r.ros / 0.3048 / 1.1;
      expect(Math.abs(chh - attendu[fm.id])).toBeLessThanOrEqual(Math.max(0.5, 0.35 * attendu[fm.id]));
    }
    // Les modèles sans combustible vif (l'humidité du vif n'y entre pas) se retrouvent à 10 % près.
    for (const id of [1, 3, 8, 9, 11, 13]) {
      const fm = FUEL_MODELS[id - 1];
      const chh = rothermel(fm, { d1h: 0.08, d10h: 0.08, d100h: 0.08, herb: 1.0, woody: 1.0 }, u, 0).ros / 0.3048 / 1.1;
      expect(Math.abs(chh - attendu[id]) / attendu[id]).toBeLessThan(0.12);
    }
  });
  it("le vent et la pente accélèrent, l'humidité freine ; les flammes suivent l'intensité (Byram) ; l'extinction arrête tout", () => {
    const fm = FUEL_MODELS[3]; // chaparral
    const sec = { d1h: 0.06, d10h: 0.08, d100h: 0.1, herb: 0.7, woody: 0.9 };
    const calme = rothermel(fm, sec, 0, 0);
    const vent = rothermel(fm, sec, 3, 0);
    const pente = rothermel(fm, sec, 0, Math.tan((25 * Math.PI) / 180));
    expect(vent.ros).toBeGreaterThan(calme.ros * 3);
    expect(pente.ros).toBeGreaterThan(calme.ros * 1.5);
    expect(vent.phiW).toBeGreaterThan(0);
    expect(calme.phiW).toBe(0);
    expect(vent.flameLength).toBeGreaterThan(calme.flameLength);
    expect(vent.firelineIntensity).toBeGreaterThan(calme.firelineIntensity);
    expect(rothermel(fm, { ...sec, d1h: 0.15, d10h: 0.17, d100h: 0.19 }, 3, 0).ros).toBeLessThan(vent.ros);
    // Au-delà de l'humidité d'extinction du mort, le lit ne porte plus le feu.
    expect(rothermel(FUEL_MODELS[0], { d1h: 0.13, d10h: 0.15, d100h: 0.17, herb: 1, woody: 1 }, 3, 0).ros).toBeLessThan(1e-6);
    expect(calme.residenceTime).toBeCloseTo(384 / 1739, 0);
  });
  it("l'humidité d'équilibre (Simard) : l'air sec et chaud dessèche, l'air humide sature ; la lecture tactique suit la flamme", () => {
    expect(equilibriumMoisture(35, 15)).toBeLessThan(0.05);
    expect(equilibriumMoisture(20, 60)).toBeGreaterThan(0.09);
    expect(equilibriumMoisture(10, 95)).toBeGreaterThan(0.2);
    expect(tacticalClass(0.8)).toBe("direct");
    expect(tacticalClass(2)).toBe("engins");
    expect(tacticalClass(3)).toBe("indirect");
    expect(tacticalClass(5)).toBe("hors");
  });
});

describe("vitesses du front de flammes", () => {
  it("le vent, l'air sec et la chaleur accélèrent ; l'ellipse s'allonge avec le vent ; l'herbe court, la litière rampe", () => {
    expect(headRos({ ...CALME, windKmh: 40 })).toBeGreaterThan(headRos({ ...CALME, windKmh: 20 }));
    expect(headRos({ ...CALME, humidityPct: 20, tempC: 35 })).toBeGreaterThan(headRos({ ...CALME, humidityPct: 80, tempC: 10 }));
    expect(headRos({ ...CALME, fuel: "tallgrass", windKmh: 30 })).toBeGreaterThan(headRos({ ...CALME, fuel: "litter", windKmh: 30 }) * 5);
    expect(lengthToBreadth(0)).toBe(1);
    expect(lengthToBreadth(40)).toBeGreaterThan(1.5);
    expect(lengthToBreadth(400)).toBe(8);
    const b = fireBehaviour({ ...CALME, fuel: "chaparral", windKmh: 40, humidityPct: 15, tempC: 38 });
    expect(b.flameLength).toBeGreaterThan(3);
  });

  it("sans vent, la vitesse est la même dans toutes les directions ; avec, la tête va plus vite que le dos", () => {
    expect(rosTowards(5, 1, Math.PI / 2)).toBeCloseTo(5, 9);
    const lb = lengthToBreadth(40);
    expect(rosTowards(5, lb, 0)).toBeCloseTo(5, 9);
    expect(rosTowards(5, lb, Math.PI)).toBeLessThan(rosTowards(5, lb, 0) / 2);
    expect(rosTowards(5, lb, Math.PI / 2)).toBeLessThan(rosTowards(5, lb, 0));
  });

  it("la pente (Rothermel) : rien en descente, un doublement vers 25–30° de montée sur un maquis", () => {
    expect(slopeFactor(0, 30)).toBe(1);
    expect(slopeFactor(-10, 30)).toBe(1);
    expect(slopeFactor(Math.tan((25 * Math.PI) / 180) * 30, 30)).toBeGreaterThan(1.6);
    expect(slopeFactor(Math.tan((30 * Math.PI) / 180) * 30, 30)).toBeGreaterThan(slopeFactor(Math.tan((25 * Math.PI) / 180) * 30, 30));
  });
});

describe("temps minimal de parcours sur la grille", () => {
  it("à plat et sans vent, le front est rond et avance à la vitesse de base", () => {
    const g = grille(101, 101, () => 100);
    const sim = new FireSpread(g, 30, 50, 50, CALME, 100_000);
    while (!sim.run(1000)) {
      /* jusqu'au bout */
    }
    const ros = headRos(CALME); // m/min
    // À 20 cellules (600 m) plein est, l'arrivée vaut ~600 / ros ; même chose plein nord.
    expect(sim.arrival[50 * 101 + 70]).toBeCloseTo(600 / ros, 0);
    expect(sim.arrival[30 * 101 + 50]).toBeCloseTo(600 / ros, 0);
    expect(sim.cells).toBeGreaterThan(1000);
    // Sans horizon, le front finit par toucher les bords : l'emprise est dite tronquée.
    expect(sim.truncated).toBe(true);
    const borne = new FireSpread(g, 30, 50, 50, CALME, (600 / ros) * 1.2);
    while (!borne.run(1000)) {
      /* jusqu'au bout */
    }
    expect(borne.truncated).toBe(false);
  });

  it("le vent d'ouest pousse le front vers l'est : l'est brûle bien avant l'ouest", () => {
    const g = grille(101, 51, () => 100);
    const sim = new FireSpread(g, 30, 50, 25, { ...CALME, windKmh: 40, windFromDeg: 270 }, 600);
    while (!sim.run(1000)) {
      /* jusqu'au bout */
    }
    const est = sim.arrival[25 * 101 + 80];
    const ouest = sim.arrival[25 * 101 + 20];
    expect(est).toBeLessThan(ouest / 4);
  });

  it("le front monte plus vite qu'il ne descend, ne brûle pas une tuile absente et s'arrête à l'horizon", () => {
    // Une pente de 10° vers l'est.
    const pente = Math.tan((10 * Math.PI) / 180) * 30;
    const g = grille(81, 5, (x) => 100 + x * pente);
    const sim = new FireSpread(g, 30, 40, 2, CALME, 100_000);
    while (!sim.run(1000)) {
      /* jusqu'au bout */
    }
    expect(sim.arrival[2 * 81 + 60]).toBeLessThan(sim.arrival[2 * 81 + 20]);
    // Une seule tuile absente au milieu de la ligne : elle ne brûle pas, le feu la contourne.
    const trou = grille(40, 5, (x, y) => (x === 20 && y === 2 ? NaN : 100));
    const s2 = new FireSpread(trou, 30, 5, 2, CALME, 100_000);
    while (!s2.run(1000)) {
      /* jusqu'au bout */
    }
    expect(s2.arrival[2 * 40 + 20]).toBe(Infinity);
    // Le trou ne coupe pas tout : on passe par les lignes voisines.
    expect(s2.arrival[2 * 40 + 30]).toBeLessThan(Infinity);
    const court = new FireSpread(grille(101, 101, () => 100), 30, 50, 50, CALME, 10);
    while (!court.run(1000)) {
      /* jusqu'au bout */
    }
    expect(court.maxArrival).toBeLessThanOrEqual(10);
    expect(court.box()!.x1 - court.box()!.x0).toBeLessThan(20);
  });
});

describe("images et course d'un feu", () => {
  it("l'état d'une cellule : intacte, flammes qui vieillissent, braises ; la palette suit", () => {
    expect(fireState(10, 5, 20)).toBe(0);
    expect(fireState(10, 10, 20)).toBe(1);
    expect(fireState(10, 20, 20)).toBeGreaterThan(90);
    expect(fireState(10, 30, 20)).toBe(FIRE_BURNT);
    const out = new Uint8ClampedArray(3 * 4);
    firePalette(1, out, 0);
    firePalette(200, out, 4);
    firePalette(FIRE_BURNT, out, 8);
    expect(out[1]).toBeGreaterThan(out[5]); // le front jaune est plus vert que le rouge sombre
    expect(out[11]).toBeLessThan(out[3]); // les braises sont plus discrètes que les flammes
  });

  it("la course dépose ses images à l'heure, note qui est atteint et quand, et se rejoue sans interpoler", async () => {
    const g = grille(121, 41, () => 100);
    const pois = [
      { id: "proche", kind: "shelter" as const, nom: "Proche", ll: pixelLngLat(g, 70, 20) },
      { id: "loin", kind: "city" as const, nom: "Loin", ll: pixelLngLat(g, 118, 20) },
    ];
    const run = new FireRun({ grid: g, cellMeters: 30, seedPx: 60, seedPy: 20, params: { ...CALME, windKmh: 30, windFromDeg: 270 }, horizonS: 3600, frameEveryS: 300, pois });
    let appels = 0;
    await driveFireRun(run, () => appels++);
    expect(run.done).toBe(true);
    expect(run.frames).toHaveLength(13);
    expect(run.frames[12].area).toBeGreaterThan(run.frames[4].area);
    expect(run.frames[12].burningKm2).toBeLessThanOrEqual(run.frames[12].area);
    expect(run.impacts.map((i) => i.id)).toContain("proche");
    const proche = run.impacts.find((i) => i.id === "proche")!;
    expect(proche.reachedAt).toBeGreaterThan(0);
    expect(proche.reachedAt).toBeLessThan(3600);
    expect(appels).toBeGreaterThan(0);
    // La cellule d'allumage est en flammes tôt, puis en braises.
    expect(frameValue(run.frames[1], 60, 20)).toBeGreaterThan(0);
    expect(frameValue(run.frames[12], 60, 20)).toBe(FIRE_BURNT);
    // Sans interpolation, l'image peinte à mi-chemin est celle de `a`.
    const out = new Uint8ClampedArray(g.width * g.height * 4);
    paintSpread(out, g.width, { x0: 60, y0: 20, x1: 61, y1: 21 }, run.frames[1], run.frames[12], 0.5, firePalette, false);
    const attendu = new Uint8ClampedArray(4);
    firePalette(frameValue(run.frames[1], 60, 20), attendu, 0);
    expect(out[(20 * g.width + 60) * 4 + 3]).toBe(attendu[3]);
    // Arrêt demandé avant de courir : rien ne se calcule.
    const stop = new FireRun({ grid: g, cellMeters: 30, seedPx: 60, seedPy: 20, params: CALME, horizonS: 3600, frameEveryS: 300, pois: [] });
    stop.abort();
    await driveFireRun(stop, () => {});
    expect(stop.aborted).toBe(true);
    expect(stop.frames).toHaveLength(1);
  });
});
