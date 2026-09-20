import { describe, expect, it } from "vitest";
import { cellSizeMeters, gridCorners, gridPixel, lngLatToTileFrac, pixelLngLat, tileFracToLngLat, type DemGrid } from "@/lib/flood/grid";
import { FloodSimulation, froehlichPeak, hydrographVolume, plateauHydrograph, scenarioOf, triangularHydrograph } from "@/lib/flood/hydro";
import { FRAME_QUANTUM, frameBox, frameDepth, paintFrames, snapshotFrame, unionBox } from "@/lib/flood/frames";
import { FloodRun, driveFloodRun } from "@/lib/flood/run";

/** Une grille de synthèse `w × h` dont l'altitude est donnée par `f(x, y)`. */
function grille(w: number, h: number, f: (x: number, y: number) => number): DemGrid {
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elev[y * w + x] = f(x, y);
  return { z: 12, x0: 2000, y0: 1650, tx: 1, ty: 1, width: w, height: h, elev };
}

describe("géométrie de la grille d'altitude", () => {
  it("la géométrie Web Mercator fait l'aller-retour", () => {
    const [lng, lat] = [-7.6, 33.58];
    const { x, y } = lngLatToTileFrac(lng, lat, 12);
    const back = tileFracToLngLat(x, y, 12);
    expect(back[0]).toBeCloseTo(lng, 6);
    expect(back[1]).toBeCloseTo(lat, 6);
    // ~32 m par cellule à z12 sous cette latitude ; ~19 m à z13 à l'équateur.
    expect(cellSizeMeters(12, 33.58)).toBeCloseTo(31.8, 0);
    expect(cellSizeMeters(13, 0)).toBeCloseTo(19.1, 0);
  });

  it("une cellule se retrouve par son point, et son centre retombe dedans", () => {
    const g = grille(4, 4, () => 100);
    const centre = pixelLngLat(g, 2, 1);
    expect(gridPixel(g, centre[0], centre[1])).toEqual({ px: 2, py: 1 });
    const [no, ne, se, so] = gridCorners(g);
    expect(no[0]).toBeLessThan(ne[0]);
    expect(no[1]).toBeGreaterThan(so[1]);
    expect(se[0]).toBeCloseTo(ne[0], 9);
    expect(gridPixel(g, 50, 50)).toBeNull();
  });
});

describe("hydrogrammes et scénarios", () => {
  it("le triangle vaut la moitié du rectangle, le plateau tout ; Froehlich donne une pointe plausible", () => {
    expect(hydrographVolume(triangularHydrograph(1000, 3600), 3600, 1)).toBeCloseTo(1.8e6, -3);
    expect(hydrographVolume(plateauHydrograph(250, 7200), 7200)).toBeCloseTo(1.8e6, 3);
    // 100 hm³ derrière 40 m d'eau : ~13 500 m³/s à la brèche.
    expect(froehlichPeak(1e8, 40)).toBeGreaterThan(13_000);
    expect(froehlichPeak(1e8, 40)).toBeLessThan(14_000);
  });

  it("chaque source donne son hydrogramme et ses chiffres dérivés", () => {
    // Rivière : l'hydrogramme du SCS — pointe à 37,5 % de la durée, volume de la loi gamma.
    const riviere = scenarioOf({ source: "river", peakQ: 2000, durationH: 6, volumeHm3: 0, damHeightM: 0, horizonH: 6, extentKm: 25 });
    expect(riviere.hydrograph(0.375 * 6 * 3600)).toBeCloseTo(2000, 6);
    expect(Math.abs(hydrographVolume(riviere.hydrograph, 48 * 3600, 30) - riviere.volumeM3) / riviere.volumeM3).toBeLessThan(0.01);
    const lac = scenarioOf({ source: "lake", peakQ: 0, durationH: 10, volumeHm3: 36, damHeightM: 0, horizonH: 12, extentKm: 25 });
    expect(lac.peakQ).toBeCloseTo(1000, 6);
    expect(lac.hydrograph(3600)).toBeCloseTo(1000, 6);
    // Barrage : Froehlich 2008 — la retenue se vide entièrement, la pointe est de l'ordre de 10⁴ m³/s pour 100 hm³ sous 40 m.
    const barrage = scenarioOf({ source: "dam", peakQ: 0, durationH: 0, volumeHm3: 100, damHeightM: 40, horizonH: 6, extentKm: 50 });
    expect(barrage.peakQ).toBeGreaterThan(5_000);
    expect(barrage.peakQ).toBeLessThan(30_000);
    expect(Math.abs(hydrographVolume(barrage.hydrograph, barrage.durationS, 10) - 1e8) / 1e8).toBeLessThan(0.03);
  });
});

