import { Injectable, Logger } from "@nestjs/common";

// ============================================================================
// ARGOS — proxy sismologie (CSEM / EMSC)
// Le frontend ne parle JAMAIS directement à un service externe (souveraineté,
// contrat-first) : l'API interroge le portail EMSC côté serveur, normalise la
// réponse GeoJSON en un format stable, et met en cache (30 s) pour ne pas
// marteler la source. En production, remplacer la source par un flux interne
// (station nationale) sans toucher au contrat. Voir docs/adr/0002.
// ============================================================================

/** Séisme normalisé (indépendant du format EMSC). */
export interface SeismicEvent {
  id: string;
  /** ISO 8601 (heure d'origine du séisme). */
  time: string;
  /** Magnitude. */
  mag: number;
  /** Type de magnitude (mb, ml, mw…). */
  magType: string;
  /** Profondeur en km. */
  depth: number;
  /** Région / lieu (Flynn region EMSC). */
  region: string;
  lat: number;
  lon: number;
  /** [lng, lat] — cohérent avec le reste du domaine. */
  ll: [number, number];
  /** Type d'événement (earthquake, quarry blast…). */
  evtype: string;
  /** Agence / réseau d'origine (auth EMSC). */
  agency: string;
  /** Dernière mise à jour de la solution (ISO 8601). */
  lastUpdate: string;
  /** Identifiant source (source_id EMSC), pour le lien de détail. */
  sourceId: string;
}

const EMSC_URL = "https://www.seismicportal.eu/fdsnws/event/1/query";
// Boîte englobante approximative du territoire national, provinces du Sud
// incluses (min/max lat, min/max lon).
const MOROCCO_BBOX = { minlatitude: 20.5, maxlatitude: 36.5, minlongitude: -17.5, maxlongitude: -1 };
const TTL_MS = 30_000;

interface EmscFeature {
  id?: string;
  properties?: {
    time?: string; mag?: number; magtype?: string; depth?: number; flynn_region?: string;
    evtype?: string; auth?: string; lastupdate?: string; source_id?: string;
  };
  geometry?: { coordinates?: [number, number, number] };
}

@Injectable()
export class SeismicService {
  private readonly logger = new Logger(SeismicService.name);
  private readonly cache = new Map<string, { at: number; data: SeismicEvent[] }>();

  /**
   * Séismes récents (magnitude ≥ minmag). `region="morocco"` restreint à la
   * boîte englobante nationale, sinon couverture mondiale. Retombe sur le cache
   * (même périmé) puis sur un tableau vide si la source est injoignable.
   */
  async recent(minmag = 2.5, region: "morocco" | "world" = "world", limit = 100): Promise<SeismicEvent[]> {
    const key = `${region}|${minmag}|${limit}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

    const params = new URLSearchParams({ format: "json", orderby: "time", limit: String(limit), minmag: String(minmag) });
    if (region === "morocco") for (const [k, v] of Object.entries(MOROCCO_BBOX)) params.set(k, String(v));

    try {
      const res = await fetch(`${EMSC_URL}?${params.toString()}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`EMSC ${res.status}`);
      const json = (await res.json()) as { features?: EmscFeature[] };
      const data = (json.features ?? [])
        .map((f) => this.normalize(f))
        .filter((e): e is SeismicEvent => e !== null);
      this.cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      this.logger.warn(`Source EMSC injoignable : ${(e as Error).message}`);
      return hit?.data ?? []; // dégradation : dernier cache connu, sinon vide
    }
  }

  private normalize(f: EmscFeature): SeismicEvent | null {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (!c || p.mag == null || !p.time) return null;
    const [lon, lat, depth] = c;
    return {
      id: f.id ?? `${p.time}-${lat}-${lon}`,
      time: p.time,
      mag: Math.round(p.mag * 10) / 10,
      magType: (p.magtype ?? "").toUpperCase(),
      depth: Math.round((depth ?? 0) * 10) / 10,
      region: p.flynn_region ?? "—",
      lat,
      lon,
      ll: [lon, lat],
      evtype: p.evtype ?? "earthquake",
      agency: (p.auth ?? "EMSC").toUpperCase(),
      lastUpdate: p.lastupdate ?? p.time,
      sourceId: p.source_id ?? "",
    };
  }
}
