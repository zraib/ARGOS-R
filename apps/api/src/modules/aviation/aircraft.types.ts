// ============================================================================
// ARGOS — suivi aérien : types du domaine
//
// Le poste de commandement ne veut PAS le trafic aérien mondial : il veut voir
// **les seuls aéronefs engagés sur un feu de forêt**, désignés un par un par un
// opérateur. La liste de suivi (« watchlist ») est donc le cœur du module ; le
// flux de positions n'est qu'une source qu'on croise avec elle.
//
// Aucun import d'infrastructure ici : ce fichier ne connaît ni OpenSky, ni HTTP,
// ni base de données. Voir docs/adr/0004.
// ============================================================================

/** Nature du code saisi par l'opérateur, déduite de sa forme. */
export type AircraftCodeKind =
  /** Adresse OACI 24 bits (hexadécimal, 6 caractères) — clé technique de l'ADS-B. */
  | "icao24"
  /** Immatriculation peinte sur le fuselage (CN-xxx au Maroc). */
  | "registration"
  /** Indicatif d'appel radio du vol (peut changer d'une mission à l'autre). */
  | "callsign"
  /** Code transpondeur Mode 3A / IFF (4 chiffres octaux). */
  | "squawk";

/** Rôle opérationnel de l'appareil dans la lutte contre le feu. */
export type AircraftRole =
  /** Bombardier d'eau (Canadair CL-415, Air Tractor…). */
  | "waterbomber"
  /** Hélicoptère (largage, héliportage, évacuation). */
  | "helicopter"
  /** Observation / guidage aérien. */
  | "observation"
  /** Transport / logistique. */
  | "transport"
  /** Évacuation sanitaire. */
  | "medevac";

export const AIRCRAFT_ROLES: readonly AircraftRole[] = [
  "waterbomber",
  "helicopter",
  "observation",
  "transport",
  "medevac",
] as const;

/** Un aéronef inscrit à la surveillance par un opérateur. */
export interface TrackedAircraft {
  id: string;
  /** Code saisi, normalisé (majuscules, sans espaces ni tirets). */
  code: string;
  /** Nature déduite du code. */
  codeKind: AircraftCodeKind;
  /**
   * Adresse OACI 24 bits, quand elle est connue (minuscules).
   *
   * Renseignée d'office si le code saisi EST une adresse OACI, sinon laissée à
   * l'opérateur. C'est le seul appariement sans ambiguïté : dès qu'elle existe,
   * elle prime sur l'indicatif et le squawk.
   */
  icao24?: string;
  /** Libellé lisible affiché sur la carte (ex. « Canadair 01 »). */
  label: string;
  role: AircraftRole;
  /** Incident auquel l'appareil est rattaché, si engagé. */
  incidentId?: string;
  /** Un appareil archivé n'est plus interrogé ni affiché. */
  archived: boolean;
  /** ISO 8601. */
  addedAt: string;
  /** Identifiant de l'opérateur qui l'a inscrit (traçabilité). */
  addedBy: string;
}

/** Position instantanée telle que rapportée par un flux ADS-B. */
export interface AircraftPosition {
  /** Adresse OACI 24 bits, minuscules. */
  icao24: string;
  /** Indicatif d'appel émis, sans espaces de bourrage. */
  callsign: string | null;
  lat: number;
  lon: number;
  /** [lng, lat] — cohérent avec le reste du domaine ARGOS. */
  ll: [number, number];
  /** Altitude barométrique en mètres. */
  altitude: number | null;
  /** Cap vrai en degrés (0 = nord). */
  heading: number | null;
  /** Vitesse sol en m/s. */
  velocity: number | null;
  /** Vitesse verticale en m/s (positif = montée). */
  verticalRate: number | null;
  onGround: boolean;
  /** Code transpondeur Mode 3A / IFF. */
  squawk: string | null;
  /** Dernier contact radio, ISO 8601. */
  lastContact: string;
  /** Pays d'immatriculation déclaré par le flux. */
  originCountry: string | null;
}

/** État de suivi d'un appareil inscrit. */
export type TrackingStatus =
  /** Position fraîche reçue. */
  | "airborne"
  /** Vu, mais au sol. */
  | "ground"
  /** Inscrit mais aucun écho dans l'emprise surveillée. */
  | "no_signal";

/** Un appareil inscrit, enrichi de sa position si le flux l'a vu. */
export interface TrackedAircraftState {
  aircraft: TrackedAircraft;
  position: AircraftPosition | null;
  status: TrackingStatus;
}

/** Emprise géographique interrogée sur le flux. */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Normalise un code saisi : majuscules, sans espaces, tirets ni points.
 * `cn-tzs` et `CN TZS` désignent le même appareil.
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s\-.]/g, "");
}

/**
 * Déduit la nature d'un code à partir de sa seule forme.
 *
 * L'opérateur saisit ce qu'il a sous la main — immatriculation lue sur le
 * fuselage, indicatif entendu à la radio, code IFF transmis par la tour, ou
 * adresse OACI issue de la documentation. On ne lui impose pas de choisir un
 * format dans un menu : la forme du code suffit à trancher.
 */
export function detectCodeKind(normalized: string): AircraftCodeKind {
  // 4 chiffres octaux (0-7) : code transpondeur Mode 3A / IFF.
  if (/^[0-7]{4}$/.test(normalized)) return "squawk";
  // 6 caractères hexadécimaux dont au moins un chiffre : adresse OACI 24 bits.
  // Le garde-fou sur le chiffre évite de confondre avec un indicatif « ABCDEF ».
  if (/^[0-9A-F]{6}$/.test(normalized) && /[0-9]/.test(normalized)) return "icao24";
  // Préfixe pays à DEUX caractères suivi d'un suffixe de trois : immatriculation.
  // CN = Maroc ; les autres couvrent les renforts méditerranéens habituels.
  //
  // Les préfixes à une seule lettre (F, D, G, I…) sont volontairement exclus :
  // ils avaleraient des indicatifs d'appel courants (« GRM01 » se lirait G-RM01).
  // L'exclusion est sans conséquence sur le suivi — l'appariement traite
  // immatriculation et indicatif de la même façon, faute d'immatriculation dans
  // la trame ADS-B — elle évite seulement d'annoncer une nature erronée.
  if (/^(CN|EC|CS|OO|LX|TS|7T)[A-Z0-9]{3}$/.test(normalized)) return "registration";
  return "callsign";
}
