import { Injectable, Logger } from "@nestjs/common";

// ============================================================================
// ARGOS — proxy météo (Open-Meteo)
// Open-Meteo : API libre, SANS clé (aucun secret à stocker), open-source et
// auto-hébergeable — le meilleur choix pour la souveraineté. Comme pour la
// sismologie, l'appel se fait côté serveur (contrat-first) et le résultat est
// mis en cache (10 min). Voir docs/adr/0002.
// ============================================================================

export interface WeatherCity {
  id: string;
  nom: string;
  lat: number;
  lon: number;
}

export interface WeatherNow {
  temp: number;
  /** Température ressentie. */
  feels: number;
  humidity: number;
  wind: number;
  /** Rafales de vent (km/h). */
  gust: number;
  /** Direction du vent (degrés). */
  windDir: number;
  precip: number;
  /** Pression de surface (hPa). */
  pressure: number;
  /** Couverture nuageuse (%). */
  cloud: number;
  code: number;
}

export interface WeatherDay {
  date: string;
  code: number;
  tmax: number;
  tmin: number;
  precip: number;
  /** Probabilité de précipitations max (%). */
  precipProb: number;
  /** Ressenti max / min. */
  feelMax: number;
  feelMin: number;
  /** Vent max & rafales max (km/h). */
  windMax: number;
  gustMax: number;
  /** Indice UV max. */
  uvMax: number;
  /** Lever / coucher du soleil (ISO 8601 local). */
  sunrise: string;
  sunset: string;
}

export interface WeatherForecast {
  lat: number;
  lon: number;
  current: WeatherNow;
  daily: WeatherDay[];
}

/** Série horaire d'un point de la grille météo (carte animée). */
export interface WeatherGridPointSeries {
  lat: number;
  lon: number;
  temp: number[];
  wind: number[];
  /** Direction d'où vient le vent (degrés), par heure. */
  windDir: number[];
  /** Probabilité de précipitations (%), par heure. */
  precipProb: number[];
}

/** Grille météo animée : heures de prévision partagées + points (row-major). */
export interface WeatherGridSeries {
  times: string[];
  points: WeatherGridPointSeries[];
}

// Villes de référence pour la sélection (préfectures / grandes villes).
const CITIES: WeatherCity[] = [
  { id: "rabat", nom: "Rabat", lat: 34.02, lon: -6.84 },
  { id: "casablanca", nom: "Casablanca", lat: 33.57, lon: -7.59 },
  { id: "marrakech", nom: "Marrakech", lat: 31.63, lon: -8.01 },
  { id: "fes", nom: "Fès", lat: 34.03, lon: -5.0 },
  { id: "tanger", nom: "Tanger", lat: 35.77, lon: -5.8 },
  { id: "agadir", nom: "Agadir", lat: 30.42, lon: -9.6 },
  { id: "oujda", nom: "Oujda", lat: 34.68, lon: -1.91 },
  { id: "meknes", nom: "Meknès", lat: 33.89, lon: -5.55 },
  { id: "kenitra", nom: "Kénitra", lat: 34.26, lon: -6.58 },
  { id: "tetouan", nom: "Tétouan", lat: 35.57, lon: -5.37 },
  { id: "laayoune", nom: "Laâyoune", lat: 27.15, lon: -13.2 },
  { id: "errachidia", nom: "Errachidia", lat: 31.93, lon: -4.42 },
  { id: "alhoceima", nom: "Al Hoceïma", lat: 35.25, lon: -3.93 },
  { id: "ouarzazate", nom: "Ouarzazate", lat: 30.92, lon: -6.9 },
];

