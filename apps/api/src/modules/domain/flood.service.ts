import { Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "@/config/configuration";
import { loadDevState, saveDevState } from "@/common/dev-store";
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
  type DailySeries,
} from "@/modules/domain/flood.openmeteo";

// ============================================================================
// ARGOS — courtier des crues : Open-Meteo Flood (GloFAS) par défaut, Google
// Flood Hub sur clé
//
// Le navigateur ne parle JAMAIS à un fournisseur : l'API interroge la source
// côté serveur, normalise jauges, statuts, prévisions et cartes d'inondation
// dans UN contrat stable, et met en cache — comme la sismologie (EMSC) et la
// météo (Open-Meteo), ADR 0002/0006. Deux fournisseurs, un contrat :
//   - Open-Meteo Flood (GloFAS v4, Copernicus/ECMWF) : sans clé, libre,
//     auto-hébergeable — le défaut ; seuils dérivés de l'historique
//     (`flood.openmeteo.ts`), pas de carte d'inondation ;
//   - Google Flood Hub : dès que `FLOOD_API_KEY` est posée — seuils du
//     modèle, tendance, cartes d'inondation KML.
// Une panne rend le dernier cache connu et le DIT ; le simulateur
// d'inondation, lui, n'en dépend pas. Voir docs/adr/0010.
//
// Données CC BY 4.0 dans les deux cas — l'attribution est portée à l'écran.
// ============================================================================

export type FloodSeverity = "extreme" | "severe" | "above_normal" | "no_flooding" | "unknown";
export type FloodTrend = "rise" | "fall" | "no_change" | "unknown";
export type FloodUnit = "m" | "m3/s" | "unknown";

export interface FloodThresholds {
  warning: number;
  danger: number;
  extreme?: number;
  unit: FloodUnit;
}

export interface FloodInundationMap {
  level: "high" | "medium" | "low";
  polygonId: string;
  type: "probability" | "depth" | "unknown";
}

/** Une jauge et son dernier statut — ce que la carte pose comme marqueur. */
export interface FloodGauge {
  gaugeId: string;
  siteName: string;
  river?: string;
  /** [lng, lat] — cohérent avec le reste du domaine. */
  ll: [number, number];
  source: string;
  qualityVerified: boolean;
  hasModel: boolean;
  severity: FloodSeverity;
  trend: FloodTrend;
  issuedTime: string | null;
  forecastStart: string | null;
  forecastEnd: string | null;
  thresholds: FloodThresholds | null;
  /** Le pic prévu sur la fenêtre de prévision, dans l'unité des seuils — ce qu'on lit même sans seuil. */
  peak: number | null;
  inundationMaps: FloodInundationMap[];
}

export interface FloodForecastPoint {
  start: string;
  end: string;
  value: number;
}

export interface FloodForecast {
  gaugeId: string;
  issuedTime: string;
  unit: FloodUnit;
  thresholds: FloodThresholds | null;
  points: FloodForecastPoint[];
}

export type FloodProvider = "open-meteo-glofas" | "google-flood-hub";

export interface FloodFeedStatus {
  /** Toujours vrai : Open-Meteo ne demande rien ; Google prend le relais sur clé. */
  configured: boolean;
  /** Le fournisseur en service. */
  provider: FloodProvider;
  source: string;
  region: string;
  fetchedAt: string | null;
  /** La dernière relecture a échoué : ce qui est servi est le dernier cache connu. */
  degraded: boolean;
  error: string | null;
  attribution: string;
}

/** Un polygone d'inondation de Flood Hub, en GeoJSON. */
export interface FloodPolygon {
  type: "Feature";
  properties: { polygonId: string };
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
}

/**
 * Ce que le service demande au réseau — remplaçable dans les tests. Un chemin
 * relatif vise Google (la clé s'y ajoute) ; une URL absolue est appelée telle
 * quelle (Open-Meteo).
 */
export type FloodFetcher = (path: string, init?: { method?: "GET" | "POST"; body?: unknown }) => Promise<unknown>;
/** Jeton d'injection du récupérateur ; sans fournisseur enregistré, l'appel réel à Google est employé. */
export const FLOOD_FETCHER = Symbol("FLOOD_FETCHER");