describe("onde inertielle sur le relief", () => {
  it("conserve le volume : ce qui entre est au sol tant que rien ne sort par les bords", () => {
    const g = grille(61, 61, () => 0);
    const sim = new FloodSimulation(g, 30, 30, 30, plateauHydrograph(200, 600));
    sim.advance(300);
    expect(sim.volumeOut).toBe(0);
    expect(sim.volumeIn).toBeGreaterThan(50_000);
    expect(Math.abs(sim.volumeIn - sim.volumeOnGround()) / sim.volumeIn).toBeLessThan(1e-3);
    expect(sim.activeCells).toBeLessThan(61 * 61);
  });

  it("descend la pente : le front avance vers l'aval, l'amont reste sec, la lame reste modeste", () => {
    // Un couloir à 1 % de pente vers l'est (cellules de 30 m) entre deux
    // versants (les bords de la grille sont ouverts : sans versants, l'eau
    // s'y perdrait), apport en x = 20.
    const g = grille(200, 7, (x, y) => (y === 0 || y === 6 ? 50 : -0.3 * x));
    const sim = new FloodSimulation(g, 30, 20, 3, plateauHydrograph(100, 3600));
    sim.advance(1800);
    expect(sim.h[3 * 200 + 60]).toBeGreaterThan(0.05);
    expect(sim.h[3 * 200 + 10]).toBeLessThan(0.01);
    expect(sim.hmax).toBeLessThan(5);
    expect(sim.volumeIn).toBeCloseTo(sim.volumeOnGround() + sim.volumeOut, -2);
  });

  it("ne franchit ni une crête plus haute que l'eau ni une tuile absente", () => {
    const crete = grille(100, 7, (x, y) => (y === 0 || y === 6 || x === 50 ? 50 : -0.3 * x));
    const s1 = new FloodSimulation(crete, 30, 20, 3, plateauHydrograph(100, 3600));
    s1.advance(1800);
    expect(s1.h[3 * 100 + 49]).toBeGreaterThan(0.05);
    expect(s1.h[3 * 100 + 70]).toBe(0);
    const trou = grille(20, 7, (x, y) => (y === 0 || y === 6 ? 50 : x === 10 ? NaN : 0));
    const s2 = new FloodSimulation(trou, 30, 5, 3, plateauHydrograph(50, 600));
    s2.advance(600);
    expect(s2.h[3 * 20 + 12]).toBe(0);
  });

  it("remplit une cuvette et s'y calme : la surface finit plate", () => {
    const g = grille(61, 61, (x, y) => 0.02 * ((x - 30) ** 2 + (y - 30) ** 2));
    const sim = new FloodSimulation(g, 30, 30, 30, plateauHydrograph(100, 600));
    sim.advance(4000);
    let haut = -Infinity;
    let bas = Infinity;
    for (let i = 0; i < sim.h.length; i++) {
      if (sim.h[i] <= 0.05) continue;
      const eta = g.elev[i] + sim.h[i];
      if (eta > haut) haut = eta;
      if (eta < bas) bas = eta;
    }
    expect(haut - bas).toBeLessThan(0.3);
    expect(sim.volumeOnGround()).toBeCloseTo(60_000, -3);
  });
});

