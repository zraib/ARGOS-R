import { ConfigService } from "@nestjs/config";
import { FloodService, type FloodFetcher } from "@/modules/domain/flood.service";
import {
  RIVER_POINTS,
  neighborhood,
  openMeteoForecastUrl,
  openMeteoHistoryUrl,
  parseOpenMeteoDaily,
  peakOf,
  severityFrom,
  snapToChannel,
  thresholdsFromHistory,
  trendFrom,
} from "@/modules/domain/flood.openmeteo";
import type { AppConfig } from "@/config/configuration";

// ============================================================================
// Crues sans clé — Open-Meteo Flood (GloFAS) : ce que verrouillent ces tests.
// Une requête pour tous les points ; les seuils sortent des maxima annuels ;
// la gravité et la tendance se lisent sur la prévision ; le service assemble
// le tout dans le même contrat que Flood Hub, sans carte d'inondation.
// ============================================================================

const config = { get: () => "" } as unknown as ConfigService<AppConfig, true>;

/** Dix ans d'historique synthétique : une pointe par an, croissante, un an à sec. */
function historique(): { time: string[]; river_discharge: (number | null)[] } {
  const time: string[] = [];
  const river_discharge: (number | null)[] = [];
  for (let an = 2016; an <= 2025; an++) {
    for (let j = 1; j <= 3; j++) {
      time.push(`${an}-03-0${j}`);
      river_discharge.push(j === 2 ? (an - 2015) * 100 : an === 2020 ? null : 10);
    }
  }
  return { time, river_discharge };
}