// --- formes BRUTES de l'API (ce qu'on lit, jamais ce qu'on sert) ------------
interface RawLatLng { latitude?: number; longitude?: number }
interface RawGauge { gaugeId?: string; siteName?: string; river?: string; source?: string; location?: RawLatLng; qualityVerified?: boolean; hasModel?: boolean }
interface RawStatus {
  gaugeId?: string; gaugeLocation?: RawLatLng; issuedTime?: string; forecastTimeRange?: { start?: string; end?: string };
  severity?: string; forecastTrend?: string; qualityVerified?: boolean; source?: string;
  inundationMapSet?: { inundationMaps?: { level?: string; serializedPolygonId?: string }[]; inundationMapType?: string };
}
interface RawModel { gaugeId?: string; thresholds?: { warningLevel?: number; dangerLevel?: number; extremeDangerLevel?: number }; gaugeValueUnit?: string }
interface RawForecast { gaugeId?: string; issuedTime?: string; forecastRanges?: { value?: number; forecastStartTime?: string; forecastEndTime?: string }[] }

const BASE = "https://floodforecasting.googleapis.com/v1";
/** Code région CLDR du Maroc. */
const REGION = "MA";
const TTL_MS = 15 * 60_000;
const POLYGON_TTL_MS = 6 * 60 * 60_000;
const TIMEOUT_MS = 12_000;
const BATCH = 100;
const ATTRIBUTION: Record<FloodProvider, string> = {
  "google-flood-hub": "Google Flood Hub — données CC BY 4.0",
  "open-meteo-glofas": "Open-Meteo Flood · GloFAS v4 (Copernicus / ECMWF) — CC BY 4.0 ; seuils dérivés de quatre ans d’historique",
};
const OM_FORECAST_TTL_MS = 6 * 60 * 60_000;
/** Les seuils changent lentement : un mois sur disque, puis relecture point par point. */
const OM_THRESHOLDS_TTL_MS = 30 * 24 * 60 * 60_000;
/** Après un « 429 » (quota), on laisse passer un quart d'heure avant de redemander. */
const OM_BACKOFF_MS = 15 * 60_000;
/** Espacement des requêtes d'historique : une par point, et le quota par minute reste respecté. */
const OM_WARMUP_GAP_MS = 25_000;

/** Ce que le disque garde des seuils Open-Meteo : par point, quand et quoi. */
interface OmThresholdsDisk {
  thresholds?: Record<string, { at: number; th: FloodThresholds | null }>;
}
const SEVERITY_RANK: Record<FloodSeverity, number> = { extreme: 0, severe: 1, above_normal: 2, no_flooding: 3, unknown: 4 };

// --- normalisation (pure, testée seule) --------------------------------------

export function severityOf(raw: string | undefined): FloodSeverity {
  switch (raw) {
    case "EXTREME": return "extreme";
    case "SEVERE": return "severe";
    case "ABOVE_NORMAL": return "above_normal";
    case "NO_FLOODING": return "no_flooding";
    default: return "unknown";
  }
}

export function trendOf(raw: string | undefined): FloodTrend {
  switch (raw) {
    case "RISE": return "rise";
    case "FALL": return "fall";
    case "NO_CHANGE": return "no_change";
    default: return "unknown";
  }
}

export function unitOf(raw: string | undefined): FloodUnit {
  return raw === "METERS" ? "m" : raw === "CUBIC_METERS_PER_SECOND" ? "m3/s" : "unknown";
}

function thresholdsOf(model: RawModel | undefined): FloodThresholds | null {
  const t = model?.thresholds;
  if (!t || typeof t.warningLevel !== "number" || typeof t.dangerLevel !== "number") return null;
  return {
    warning: t.warningLevel,
    danger: t.dangerLevel,
    ...(typeof t.extremeDangerLevel === "number" ? { extreme: t.extremeDangerLevel } : {}),
    unit: unitOf(model?.gaugeValueUnit),
  };
}

function llOf(p: RawLatLng | undefined): [number, number] | null {
  return p && typeof p.latitude === "number" && typeof p.longitude === "number" ? [p.longitude, p.latitude] : null;
}

