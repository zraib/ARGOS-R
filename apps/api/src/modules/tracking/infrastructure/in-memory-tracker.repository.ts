import { Injectable, NotFoundException } from "@nestjs/common";
import { loadDevState, saveDevState } from "@/common/dev-store";
import type { TrackerRegistry } from "@/modules/tracking/ports/tracker-registry.port";
import { TRAIL_MAX, type Tracker, type TrackerFix, type TrackerPatch } from "@/modules/tracking/tracking.types";

// ============================================================================
// ARGOS — adaptateur in-memory du port TrackerRegistry (lot N-2)
//
// Mode développement, sans Docker ni base. Une implémentation Drizzle/Postgres
// — avec les positions en hypertable TimescaleDB, ce qu'elles appellent — se
// substituera à celle-ci en changeant le seul `useClass` du module : le service
// applicatif n'en saura rien.
//
// Le registre survit aux redémarrages par l'instantané JSON commun
// (`common/dev-store`, `tracking.json`, écriture regroupée par l'utilitaire) :
// sur la station, un boîtier déclaré ou un partage de position ne disparaît
// pas avec un redémarrage de l'API.
// ============================================================================

@Injectable()
export class InMemoryTrackerRepository implements TrackerRegistry {
  /**
   * Liste vide au premier démarrage. On ne pré-remplit pas une flotte
   * fictive : un traceur affiché est un moyen que l'état-major croit voir
   * bouger, et une démonstration ne doit jamais pouvoir se confondre avec la
   * situation réelle. Les traceurs d'un instantané antérieur reviennent,
   * complétés de ce que les versions suivantes ont ajouté (`source`).
   */
  private readonly trackers: Tracker[] = loadDevState<{ trackers?: Tracker[] }>("tracking", {}).trackers?.map((t) => ({
    ...t,
    source: t.source ?? (t.imei.startsWith("app:") ? "app" : "device"),
    trail: Array.isArray(t.trail) ? t.trail : [],
  })) ?? [];

  private persist(): void {
    saveDevState("tracking", { trackers: this.trackers });
  }

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
    this.persist();
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
    this.persist();
    return this.clone(t);
  }

  async remove(id: string): Promise<void> {
    const i = this.trackers.findIndex((t) => t.id === id);
    if (i < 0) throw new NotFoundException(`Traceur inconnu : ${id}`);
    this.trackers.splice(i, 1);
    this.persist();
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
    this.persist();
  }

  async touch(id: string, at: string): Promise<void> {
    const t = this.trackers.find((x) => x.id === id);
    if (t) {
      t.lastSeenAt = at;
      this.persist();
    }
  }
}
