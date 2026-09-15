import { describe, expect, it } from "vitest";
import { pixelLngLat, type DemGrid } from "@/lib/flood/grid";
import { FireSpread, headRos, lengthToBreadth, moistureFactor, rosTowards, slopeFactor, windFactor, type FireParams } from "@/lib/fire/spread";
import { FIRE_BURNT, FireRun, driveFireRun, fireState } from "@/lib/fire/run";
import { frameValue, paintSpread } from "@/lib/sim/spread";
import { firePalette } from "@/components/map/layers/fire";

function grille(w: number, h: number, f: (x: number, y: number) => number): DemGrid {
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elev[y * w + x] = f(x, y);
  return { z: 12, x0: 2000, y0: 1650, tx: 1, ty: 1, width: w, height: h, elev };
}

const CALME: FireParams = { fuel: "shrub", windKmh: 0, windFromDeg: 0, humidityPct: 30, tempC: 25 };

describe("vitesses du front de flammes", () => {
  it("le vent, l'air sec et la chaleur accélèrent ; l'ellipse s'allonge avec le vent", () => {
    expect(windFactor(0)).toBe(1);
    expect(windFactor(40)).toBeGreaterThan(windFactor(20));
    expect(moistureFactor(20)).toBeGreaterThan(moistureFactor(80));
    expect(headRos({ ...CALME, humidityPct: 20, tempC: 35 })).toBeGreaterThan(headRos({ ...CALME, humidityPct: 80, tempC: 10 }));
    expect(lengthToBreadth(0)).toBe(1);
    expect(lengthToBreadth(40)).toBeGreaterThan(3);
    expect(lengthToBreadth(200)).toBe(8);
  });

  it("sans vent, la vitesse est la même dans toutes les directions ; avec, la tête va plus vite que le dos", () => {
    expect(rosTowards(5, 1, Math.PI / 2)).toBeCloseTo(5, 9);
    const lb = lengthToBreadth(40);
    expect(rosTowards(5, lb, 0)).toBeCloseTo(5, 9);
    expect(rosTowards(5, lb, Math.PI)).toBeLessThan(0.5);
    expect(rosTowards(5, lb, Math.PI / 2)).toBeLessThan(rosTowards(5, lb, 0));
  });

  it("la pente : le double tous les 10° de montée, la moitié en descente, bornée à 30°", () => {
    expect(slopeFactor(0, 30)).toBe(1);
    expect(slopeFactor(Math.tan((10 * Math.PI) / 180) * 30, 30)).toBeCloseTo(2, 6);
    expect(slopeFactor(-Math.tan((10 * Math.PI) / 180) * 30, 30)).toBeCloseTo(0.5, 6);
    expect(slopeFactor(1000, 30)).toBeCloseTo(8, 6);
  });
});

describe("temps minimal de parcours sur la grille", () => {
  it("à plat et sans vent, le front est rond et avance à la vitesse de base", () => {
    const g = grille(101, 101, () => 100);
    const sim = new FireSpread(g, 30, 50, 50, CALME, 240);
    while (!sim.run(1000)) {
      /* jusqu'au bout */
    }
    const ros = headRos(CALME); // m/min
    // À 20 cellules (600 m) plein est, l'arrivée vaut ~600 / ros ; même chose plein nord.
    expect(sim.arrival[50 * 101 + 70]).toBeCloseTo(600 / ros, 0);
    expect(sim.arrival[30 * 101 + 50]).toBeCloseTo(600 / ros, 0);
    expect(sim.cells).toBeGreaterThan(1000);
    expect(sim.truncated).toBe(false);
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
