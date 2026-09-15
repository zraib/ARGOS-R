// ============================================================================
// Traceurs GPS FMC920, côté écran (lot N-2)
//
// Miroir des types du domaine servis par `GET /api/tracking/trackers`. Écrits
// ici plutôt que dérivés du client généré : la carte, l'écran de gestion et une
// future fiche lisent la même forme, et un seul endroit la décrit.
// ============================================================================

export type TrackerTargetKind = "unit" | "vehicle" | "personnel" | "equipment";

export const TRACKER_TARGET_KINDS: TrackerTargetKind[] = ["unit", "vehicle", "personnel", "equipment"];

export interface TrackerFix {
  /** Millisecondes UTC — l'horodatage du BOÎTIER, pas celui de la réception. */
  at: number;
  /** [lng, lat] en degrés. */
  ll: [number, number];
  speedKmh: number;
  headingDeg: number;
  altitudeM: number;
  satellites: number;
  priority: "low" | "high" | "panic";
}

/** D'où viennent les positions : un boîtier FMC920 (`device`) ou le téléphone d'un compte via l'application (`app`). */
export type TrackerSource = "device" | "app";

export interface Tracker {
  id: string;
  /** IMEI du boîtier ; pour un partage par l'application, la clé `app:<matricule>`. */
  imei: string;
  source: TrackerSource;
  /** Partage par l'application : le compte qui partage. */
  account?: string;
  label: string;
  target: { kind: TrackerTargetKind; id: string } | null;
  incidentId: string | null;
  archived: boolean;
  createdBy: string;
  createdAt: string;
  /** Dernière position EXPLOITABLE, ou `null` si le boîtier n'a jamais eu de fix. */
  last: TrackerFix | null;
  /**
   * Dernier contact, fix ou non. Distinct de `last` à dessein : un boîtier peut
   * émettre fidèlement depuis un sous-sol sans jamais se localiser.
   */
  lastSeenAt: string | null;
  trail: TrackerFix[];
}

/**
 * Délai au-delà duquel un traceur est tenu pour MUET.
 *
 * Le FMC920 émet typiquement toutes les 30 s en mouvement et se met en veille à
 * l'arrêt : cinq minutes sans un octet ne sont pas une panne, quinze le sont.
 * Le seuil est ici, en clair, plutôt que dispersé dans les composants.
 */
export const STALE_MS = 15 * 60 * 1000;

export function isStale(t: Tracker): boolean {
  if (t.archived) return false;
  if (!t.lastSeenAt) return true;
  return Date.now() - new Date(t.lastSeenAt).getTime() > STALE_MS;
}

/** Ancienneté du dernier contact, en clair : « 2 min », « 3 h », « 4 j ». */
export function contactAge(t: Tracker): string {
  if (!t.lastSeenAt) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(t.lastSeenAt).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} j`;
}
