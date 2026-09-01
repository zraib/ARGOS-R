import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DomainService } from "@/modules/domain/domain.service";
import { WeatherService } from "@/modules/domain/weather.service";
import { SUBSTANCE_CATALOG, type SubstanceCatalog } from "@/modules/nrbc/ports/substance-catalog.port";
import { libraryProvenance } from "@/modules/nrbc/infrastructure/substances.data";

/** Ce que la LISTE transporte : tout sauf la fiche, qui pèse trop. */
export type SubstanceSummary = Omit<Substance, "sheet"> & { hasSheet: boolean };

function summarize(s: Substance): SubstanceSummary {
  const { sheet, ...rest } = s;
  return { ...rest, hasSheet: !!sheet };
}
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
   * Bibliothèque consultable (lot N-3) : recherche libre + état de provenance.
   *
   * La recherche porte AUSSI sur les synonymes, le numéro ONU et le CAS : sur
   * une intervention, ce qui est lu sur l'étiquette orange d'une citerne est un
   * numéro, pas un nom français. Chercher « 1017 » ou « UN1017 » doit trouver le
   * chlore.
   *
   * L'état de provenance est renvoyé AVEC la liste, jamais séparément : une
   * bibliothèque dont on ignore ce qui est vérifié se lit comme si tout l'était.
   */
  async library(query?: string): Promise<{
    substances: SubstanceSummary[];
    provenance: ReturnType<typeof libraryProvenance> & {
      origins: { source: string; retrievedAt: string; authorization: string; count: number }[] | null;
    };
  }> {
    const all = await this.catalog.list();
    const q = query?.trim().toLowerCase().replace(/^un\s*/i, "");
    const substances = !q
      ? all
      : all.filter((x) =>
          [
            x.un,
            x.cas ?? "",
            x.ergGuide,
            x.labels.fr,
            x.labels.en,
            x.labels.ar,
            ...(x.synonyms ?? []),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        );
    // La provenance décrit TOUTE la bibliothèque, pas la seule page filtrée :
    // sinon une recherche qui ne ramène que des fiches vérifiées laisserait
    // croire que la bibliothèque entière l'est.
    return {
      // Résumés SANS la fiche. Le référentiel complet pèse 22 Mo de texte : la
      // liste entière deviendrait une réponse de plusieurs dizaines de méga-
      // octets, sur un poste de commandement dont la liaison peut être
      // médiocre. La fiche se demande à l'ouverture (`GET /nrbc/substances/:id`).
      substances: substances.map(summarize),
      // L'origine du jeu SOUS LICENCE voyage avec la provenance : une
      // bibliothèque enrichie dont on ignore d'où vient l'enrichissement aurait
      // l'air complète, ce qui est pire que d'être incomplète.
      provenance: { ...libraryProvenance(all), origins: this.catalog.origin?.() ?? null },
    };
  }

  /** Fiche d'une substance, ou `null` si l'identifiant est inconnu. */
  async substance(id: string): Promise<Substance | null> {
    return this.catalog.findById(id);
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
      // Une substance du catalogue peut ne PAS porter de distances ERG : sa
      // fiche opérationnelle est renseignée, la table 1 ne l'est pas encore
      // (lot N-3). Le gabarit ERG est alors simplement indisponible pour elle —
      // on ne dessine pas un périmètre inventé sous prétexte d'avoir quelque
      // chose à montrer.
      const distances = spill === "small" ? substance.small : substance.large;
      if (distances) {
        zones.push(...ergZones([lon, lat], distances, wind?.isDay ?? true, wind?.fromDeg ?? null));
      }
    }

    return {
      incidentId,
      substance: substance
        ? {
            id: substance.id,
            un: substance.un,
            ergGuide: substance.ergGuide,
            labels: substance.labels,
            ergVerified: substance.ergVerified,
            // Le client doit pouvoir distinguer « pas de gabarit ERG demandé »
            // de « gabarit demandé mais distances inconnues » : sans cela, une
            // carte sans cercle laisse croire à une panne.
            hasErgDistances: !!(substance.small && substance.large),
          }
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
