import { Injectable, NotFoundException } from "@nestjs/common";
import type { TrackerRegistry } from "@/modules/tracking/ports/tracker-registry.port";
import { TRAIL_MAX, type Tracker, type TrackerFix, type TrackerPatch } from "@/modules/tracking/tracking.types";

// ============================================================================
// ARGOS — adaptateur in-memory du port TrackerRegistry (lot N-2)
//
// Mode développement, sans Docker ni base. Une implémentation Drizzle/Postgres
// — avec les positions en hypertable TimescaleDB, ce qu'elles appellent — se
// substituera à celle-ci en changeant le seul `useClass` du module : le service
// applicatif n'en saura rien.
// ============================================================================

@Injectable()
export class InMemoryTrackerRepository implements TrackerRegistry {
  /**
   * Liste vide au démarrage. On ne pré-remplit pas une flotte fictive : un
   * traceur affiché est un moyen que l'état-major croit voir bouger, et une
   * démonstration ne doit jamais pouvoir se confondre avec la situation réelle.
   */
  private readonly trackers: Tracker[] = [];

  private clone(t: Tracker): Tracker {
    return { ...t, target: t.target ? { ...t.target } : null, last: t.last ? { ...t.last } : null, trail: [...t.trail] };
  }

  async list(): Promise<Tracker[]> {
    return this.trackers.map((t) => this.clone(t));
  }

  async findById(id: string): Promise<Tracker | null> {
    const found = this.trackers.find((t) => t.id === id);
    return found ? this.clone(found) : null;
  }

  async findByImei(imei: string): Promise<Tracker | null> {
    const found = this.trackers.find((t) => t.imei === imei);
    return found ? this.clone(found) : null;
  }

  async add(tracker: Tracker): Promise<Tracker> {
    this.trackers.push(this.clone(tracker));
    return this.clone(tracker);
  }

  async update(id: string, patch: TrackerPatch): Promise<Tracker> {
    const t = this.trackers.find((x) => x.id === id);
    if (!t) throw new NotFoundException(`Traceur inconnu : ${id}`);
    // `undefined` ne doit pas écraser une valeur existante : on n'applique que
    // les clés réellement fournies.
    if (patch.label !== undefined) t.label = patch.label;
    if (patch.target !== undefined) t.target = patch.target;
    if (patch.incidentId !== undefined) t.incidentId = patch.incidentId;
    if (patch.archived !== undefined) t.archived = patch.archived;
    return this.clone(t);
  }

  async remove(id: string): Promise<void> {
    const i = this.trackers.findIndex((t) => t.id === id);
    if (i < 0) throw new NotFoundException(`Traceur inconnu : ${id}`);
    this.trackers.splice(i, 1);
  }

  async appendFix(id: string, fix: TrackerFix): Promise<void> {
    const t = this.trackers.find((x) => x.id === id);
    if (!t) return;

    // La trace est ordonnée par l'horodatage DU BOÎTIER, pas par l'ordre
    // d'arrivée : un FMC920 mémorise hors couverture puis déverse son tampon,
    // et les enregistrements remontent alors dans le désordre. Insérer sans
    // trier dessinerait un itinéraire en zigzag entre passé et présent.
    const i = t.trail.findIndex((f) => f.at > fix.at);
    if (i < 0) t.trail.push({ ...fix });
    else t.trail.splice(i, 0, { ...fix });
    if (t.trail.length > TRAIL_MAX) t.trail.splice(0, t.trail.length - TRAIL_MAX);

    // La dernière position est la PLUS RÉCENTE dans le temps, pas la dernière
    // reçue : un déversement de tampon ne doit pas faire reculer le moyen.
    if (!t.last || fix.at >= t.last.at) t.last = { ...fix };
  }

  async touch(id: string, at: string): Promise<void> {
    const t = this.trackers.find((x) => x.id === id);
    if (t) t.lastSeenAt = at;
  }
}
