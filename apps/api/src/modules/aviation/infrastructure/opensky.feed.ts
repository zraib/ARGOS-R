import { Injectable, Logger } from "@nestjs/common";
import type { AircraftPosition, BoundingBox } from "@/modules/aviation/aircraft.types";
import type { FlightFeed } from "@/modules/aviation/ports/flight-feed.port";

// ============================================================================
// ARGOS — adaptateur « OpenSky Network » du port FlightFeed
//
// Pourquoi OpenSky et non Flightradar24 : FR24 n'expose pas d'API publique
// gratuite (licence commerciale, CGU interdisant le scraping). OpenSky sert les
// mêmes données ADS-B, est documenté, libre d'accès et utilisable sans clé.
// C'est un ADAPTATEUR : brancher FR24 sous licence, ou un récepteur ADS-B
// national, se fait en écrivant une classe voisine. Voir docs/adr/0004.
// ============================================================================

const OPENSKY_URL = "https://opensky-network.org/api/states/all";

/**
 * Durée de cache.
 *
 * Tenue volontairement SOUS la cadence de publication de la source (~10 s au
 * palier public) : un cache plus long s'additionnerait à la latence du flux et
 * au rythme de sondage du navigateur, et l'opérateur verrait une situation
 * vieille d'une demi-minute. Réglable par `AVIATION_FEED_TTL_MS`.
 */
const DEFAULT_TTL_MS = 5_000;

/** Palier de repli après un refus de la source (quota dépassé ou panne). */
const BACKOFF_MS = 120_000;

/** Ligne d'état OpenSky : un tableau positionnel, d'où les index nommés ci-dessous. */
type OpenSkyState = readonly (string | number | boolean | null | number[])[];

const IDX = {
  icao24: 0,
  callsign: 1,
  originCountry: 2,
  lastContact: 4,
  longitude: 5,
  latitude: 6,
  baroAltitude: 7,
  onGround: 8,
  velocity: 9,
  trueTrack: 10,
  verticalRate: 11,
  geoAltitude: 13,
  squawk: 14,
} as const;

@Injectable()
export class OpenSkyFeed implements FlightFeed {
  readonly name = "OpenSky Network";

  private readonly logger = new Logger(OpenSkyFeed.name);
  private readonly ttl = Number(process.env.AVIATION_FEED_TTL_MS ?? DEFAULT_TTL_MS);
  private cache: { at: number; data: AircraftPosition[] } | null = null;
  /** Horodatage jusqu'auquel on s'abstient d'interroger la source. */
  private mutedUntil = 0;
  private derniereRaison: string | null = null;

  /**
   * Le flux est-il en service ? Rendue au contrôleur pour que l'écran sache
   * distinguer « aucun appareil » de « fournisseur indisponible ».
   */
  health(): { available: boolean; reason?: string; retryAt?: string } {
    if (Date.now() >= this.mutedUntil) return { available: true };
    return {
      available: false,
      reason: this.derniereRaison ?? "indisponible",
      retryAt: new Date(this.mutedUntil).toISOString(),
    };
  }

  async statesInBox(box: BoundingBox): Promise<AircraftPosition[]> {
    const fresh = this.cache && Date.now() - this.cache.at < this.ttl;
    if (fresh) return this.cache!.data;

    // Quota dépassé ou source en panne : on sert le dernier état connu plutôt
    // que de marteler une source qui refuse.
    if (Date.now() < this.mutedUntil) return this.cache?.data ?? [];

    const params = new URLSearchParams({
      lamin: String(box.minLat),
      lamax: String(box.maxLat),
      lomin: String(box.minLon),
      lomax: String(box.maxLon),
    });

    try {
      const res = await fetch(`${OPENSKY_URL}?${params.toString()}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(8_000),
      });

      if (res.status === 429 || res.status >= 500) {
        this.mutedUntil = Date.now() + BACKOFF_MS;
        this.derniereRaison = res.status === 429 ? "quota du fournisseur atteint" : `erreur ${res.status} du fournisseur`;
        this.logger.warn(`OpenSky ${res.status} — repli sur le cache pendant ${BACKOFF_MS / 1000} s.`);
        return this.cache?.data ?? [];
      }
      if (!res.ok) throw new Error(`OpenSky ${res.status}`);

      const json = (await res.json()) as { states?: OpenSkyState[] | null };
      const data = (json.states ?? []).map(toPosition).filter((p): p is AircraftPosition => p !== null);
      this.cache = { at: Date.now(), data };
      this.derniereRaison = null;
      return data;
    } catch (err) {
      // Dégradation : une carte sans avions reste exploitable, une carte en
      // erreur ne l'est pas. On garde le dernier état connu.
      this.logger.warn(`Flux aérien injoignable (${(err as Error).message}) — dernier état conservé.`);
      return this.cache?.data ?? [];
    }
  }

  /**
   * Authentification facultative. Sans identifiants, OpenSky répond en anonyme
   * avec un quota réduit — suffisant pour une poignée d'appareils. Les
   * identifiants viennent de l'environnement, JAMAIS du dépôt.
   */
  private headers(): Record<string, string> {
    const user = process.env.OPENSKY_USERNAME;
    const pass = process.env.OPENSKY_PASSWORD;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (user && pass) {
      headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
    }
    return headers;
  }
}

/** Convertit une ligne positionnelle OpenSky en position normalisée ARGOS. */
function toPosition(s: OpenSkyState): AircraftPosition | null {
  const icao24 = str(s[IDX.icao24]);
  const lat = num(s[IDX.latitude]);
  const lon = num(s[IDX.longitude]);
  // Un écho sans coordonnées ne peut pas être placé sur la carte.
  if (!icao24 || lat === null || lon === null) return null;

  const callsign = str(s[IDX.callsign])?.trim() || null;
  const lastContact = num(s[IDX.lastContact]);

  return {
    icao24,
    callsign,
    lat,
    lon,
    ll: [lon, lat],
    // L'altitude géométrique est plus fiable à basse hauteur (largage) que la
    // barométrique ; on la préfère quand elle est disponible.
    altitude: num(s[IDX.geoAltitude]) ?? num(s[IDX.baroAltitude]),
    heading: num(s[IDX.trueTrack]),
    velocity: num(s[IDX.velocity]),
    verticalRate: num(s[IDX.verticalRate]),
    onGround: s[IDX.onGround] === true,
    squawk: str(s[IDX.squawk]),
    lastContact: new Date((lastContact ?? Date.now() / 1000) * 1000).toISOString(),
    originCountry: str(s[IDX.originCountry]),
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