const OM_URL = "https://api.open-meteo.com/v1/forecast";
const TTL_MS = 600_000; // 10 min

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, { at: number; data: WeatherForecast }>();
  private gridAt = 0;
  private gridData: WeatherGridSeries | null = null;
  private gridWorldAt = 0;
  private gridWorldData: WeatherGridSeries | null = null;

  cities(): WeatherCity[] {
    return CITIES;
  }

  /**
   * Récupère les séries horaires (7 j) pour une liste de points, en LOTS de
   * 150 localisations (limite de longueur d'URL Open-Meteo), puis fusionne.
   */
  private async fetchHourlySeries(pts: [number, number][]): Promise<WeatherGridSeries> {
    interface Hourly {
      time?: string[];
      temperature_2m?: (number | null)[];
      wind_speed_10m?: (number | null)[];
      wind_direction_10m?: (number | null)[];
      precipitation_probability?: (number | null)[];
    }
    const CHUNK = 150;
    let times: string[] = [];
    const points: WeatherGridPointSeries[] = [];
    for (let off = 0; off < pts.length; off += CHUNK) {
      const part = pts.slice(off, off + CHUNK);
      const params = new URLSearchParams({
        latitude: part.map((p) => p[0]).join(","),
        longitude: part.map((p) => p[1]).join(","),
        hourly: "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability",
        forecast_days: "7",
      });
      const res = await fetch(`${OM_URL}?${params.toString()}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const raw = (await res.json()) as unknown;
      const arr = Array.isArray(raw) ? raw : [raw];
      const first = arr[0] as { hourly?: Hourly } | undefined;
      // Les heures (UTC) sont identiques pour tous les points et tous les lots.
      if (times.length === 0) times = first?.hourly?.time ?? [];
      const pick = (a: (number | null)[] | undefined, f: (v: number | null | undefined) => number) =>
        times.map((_, i) => f(a ? a[i] : 0));
      for (const o of arr) {
        const p = o as { latitude?: number; longitude?: number; hourly?: Hourly };
        const h = p.hourly ?? {};
        points.push({
          lat: p.latitude ?? 0,
          lon: p.longitude ?? 0,
          temp: pick(h.temperature_2m, (v) => Math.round((v ?? 0) * 10) / 10),
          wind: pick(h.wind_speed_10m, (v) => Math.round(v ?? 0)),
          windDir: pick(h.wind_direction_10m, (v) => Math.round(v ?? 0)),
          precipProb: pick(h.precipitation_probability, (v) => Math.round(v ?? 0)),
        });
      }
    }
    return { times, points };
  }

  /**
   * Grille MONDIALE grossière (pas de 10°, 36×14 = 504 points, 70°N → 60°S) :
   * les couches météo de la carte couvrent le monde entier, la grille nationale
   * dense gardant le détail sur le territoire. Cache 60 min (échelle planétaire,
   * rafraîchissement lent suffisant + respect des quotas Open-Meteo).
   */
  async gridWorld(): Promise<WeatherGridSeries> {
    if (this.gridWorldData && Date.now() - this.gridWorldAt < 3_600_000) return this.gridWorldData;
    const pts: [number, number][] = [];
    for (let r = 0; r < 14; r++) {
      for (let c = 0; c < 36; c++) pts.push([70 - r * 10, -180 + c * 10]);
    }
    try {
      const data = await this.fetchHourlySeries(pts);
      this.gridWorldAt = Date.now();
      this.gridWorldData = data;
      return data;
    } catch (e) {
      this.logger.warn(`Open-Meteo (grille monde) injoignable : ${(e as Error).message}`);
      return this.gridWorldData ?? { times: [], points: [] };
    }
  }

  /**
   * Grille de PRÉVISIONS HORAIRES (24 h) couvrant le territoire — alimente la
   * carte météo ANIMÉE. Une seule requête Open-Meteo multi-localisations ;
   * cache 10 min ; dégradation sur le dernier cache connu, sinon grille vide.
   */
  async grid(): Promise<WeatherGridSeries> {
    if (this.gridData && Date.now() - this.gridAt < TTL_MS) return this.gridData;

    // Grille assez dense pour interpoler un champ continu côté client.
    const COLS = 12, ROWS = 14;
    const B = { minLat: 20.5, maxLat: 36.5, minLon: -17.5, maxLon: -0.5 };
    const pts: [number, number][] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lat = Math.round((B.minLat + (r / (ROWS - 1)) * (B.maxLat - B.minLat)) * 1000) / 1000;
        const lon = Math.round((B.minLon + (c / (COLS - 1)) * (B.maxLon - B.minLon)) * 1000) / 1000;
        pts.push([lat, lon]);
      }
    }
    try {
      // Pas HORAIRE sur 7 jours (168 pas) — l'animation cliente interpole entre
      // les pas ; la réponse est mise en cache 10 min côté API.
      const data = await this.fetchHourlySeries(pts);
      this.gridAt = Date.now();
      this.gridData = data;
      return data;
    } catch (e) {
      this.logger.warn(`Open-Meteo (grille) injoignable : ${(e as Error).message}`);
      return this.gridData ?? { times: [], points: [] }; // dernier cache, sinon vide
    }
  }

  async forecast(lat: number, lon: number): Promise<WeatherForecast | null> {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,surface_pressure,cloud_cover,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,sunrise,sunset",
      timezone: "auto",
      forecast_days: "7",
    });
    try {
      const res = await fetch(`${OM_URL}?${params.toString()}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const j = (await res.json()) as {
        current?: {
          temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number;
          wind_speed_10m: number; wind_gusts_10m: number; wind_direction_10m: number;
          precipitation: number; surface_pressure: number; cloud_cover: number; weather_code: number;
        };
        daily?: {
          time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[];
          apparent_temperature_max: number[]; apparent_temperature_min: number[]; precipitation_sum: number[];
          precipitation_probability_max: number[]; wind_speed_10m_max: number[]; wind_gusts_10m_max: number[];
          uv_index_max: number[]; sunrise: string[]; sunset: string[];
        };
      };
      const c = j.current;
      const d = j.daily;
      const at = <T,>(arr: T[] | undefined, i: number): T | undefined => (arr ? arr[i] : undefined);
      const data: WeatherForecast = {
        lat,
        lon,
        current: {
          temp: Math.round(c?.temperature_2m ?? 0),
          feels: Math.round(c?.apparent_temperature ?? 0),
          humidity: Math.round(c?.relative_humidity_2m ?? 0),
          wind: Math.round(c?.wind_speed_10m ?? 0),
          gust: Math.round(c?.wind_gusts_10m ?? 0),
          windDir: Math.round(c?.wind_direction_10m ?? 0),
          precip: Math.round((c?.precipitation ?? 0) * 10) / 10,
          pressure: Math.round(c?.surface_pressure ?? 0),
          cloud: Math.round(c?.cloud_cover ?? 0),
          code: c?.weather_code ?? 0,
        },
        daily: (d?.time ?? []).map((date, i) => ({
          date,
          code: at(d?.weather_code, i) ?? 0,
          tmax: Math.round(at(d?.temperature_2m_max, i) ?? 0),
          tmin: Math.round(at(d?.temperature_2m_min, i) ?? 0),
          feelMax: Math.round(at(d?.apparent_temperature_max, i) ?? 0),
          feelMin: Math.round(at(d?.apparent_temperature_min, i) ?? 0),
          precip: Math.round((at(d?.precipitation_sum, i) ?? 0) * 10) / 10,
          precipProb: Math.round(at(d?.precipitation_probability_max, i) ?? 0),
          windMax: Math.round(at(d?.wind_speed_10m_max, i) ?? 0),
          gustMax: Math.round(at(d?.wind_gusts_10m_max, i) ?? 0),
          uvMax: Math.round((at(d?.uv_index_max, i) ?? 0) * 10) / 10,
          sunrise: at(d?.sunrise, i) ?? "",
          sunset: at(d?.sunset, i) ?? "",
        })),
      };
      this.cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      this.logger.warn(`Open-Meteo injoignable : ${(e as Error).message}`);
      return hit?.data ?? null;
    }
  }
}