describe("images et course d'une simulation", () => {
  it("un instantané garde la boîte mouillée au décimètre, et la peinture interpole puis efface", () => {
    const g = grille(12, 12, () => 0);
    const sim = new FloodSimulation(g, 30, 5, 5, plateauHydrograph(0, 0));
    const [a, b] = sim.seeds;
    sim.h[a] = 1;
    sim.h[b] = 3;
    const f1 = snapshotFrame(sim, 0);
    expect(f1.area).toBeCloseTo((2 * 900) / 1e6, 9);
    expect(f1.maxDepth).toBe(3);
    expect(frameDepth(f1, a % 12, Math.floor(a / 12))).toBeCloseTo(1, 6);
    expect(frameDepth(f1, 0, 0)).toBe(0);
    sim.h[a] = 3;
    const f2 = snapshotFrame(sim, 100);
    expect(f2.data.every((d) => d === 0 || d === Math.round(3 / FRAME_QUANTUM))).toBe(true);
    const zone = unionBox(frameBox(f1), frameBox(f2))!;
    const out = new Uint8ClampedArray(12 * 12 * 4);
    paintFrames(out, 12, zone, f1, f2, 0.5);
    // À mi-chemin, la cellule `a` est sous 2 m : alpha = 120 + 110 × 2/5.
    expect(out[a * 4 + 3]).toBe(164);
    paintFrames(out, 12, zone, null, null, 0);
    expect(out[a * 4 + 3]).toBe(0);
  });

  it("la course dépose ses images à l'heure, note qui est atteint et quand, et s'arrête sur demande", async () => {
    const g = grille(120, 7, (x, y) => (y === 0 || y === 6 ? 50 : -0.3 * x));
    const pois = [
      { id: "aval", kind: "hospital" as const, nom: "Aval", ll: pixelLngLat(g, 60, 3) },
      { id: "amont", kind: "city" as const, nom: "Amont", ll: pixelLngLat(g, 5, 3) },
    ];
    const run = new FloodRun({ grid: g, cellMeters: 30, seedPx: 20, seedPy: 3, hydrograph: plateauHydrograph(100, 1200), horizonS: 1200, frameEveryS: 100, pois });
    let appels = 0;
    await driveFloodRun(run, () => appels++);
    expect(run.done).toBe(true);
    expect(run.frames).toHaveLength(13);
    expect(run.frames.map((f) => f.t)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]);
    expect(run.frames[12].area).toBeGreaterThan(run.frames[3].area);
    expect(run.impacts.map((i) => i.id)).toEqual(["aval"]);
    expect(run.impacts[0].reachedAt).toBeGreaterThan(0);
    expect(run.impacts[0].reachedAt).toBeLessThanOrEqual(1200);
    expect(appels).toBeGreaterThan(0);
    // Arrêt demandé avant de courir : rien ne se calcule, et cela se dit.
    const stop = new FloodRun({ grid: g, cellMeters: 30, seedPx: 20, seedPy: 3, hydrograph: plateauHydrograph(100, 1200), horizonS: 1200, frameEveryS: 100, pois: [] });
    stop.abort();
    await driveFloodRun(stop, () => {});
    expect(stop.aborted).toBe(true);
    expect(stop.done).toBe(false);
    expect(stop.frames).toHaveLength(1);
  });
});

