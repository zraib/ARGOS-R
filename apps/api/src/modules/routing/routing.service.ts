import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { DomainService } from "@/modules/domain/domain.service";
import type { Drawing, Incident } from "@/modules/domain/domain.types";
import { NrbcService } from "@/modules/nrbc/nrbc.service";
import type { PlumeLevel } from "@/modules/nrbc/nrbc.types";
import { atp45Zones } from "@/modules/nrbc/plume/plume.engine";
import {
  bboxIntersects,
  bboxOf,
  circleRing,
  closeRing,
  corridorBox,
  haversineM,
  isLngLat,
  lengthInsideM,
  pathCrossesRings,
  pathM,
  pointInAny,
  pointInRing,
  pushOutward,
  ringCentroid,
  sampleRing,
  thinPoints,
  type LngLat,
} from "@/modules/routing/geo";
import { type EngineOptions, type EngineRoute, ROUTING_ENGINE, type RoutingEngine, RoutingEngineError } from "@/modules/routing/ports/routing-engine.port";
import type { PlanInput, RouteLeg, RoutePlan, RouteWarning, TravelMode } from "@/modules/routing/routing.types";

// ============================================================================
// ARGOS — le planificateur d'itinéraire sûr (ADR 0039)
//
// Un itinéraire routier qui CONTOURNE :
//   • les obstacles posés sur la carte (croquis marqués « obstacle ») — un point
//     retire la route sur laquelle il tombe (pont détruit, route coupée), une
//     surface retire toute route qui la traverse (zone inondée, zone interdite) ;
//   • les zones des panaches NRBC en cours — danger et protection (vigilance
//     sur demande), de TOUS les incidents chimiques actifs, qu'ils soient ou non
//     affichés : la sécurité d'un itinéraire ne dépend pas de l'écran.
//
// Trois situations propres au NRBC :
//   • départ DANS une zone : on en sort au plus vite — parmi des points de
//     sortie pris juste au-delà du bord, celui que la route atteint le plus tôt ;
//   • étape ou arrivée DANS une zone : remplacée par le point d'approche sûr le
//     plus proche d'elle — par construction, le côté du vent (le bord au vent
//     est le plus proche de la source, le panache s'étire sous le vent) ;
//   • trajet long : le panache dérive — les zones évitées couvrent toute la
//     durée du trajet (H+0 à H+n), pas seulement l'heure du départ.
//
// Et deux replis honnêtes : moteur injoignable → ligne droite, marquée comme
// telle ; aucun chemin sûr → le trajet le plus court, marqué NON SÛR. Jamais un
// itinéraire dangereux présenté comme sûr.
// ============================================================================

/** Une zone NRBC à éviter : son anneau, l'incident et le niveau dont elle vient. */
interface Zone {
  ring: LngLat[];
  incidentId: string;
  level: PlumeLevel;
}

/** Ce qu'une demande prend en compte, préparé une fois. */
interface Context {
  mode: TravelMode;
  /** Exclusions des obstacles seuls (la sortie d'une zone traverse la zone, pas les obstacles). */
  base: EngineOptions;
  obstacleCount: number;
  incidents: Incident[];
  /** Zones de l'heure en cours. */
  now: Zone[];
  nowRings: LngLat[][];
  /** Zones de l'heure en cours ET de la suivante : un point de sortie doit le rester. */
  soonRings: LngLat[][];
  /** Anneaux des zones sur les échéances données (dédoublonnés). */
  ringsFor: (hours: number[]) => Promise<LngLat[][]>;
}

/** Un calcul de panache au-delà de ce délai (prévision météo en difficulté) retombe sur le cercle de danger. */
const PLUME_TIMEOUT_MS = 6_000;
/** Échéance la plus lointaine du panache (H+6). */
const MAX_HOUR = 6;
/** Recherche des sorties : un point tous les 400 m du bord, 36 par zone au plus. */
const SAMPLE_STEP_M = 400;
const SAMPLES_PER_ZONE = 36;
/** Un point de sortie est pris à 250 m au-delà du bord. */
const OUTWARD_M = 250;
/** Au plus 48 candidats par recherche : une matrice de durées, une seule requête. */
const MAX_CANDIDATES = 48;
/** Une approche est choisie parmi les points à moins de 1,5 km du plus proche de l'étape. */
const APPROACH_SLACK_M = 1_500;

