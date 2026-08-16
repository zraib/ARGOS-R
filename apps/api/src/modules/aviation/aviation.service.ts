import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AircraftRole,
  BoundingBox,
  TrackedAircraft,
  TrackedAircraftState,
} from "@/modules/aviation/aircraft.types";
import { detectCodeKind, normalizeCode } from "@/modules/aviation/aircraft.types";
import { resolvePositions, statusOf } from "@/modules/aviation/aircraft.matching";
import {
  AIRCRAFT_WATCHLIST,
  type AircraftPatch,
  type AircraftWatchlistRepository,
} from "@/modules/aviation/ports/aircraft-watchlist.port";
import { FLIGHT_FEED, type FlightFeed } from "@/modules/aviation/ports/flight-feed.port";

// ============================================================================
// ARGOS — service de suivi aérien (couche applicative)
//
// Ce service ne dépend QUE de deux interfaces (`AircraftWatchlistRepository`,
// `FlightFeed`), injectées par jeton. Il ignore totalement OpenSky, HTTP et la
// base de données : c'est l'inversion de dépendance appliquée strictement, dans
// la continuité du module `orders`. Voir docs/adr/0004.
// ============================================================================

/**
 * Emprise surveillée : territoire national plus une marge large.
 *
 * La marge est délibérée — elle capte les renforts étrangers en approche
 * (Espagne, Portugal, Algérie) et les appareils en transit vers un feu avant
 * qu'ils n'entrent dans l'espace aérien national.
 */
export const MOROCCO_AIR_BBOX: BoundingBox = { minLat: 19, maxLat: 38, minLon: -19.5, maxLon: 0.5 };

/** Données de création d'un appareil suivi. */
export interface AddAircraftInput {
  code: string;
  label: string;
  role: AircraftRole;
  incidentId?: string;
  icao24?: string;
}

@Injectable()
export class AviationService {
  constructor(
    @Inject(AIRCRAFT_WATCHLIST) private readonly watchlist: AircraftWatchlistRepository,
    @Inject(FLIGHT_FEED) private readonly feed: FlightFeed,
  ) {}

  /** Nom du fournisseur de positions, affiché à l'opérateur. */
  get feedName(): string {
    return this.feed.name;
  }

  /** Appareils inscrits. Les archivés sont masqués sauf demande explicite. */
  async list(includeArchived = false): Promise<TrackedAircraft[]> {
    const all = await this.watchlist.list();
    return includeArchived ? all : all.filter((a) => !a.archived);
  }

  /**
   * Inscrit un appareil à la surveillance.
   *
   * Le code est normalisé puis sa nature déduite de sa forme : l'opérateur
   * saisit ce qu'il connaît (immatriculation, indicatif, code IFF ou adresse
   * OACI) sans choisir de format.
   */
  async add(input: AddAircraftInput, actor: string): Promise<TrackedAircraft> {
    const code = normalizeCode(input.code);
    if (code.length < 3) throw new BadRequestException("Code d'aéronef trop court (3 caractères minimum).");
    if (code.length > 12) throw new BadRequestException("Code d'aéronef trop long (12 caractères maximum).");

    const existing = await this.watchlist.findByCode(code);
    if (existing) throw new ConflictException(`L'aéronef ${code} est déjà suivi.`);

    const label = input.label.trim();
    if (!label) throw new BadRequestException("Le libellé est obligatoire.");

    const codeKind = detectCodeKind(code);
    // Si le code saisi EST une adresse OACI, on la retient d'office comme clé
    // d'appariement : c'est la seule sans ambiguïté.
    const icao24 = normalizeIcao24(input.icao24) ?? (codeKind === "icao24" ? code.toLowerCase() : undefined);

    return this.watchlist.add({
      id: `acft-${code.toLowerCase()}`,
      code,
      codeKind,
      icao24,
      label,
      role: input.role,
      incidentId: input.incidentId,
      archived: false,
      addedAt: new Date().toISOString(),
      addedBy: actor,
    });
  }

  async update(id: string, patch: AircraftPatch): Promise<TrackedAircraft> {
    await this.require(id);
    return this.watchlist.update(id, patch);
  }

  /**
   * Archive un appareil : il sort de la carte et des interrogations, mais reste
   * consultable. C'est le geste par défaut — seul le superadmin supprime.
   */
  async archive(id: string): Promise<TrackedAircraft> {
    await this.require(id);
    return this.watchlist.update(id, { archived: true });
  }

  async restore(id: string): Promise<TrackedAircraft> {
    await this.require(id);
    return this.watchlist.update(id, { archived: false });
  }

  /** Suppression définitive — le RBAC la réserve au superadmin. */
  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.watchlist.remove(id);
  }

  /**
   * Positions courantes des seuls appareils inscrits et actifs.
   *
   * On interroge le flux sur l'emprise nationale puis on croise avec la liste :
   * le trafic mondial ne sort jamais de ce service, et la liste de suivi ne sort
   * jamais vers le fournisseur.
   */
  async states(incidentId?: string): Promise<TrackedAircraftState[]> {
    const fleet = (await this.list()).filter((a) => !incidentId || a.incidentId === incidentId);
    if (fleet.length === 0) return [];

    const echoes = await this.feed.statesInBox(MOROCCO_AIR_BBOX);
    const positions = resolvePositions(fleet, echoes);

    return fleet.map((aircraft) => {
      const position = positions.get(aircraft.id) ?? null;
      return { aircraft, position, status: statusOf(position) };
    });
  }

  private async require(id: string): Promise<TrackedAircraft> {
    const found = await this.watchlist.findById(id);
    if (!found) throw new NotFoundException(`Aéronef inconnu : ${id}`);
    return found;
  }
}

/** Valide une adresse OACI saisie à la main (6 caractères hexadécimaux). */
function normalizeIcao24(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase().replace(/[\s\-.]/g, "");
  if (!/^[0-9a-f]{6}$/.test(v)) throw new BadRequestException("Adresse OACI invalide (6 caractères hexadécimaux attendus).");
  return v;
}