/** Assemble une jauge servie à partir de son statut, de sa fiche et de son modèle. */
export function normalizeGauge(status: RawStatus, gauge: RawGauge | undefined, model: RawModel | undefined): FloodGauge | null {
  const gaugeId = status.gaugeId ?? gauge?.gaugeId;
  const ll = llOf(status.gaugeLocation) ?? llOf(gauge?.location);
  if (!gaugeId || !ll) return null;
  const type = status.inundationMapSet?.inundationMapType;
  return {
    gaugeId,
    siteName: gauge?.siteName?.trim() || gauge?.river?.trim() || gaugeId,
    river: gauge?.river?.trim() || undefined,
    ll,
    source: status.source ?? gauge?.source ?? "",
    qualityVerified: status.qualityVerified ?? gauge?.qualityVerified ?? false,
    hasModel: gauge?.hasModel ?? !!model,
    severity: severityOf(status.severity),
    trend: trendOf(status.forecastTrend),
    issuedTime: status.issuedTime ?? null,
    forecastStart: status.forecastTimeRange?.start ?? null,
    forecastEnd: status.forecastTimeRange?.end ?? null,
    thresholds: thresholdsOf(model),
    peak: null,
    inundationMaps: (status.inundationMapSet?.inundationMaps ?? [])
      .filter((m): m is { level: string; serializedPolygonId: string } => !!m.serializedPolygonId && !!m.level)
      .map((m) => ({
        level: m.level === "HIGH" ? "high" : m.level === "MEDIUM" ? "medium" : "low",
        polygonId: m.serializedPolygonId,
        type: type === "PROBABILITY" ? "probability" : type === "DEPTH" ? "depth" : "unknown",
      })),
  };
}

/**
 * KML → GeoJSON MultiPolygon, sans dépendance : les polygones de Flood Hub
 * n'emploient que `<Polygon>`, `<outerBoundaryIs>`, `<innerBoundaryIs>` et
 * `<coordinates>` (« lng,lat[,alt] » séparés par des blancs).
 */
export function kmlToGeoJson(kml: string, polygonId: string): FloodPolygon {
  const anneau = (bloc: string): number[][] => {
    const m = /<coordinates>([\s\S]*?)<\/coordinates>/i.exec(bloc);
    if (!m) return [];
    const pts = m[1].trim().split(/\s+/).map((c) => c.split(",").map(Number)).filter((c) => c.length >= 2 && c.every((v, i) => i > 1 || Number.isFinite(v))).map((c) => [c[0], c[1]]);
    // Un anneau se ferme : le dernier point est le premier.
    if (pts.length >= 3 && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) pts.push(pts[0]);
    return pts.length >= 4 ? pts : [];
  };
  const polygones: number[][][][] = [];
  for (const m of kml.matchAll(/<Polygon\b[\s\S]*?<\/Polygon>/gi)) {
    const bloc = m[0];
    const ext = /<outerBoundaryIs>([\s\S]*?)<\/outerBoundaryIs>/i.exec(bloc);
    const exterieur = anneau(ext ? ext[1] : bloc);
    if (exterieur.length === 0) continue;
    const trous = [...bloc.matchAll(/<innerBoundaryIs>([\s\S]*?)<\/innerBoundaryIs>/gi)].map((t) => anneau(t[1])).filter((r) => r.length > 0);
    polygones.push([exterieur, ...trous]);
  }
  return { type: "Feature", properties: { polygonId }, geometry: { type: "MultiPolygon", coordinates: polygones } };
}

function lots<T>(items: readonly T[], taille: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += taille) out.push(items.slice(i, i + taille));
  return out;
}

