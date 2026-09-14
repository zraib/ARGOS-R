import { ConfigService } from "@nestjs/config";
import { FloodService, kmlToGeoJson, normalizeGauge, severityOf, trendOf, unitOf, type FloodFetcher } from "@/modules/domain/flood.service";
import type { AppConfig } from "@/config/configuration";

// ============================================================================
// Courtier des crues — la normalisation ne dépend d'aucun réseau
//
// Ce que ces tests verrouillent : sans clé le flux est indisponible et le dit ;
// les enums de Flood Hub deviennent le contrat stable de l'écran ; les trois
// appels (statuts, fiches, modèles) s'assemblent en une jauge ; une panne
// rend le dernier cache connu, et le dit ; le KML devient du GeoJSON.
// ============================================================================

const config = (key: string) => ({ get: (k: string) => (k === "floodApiKey" ? key : "") }) as unknown as ConfigService<AppConfig, true>;

const statut = (gaugeId: string, severity: string, extra: Record<string, unknown> = {}) => ({
  gaugeId, severity, forecastTrend: "RISE", issuedTime: "2026-09-14T06:00:00Z",
  forecastTimeRange: { start: "2026-09-14T06:00:00Z", end: "2026-09-21T06:00:00Z" },
  gaugeLocation: { latitude: 31.6, longitude: -8.0 }, source: "GRDC", qualityVerified: true, ...extra,
});

