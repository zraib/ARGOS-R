import { BadRequestException } from "@nestjs/common";
import type { DomainService } from "@/modules/domain/domain.service";
import type { Drawing, Incident } from "@/modules/domain/domain.types";
import type { NrbcService } from "@/modules/nrbc/nrbc.service";
import type { PlumeResult } from "@/modules/nrbc/nrbc.types";
import { haversineM, pathCrossesRings, pathM, pointInAny, type LngLat } from "@/modules/routing/geo";
import { type EngineOptions, type EngineRoute, type RoutingEngine, RoutingEngineError } from "@/modules/routing/ports/routing-engine.port";
import { RoutingService } from "@/modules/routing/routing.service";

// ============================================================================
// Planificateur d'itinéraire sûr (ADR 0039)
//
// Ce que ces tests verrouillent : un obstacle ou une zone NRBC traversés sont
// contournés ; un départ dans une zone commence par en sortir ; une arrivée
// dans une zone devient un point d'approche sûr ; un panache incalculable se
// replie sur le cercle de danger ; et jamais un trajet dangereux n'est rendu
// comme sûr — moteur injoignable ou aucun chemin, la réponse le dit.
// ============================================================================

const INC: LngLat = [-7.6, 33.57];
/** La zone de danger du panache de test : un carré de ~2 km autour de l'incident. */
const ZONE: LngLat[] = [[-7.61, 33.56], [-7.59, 33.56], [-7.59, 33.58], [-7.61, 33.58], [-7.61, 33.56]];
const OUEST: LngLat = [-7.7, 33.57];
const EST: LngLat = [-7.5, 33.57];
/** Le détour que le faux moteur prend quand la ligne droite est exclue : par le nord. */
const NORD: LngLat = [-7.6, 33.62];

/** Un faux moteur : ligne droite, ou détour par le nord si elle traverse une exclusion. */
class FakeEngine implements RoutingEngine {
  readonly name = "fake";
  calls: { action: string; points: LngLat[]; opts: EngineOptions }[] = [];
  unavailable = false;
  detour: LngLat | null = NORD;

  async route(points: LngLat[], opts: EngineOptions): Promise<EngineRoute> {
    this.calls.push({ action: "route", points, opts });
    if (this.unavailable) throw new RoutingEngineError("unavailable", "arrêté");
    if (points.some((p) => pointInAny(p, opts.excludeRings))) throw new RoutingEngineError("no_path", "point exclu");
    let path = [...points];
    if (pathCrossesRings(path, opts.excludeRings)) {
      if (!this.detour) throw new RoutingEngineError("no_path", "aucun chemin");
      path = [points[0], this.detour, ...points.slice(1)];
      if (pathCrossesRings(path, opts.excludeRings)) throw new RoutingEngineError("no_path", "aucun chemin");
    }
    const km = pathM(path) / 1000;
    return { coords: path, km, min: km };
  }

  async matrix(source: LngLat, targets: LngLat[], opts: EngineOptions): Promise<(number | null)[]> {
    this.calls.push({ action: "matrix", points: [source, ...targets], opts });
    if (this.unavailable) throw new RoutingEngineError("unavailable", "arrêté");
    return targets.map((t) => (pathCrossesRings([source, t], opts.excludeRings) ? null : haversineM(source, t)));
  }

  async snap(points: LngLat[]): Promise<(LngLat | null)[]> {
    if (this.unavailable) throw new RoutingEngineError("unavailable", "arrêté");
    return points;
  }
}

function incident(over: Partial<Incident> = {}): Incident {
  return { id: "INC-1", ll: INC, archived: false, st: "open", nrbc: { family: "C" }, ...over } as unknown as Incident;
}

function drawing(over: Partial<Drawing>): Drawing {
  return {
    id: "D1",
    kind: "point",
    label: "obstacle",
    coords: [[-7.55, 33.57]],
    createdBy: "m.zraib",
    createdAt: "2026-09-27T10:00:00.000Z",
    updatedBy: "m.zraib",
    updatedAt: "2026-09-27T10:00:00.000Z",
    ...over,
  };
}