const round1 = (v: number) => Math.round(v * 10) / 10;

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly domain: DomainService,
    private readonly nrbc: NrbcService,
    @Inject(ROUTING_ENGINE) private readonly engine: RoutingEngine,
  ) {}

  async plan(input: PlanInput): Promise<RoutePlan> {
    const points = input.points;
    if (!Array.isArray(points) || points.length < 1 || points.length > 10 || !points.every(isLngLat)) {
      throw new BadRequestException("De 1 à 10 étapes [longitude, latitude].");
    }
    const warnings = new Set<RouteWarning>();
    const ctx = await this.context(input, points, warnings);
    try {
      return await this.planWith(points, ctx, warnings);
    } catch (e) {
      if (e instanceof RoutingEngineError && e.code === "unavailable") {
        this.logger.warn(e.message);
        warnings.add("engine_unavailable");
        return this.straight(points, ctx, warnings);
      }
      throw e;
    }
  }

  // --- préparation : obstacles et zones ----------------------------------------

  private async context(input: PlanInput, points: LngLat[], warnings: Set<RouteWarning>): Promise<Context> {
    const mode = input.mode ?? "auto";
    const obstacles = input.avoidObstacles === false ? [] : this.domain.listDrawings().filter((d) => !!d.obstacle);
    const excludePoints = obstacles.filter((d) => d.kind === "point" && isLngLat(d.coords[0])).map((d) => d.coords[0]);
    let surfaces = obstacles.map(obstacleRing).filter((r): r is LngLat[] => r !== null);
    // On ne contourne pas l'obstacle où l'on se trouve (ou que l'on vise) : le
    // moteur ne trouverait aucun chemin. Il est signalé, pas ignoré en silence.
    const contenant = surfaces.filter((r) => points.some((p) => pointInRing(p, r)));
    if (contenant.length > 0) {
      warnings.add("point_in_obstacle");
      surfaces = surfaces.filter((r) => !contenant.includes(r));
    }
    const base: EngineOptions = { mode, excludePoints, excludeRings: surfaces };

    const levels = new Set<PlumeLevel>(["danger", "protection", ...(input.nrbcVigilance ? (["vigilance"] as const) : [])]);
    const incidents =
      input.avoidNrbc === false
        ? []
        : this.domain.listIncidents().filter((i) => !i.archived && i.st !== "closed" && i.nrbc?.family === "C" && isLngLat(i.ll));
    const parHeure = new Map<number, Promise<Zone[]>>();
    const zonesAt = (h: number) => {
      let z = parHeure.get(h);
      if (!z) {
        z = this.zonesAt(incidents, h, levels, warnings);
        parHeure.set(h, z);
      }
      return z;
    };
    const now = incidents.length > 0 ? await zonesAt(0) : [];
    const next = incidents.length > 0 ? await zonesAt(1) : [];
    const ringsFor = async (hours: number[]) => {
      const vus = new Set<string>();
      const out: LngLat[][] = [];
      for (const h of hours) {
        for (const z of await zonesAt(h)) {
          const cle = JSON.stringify(z.ring);
          if (!vus.has(cle)) {
            vus.add(cle);
            out.push(z.ring);
          }
        }
      }
      return out;
    };
    return {
      mode,
      base,
      obstacleCount: excludePoints.length + surfaces.length,
      incidents,
      now,
      nowRings: now.map((z) => z.ring),
      soonRings: [...now, ...next].map((z) => z.ring),
      ringsFor,
    };
  }

  /**
   * Les zones à éviter de chaque incident chimique actif, à l'échéance donnée.
   * Un panache qui ne se calcule pas à temps (prévision météo injoignable) se
   * replie sur le cercle de danger ATP-45, sans direction : la prudence, jamais
   * le vide.
   */
  private async zonesAt(incidents: Incident[], hour: number, levels: Set<PlumeLevel>, warnings: Set<RouteWarning>): Promise<Zone[]> {
    const parIncident = await Promise.all(
      incidents.map(async (inc) => {
        try {
          const p = await withTimeout(this.nrbc.plume(inc.id, [], hour), PLUME_TIMEOUT_MS);
          if (!p.wind) warnings.add("wind_unknown");
          return p.zones.map((z) => ({ ring: closeRing(z.ring), incidentId: inc.id, level: z.level }));
        } catch (e) {
          this.logger.warn(`panache de ${inc.id} (H+${hour}) indisponible : ${(e as Error).message} — cercle de danger retenu`);
          warnings.add("wind_unknown");
          return atp45Zones(inc.ll, null, null).map((z) => ({ ring: closeRing(z.ring), incidentId: inc.id, level: z.level }));
        }
      }),
    );
    return parIncident.flat().filter((z) => levels.has(z.level) && z.ring.length >= 4);
  }

  // --- planification ----------------------------------------------------------

  private async planWith(points: LngLat[], ctx: Context, warnings: Set<RouteWarning>): Promise<RoutePlan> {
    const legs: RouteLeg[] = [];
    let exit: RoutePlan["exit"] = null;
    const approaches: RoutePlan["approaches"] = [];
    let depart = points[0];
    let safe = true;

    // A. Départ dans une zone : la sortie la plus rapide.
    if (pointInAny(depart, ctx.nowRings)) {
      warnings.add("origin_in_zone");
      const sortie = await this.exitFrom(depart, ctx);
      if (sortie) {
        legs.push(sortie.leg);
        exit = sortie.info;
        depart = sortie.info.point;
      } else {
        warnings.add("exit_not_found");
        safe = false;
      }
    } else if (points.length === 1) {
      warnings.add("not_in_zone");
    }
    if (points.length === 1) return this.assemble(ctx, legs, { safe, exit, approaches, reference: null, hours: [0], warnings });

    // B. Étapes et arrivée dans une zone : le point d'approche sûr.
    const suite: LngLat[] = [];
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (!pointInAny(p, ctx.nowRings)) {
        suite.push(p);
        continue;
      }
      warnings.add("point_in_zone");
      const approche = await this.approachTo(p, suite[suite.length - 1] ?? depart, ctx);
      if (approche) {
        approaches.push({ index: i, from: p, point: approche.point, incidentIds: approche.incidentIds });
        suite.push(approche.point);
      } else {
        safe = false;
        suite.push(p);
      }
    }

    // C. Le trajet qui contourne obstacles et zones.
    const chemin = [depart, ...suite];
    let principal: EngineRoute | null = null;
    let hours: number[] = [];
    if (safe) {
      try {
        ({ route: principal, hours } = await this.safeRoute(chemin, ctx));
      } catch (e) {
        if (!(e instanceof RoutingEngineError) || e.code === "unavailable") throw e;
        if (e.code === "limit") warnings.add("engine_limit");
        this.logger.warn(`aucun itinéraire sûr : ${e.message}`);
      }
    }
    if (!principal) {
      // Aucun chemin ne contourne tout : le plus court, SIGNALÉ comme non sûr.
      safe = false;
      warnings.add("no_safe_route");
      principal = await this.engine.route(chemin, { mode: ctx.mode, excludePoints: [], excludeRings: [] });
    }
    legs.push({ kind: "route", ...principal });

    // D. La référence sans contournement : elle mesure le détour imposé.
    let reference: RoutePlan["reference"] = null;
    if (safe && (ctx.obstacleCount > 0 || ctx.incidents.length > 0)) {
      const brut = await this.engine.route(points, { mode: ctx.mode, excludePoints: [], excludeRings: [] }).catch(() => null);
      const km = legs.reduce((s, l) => s + l.km, 0);
      const min = legs.reduce((s, l) => s + l.min, 0);
      if (brut && (Math.abs(brut.km - km) > Math.max(0.05, km * 0.005) || Math.abs(brut.min - min) >= 1)) {
        reference = { coords: brut.coords, km: round1(brut.km), min: Math.round(brut.min) };
      }
    }
    return this.assemble(ctx, legs, { safe, exit, approaches, reference, hours, warnings });
  }

  /**
   * Itinéraire hors obstacles et hors zones sur toute la durée du trajet.
   *
   * Exclure une surface coûte cher au moteur (~0,7 s par requête pour les zones
   * d'un panache sur Casablanca, même à 200 km du trajet). On calcule donc
   * d'abord le trajet qui n'évite que les points (quelques millisecondes) : s'il
   * ne touche aucune surface ni aucune zone des heures qu'il couvre, il est sûr
   * tel quel. Sinon on exclut — les zones de l'heure en cours et de la suivante,
   * puis celles de chaque heure du trajet (H+6 au plus). Si l'horizon long
   * ferme tous les chemins, on garde le précédent ; si H+0 et H+1 ensemble
   * ferment tout, on se contente de H+0.
   */
  private async safeRoute(chemin: LngLat[], ctx: Context): Promise<{ route: EngineRoute; hours: number[] }> {
    const zones = ctx.incidents.length > 0;
    const heures = (min: number) => (zones ? range(Math.min(MAX_HOUR, Math.max(1, Math.ceil(min / 60)))) : []);
    const rapide = await this.engine.route(chemin, { ...ctx.base, excludeRings: [] });
    const h = heures(rapide.min);
    if (!pathCrossesRings(rapide.coords, await this.ringsWith(ctx, h))) return { route: rapide, hours: h };

    let hours = zones ? [0, 1] : [];
    let route: EngineRoute;
    try {
      route = await this.avoiding(chemin, ctx, hours);
    } catch (e) {
      if (!zones || !(e instanceof RoutingEngineError) || e.code !== "no_path") throw e;
      hours = [0];
      route = await this.avoiding(chemin, ctx, hours);
    }
    const besoin = zones ? Math.min(MAX_HOUR, Math.ceil(route.min / 60)) : 0;
    if (hours.length === 2 && besoin > 1) {
      try {
        route = await this.avoiding(chemin, ctx, range(besoin));
        hours = range(besoin);
      } catch (e) {
        if (!(e instanceof RoutingEngineError) || e.code === "unavailable") throw e;
      }
    }
    return { route, hours };
  }

  /** Les surfaces d'obstacle et les zones des échéances données. */
  private async ringsWith(ctx: Context, hours: number[]): Promise<LngLat[][]> {
    return [...ctx.base.excludeRings, ...(await ctx.ringsFor(hours))];
  }

  /**
   * Itinéraire qui exclut les surfaces proches du trajet (son couloir) ; s'il en
   * touche une plus lointaine, on recommence en les excluant toutes.
   */
  private async avoiding(chemin: LngLat[], ctx: Context, hours: number[]): Promise<EngineRoute> {
    const toutes = await this.ringsWith(ctx, hours);
    const couloir = corridorBox(chemin);
    const proches = toutes.filter((r) => bboxIntersects(bboxOf(r), couloir));
    const route = await this.engine.route(chemin, { ...ctx.base, excludeRings: proches });
    if (proches.length < toutes.length && pathCrossesRings(route.coords, toutes)) {
      return this.engine.route(chemin, { ...ctx.base, excludeRings: toutes });
    }
    return route;
  }

  /** Des points juste au-delà du bord des zones, hors des zones de l'heure et de la suivante, calés sur la route. */
  private async candidates(zones: Zone[], near: LngLat, ctx: Context): Promise<LngLat[]> {
    const bruts: LngLat[] = [];
    for (const z of zones) {
      const centre = ringCentroid(z.ring);
      for (const p of sampleRing(z.ring, SAMPLE_STEP_M, SAMPLES_PER_ZONE)) bruts.push(pushOutward(p, centre, OUTWARD_M));
    }
    // Hors des zones de maintenant ET de l'heure suivante ; à défaut, de maintenant.
    let dehors = bruts.filter((p) => !pointInAny(p, ctx.soonRings));
    const garde = dehors.length > 0 ? ctx.soonRings : ctx.nowRings;
    if (dehors.length === 0) dehors = bruts.filter((p) => !pointInAny(p, ctx.nowRings));
    const proches = thinPoints(dehors, 200)
      .sort((a, b) => haversineM(near, a) - haversineM(near, b))
      .slice(0, MAX_CANDIDATES);
    const cales = await this.engine.snap(proches, ctx.mode);
    return thinPoints(
      cales.filter((p): p is LngLat => p !== null && !pointInAny(p, garde)),
      50,
    );
  }

  /** Sortir d'une zone au plus vite : le point de sortie que la route atteint le plus tôt. */
  private async exitFrom(origin: LngLat, ctx: Context): Promise<{ leg: RouteLeg; info: NonNullable<RoutePlan["exit"]> } | null> {
    const cibles = await this.candidates(ctx.now, origin, ctx);
    if (cibles.length === 0) return null;
    // La sortie traverse forcément la zone : seuls les obstacles restent exclus.
    const temps = await this.engine.matrix(origin, cibles, ctx.base);
    const best = argmin(temps);
    if (best < 0) return null;
    const route = await this.engine.route([origin, cibles[best]], ctx.base);
    const insideKm = lengthInsideM(route.coords, ctx.nowRings) / 1000;
    const incidentIds = [...new Set(ctx.now.filter((z) => pointInRing(origin, z.ring)).map((z) => z.incidentId))];
    return {
      leg: { kind: "exit", ...route },
      info: {
        point: cibles[best],
        insideKm: round1(insideKm),
        insideMin: route.km > 0 ? Math.round((route.min * Math.min(insideKm, route.km)) / route.km) : 0,
        incidentIds,
      },
    };
  }

  /**
   * Le point d'approche sûr d'une étape prise dans une zone : parmi les points
   * hors zone les plus proches d'elle, celui qu'on atteint le plus tôt en
   * contournant tout.
   */
  private async approachTo(p: LngLat, from: LngLat, ctx: Context): Promise<{ point: LngLat; incidentIds: string[] } | null> {
    const dedans = ctx.now.filter((z) => pointInRing(p, z.ring));
    const cibles = await this.candidates(dedans, p, ctx);
    if (cibles.length === 0) return null;
    const dmin = Math.min(...cibles.map((c) => haversineM(p, c)));
    const retenues = cibles.filter((c) => haversineM(p, c) <= dmin + APPROACH_SLACK_M);
    const couloir = corridorBox([from, ...retenues]);
    const exclues = [...ctx.base.excludeRings, ...ctx.soonRings].filter((r) => bboxIntersects(bboxOf(r), couloir));
    const temps = await this.engine.matrix(from, retenues, { ...ctx.base, excludeRings: exclues });
    const best = argmin(temps);
    // Rien d'atteignable en contournant : le plus proche, le trajet dira s'il est sûr.
    const point = best >= 0 ? retenues[best] : retenues.sort((a, b) => haversineM(p, a) - haversineM(p, b))[0];
    return { point, incidentIds: [...new Set(dedans.map((z) => z.incidentId))] };
  }

  // --- mise en forme -------------------------------------------------------------

  private assemble(
    ctx: Context,
    legs: RouteLeg[],
    o: { safe: boolean; exit: RoutePlan["exit"]; approaches: RoutePlan["approaches"]; reference: RoutePlan["reference"]; hours: number[]; warnings: Set<RouteWarning> },
  ): RoutePlan {
    const rounded = legs.map((l) => ({ ...l, km: round1(l.km), min: Math.round(l.min) }));
    const zoneIncidents = [...new Set(ctx.now.map((z) => z.incidentId))];
    return {
      engine: this.engine.name,
      road: true,
      safe: o.safe,
      mode: ctx.mode,
      legs: rounded,
      km: round1(legs.reduce((s, l) => s + l.km, 0)),
      min: Math.round(legs.reduce((s, l) => s + l.min, 0)),
      reference: o.reference,
      exit: o.exit,
      approaches: o.approaches,
      avoided: { obstacles: ctx.obstacleCount, zones: ctx.now.length, incidentIds: zoneIncidents, hours: ctx.incidents.length > 0 ? o.hours : [] },
      warnings: [...o.warnings],
    };
  }

  /** Moteur injoignable : la ligne droite, qui ne contourne rien — et le dit. */
  private straight(points: LngLat[], ctx: Context, warnings: Set<RouteWarning>): RoutePlan {
    if (pointInAny(points[0], ctx.nowRings)) warnings.add("origin_in_zone");
    if (points.slice(1).some((p) => pointInAny(p, ctx.nowRings))) warnings.add("point_in_zone");
    const km = pathM(points) / 1000;
    return {
      engine: "direct",
      road: false,
      safe: ctx.obstacleCount === 0 && ctx.now.length === 0,
      mode: ctx.mode,
      legs: points.length > 1 ? [{ kind: "route", coords: points, km: round1(km), min: 0 }] : [],
      km: round1(km),
      min: null,
      reference: null,
      exit: null,
      approaches: [],
      avoided: { obstacles: ctx.obstacleCount, zones: ctx.now.length, incidentIds: [...new Set(ctx.now.map((z) => z.incidentId))], hours: [] },
      warnings: [...warnings],
    };
  }
}

/** L'anneau à éviter d'un obstacle de surface (cercle ou polygone) ; null pour un point. */
function obstacleRing(d: Drawing): LngLat[] | null {
  if (d.kind === "circle" && isLngLat(d.coords[0]) && d.radiusM && d.radiusM > 0) return circleRing(d.coords[0], d.radiusM, 32);
  if (d.kind === "polygon" && d.coords.length >= 3 && d.coords.every(isLngLat)) return closeRing(d.coords);
  return null;
}

/** Les heures 0 … n. */
function range(n: number): number[] {
  return Array.from({ length: n + 1 }, (_, h) => h);
}

/** Index de la plus petite valeur définie, -1 s'il n'y en a aucune. */
function argmin(values: (number | null)[]): number {
  let best = -1;
  values.forEach((v, i) => {
    if (v !== null && (best < 0 || v < (values[best] as number))) best = i;
  });
  return best;
}

/** Une promesse bornée dans le temps. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`délai de ${ms} ms dépassé`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