@Injectable()
export class FloodService {
  private readonly log = new Logger("Floods");
  private readonly fetcher: FloodFetcher;
  private gaugesCache: { at: number; data: FloodGauge[] } | null = null;
  private gaugesProvider: FloodProvider | null = null;
  private readonly models = new Map<string, RawModel>();
  /** Open-Meteo : la cellule de lit retenue par point et sa série prévue (cache 6 h). */
  private omForecasts: { at: number; cells: Map<string, [number, number]>; series: Map<string, DailySeries> } | null = null;
  /** Seuils par point, dérivés de l'historique — sur disque, un mois. */
  private readonly omThresholds: Record<string, { at: number; th: FloodThresholds | null }>;
  private omWarmup: Promise<void> | null = null;
  private omBackoffUntil = 0;
  /** Espacement des requêtes d'historique (raccourci par les tests). */
  warmupGapMs = OM_WARMUP_GAP_MS;
  private readonly polygons = new Map<string, { at: number; data: FloodPolygon }>();
  private enCours: Promise<FloodGauge[]> | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    // Une fonction n'a pas de type injectable : le jeton est optionnel, et
    // Nest passe `undefined` quand rien ne le fournit — le réseau, alors.
    @Optional() @Inject(FLOOD_FETCHER) fetcher?: FloodFetcher,
  ) {
    this.fetcher = fetcher ?? ((path, init) => this.fetchGoogle(path, init));
    this.omThresholds = loadDevState<OmThresholdsDisk>("floods", {}).thresholds ?? {};
  }

  private get key(): string {
    return this.config.get("floodApiKey", { infer: true }) ?? "";
  }

  /** Le fournisseur en service : Google dès qu'une clé est posée, Open-Meteo sinon. */
  get provider(): FloodProvider {
    return this.key ? "google-flood-hub" : "open-meteo-glofas";
  }

  /** L'appel réel : clé en paramètre pour Google, URL telle quelle pour Open-Meteo ; délai borné, échec NOMMÉ. */
  private async fetchGoogle(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<unknown> {
    const absolue = /^https?:\/\//.test(path);
    const sep = path.includes("?") ? "&" : "?";
    const url = absolue ? path : `${BASE}/${path}${sep}key=${encodeURIComponent(this.key)}`;
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { Accept: "application/json", ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${absolue ? "Open-Meteo" : "Flood Hub"} ${res.status}`);
    return res.json();
  }

  status(): FloodFeedStatus {
    const provider = this.provider;
    return {
      configured: true,
      provider,
      source: provider,
      region: REGION,
      fetchedAt: this.gaugesCache ? new Date(this.gaugesCache.at).toISOString() : null,
      degraded: this.lastError !== null,
      error: this.lastError,
      attribution: ATTRIBUTION[provider],
    };
  }

  /**
   * Les jauges du Maroc et leur dernier statut, par gravité décroissante.
   * Cache 15 min ; dégradation sur le dernier cache connu, sinon liste vide.
   * Un changement de fournisseur (clé posée ou retirée) invalide le cache.
   */
  async gauges(): Promise<FloodGauge[]> {
    const frais = this.gaugesCache && this.gaugesProvider === this.provider && Date.now() - this.gaugesCache.at < TTL_MS;
    if (frais) return this.gaugesCache!.data;
    if (this.enCours) return this.enCours;
    const lecture = this.provider === "google-flood-hub" ? this.relire() : this.relireOpenMeteo();
    this.enCours = lecture.finally(() => {
      this.enCours = null;
    });
    return this.enCours;
  }

  /** Un « 429 » est un quota, pas une panne : on attend avant de redemander. */
  private noterQuota(e: unknown): void {
    if ((e as Error).message?.includes("429")) this.omBackoffUntil = Date.now() + OM_BACKOFF_MS;
  }

  /**
   * Open-Meteo : UNE requête toutes les 6 h — les 3 × 3 cellules de chaque
   * point sur deux semaines — qui choisit le lit de l'oued ET donne sa
   * prévision. Les seuils viennent du disque ; ceux qui manquent se calculent
   * en arrière-plan, point par point, sans bloquer la réponse.
   */
  private async relireOpenMeteo(): Promise<FloodGauge[]> {
    if (Date.now() < this.omBackoffUntil) return this.gaugesCache?.data ?? [];
    try {
      if (!this.omForecasts || Date.now() - this.omForecasts.at > OM_FORECAST_TTL_MS) {
        const toutes = parseOpenMeteoDaily(await this.fetcher(openMeteoForecastUrl(RIVER_POINTS)), RIVER_POINTS.length * 9);
        const choix = snapToChannel(RIVER_POINTS, toutes);
        const cells = new Map<string, [number, number]>();
        const series = new Map<string, DailySeries>();
        RIVER_POINTS.forEach((p, i) => {
          cells.set(p.gaugeId, neighborhood(p.ll)[choix[i]]);
          // Les sept jours passés servent au choix de la cellule, pas à la prévision servie.
          const serie = toutes[i * 9 + choix[i]] ?? { time: [], values: [] };
          const debut = Math.max(0, serie.time.length - 7);
          series.set(p.gaugeId, { time: serie.time.slice(debut), values: serie.values.slice(debut) });
        });
        this.omForecasts = { at: Date.now(), cells, series };
      }
      this.warmupThresholds();
      const issued = new Date(this.omForecasts.at).toISOString();
      const data = RIVER_POINTS.map((p): FloodGauge => {
        const serie = this.omForecasts!.series.get(p.gaugeId) ?? { time: [], values: [] };
        const thresholds = this.omThresholds[p.gaugeId]?.th ?? null;
        return {
          gaugeId: p.gaugeId,
          siteName: p.siteName,
          river: p.river,
          // Le marqueur reste au point nommé ; c'est la cellule de lit qui est lue.
          ll: p.ll,
          source: "GloFAS v4 (Open-Meteo)",
          qualityVerified: false,
          hasModel: serie.values.length > 0,
          severity: severityFrom(peakOf(serie.values), thresholds),
          trend: trendFrom(serie.values),
          issuedTime: issued,
          forecastStart: serie.time[0] ?? null,
          forecastEnd: serie.time[serie.time.length - 1] ?? null,
          thresholds,
          peak: peakOf(serie.values),
          inundationMaps: [],
        };
      }).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.siteName.localeCompare(b.siteName, "fr"));
      this.gaugesCache = { at: Date.now(), data };
      this.gaugesProvider = "open-meteo-glofas";
      this.lastError = null;
      return data;
    } catch (e) {
      this.noterQuota(e);
      this.lastError = (e as Error).message;
      this.log.warn(`Open-Meteo Flood indisponible : ${this.lastError}`);
      return this.gaugesCache?.data ?? [];
    }
  }

  /**
   * Les seuils qui manquent ou datent, point par point, espacés : quatre ans
   * d'historique de la cellule de lit, les maxima annuels, le disque. Une
   * seule passe à la fois ; un « 429 » l'interrompt et remet à plus tard.
   * Rend la promesse pour que les tests l'attendent ; l'écran, lui, n'attend
   * pas — les jauges concernées disent « inconnu » jusque-là.
   */
  warmupThresholds(): Promise<void> {
    if (this.omWarmup) return this.omWarmup;
    const cells = this.omForecasts?.cells;
    if (!cells) return Promise.resolve();
    const aFaire = RIVER_POINTS.filter((p) => {
      const d = this.omThresholds[p.gaugeId];
      return !d || Date.now() - d.at > OM_THRESHOLDS_TTL_MS;
    });
    if (aFaire.length === 0) return Promise.resolve();
    this.omWarmup = (async () => {
      for (const [i, p] of aFaire.entries()) {
        if (Date.now() < this.omBackoffUntil) break;
        try {
          const ll = cells.get(p.gaugeId) ?? p.ll;
          const hist = parseOpenMeteoDaily(await this.fetcher(openMeteoHistoryUrl(ll)), 1)[0];
          this.omThresholds[p.gaugeId] = { at: Date.now(), th: thresholdsFromHistory(hist) };
          saveDevState("floods", { thresholds: this.omThresholds });
          // Les jauges déjà servies se relisent avec leurs seuils au prochain appel.
          this.gaugesCache = null;
        } catch (e) {
          this.noterQuota(e);
          this.log.warn(`seuils Open-Meteo indisponibles pour ${p.gaugeId} : ${(e as Error).message}`);
          if (Date.now() < this.omBackoffUntil) break;
        }
        if (i < aFaire.length - 1 && this.warmupGapMs > 0) await new Promise((r) => setTimeout(r, this.warmupGapMs));
      }
    })().finally(() => {
      this.omWarmup = null;
    });
    return this.omWarmup;
  }

  private async relire(): Promise<FloodGauge[]> {
    try {
      const statuts = await this.statuts();
      const ids = [...new Set(statuts.map((s) => s.gaugeId).filter((id): id is string => !!id))];
      const fiches = new Map<string, RawGauge>();
      for (const lot of lots(ids, BATCH)) {
        const q = lot.map((id) => `names=${encodeURIComponent(`gauges/${id}`)}`).join("&");
        const res = (await this.fetcher(`gauges:batchGet?${q}`)) as { gauges?: RawGauge[] };
        for (const g of res.gauges ?? []) if (g.gaugeId) fiches.set(g.gaugeId, g);
      }
      for (const lot of lots(ids, BATCH)) {
        // Un lot sans modèle (jauges non modélisées) ne doit pas faire tomber le tout.
        try {
          const q = lot.map((id) => `names=${encodeURIComponent(`gaugeModels/${id}`)}`).join("&");
          const res = (await this.fetcher(`gaugeModels:batchGet?${q}`)) as { gaugeModels?: RawModel[] };
          for (const m of res.gaugeModels ?? []) if (m.gaugeId) this.models.set(m.gaugeId, m);
        } catch (e) {
          this.log.warn(`modèles indisponibles pour un lot : ${(e as Error).message}`);
        }
      }
      const data = statuts
        .map((s) => normalizeGauge(s, s.gaugeId ? fiches.get(s.gaugeId) : undefined, s.gaugeId ? this.models.get(s.gaugeId) : undefined))
        .filter((g): g is FloodGauge => g !== null)
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.siteName.localeCompare(b.siteName, "fr"));
      this.gaugesCache = { at: Date.now(), data };
      this.gaugesProvider = "google-flood-hub";
      this.lastError = null;
      return data;
    } catch (e) {
      this.lastError = (e as Error).message;
      this.log.warn(`Flood Hub indisponible : ${this.lastError}`);
      return this.gaugesCache?.data ?? [];
    }
  }

  private async statuts(): Promise<RawStatus[]> {
    const out: RawStatus[] = [];
    let pageToken: string | undefined;
    // Quelques pages suffisent au pays ; on ne boucle jamais sans fin.
    for (let page = 0; page < 5; page++) {
      const res = (await this.fetcher("floodStatus:searchLatestFloodStatusByArea", {
        method: "POST",
        body: { regionCode: REGION, includeNonQualityVerified: true, pageSize: 2000, ...(pageToken ? { pageToken } : {}) },
      })) as { floodStatuses?: RawStatus[]; nextPageToken?: string };
      out.push(...(res.floodStatuses ?? []));
      pageToken = res.nextPageToken || undefined;
      if (!pageToken) break;
    }
    return out;
  }

  /** La dernière prévision émise pour une jauge, avec ses seuils. */
  async forecast(gaugeId: string): Promise<FloodForecast> {
    if (this.provider === "open-meteo-glofas") {
      if (!this.omForecasts || this.gaugesProvider !== "open-meteo-glofas") await this.gauges();
      const serie = this.omForecasts?.series.get(gaugeId);
      if (!serie || serie.values.length === 0) throw new NotFoundException(`Aucune prévision pour le point ${gaugeId}.`);
      const thresholds = this.omThresholds[gaugeId]?.th ?? null;
      return {
        gaugeId,
        issuedTime: new Date(this.omForecasts!.at).toISOString(),
        unit: "m3/s",
        thresholds,
        points: serie.time.flatMap((t, i) => (serie.values[i] === null ? [] : [{ start: t, end: t, value: serie.values[i] as number }])),
      };
    }
    const res = (await this.fetcher(`gauges:queryGaugeForecasts?gaugeIds=${encodeURIComponent(gaugeId)}`)) as {
      forecasts?: Record<string, { forecasts?: RawForecast[] }>;
    };
    const serie = res.forecasts?.[gaugeId]?.forecasts ?? [];
    const derniere = [...serie].sort((a, b) => (b.issuedTime ?? "").localeCompare(a.issuedTime ?? ""))[0];
    if (!derniere) throw new NotFoundException(`Aucune prévision pour la jauge ${gaugeId}.`);
    let model = this.models.get(gaugeId);
    if (!model) {
      try {
        model = (await this.fetcher(`gaugeModels/${encodeURIComponent(gaugeId)}`)) as RawModel;
        if (model?.gaugeId) this.models.set(gaugeId, model);
      } catch {
        model = undefined;
      }
    }
    const thresholds = thresholdsOf(model);
    return {
      gaugeId,
      issuedTime: derniere.issuedTime ?? "",
      unit: thresholds?.unit ?? unitOf(model?.gaugeValueUnit),
      thresholds,
      points: (derniere.forecastRanges ?? [])
        .filter((r): r is { value: number; forecastStartTime: string; forecastEndTime: string } => typeof r.value === "number" && !!r.forecastStartTime && !!r.forecastEndTime)
        .map((r) => ({ start: r.forecastStartTime, end: r.forecastEndTime, value: r.value })),
    };
  }

  /** Un polygone d'inondation de Flood Hub, converti en GeoJSON (cache 6 h : ces cartes changent peu). Open-Meteo n'en a pas. */
  async polygon(polygonId: string): Promise<FloodPolygon> {
    if (this.provider !== "google-flood-hub") throw new NotFoundException("Aucune carte d'inondation sans Google Flood Hub.");
    const hit = this.polygons.get(polygonId);
    if (hit && Date.now() - hit.at < POLYGON_TTL_MS) return hit.data;
    const res = (await this.fetcher(`serializedPolygons/${encodeURIComponent(polygonId)}`)) as { polygonId?: string; kml?: string };
    if (!res.kml) throw new NotFoundException(`Polygone inconnu : ${polygonId}`);
    const data = kmlToGeoJson(res.kml, polygonId);
    this.polygons.set(polygonId, { at: Date.now(), data });
    return data;
  }
}