function build(o: { incidents?: Incident[]; drawings?: Drawing[]; plume?: (id: string, hour: number) => Promise<PlumeResult> } = {}) {
  const engine = new FakeEngine();
  const domain = { listDrawings: () => o.drawings ?? [], listIncidents: () => o.incidents ?? [] } as unknown as DomainService;
  const plume =
    o.plume ??
    (async (id: string, hour: number) =>
      ({ incidentId: id, hour, wind: { speedKmh: 12, fromDeg: 221, time: "", isDay: true }, zones: [{ model: "atp45", level: "danger", kind: "square", ring: ZONE }] }) as unknown as PlumeResult);
  const nrbc = { plume: (id: string, _models: string[], hour: number) => plume(id, hour) } as unknown as NrbcService;
  return { engine, service: new RoutingService(domain, nrbc, engine) };
}

describe("planificateur d'itinéraire sûr", () => {
  it("sans obstacle ni zone : l'itinéraire du moteur, un seul appel", async () => {
    const { engine, service } = build();
    const plan = await service.plan({ points: [OUEST, EST] });
    expect(plan).toMatchObject({ engine: "fake", road: true, safe: true, reference: null, warnings: [] });
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0].coords).toEqual([OUEST, EST]);
    expect(engine.calls.filter((c) => c.action === "route")).toHaveLength(1);
  });

  it("refuse une demande sans étape valide", async () => {
    const { service } = build();
    await expect(service.plan({ points: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.plan({ points: [[500, 0] as LngLat, EST] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.plan({ points: Array.from({ length: 11 }, () => OUEST) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("un obstacle ponctuel est transmis au moteur comme route à retirer", async () => {
    const { engine, service } = build({ drawings: [drawing({ obstacle: "bridge" }), drawing({ id: "D2", obstacle: undefined, coords: [[-7.4, 33.5]] })] });
    const plan = await service.plan({ points: [OUEST, EST] });
    expect(engine.calls[0].opts.excludePoints).toEqual([[-7.55, 33.57]]);
    expect(plan.avoided.obstacles).toBe(1);
    // Contournement désactivé : plus rien d'exclu.
    engine.calls = [];
    await service.plan({ points: [OUEST, EST], avoidObstacles: false });
    expect(engine.calls[0].opts.excludePoints).toEqual([]);
  });

  it("une surface d'obstacle traversée est contournée, et le détour se mesure", async () => {
    const { service } = build({ drawings: [drawing({ kind: "polygon", coords: ZONE.slice(0, 4), obstacle: "flooded" })] });
    const plan = await service.plan({ points: [OUEST, EST] });
    expect(plan.safe).toBe(true);
    expect(plan.legs[0].coords).toEqual([OUEST, NORD, EST]);
    expect(plan.reference).not.toBeNull();
    expect(plan.reference!.km).toBeLessThan(plan.km);
  });

  it("une zone NRBC traversée est contournée sur l'heure en cours et la suivante", async () => {
    const heures: number[] = [];
    const { service } = build({
      incidents: [incident()],
      plume: async (id, hour) => {
        heures.push(hour);
        return { incidentId: id, hour, wind: { speedKmh: 12, fromDeg: 221 }, zones: [{ level: "danger", ring: ZONE }] } as unknown as PlumeResult;
      },
    });
    const plan = await service.plan({ points: [OUEST, EST] });
    expect(plan.safe).toBe(true);
    expect(plan.legs[0].coords).toEqual([OUEST, NORD, EST]);
    expect(plan.avoided).toMatchObject({ zones: 1, incidentIds: ["INC-1"] });
    expect(plan.avoided.hours).toEqual(expect.arrayContaining([0, 1]));
    expect(new Set(heures)).toEqual(new Set(plan.avoided.hours));
  });

  it("un incident clos, archivé ou non chimique n'impose rien", async () => {
    const { service } = build({ incidents: [incident({ st: "closed" }), incident({ archived: true }), incident({ nrbc: { family: "B" } as Incident["nrbc"] })] });
    const plan = await service.plan({ points: [OUEST, EST] });
    expect(plan.legs[0].coords).toEqual([OUEST, EST]);
    expect(plan.avoided.zones).toBe(0);
  });

  it("départ dans la zone : on en sort au plus vite, puis on contourne", async () => {
    const { service } = build({ incidents: [incident()] });
    const plan = await service.plan({ points: [INC, OUEST] });
    expect(plan.warnings).toContain("origin_in_zone");
    expect(plan.legs.map((l) => l.kind)).toEqual(["exit", "route"]);
    expect(plan.exit).not.toBeNull();
    expect(pointInAny(plan.exit!.point, [ZONE])).toBe(false);
    expect(plan.exit!.incidentIds).toEqual(["INC-1"]);
    expect(plan.exit!.insideKm).toBeGreaterThan(0);
    // La sortie commence au départ et finit où le trajet reprend.
    expect(plan.legs[0].coords[0]).toEqual(INC);
    expect(plan.legs[1].coords[0]).toEqual(plan.exit!.point);
  });

  it("un seul point : la sortie seule — ou rien à quitter", async () => {
    const { service } = build({ incidents: [incident()] });
    const sortie = await service.plan({ points: [INC] });
    expect(sortie.legs.map((l) => l.kind)).toEqual(["exit"]);
    const dehors = await service.plan({ points: [OUEST] });
    expect(dehors.legs).toEqual([]);
    expect(dehors.warnings).toContain("not_in_zone");
  });

  it("arrivée dans la zone : remplacée par le point d'approche sûr le plus proche", async () => {
    const { service } = build({ incidents: [incident()] });
    const plan = await service.plan({ points: [OUEST, INC] });
    expect(plan.warnings).toContain("point_in_zone");
    expect(plan.approaches).toHaveLength(1);
    expect(plan.approaches[0]).toMatchObject({ index: 1, from: INC, incidentIds: ["INC-1"] });
    const p = plan.approaches[0].point;
    expect(pointInAny(p, [ZONE])).toBe(false);
    // Au bord, pas à l'autre bout de la carte.
    expect(haversineM(p, INC)).toBeLessThan(3_000);
    expect(plan.safe).toBe(true);
    expect(plan.legs[plan.legs.length - 1].coords.at(-1)).toEqual(p);
  });

  it("aucun chemin sûr : le plus court, signalé NON SÛR", async () => {
    const { engine, service } = build({ incidents: [incident()] });
    engine.detour = null;
    const plan = await service.plan({ points: [OUEST, EST] });
    expect(plan.safe).toBe(false);
    expect(plan.warnings).toContain("no_safe_route");
    expect(plan.legs[0].coords).toEqual([OUEST, EST]);
  });

  it("moteur injoignable : ligne droite, qui ne prétend rien contourner", async () => {
    const { engine, service } = build({ incidents: [incident()] });
    engine.unavailable = true;
    const plan = await service.plan({ points: [OUEST, EST] });
    expect(plan).toMatchObject({ engine: "direct", road: false, safe: false, min: null });
    expect(plan.warnings).toContain("engine_unavailable");
    expect(plan.legs[0].coords).toEqual([OUEST, EST]);
  });

  it("panache incalculable : le cercle de danger, vent inconnu", async () => {
    const { service } = build({
      incidents: [incident()],
      plume: async () => {
        throw new Error("Open-Meteo injoignable");
      },
    });
    // À 1 km de l'incident : dans le cercle de danger ATP-45 (2 km).
    const plan = await service.plan({ points: [[-7.6, 33.579]] });
    expect(plan.warnings).toEqual(expect.arrayContaining(["wind_unknown", "origin_in_zone"]));
    expect(plan.legs.map((l) => l.kind)).toEqual(["exit"]);
  });

  it("une étape dans une surface d'obstacle : cette surface n'est pas contournée, et c'est dit", async () => {
    const { engine, service } = build({ drawings: [drawing({ kind: "circle", coords: [OUEST], radiusM: 500, obstacle: "forbidden" })] });
    const plan = await service.plan({ points: [OUEST, EST] });
    expect(plan.warnings).toContain("point_in_obstacle");
    expect(engine.calls[0].opts.excludeRings).toEqual([]);
    expect(plan.safe).toBe(true);
  });
});