describe("courtier des crues (Flood Hub)", () => {
  it("normalise les enums de Flood Hub vers le contrat de l'écran", () => {
    expect(severityOf("EXTREME")).toBe("extreme");
    expect(severityOf("ABOVE_NORMAL")).toBe("above_normal");
    expect(severityOf("SEVERITY_UNSPECIFIED")).toBe("unknown");
    expect(trendOf("FALL")).toBe("fall");
    expect(trendOf(undefined)).toBe("unknown");
    expect(unitOf("CUBIC_METERS_PER_SECOND")).toBe("m3/s");
  });

  it("assemble statut, fiche et modèle en une jauge ; sans position, rien", () => {
    const g = normalizeGauge(
      statut("g1", "SEVERE", { inundationMapSet: { inundationMapType: "PROBABILITY", inundationMaps: [{ level: "HIGH", serializedPolygonId: "p1" }, { level: "LOW" }] } }),
      { gaugeId: "g1", siteName: "Oued Tensift — Marrakech", river: "Tensift", hasModel: true },
      { gaugeId: "g1", thresholds: { warningLevel: 2, dangerLevel: 3.5 }, gaugeValueUnit: "METERS" },
    );
    expect(g).toMatchObject({
      gaugeId: "g1", siteName: "Oued Tensift — Marrakech", river: "Tensift", ll: [-8.0, 31.6], severity: "severe", trend: "rise",
      thresholds: { warning: 2, danger: 3.5, unit: "m" }, inundationMaps: [{ level: "high", polygonId: "p1", type: "probability" }],
    });
    expect(normalizeGauge({ gaugeId: "g2", severity: "EXTREME" }, undefined, undefined)).toBeNull();
  });

  it("sans clé : aucune jauge, et le statut le dit", async () => {
    const svc = new FloodService(config(""), async () => { throw new Error("ne doit pas appeler"); });
    expect(await svc.gauges()).toEqual([]);
    expect(svc.status()).toMatchObject({ configured: false, degraded: false });
  });

  it("relit statuts, fiches et modèles, trie par gravité, met en cache", async () => {
    const appels: string[] = [];
    const fetcher: FloodFetcher = async (path) => {
      appels.push(path.split("?")[0]);
      if (path.startsWith("floodStatus:")) return { floodStatuses: [statut("calme", "NO_FLOODING"), statut("crue", "EXTREME")] };
      if (path.startsWith("gauges:batchGet")) return { gauges: [{ gaugeId: "calme", siteName: "Calme" }, { gaugeId: "crue", siteName: "Crue" }] };
      if (path.startsWith("gaugeModels:batchGet")) return { gaugeModels: [{ gaugeId: "crue", thresholds: { warningLevel: 1, dangerLevel: 2 }, gaugeValueUnit: "METERS" }] };
      throw new Error(`inattendu : ${path}`);
    };
    const svc = new FloodService(config("k"), fetcher);
    const jauges = await svc.gauges();
    expect(jauges.map((g) => g.gaugeId)).toEqual(["crue", "calme"]);
    expect(jauges[0].thresholds?.danger).toBe(2);
    expect(jauges[1].thresholds).toBeNull();
    await svc.gauges();
    expect(appels.filter((a) => a === "floodStatus:searchLatestFloodStatusByArea")).toHaveLength(1);
    expect(svc.status()).toMatchObject({ configured: true, degraded: false, error: null });
  });

  it("une panne rend le dernier cache connu — et le dit", async () => {
    let panne = false;
    const fetcher: FloodFetcher = async (path) => {
      if (panne) throw new Error("Flood Hub 503");
      if (path.startsWith("floodStatus:")) return { floodStatuses: [statut("g", "SEVERE")] };
      return { gauges: [], gaugeModels: [] };
    };
    const svc = new FloodService(config("k"), fetcher);
    expect((await svc.gauges()).map((g) => g.gaugeId)).toEqual(["g"]);
    panne = true;
    // Cache périmé de force : on relit, ça échoue, on sert l'ancien.
    (svc as unknown as { gaugesCache: { at: number } | null }).gaugesCache!.at = 0;
    expect((await svc.gauges()).map((g) => g.gaugeId)).toEqual(["g"]);
    expect(svc.status()).toMatchObject({ degraded: true, error: "Flood Hub 503" });
  });

  it("sert la dernière prévision émise avec ses seuils", async () => {
    const fetcher: FloodFetcher = async (path) => {
      if (path.startsWith("gauges:queryGaugeForecasts")) {
        return { forecasts: { g: { forecasts: [
          { gaugeId: "g", issuedTime: "2026-09-13T00:00:00Z", forecastRanges: [{ value: 1, forecastStartTime: "a", forecastEndTime: "b" }] },
          { gaugeId: "g", issuedTime: "2026-09-14T00:00:00Z", forecastRanges: [{ value: 2.5, forecastStartTime: "c", forecastEndTime: "d" }, { forecastStartTime: "x" }] },
        ] } } };
      }
      if (path.startsWith("gaugeModels/g")) return { gaugeId: "g", thresholds: { warningLevel: 2, dangerLevel: 3 }, gaugeValueUnit: "METERS" };
      throw new Error(path);
    };
    const f = await new FloodService(config("k"), fetcher).forecast("g");
    expect(f).toMatchObject({ gaugeId: "g", issuedTime: "2026-09-14T00:00:00Z", unit: "m", thresholds: { warning: 2, danger: 3 } });
    expect(f.points).toEqual([{ start: "c", end: "d", value: 2.5 }]);
  });

  it("convertit le KML de Flood Hub en MultiPolygon GeoJSON, anneaux fermés, trous compris", () => {
    const kml = `<kml><Placemark><MultiGeometry>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-8.0,31.6,0 -7.9,31.6,0 -7.9,31.7,0</coordinates></LinearRing></outerBoundaryIs>
        <innerBoundaryIs><LinearRing><coordinates>-7.95,31.62 -7.93,31.62 -7.93,31.64 -7.95,31.62</coordinates></LinearRing></innerBoundaryIs></Polygon>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-7.5,31.5 -7.4,31.5 -7.4,31.6 -7.5,31.5</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </MultiGeometry></Placemark></kml>`;
    const geo = kmlToGeoJson(kml, "p1");
    expect(geo.properties.polygonId).toBe("p1");
    expect(geo.geometry.coordinates).toHaveLength(2);
    const [ext, trou] = geo.geometry.coordinates[0];
    expect(ext[0]).toEqual([-8.0, 31.6]);
    expect(ext[ext.length - 1]).toEqual(ext[0]);
    expect(trou).toHaveLength(4);
  });
});