describe("crues sans clé — Open-Meteo Flood (GloFAS)", () => {
  it("une requête pour le voisinage et la prévision de tous les points ; l'historique point par point, sur quatre ans", () => {
    const url = openMeteoForecastUrl(RIVER_POINTS);
    expect(url).toContain("flood-api.open-meteo.com/v1/flood?latitude=");
    expect(url.split("latitude=")[1].split("&")[0].split(",")).toHaveLength(RIVER_POINTS.length * 9);
    expect(url).toContain("daily=river_discharge,river_discharge_max&forecast_days=7&past_days=7");
    const hist = openMeteoHistoryUrl(RIVER_POINTS[0].ll, new Date("2026-09-14T00:00:00Z"));
    expect(hist.split("latitude=")[1].split("&")[0].split(",")).toHaveLength(1);
    expect(hist).toContain("start_date=2022-09-12&end_date=2026-09-12");
  });

  it("retient, autour de chaque point, la cellule au débit moyen le plus fort — le lit de l'oued", () => {
    const point = RIVER_POINTS[0];
    const cellules = neighborhood(point.ll);
    expect(cellules).toHaveLength(9);
    expect(cellules[4]).toEqual(point.ll);
    // La cellule 7 (au sud) coule, les autres sont sèches.
    const series = cellules.map((_, j) => ({ time: ["a", "b"], values: j === 7 ? [40, 60] : [0.1, null] }));
    expect(snapToChannel([point], series)[0]).toBe(7);
    // Sans série exploitable : la cellule du point lui-même.
    expect(snapToChannel([point], [])[0]).toBe(4);
  });

  it("découpe une réponse à plusieurs points sans en décaler aucun", () => {
    const res = [
      { daily: { time: ["2026-09-14", "2026-09-15"], river_discharge: [12.5, null] } },
      { daily: { time: ["2026-09-14"], river_discharge: ["x"] } },
    ];
    const series = parseOpenMeteoDaily(res, 3);
    expect(series[0]).toEqual({ time: ["2026-09-14", "2026-09-15"], values: [12.5, null] });
    expect(series[1]).toEqual({ time: ["2026-09-14"], values: [null] });
    expect(series[2]).toEqual({ time: [], values: [] });
    // Un seul point : un objet, pas un tableau.
    expect(parseOpenMeteoDaily(res[0], 1)[0].values).toEqual([12.5, null]);
  });

  it("dérive les seuils des maxima annuels — médiane, 80e centile, maximum", () => {
    const h = historique();
    const th = thresholdsFromHistory({ time: h.time, values: h.river_discharge });
    // Maxima : 100, 200, …, 1000 → médiane (index 4/5) = 500 ou 600, 80e centile 800, maximum 1000.
    expect(th).toMatchObject({ danger: 800, extreme: 1000, unit: "m3/s" });
    expect([500, 600]).toContain(th!.warning);
    // Trop peu d'années, ou un oued à sec (maximum décennal sous 1 m³/s) : pas de seuil.
    expect(thresholdsFromHistory({ time: ["2025-01-01", "2026-01-01"], values: [5, 7] })).toBeNull();
    expect(thresholdsFromHistory({ time: ["2023-01-01", "2024-01-01", "2025-01-01"], values: [0.02, 0.4, 0.9] })).toBeNull();
  });

  it("lit la gravité sur le pic prévu, et la tendance sur la pente", () => {
    const th = { warning: 100, danger: 200, extreme: 400, unit: "m3/s" as const };
    expect(severityFrom(50, th)).toBe("no_flooding");
    expect(severityFrom(150, th)).toBe("above_normal");
    expect(severityFrom(250, th)).toBe("severe");
    expect(severityFrom(400, th)).toBe("extreme");
    expect(severityFrom(400, null)).toBe("unknown");
    expect(severityFrom(null, th)).toBe("unknown");
    expect(peakOf([1, null, 7, 3])).toBe(7);
    expect(peakOf([null])).toBeNull();
    expect(trendFrom([10, 10, 10, 30, 40, 50])).toBe("rise");
    expect(trendFrom([50, 40, 30, 10, 10, 10])).toBe("fall");
    expect(trendFrom([10, 10, 10, 10, 11, 10])).toBe("no_change");
    expect(trendFrom([10])).toBe("unknown");
  });

  it("le service assemble jauges, gravité et prévision dans le contrat commun — sans carte d'inondation", async () => {
    const appels: string[] = [];
    // Neuf jours servis : sept passés (choix de la cellule) et… les deux derniers prévus ici, pour rester court.
    const jours = ["09-06", "09-07", "09-08", "09-09", "09-10", "09-11", "09-12", "09-13", "09-14"].map((j) => `2026-${j}`);
    const fetcher: FloodFetcher = async (url) => {
      appels.push(url);
      if (url.includes("start_date=")) return { daily: historique() };
      // Voisinage + prévision : par point, 9 cellules ; seule la cellule 7 coule —
      // fort pour le premier point, faiblement pour les autres.
      return RIVER_POINTS.flatMap((_, i) =>
        Array.from({ length: 9 }, (_, j) => ({
          daily: { time: jours, river_discharge: j === 7 ? (i === 0 ? [50, 50, 50, 50, 50, 50, 50, 600, 1200] : jours.map(() => 5)) : jours.map(() => 0) },
        })),
      );
    };
    const svc = new FloodService(config, fetcher);
    svc.warmupGapMs = 0;
    const sansSeuils = await svc.gauges();
    expect(sansSeuils).toHaveLength(RIVER_POINTS.length);
    // Une seule requête pour vingt points ; les seuils ne sont pas encore là : « inconnu », mais le pic se lit.
    expect(appels.filter((u) => !u.includes("start_date="))).toHaveLength(1);
    const premier = sansSeuils.find((g) => g.gaugeId === RIVER_POINTS[0].gaugeId)!;
    expect(premier).toMatchObject({ severity: "unknown", peak: 1200, inundationMaps: [], source: "GloFAS v4 (Open-Meteo)" });
    // Seuls les sept derniers jours sont servis comme prévision.
    expect((await svc.forecast(RIVER_POINTS[0].gaugeId)).points.map((p) => p.value)).toEqual([50, 50, 50, 50, 50, 600, 1200]);
    // L'historique se lit point par point en arrière-plan, sur la cellule de lit.
    await svc.warmupThresholds();
    expect(appels.filter((u) => u.includes("start_date=")).length).toBe(RIVER_POINTS.length);
    expect(appels.find((u) => u.includes("start_date="))).toContain(`latitude=${neighborhood(RIVER_POINTS[0].ll)[7][1].toFixed(4)}`);
    const avecSeuils = await svc.gauges();
    expect(avecSeuils[0]).toMatchObject({ gaugeId: RIVER_POINTS[0].gaugeId, severity: "extreme", trend: "rise" });
    expect(avecSeuils[0].thresholds?.unit).toBe("m3/s");
    expect(avecSeuils[1].severity).toBe("no_flooding");
    // Tout est en cache : aucune requête de plus.
    const n = appels.length;
    await svc.gauges();
    expect(appels).toHaveLength(n);
    await expect(svc.forecast("inconnu")).rejects.toThrow(/Aucune prévision/);
    expect(svc.status().attribution).toContain("GloFAS");
  });

  it("un « 429 » est un quota : on garde ce qu'on a et on attend avant de redemander", async () => {
    let appels = 0;
    const fetcher: FloodFetcher = async () => {
      appels++;
      throw new Error("Open-Meteo 429");
    };
    const svc = new FloodService(config, fetcher);
    expect(await svc.gauges()).toEqual([]);
    expect(svc.status()).toMatchObject({ degraded: true, error: "Open-Meteo 429" });
    // Cache périmé de force : le recul empêche de marteler.
    (svc as unknown as { gaugesCache: { at: number } | null }).gaugesCache = { at: 0 };
    await svc.gauges();
    expect(appels).toBe(1);
  });
});
