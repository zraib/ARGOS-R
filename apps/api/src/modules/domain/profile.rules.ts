// ============================================================================
// ARGOS — élagage du jeu de démonstration (profil de données, ADR 0015)
//
// Fichier PUR : aucune dépendance à NestJS ni à la persistance. Il répond à
// une seule question : étant donné les collections du domaine et ce qu'on
// veut retirer, que reste-t-il — et qu'emporte-t-on avec ?
//
// Trois usages, une seule règle :
//   - profil « empty » à la reprise : retirer TOUTES les graines de
//     démonstration (par identifiant et par marqueur `seeded`) et les
//     orphelins qu'elles laissent ;
//   - profil « demo » : retirer les seules graines explicitement supprimées
//     (pierres tombales), pour qu'une suppression survive au redémarrage ;
//   - purge signée du superadmin : tout retirer, sauf le réseau hospitalier.
//
// Ce qui reste TOUJOURS : les hôpitaux et leurs services (référentiel, même si
// leurs capacités civiles sont des estimations), les comptes (autre module),
// la base (audit, drapeaux, bons de travail).
// ============================================================================

import type { FeedItem, FieldHospital, Hospital, HospitalWard, Incident, IncidentPost, IncidentVictim, MorgueSite, MortuaryRecord, Shelter, Unit } from "@/modules/domain/domain.types";
import type { EquipItem } from "@/modules/domain/catalog.data";

export interface DomainCollections {
  incidents: Incident[];
  units: Unit[];
  hospitals: Hospital[];
  fieldHospitals: FieldHospital[];
  wards: HospitalWard[];
  shelters: Shelter[];
  morgues: MorgueSite[];
  mortuaryRecords: MortuaryRecord[];
  victims: IncidentVictim[];
  equipment: EquipItem[];
  feed: FeedItem[];
  posts: IncidentPost[];
}

export interface PruneOptions {
  /** Identifiants à retirer (graines du profil, pierres tombales). */
  ids: ReadonlySet<string>;
  /** Retirer aussi tout incident ou unité marqué `seeded`, quel que soit son identifiant (profil « empty »). */
  seeded?: boolean;
  /**
   * Retirer les hôpitaux de campagne de démonstration — ceux qu'aucun opérateur
   * n'a déployés (profil « empty ») ; un détachement déployé depuis la carte
   * (ADR 0030) reste. La purge (`all`) les retire tous.
   */
  fieldHospitals?: boolean;
  /** Retirer les lignes du fil qui ne parlent d'aucun incident (les graines du fil, profil « empty »). */
  orphanFeed?: boolean;
  /** Tout retirer sauf les hôpitaux et leurs services (purge). */
  all?: boolean;
}

export interface PruneResult {
  next: DomainCollections;
  /** Incidents retirés — leurs cascades (missions, déploiements) restent à courir. */
  removedIncidentIds: string[];
  /** Ce qui a été retiré, par collection, pour le compte rendu. */
  counts: Record<keyof DomainCollections, number>;
  total: number;
}

/**
 * Retire de `c` ce que `opt` désigne, puis ce qui n'existe que par ce qui a
 * été retiré : les dossiers d'un site disparu ou d'un incident retiré, les
 * victimes d'un incident retiré, le parc d'une unité retirée, les postes
 * d'une opération ou d'une entité retirée, les lignes du fil qui parlent d'un
 * incident retiré.
 */
export function pruneDemo(c: DomainCollections, opt: PruneOptions): PruneResult {
  const all = opt.all === true;
  const gone = (id: string, seeded?: boolean): boolean => all || opt.ids.has(id) || (opt.seeded === true && seeded === true);

  const goneIncidents = new Set(c.incidents.filter((i) => gone(i.id, i.seeded)).map((i) => i.id));
  const units = c.units.filter((u) => !gone(u.id, u.seeded));
  const unitIds = new Set(units.map((u) => u.id));
  // Les affectations d'une unité partie (ADR 0016) partent avec elle.
  const incidents = c.incidents
    .filter((i) => !gone(i.id, i.seeded))
    .map((i) => (i.assignments?.some((a) => !unitIds.has(a.unitId)) ? { ...i, assignments: i.assignments.filter((a) => unitIds.has(a.unitId)) } : i));
  const shelters = c.shelters.filter((s) => !gone(s.id));
  const shelterIds = new Set(shelters.map((s) => s.id));
  const morgues = c.morgues.filter((m) => !gone(m.id));
  const morgueIds = new Set(morgues.map((m) => m.id));
  const fieldHospitals = c.fieldHospitals.filter((f) => !gone(f.id) && !(opt.fieldHospitals && !f.deployedBy));
  // Un dossier sans site, ou dont l'incident est parti, est un orphelin : la
  // référence n'a plus de registre pour la porter.
  const mortuaryRecords = c.mortuaryRecords.filter(
    (r) => !gone(r.id) && morgueIds.has(r.mid) && !(r.incidentId && goneIncidents.has(r.incidentId)),
  );
  const victims = all ? [] : c.victims.filter((v) => !goneIncidents.has(v.incidentId));
  const equipment = c.equipment.filter((e) => {
    if (gone(e.id)) return false;
    if (e.ownerKind === "hospital") return true; // le réseau hospitalier reste
    if (e.ownerKind === "shelter") return shelterIds.has(e.unitId);
    return !e.unitId || unitIds.has(e.unitId);
  });
  const feed = all
    ? []
    : c.feed.filter((f) => (f.incidentId ? !goneIncidents.has(f.incidentId) : opt.orphanFeed !== true));
  const posts = c.posts.filter((p) => {
    if (all || goneIncidents.has(p.incidentId)) return false;
    if (p.kind === "shelter" && p.entityId && !shelterIds.has(p.entityId)) return false;
    if (p.kind === "equipment" && p.entityId && !unitIds.has(p.entityId)) return false;
    return true;
  });

  const next: DomainCollections = {
    incidents,
    units,
    hospitals: c.hospitals,
    fieldHospitals,
    wards: c.wards,
    shelters,
    morgues,
    mortuaryRecords,
    victims,
    equipment,
    feed,
    posts,
  };
  const counts = Object.fromEntries(
    (Object.keys(next) as (keyof DomainCollections)[]).map((k) => [k, c[k].length - next[k].length]),
  ) as Record<keyof DomainCollections, number>;
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  return { next, removedIncidentIds: [...goneIncidents], counts, total };
}
