import { Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "@/config/configuration";

// ============================================================================
// ARGOS — courtier des crues (Google Flood Forecasting API, « Flood Hub »)
//
// Le navigateur ne parle JAMAIS à Google : l'API interroge Flood Hub côté
// serveur avec SA clé, normalise les jauges, statuts, prévisions et cartes
// d'inondation dans un contrat stable, et met en cache (15 min) — comme la
// sismologie (EMSC) et la météo (Open-Meteo), ADR 0002/0006. Sans clé, le flux
// est « indisponible » et l'écran le dit ; le simulateur d'inondation, lui,
// n'en dépend pas. Voir docs/adr/0010.
//
// Données CC BY 4.0 (Google) — l'attribution est portée à l'écran.
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

export interface FloodFeedStatus {
  configured: boolean;
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

/** Ce que le service demande au réseau — remplaçable dans les tests. */
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
const ATTRIBUTION = "Google Flood Hub — données CC BY 4.0";
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
  private readonly models = new Map<string, RawModel>();
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
  }

  private get key(): string {
    return this.config.get("floodApiKey", { infer: true }) ?? "";
  }

  /** L'appel réel : clé en paramètre, délai borné, échec NOMMÉ (statut HTTP). */
  private async fetchGoogle(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<unknown> {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${BASE}/${path}${sep}key=${encodeURIComponent(this.key)}`, {
      method: init?.method ?? "GET",
      headers: { Accept: "application/json", ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Flood Hub ${res.status}`);
    return res.json();
  }

  status(): FloodFeedStatus {
    return {
      configured: this.key !== "",
      source: "google-flood-hub",
      region: REGION,
      fetchedAt: this.gaugesCache ? new Date(this.gaugesCache.at).toISOString() : null,
      degraded: this.lastError !== null,
      error: this.lastError,
      attribution: ATTRIBUTION,
    };
  }

  /**
   * Les jauges du Maroc et leur dernier statut, par gravité décroissante.
   * Cache 15 min ; dégradation sur le dernier cache connu, sinon liste vide.
   * Sans clé : liste vide, et `status()` le dit.
   */
  async gauges(): Promise<FloodGauge[]> {
    if (!this.key) return [];
    if (this.gaugesCache && Date.now() - this.gaugesCache.at < TTL_MS) return this.gaugesCache.data;
    if (this.enCours) return this.enCours;
    this.enCours = this.relire().finally(() => {
      this.enCours = null;
    });
    return this.enCours;
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
    if (!this.key) throw new NotFoundException("Flux des crues indisponible : aucune clé configurée.");
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

  /** Un polygone d'inondation de Flood Hub, converti en GeoJSON (cache 6 h : ces cartes changent peu). */
  async polygon(polygonId: string): Promise<FloodPolygon> {
    if (!this.key) throw new NotFoundException("Flux des crues indisponible : aucune clé configurée.");
    const hit = this.polygons.get(polygonId);
    if (hit && Date.now() - hit.at < POLYGON_TTL_MS) return hit.data;
    const res = (await this.fetcher(`serializedPolygons/${encodeURIComponent(polygonId)}`)) as { polygonId?: string; kml?: string };
    if (!res.kml) throw new NotFoundException(`Polygone inconnu : ${polygonId}`);
    const data = kmlToGeoJson(res.kml, polygonId);
    this.polygons.set(polygonId, { at: Date.now(), data });
    return data;
  }
}
