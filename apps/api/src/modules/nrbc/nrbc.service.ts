import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DomainService } from "@/modules/domain/domain.service";
import { WeatherService } from "@/modules/domain/weather.service";
import { SUBSTANCE_CATALOG, type SubstanceCatalog } from "@/modules/nrbc/ports/substance-catalog.port";
import { atp45Zones, ergZones } from "@/modules/nrbc/plume/plume.engine";
import {
  PLUME_MODELS,
  type PlumeModelId,
  type PlumeResult,
  type PlumeWind,
  type PlumeZone,
  type Substance,
} from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — cas d'usage NRBC : du fait déclaré au panache dessinable
//
// Assemble ce que les moteurs purs ne connaissent pas : l'incident (position,
// substance, ampleur), la PRÉVISION de vent au point exact du rejet, et
// l'échéance demandée (H+0 … H+6). Les gabarits eux-mêmes sont dans
// `plume/plume.engine.ts` — purs et testés.
//
// Doctrine d'honnêteté : le vent est une prévision à 10 m au pas horaire, pas
// une mesure au sol ; la réponse transporte l'heure du pas utilisé et le
// panache est toujours présenté comme une ESTIMATION côté interface.
// ============================================================================

/** Fenêtre d'évolution proposée à l'opérateur : H+0 à H+6. */
export const PLUME_MAX_HOUR = 6;

/**
 * Heure locale approchée depuis une heure UTC. Le Maroc (Africa/Casablanca)
 * vit à UTC+1 l'essentiel de l'année — approximation assumée et documentée,
 * utilisée UNIQUEMENT pour trancher jour/nuit (7 h–19 h) dans le choix de la
 * distance ERG. Une erreur d'une heure aux bascules ne change le gabarit
 * qu'aux minutes du crépuscule.
 */
function isLocalDay(utcIso: string): boolean {
  const utcHour = Number(utcIso.slice(11, 13));
  const localHour = (utcHour + 1) % 24;
  return localHour >= 7 && localHour < 19;
}

@Injectable()
export class NrbcService {
  constructor(
    private readonly domain: DomainService,
    private readonly weather: WeatherService,
    @Inject(SUBSTANCE_CATALOG) private readonly catalog: SubstanceCatalog,
  ) {}

  /** Catalogue des substances (sélecteur du wizard + fiche incident). */
  async substances(): Promise<Substance[]> {
    return this.catalog.list();
  }

  /**
   * Panache d'un incident NRBC à l'échéance H+`hour`, pour les référentiels
   * demandés. La direction retenue est celle du pas de prévision correspondant
   * — c'est ce qui fait « évoluer » le panache quand l'opérateur balaie les
   * échéances.
   */
  async plume(incidentId: string, models: PlumeModelId[], hour: number): Promise<PlumeResult> {
    const incident = this.domain.listIncidents().find((i) => i.id === incidentId);
    if (!incident) throw new NotFoundException(`Incident ${incidentId} introuvable.`);
    if (!incident.nrbc) throw new BadRequestException(`L'incident ${incidentId} n'a pas de volet NRBC.`);
    if (incident.nrbc.family !== "C") {
      // ATP-45 couvre aussi B et N, mais avec d'autres gabarits — hors des
      // phases 1-3 (ADR 0005). Ne rien dessiner vaut mieux qu'un gabarit faux.
      throw new BadRequestException("Le panache n'est disponible que pour la famille chimique (C) dans cette phase.");
    }
    const wanted = models.length > 0 ? models : [...PLUME_MODELS];
    const substance = incident.nrbc.substanceId ? await this.catalog.findById(incident.nrbc.substanceId) : null;
    // Planification prudente : sans ampleur déclarée, on retient le grand
    // déversement (l'enveloppe), jamais l'hypothèse optimiste.
    const spill = incident.nrbc.spill ?? "large";

    const [lon, lat] = incident.ll;
    const wind = await this.windAt(lat, lon, hour);

    const zones: PlumeZone[] = [];
    if (wanted.includes("atp45")) {
      zones.push(...atp45Zones([lon, lat], wind?.speedKmh ?? null, wind?.fromDeg ?? null));
    }
    if (wanted.includes("erg") && substance) {
      const distances = spill === "small" ? substance.small : substance.large;
      zones.push(...ergZones([lon, lat], distances, wind?.isDay ?? true, wind?.fromDeg ?? null));
    }

    return {
      incidentId,
      substance: substance
        ? { id: substance.id, un: substance.un, ergGuide: substance.ergGuide, labels: substance.labels, ergVerified: substance.ergVerified }
        : null,
      spill,
      hour,
      wind,
      zones,
      // ERG sans substance déclarée = rien à dessiner : le modèle est retiré de
      // la réponse pour que l'interface explique l'absence au lieu de la subir.
      models: wanted.filter((m) => m !== "erg" || substance !== null),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Vent prévu au point du rejet, au pas horaire H+`hour`. `null` quand la
   * prévision est indisponible — le panache dégrade alors en zones non
   * directionnelles au lieu d'inventer une direction.
   */
  private async windAt(lat: number, lon: number, hour: number): Promise<PlumeWind | null> {
    const series = await this.weather.pointSeries(lat, lon);
    if (!series || series.times.length === 0) return null;
    // Les heures Open-Meteo sont en UTC au format « YYYY-MM-DDTHH:00 » : on
    // cale H+0 sur le pas de l'heure UTC courante, puis on décale de `hour`.
    const nowKey = new Date().toISOString().slice(0, 13);
    let base = series.times.findIndex((t) => t.slice(0, 13) === nowKey);
    if (base < 0) base = 0;
    const idx = Math.min(base + hour, series.times.length - 1);
    const time = series.times[idx];
    return {
      speedKmh: series.wind[idx] ?? 0,
      fromDeg: series.windDir[idx] ?? 0,
      time,
      isDay: isLocalDay(time),
    };
  }
}