describe("hydrologie de référence (SCS, Froehlich 2008) et référentiel des barrages", async () => {
  const { breachHydrograph, froehlich2008, gammaVolumeFactor, hydrographVolume, manningOf, scenarioOf, scsHydrograph } = await import("@/lib/flood/hydro");
  const { DAMS_MA, RIVERS_MA, damById } = await import("@/lib/flood/dams");
  it("Al Wahda (3 522 hm³, 88 m) : une pointe de rupture de l'ordre de 10⁵ m³/s, une brèche de plusieurs heures et de plusieurs centaines de mètres", () => {
    const f = froehlich2008(3522e6, 88);
    expect(f.peakQ).toBeGreaterThan(80_000);
    expect(f.peakQ).toBeLessThan(200_000);
    expect(f.failureTimeS / 3600).toBeGreaterThan(2);
    expect(f.failureTimeS / 3600).toBeLessThan(6);
    expect(f.breachWidthM).toBeGreaterThan(300);
    // Le renard forme une brèche plus étroite que la surverse.
    expect(froehlich2008(3522e6, 88, false).breachWidthM).toBeLessThan(f.breachWidthM);
    // Un petit barrage : une pointe bien moindre, une brèche rapide.
    const petit = froehlich2008(35e6, 46);
    expect(petit.peakQ).toBeLessThan(f.peakQ / 5);
    expect(petit.failureTimeS).toBeLessThan(f.failureTimeS);
  });
  it("l'hydrogramme de rupture vide exactement la retenue, monte en le temps de formation de la brèche et culmine à la pointe", () => {
    const V = 3522e6;
    const f = froehlich2008(V, 88);
    const b = breachHydrograph(V, f.peakQ, f.failureTimeS);
    const vol = hydrographVolume(b.hydrograph, b.durationS, 30);
    expect(Math.abs(vol - V) / V).toBeLessThan(0.03);
    expect(b.hydrograph(f.failureTimeS)).toBeCloseTo(f.peakQ, 3);
    expect(b.hydrograph(f.failureTimeS / 2)).toBeLessThan(f.peakQ);
    expect(b.hydrograph(b.durationS)).toBeLessThan(0.02 * f.peakQ);
    expect(gammaVolumeFactor(3.7)).toBeCloseTo(1.38, 1);
  });
  it("la crue de rivière suit l'hydrogramme du SCS : pointe à 37,5 % de la durée, décrue plus longue que la montée", () => {
    const h = scsHydrograph(1000, 24 * 3600);
    const tp = 0.375 * 24 * 3600;
    expect(h(tp)).toBeCloseTo(1000, 6);
    expect(h(tp / 2)).toBeLessThan(1000);
    expect(h(tp * 2)).toBeLessThan(1000);
    // La décrue est plus lente que la montée : à mi-chemin après la pointe, il reste plus d'eau qu'à mi-chemin avant.
    expect(h(tp * 1.5)).toBeGreaterThan(h(tp / 2));
    const s = scenarioOf({ source: "river", peakQ: 1000, durationH: 24, volumeHm3: 0, damHeightM: 0, horizonH: 6, extentKm: 25 });
    expect(Math.abs(hydrographVolume(s.hydrograph, 5 * 24 * 3600, 60) - s.volumeM3) / s.volumeM3).toBeLessThan(0.02);
  });
  it("le scénario de barrage porte la brèche ; la rugosité suit le préréglage ; le référentiel couvre les plus grands barrages", () => {
    const s = scenarioOf({ source: "dam", peakQ: 0, durationH: 0, volumeHm3: 2760, damHeightM: 80, horizonH: 12, extentKm: 100, breach: "piping" });
    expect(s.failureTimeS).toBeGreaterThan(0);
    expect(s.breachWidthM).toBeGreaterThan(0);
    expect(Math.abs(hydrographVolume(s.hydrograph, s.durationS, 30) - 2760e6) / 2760e6).toBeLessThan(0.03);
    expect(manningOf({})).toBe(0.05);
    expect(manningOf({ roughness: "urban" })).toBe(0.12);
    expect(DAMS_MA.length).toBeGreaterThan(25);
    expect(damById("al-wahda")?.capacityHm3).toBe(3522);
    expect(Math.max(...DAMS_MA.map((d) => d.capacityHm3))).toBe(3522);
    expect(new Set(DAMS_MA.map((d) => d.id)).size).toBe(DAMS_MA.length);
    for (const d of DAMS_MA) expect(d.ll[0] > -17.5 && d.ll[0] < -1 && d.ll[1] > 21 && d.ll[1] < 36).toBe(true);
    expect(RIVERS_MA.find((r) => r.id === "ourika")?.peakQ).toBe(1030);
  });
});
