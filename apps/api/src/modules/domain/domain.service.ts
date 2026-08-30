import { Injectable } from "@nestjs/common";
import { PROVINCES_MA, llToSvg } from "@/modules/domain/provinces.data";
import { CITIES_MA } from "@/modules/domain/cities.data";
import { EQUIPMENT, ORSEC_BOARD, ROSTER, SHELTERS, TRIAGE_ZONES, type EquipItem } from "@/modules/domain/catalog.data";
import { HOSPITALS_MA, type HospitalKind } from "@/modules/domain/hospitals.data";
import { checkRecordUpdate } from "@/modules/domain/dvi.rules";
import { loadDevState, saveDevState } from "@/common/dev-store";
import type { NrbcDetails } from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — données de domaine (Phase 2, in-memory)
// Source de vérité serveur pour les entités opérationnelles consommées par le
// frontend (incidents, unités, hôpitaux, fil d'événements). En production :
// PostgreSQL + PostGIS. Les formes correspondent aux types du frontend.
// ============================================================================

export interface Incident {
  id: string;
  /** Type d'incident : identifiant du catalogue paramétrable (IncidentTypesService). */
  type: string;
  titre: string;
  region: string;
  /** Adresse / lieu-dit saisi à la déclaration (optionnel). */
  adresse?: string;
  sev: "high" | "medium" | "low";
  st: "open" | "prog" | "closed";
  time: string;
  x: number;
  y: number;
  ll: [number, number];
  /** Bilan humain saisi à la déclaration (optionnel). */
  casualties?: { dead: number; injured: number; missing: number };
  /** Premiers intervenants rattachés : identifiants d'unités / d'hôpitaux. */
  responders?: { units: string[]; hospitals: string[] };
  /** Sous-incidents (aléas secondaires rattachés après la déclaration). */
  subIncidents?: SubIncident[];
  /** Volet NRBC (famille, substance, ampleur) — incidents de type `nrbc`. */
  nrbc?: NrbcDetails;
  /** Incident archivé (masqué de la liste active). */
  archived?: boolean;
}

/** Aléa secondaire rattaché à un incident principal (mêmes détails qu'un incident). */
export interface SubIncident {
  id: string;
  /** Identifiant d'un sous-type (SubIncidentTypesService). */
  type: string;
  sev: "high" | "medium" | "low";
  note?: string;
  time: string;
  /** Localisation propre du sous-incident [lng, lat] (optionnel). */
  ll?: [number, number];
  /** Bilan humain propre au sous-incident (optionnel). */
  casualties?: { dead: number; injured: number; missing: number };
  /** Intervenants rattachés au sous-incident (IDs d'unités / d'hôpitaux). */
  responders?: { units: string[]; hospitals: string[] };
}

export interface Unit {
  id: string;
  nom: string;
  ville: string;
  cmdt: string;
  eff: number;
  dispo: "ready" | "deployed" | "standby";
  readiness: number;
  x: number;
  y: number;
  ll: [number, number];
}

export interface Hospital {
  id: string;
  nom: string;
  ville: string;
  /** Région administrative de rattachement. */
  region?: string;
  /** Province / préfecture de rattachement. */
  province?: string;
  /**
   * Réseau et échelon de l'établissement — pilote le symbole cartographique.
   * Absent sur les données créées avant l'introduction du champ : le frontend
   * retombe alors sur « civil » (voir lib/hospitals.ts, hospKind).
   */
  kind?: HospitalKind;
  /** Nature de la structure (CHU militaire, hôpital général, régional…). */
  type?: string;
  lits: number;
  occ: number;
  rea: number;
  reaOcc: number;
  staff: number;
  amb: number;
  heli: number;
  x: number;
  y: number;
  ll: [number, number];
}

export interface FieldHospital {
  hid: string;
  nom: string;
  cap: number;
  occ: number;
  statut: "op" | "partial";
  depuis: string;
  /** Réseau de rattachement : campagne militaire ou campagne civile. */
  kind?: "mil_field" | "civ_field";
}

/**
 * Service de soins d'un établissement (réanimation, chirurgie, urgences…).
 * Piloté par le responsable de SON hôpital — le cantonnement est appliqué par
 * le `ScopeGuard`, ce service ne connaît pas la notion de responsable.
 * Identifiant anglais `Ward` pour ne pas confondre avec les « services » NestJS.
 */
export interface HospitalWard {
  id: string;
  /** Hôpital de rattachement. */
  hid: string;
  nom: string;
  lits: number;
  occ: number;
  statut: "open" | "saturated" | "closed";
  /** Médecin-chef du service. */
  chef?: string;
}

/**
 * Abri d'hébergement, piloté par son responsable. Repris du catalogue statique
 * (`catalog.data.ts`) mais désormais MUTABLE : c'est `DomainService` qui fait
 * autorité, et `CatalogService` sert cette liste vivante à l'écran /abris.
 */
export interface Shelter {
  id: string;
  nom: string;
  ville: string;
  capacity: number;
  occupants: number;
  staff: number;
  supplies: "ok" | "low" | "critical";
  needs: string;
  adults: number;
  children: number;
  elderly: number;
}

// --- Morgue / identification des victimes (DVI) -----------------------------
// Modélisé sur les pratiques d'identification des victimes de catastrophe :
// un site mortuaire accueille des corps sous référence provisoire, qui suivent
// un parcours d'identification jalonné de prélèvements, puis sont restitués aux
// familles. Le registre est horodaté à chaque étape.

/** Site mortuaire (permanent ou de circonstance). */
export interface MorgueSite {
  id: string;
  nom: string;
  ville: string;
  /** Emplacements réfrigérés. */
  capacity: number;
  /** Effectif affecté au site (médecins légistes, techniciens). */
  staff: number;
  statut: "op" | "partial" | "closed";
}

/** Étapes du parcours d'identification. */
export const DVI_STATUSES = ["unidentified", "in_progress", "identified", "released"] as const;
export type DviStatus = (typeof DVI_STATUSES)[number];

/** Prélèvements post-mortem servant à l'identification. */
export const DVI_SAMPLES = ["dna", "dental", "fingerprint"] as const;
export type DviSample = (typeof DVI_SAMPLES)[number];

/**
 * Enregistrement d'un corps admis dans un site mortuaire.
 * `reference` est la référence PROVISOIRE attribuée à l'admission : elle reste
 * l'identifiant opérationnel tant que l'identité n'est pas confirmée.
 */
export interface MortuaryRecord {
  id: string;
  /** Site mortuaire de rattachement. */
  mid: string;
  reference: string;
  /** Incident d'origine, s'il est connu. */
  incidentId?: string;
  /** Lieu de découverte. */
  foundAt?: string;
  sex?: "m" | "f" | "unknown";
  ageRange?: string;
  status: DviStatus;
  samples: DviSample[];
  /** Identité confirmée — exigée dès le statut « identifié ». */
  identifiedAs?: string;
  /** Personne à qui le corps a été restitué — exigée au statut « restitué ». */
  releasedTo?: string;
  /** Horodatages ISO 8601 : admission et dernière évolution. */
  admittedAt: string;
  updatedAt: string;
}

export interface FeedItem {
  time: string;
  c: string;
  txt: string;
}

export interface QueueItem {
  id: string;
  kind: "logistics" | "evac" | "shelter";
  label: string;
  incidentId: string;
  target: [number, number];
  type: Incident["type"];
  urgency: "urgent" | "high" | "medium";
}

export interface TransportMovement {
  id: string;
  mission: string;
  vehicles: string;
  origin: string;
  destination: string;
  cargo: string;
  progress: number;
  etaMin: number;
  delayMin: number;
}

/**
 * Version des données de référence embarquées (hôpitaux, hôpitaux de campagne).
 * À INCRÉMENTER à chaque mise à jour du réseau : l'instantané dev écrit avec une
 * version antérieure est alors ignoré pour ces collections.
 * v4 — services de soins par établissement (wards).
 * v3 — ajout du réseau hospitalier public civil (106 établissements) et du
 *      champ `kind` différenciant les symboles cartographiques.
 */
const DOMAIN_SEED_VERSION = 4;

@Injectable()
export class DomainService {
  private incidents: Incident[] = [
    { id: "INC-2607", type: "earthquake", titre: "Séisme M5.9 — Province d'Al Haouz", region: "Marrakech-Safi", sev: "high", st: "prog", time: "06:42", x: 188, y: 286, ll: [-8.44, 31.06] },
    { id: "INC-2606", type: "flood", titre: "Crues de l'oued Ourika", region: "Marrakech-Safi", sev: "high", st: "prog", time: "05:10", x: 196, y: 276, ll: [-7.79, 31.32] },
    { id: "INC-2604", type: "wildfire", titre: "Feu de forêt — Chefchaouen", region: "Tanger-Tétouan-Al Hoceïma", sev: "medium", st: "prog", time: "J-1", x: 248, y: 82, ll: [-5.27, 35.17] },
    { id: "INC-2601", type: "landslide", titre: "Glissement de terrain — Al Hoceïma", region: "Oriental", sev: "medium", st: "open", time: "J-1", x: 300, y: 94, ll: [-3.93, 35.25] },
    { id: "INC-2598", type: "industrial", titre: "Fuite chimique — Port de Mohammedia", region: "Casablanca-Settat", sev: "low", st: "closed", time: "J-2", x: 182, y: 168, ll: [-7.38, 33.69] },
    { id: "INC-2595", type: "epidemic", titre: "Foyer choléra suspecté — Zagora", region: "Drâa-Tafilalet", sev: "medium", st: "open", time: "J-3", x: 300, y: 420, ll: [-5.84, 30.33] },
  ];

  private readonly units: Unit[] = [
    { id: "U1", nom: "1er Groupement d'Intervention", ville: "Rabat", cmdt: "Col. Y. Benjelloun", eff: 420, dispo: "ready", readiness: 92, x: 196, y: 148, ll: [-6.84, 34.02] },
    { id: "U2", nom: "3e Bataillon du Génie", ville: "Marrakech", cmdt: "Lt-Col. A. Tazi", eff: 365, dispo: "deployed", readiness: 78, x: 180, y: 262, ll: [-8.01, 31.63] },
    { id: "U3", nom: "7e Régiment Aéroporté", ville: "Agadir", cmdt: "Col. M. El Fassi", eff: 510, dispo: "deployed", readiness: 85, x: 112, y: 330, ll: [-9.6, 30.42] },
    { id: "U4", nom: "2e Groupe Logistique", ville: "Fès", cmdt: "Lt-Col. S. Amrani", eff: 290, dispo: "standby", readiness: 70, x: 268, y: 140, ll: [-5.0, 34.03] },
    { id: "U5", nom: "5e Bataillon de Soutien", ville: "Oujda", cmdt: "Cdt. H. Berrada", eff: 245, dispo: "ready", readiness: 88, x: 378, y: 120, ll: [-1.91, 34.68] },
    { id: "U6", nom: "4e Unité NRBC", ville: "Kénitra", cmdt: "Cdt. N. Chraibi", eff: 180, dispo: "standby", readiness: 81, x: 205, y: 132, ll: [-6.58, 34.26] },
  ];

  // Référentiel hospitalier national : réseau militaire (7) + réseau public
  // civil (106). Voir hospitals.data.ts. x/y positionnent le marqueur sur la
  // silhouette du tableau de bord.
  private readonly hospitals: Hospital[] = HOSPITALS_MA.map((h) => ({ ...h }));

  private readonly fieldHospitals: FieldHospital[] = [
    { hid: "H4", nom: "HMC Amizmiz", cap: 60, occ: 48, statut: "op", depuis: "J+2", kind: "mil_field" },
    { hid: "H4", nom: "HMC Talat N'Yaaqoub", cap: 40, occ: 37, statut: "op", depuis: "J+1", kind: "mil_field" },
    { hid: "H5", nom: "HMC Taroudant", cap: 40, occ: 22, statut: "partial", depuis: "J+1", kind: "mil_field" },
    // Structures de campagne civiles déployées par le ministère de la Santé
    // en appui du CHU Mohammed VI (Marrakech) et du CHP d'Al Haouz.
    { hid: "HC072", nom: "HCC Asni", cap: 50, occ: 41, statut: "op", depuis: "J+2", kind: "civ_field" },
    { hid: "HC076", nom: "HCC Ouirgane", cap: 30, occ: 14, statut: "partial", depuis: "J+1", kind: "civ_field" },
  ];

  // Services de soins du réseau militaire — pilotés par le responsable de
  // chaque établissement depuis « Ma responsabilité › Gestion ».
  private readonly wards: HospitalWard[] = [
    { id: "W-101", hid: "H1", nom: "Réanimation polyvalente", lits: 48, occ: 39, statut: "saturated", chef: "Pr. A. Benkirane" },
    { id: "W-102", hid: "H1", nom: "Chirurgie de guerre", lits: 120, occ: 88, statut: "open", chef: "Col. M. Sabri" },
    { id: "W-103", hid: "H1", nom: "Urgences", lits: 60, occ: 51, statut: "open", chef: "Cdt. L. Ouazzani" },
    { id: "W-104", hid: "H1", nom: "Brûlés", lits: 24, occ: 14, statut: "open", chef: "Cdt. S. Alaoui" },
    { id: "W-201", hid: "H2", nom: "Réanimation", lits: 30, occ: 21, statut: "open", chef: "Cdt. K. Tahiri" },
    { id: "W-202", hid: "H2", nom: "Traumatologie", lits: 90, occ: 74, statut: "open", chef: "Cne. R. Belkadi" },
    { id: "W-301", hid: "H3", nom: "Réanimation", lits: 24, occ: 12, statut: "open", chef: "Cne. H. Mansouri" },
    { id: "W-302", hid: "H3", nom: "Médecine interne", lits: 80, occ: 53, statut: "open" },
    { id: "W-401", hid: "H4", nom: "Réanimation", lits: 36, occ: 34, statut: "saturated", chef: "Cdt. N. Berrada" },
    { id: "W-402", hid: "H4", nom: "Chirurgie orthopédique", lits: 110, occ: 101, statut: "saturated", chef: "Cne. Y. Fadili" },
    { id: "W-403", hid: "H4", nom: "Urgences séisme", lits: 70, occ: 62, statut: "open", chef: "Cne. I. Charki" },
    { id: "W-501", hid: "H5", nom: "Réanimation", lits: 20, occ: 17, statut: "saturated", chef: "Cne. O. Rachidi" },
    { id: "W-502", hid: "H5", nom: "Chirurgie", lits: 85, occ: 68, statut: "open" },
    { id: "W-601", hid: "H6", nom: "Réanimation", lits: 12, occ: 5, statut: "open", chef: "Lt. F. Naciri" },
    { id: "W-602", hid: "H6", nom: "Médecine générale", lits: 60, occ: 31, statut: "open" },
    { id: "W-701", hid: "H7", nom: "Réanimation", lits: 8, occ: 3, statut: "open" },
    { id: "W-702", hid: "H7", nom: "Médecine générale", lits: 45, occ: 22, statut: "open" },
  ];

  // Abris d'hébergement — seedés depuis le catalogue puis pilotés par leur
  // responsable. `structuredClone` : ne jamais muter le tableau du catalogue.
  private readonly shelters: Shelter[] = structuredClone(SHELTERS) as Shelter[];

  // Sites mortuaires engagés sur le séisme d'Al Haouz.
  private readonly morgues: MorgueSite[] = [
    { id: "M1", nom: "Institut médico-légal — HMI Mohammed V", ville: "Rabat", capacity: 60, staff: 18, statut: "op" },
    { id: "M2", nom: "Chambre mortuaire — HM Avicenne", ville: "Marrakech", capacity: 45, staff: 14, statut: "op" },
    { id: "M3", nom: "Site mortuaire de circonstance — Amizmiz", ville: "Amizmiz", capacity: 80, staff: 11, statut: "partial" },
  ];

  private readonly mortuaryRecords: MortuaryRecord[] = [
    { id: "DVI-1", mid: "M3", reference: "AH-2026-001", incidentId: "INC-2607", foundAt: "Douar Tinzert", sex: "m", ageRange: "40-55", status: "identified", samples: ["dental", "fingerprint"], identifiedAs: "M. Brahim Ait Oussaid", admittedAt: "2026-08-08T07:20:00Z", updatedAt: "2026-08-09T09:10:00Z" },
    { id: "DVI-2", mid: "M3", reference: "AH-2026-002", incidentId: "INC-2607", foundAt: "Douar Tinzert", sex: "f", ageRange: "20-35", status: "in_progress", samples: ["dna"], admittedAt: "2026-08-08T07:35:00Z", updatedAt: "2026-08-08T18:00:00Z" },
    { id: "DVI-3", mid: "M3", reference: "AH-2026-003", incidentId: "INC-2607", foundAt: "Piste RP2010", sex: "unknown", status: "unidentified", samples: [], admittedAt: "2026-08-08T11:05:00Z", updatedAt: "2026-08-08T11:05:00Z" },
    { id: "DVI-4", mid: "M2", reference: "MK-2026-014", incidentId: "INC-2606", foundAt: "Oued Ourika", sex: "m", ageRange: "10-18", status: "released", samples: ["dna", "dental"], identifiedAs: "Youssef El Alaoui", releasedTo: "Famille El Alaoui (père)", admittedAt: "2026-08-07T16:40:00Z", updatedAt: "2026-08-09T08:00:00Z" },
    { id: "DVI-5", mid: "M2", reference: "MK-2026-015", incidentId: "INC-2606", foundAt: "Oued Ourika", sex: "f", ageRange: "55-70", status: "identified", samples: ["fingerprint"], identifiedAs: "Mme Fatima Benhima", admittedAt: "2026-08-07T17:10:00Z", updatedAt: "2026-08-09T07:30:00Z" },
  ];

  // Parc d'équipement — seedé depuis le catalogue puis piloté par le
  // responsable de CHAQUE unité détentrice (cantonnement sur `unitId`).
  private readonly equipment: EquipItem[] = structuredClone(EQUIPMENT) as EquipItem[];

  private readonly feed: FeedItem[] = [
    { time: "07:12", c: "bg-danger-500", txt: "Réplique M4.2 enregistrée — Al Haouz" },
    { time: "07:02", c: "bg-or-500", txt: "7e Régiment Aéroporté : 120 personnels héliportés vers Amizmiz" },
    { time: "06:55", c: "bg-blue-500", txt: "EVASAN : 14 blessés graves transférés vers HM Avicenne" },
    { time: "06:48", c: "bg-green-500", txt: "HMC Amizmiz opérationnel — capacité 60 lits" },
    { time: "06:42", c: "bg-danger-500", txt: "Séisme M5.9 détecté, épicentre province d'Al Haouz" },
  ];

  constructor() {
    // Persistance dev : restaure les collections mutables depuis l'instantané
    // disque pour que les données NE SOIENT PAS effacées à chaque redémarrage.
    // Les référentiels statiques (provinces, villes, routes, file, mouvements)
    // ne sont pas persistés. Voir common/dev-store. (Réinitialiser : rm -rf .dev-data)
    const snap = loadDevState<{
      seedVersion?: number;
      incidents?: Incident[];
      units?: Unit[];
      hospitals?: Hospital[];
      fieldHospitals?: FieldHospital[];
      wards?: HospitalWard[];
      shelters?: Shelter[];
      morgues?: MorgueSite[];
      mortuaryRecords?: MortuaryRecord[];
      equipment?: EquipItem[];
      feed?: FeedItem[];
    }>("domain", {});
    if (snap.incidents) this.incidents.splice(0, this.incidents.length, ...snap.incidents);
    if (snap.units) this.units.splice(0, this.units.length, ...snap.units);
    // Référentiel hospitalier : repris du disque UNIQUEMENT si l'instantané a
    // été écrit avec la version de seed courante. Sinon (mise à jour du réseau
    // hospitalier officiel), les seeds du code font autorité et écrasent
    // l'ancienne liste — les incidents et unités, eux, sont conservés.
    const sameSeed = snap.seedVersion === DOMAIN_SEED_VERSION;
    if (sameSeed && snap.hospitals) this.hospitals.splice(0, this.hospitals.length, ...snap.hospitals);
    if (sameSeed && snap.fieldHospitals) this.fieldHospitals.splice(0, this.fieldHospitals.length, ...snap.fieldHospitals);
    if (sameSeed && snap.wards) this.wards.splice(0, this.wards.length, ...snap.wards);
    if (sameSeed && snap.shelters) this.shelters.splice(0, this.shelters.length, ...snap.shelters);
    if (sameSeed && snap.morgues) this.morgues.splice(0, this.morgues.length, ...snap.morgues);
    if (sameSeed && snap.mortuaryRecords) this.mortuaryRecords.splice(0, this.mortuaryRecords.length, ...snap.mortuaryRecords);
    if (sameSeed && snap.equipment) this.equipment.splice(0, this.equipment.length, ...snap.equipment);
    if (snap.feed) this.feed.splice(0, this.feed.length, ...snap.feed);
    if (!sameSeed) this.persist();
  }

  /** Écrit l'instantané des collections mutables (débounce ; no-op hors dev). */
  private persist(): void {
    saveDevState("domain", {
      seedVersion: DOMAIN_SEED_VERSION,
      incidents: this.incidents,
      units: this.units,
      hospitals: this.hospitals,
      fieldHospitals: this.fieldHospitals,
      wards: this.wards,
      shelters: this.shelters,
      morgues: this.morgues,
      mortuaryRecords: this.mortuaryRecords,
      equipment: this.equipment,
      feed: this.feed,
    });
  }

  listIncidents(): Incident[] {
    return this.incidents;
  }

  createIncident(input: Omit<Incident, "id" | "time"> & { time?: string }): Incident {
    const d = new Date();
    const time = input.time ?? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const n = 2608 + this.incidents.filter((i) => i.id.startsWith("INC-26")).length;
    const inc: Incident = { ...input, id: `INC-${n}`, time };
    this.incidents.unshift(inc);
    this.feed.unshift({ time, c: "bg-danger-500", txt: `${inc.id} — ${inc.titre}` });
    this.persist();
    return inc;
  }

  /** Mise à jour partielle d'un incident (édition / archivage). */
  updateIncident(id: string, patch: Partial<Omit<Incident, "id">>): Incident | undefined {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) return undefined;
    // N'écrase que les champs réellement fournis : les DTO exposent les champs
    // optionnels absents comme `undefined`, et un Object.assign brut effacerait
    // les valeurs existantes (titre, type, gravité…) lors d'une mise à jour partielle.
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (inc as unknown as Record<string, unknown>)[k] = v;
    }
    this.persist();
    return inc;
  }

  /** Rattache un sous-incident à un incident et trace l'événement. */
  addSubIncident(id: string, input: Omit<SubIncident, "id" | "time"> & { time?: string }): Incident | undefined {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) return undefined;
    const d = new Date();
    const time = input.time ?? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const n = (inc.subIncidents?.length ?? 0) + 1;
    const sub: SubIncident = {
      id: `${inc.id}-S${n}`,
      type: input.type,
      sev: input.sev,
      note: input.note,
      time,
      ll: input.ll,
      casualties: input.casualties,
      responders: input.responders,
    };
    inc.subIncidents = [...(inc.subIncidents ?? []), sub];
    this.feed.unshift({ time, c: "bg-or-500", txt: `Sous-incident rattaché à ${inc.id}` });
    this.persist();
    return inc;
  }

  /** Détache un sous-incident d'un incident. */
  /**
   * Cascades à exécuter lors de la suppression d'un incident.
   *
   * POURQUOI UN REGISTRE plutôt qu'un appel direct : la suppression doit
   * annuler puis purger les missions de l'incident, mais le module `missions`
   * importe DÉJÀ `domain`. Un appel direct créerait un cycle de modules, et
   * `forwardRef` ne ferait que le masquer.
   *
   * Ici, l'inversion est franche : le domaine expose un point d'accroche, et
   * c'est le module qui dépend de lui (missions) qui vient s'y inscrire au
   * démarrage. Le domaine ignore toujours ce qu'est une mission.
   */
  private readonly cascades: ((incidentId: string) => Promise<void>)[] = [];

  /** Inscrit une cascade de suppression (appelé par les modules dépendants). */
  registerIncidentCascade(fn: (incidentId: string) => Promise<void>): void {
    this.cascades.push(fn);
  }

  /**
   * Suppression DÉFINITIVE d'un incident — réservée au superadmin par le RBAC
   * (`incidents:delete`, que la matrice n'accorde à personne).
   *
   * L'archivage reste le geste par défaut de tous les autres rôles : la
   * suppression est l'exception outillée, pas le raccourci.
   *
   * NON ATOMIQUE en dépôt mémoire : si une cascade échoue, l'incident est
   * déjà retiré. Le passage à PostgreSQL apportera la transaction.
   */
  async deleteIncident(id: string, actor: string): Promise<{ id: string; cascades: number }> {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) return { id, cascades: 0 };

    // Les cascades D'ABORD : elles ont besoin de l'incident pour le retrouver.
    for (const fn of this.cascades) await fn(id);

    this.incidents = this.incidents.filter((i) => i.id !== id);
    this.pushFeed(`${id} — SUPPRIMÉ par ${actor}`, "bg-danger-500");
    this.persist();
    return { id, cascades: this.cascades.length };
  }

  /** Un incident est-il encore actif (non archivé, non clos) ? */
  isIncidentActive(id: string): boolean {
    const inc = this.incidents.find((i) => i.id === id);
    return !!inc && !inc.archived && inc.st !== "closed";
  }

  removeSubIncident(id: string, subId: string): Incident | undefined {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) return undefined;
    inc.subIncidents = (inc.subIncidents ?? []).filter((s) => s.id !== subId);
    this.persist();
    return inc;
  }

  listUnits(): Unit[] {
    return this.units;
  }

  /** Crée une unité (id séquentiel U<n>) et trace l'événement dans le fil. */
  createUnit(input: Omit<Unit, "id">): Unit {
    const n = Math.max(0, ...this.units.map((u) => parseInt(u.id.replace(/\D/g, ""), 10) || 0)) + 1;
    const unit: Unit = { ...input, id: `U${n}` };
    this.units.push(unit);
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    this.feed.unshift({ time, c: "bg-green-500", txt: `Nouvelle unité enregistrée : ${unit.nom} (${unit.ville})` });
    this.persist();
    return unit;
  }

  listHospitals(): Hospital[] {
    return this.hospitals;
  }

  findHospital(id: string): Hospital | undefined {
    return this.hospitals.find((h) => h.id === id);
  }

  /**
   * Mise à jour partielle d'un hôpital (pilotage par son responsable).
   * Le cantonnement au périmètre affecté est appliqué en amont par le
   * `ScopeGuard` — ce service ne connaît pas la notion de responsable.
   */
  updateHospital(id: string, patch: Partial<Omit<Hospital, "id">>): Hospital | undefined {
    const h = this.hospitals.find((x) => x.id === id);
    if (!h) return undefined;
    // N'écrase que les champs réellement fournis (les DTO exposent les champs
    // optionnels absents comme `undefined`).
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (h as unknown as Record<string, unknown>)[k] = v;
    }
    this.persist();
    return h;
  }

  /** Crée un hôpital (id séquentiel H<n>) — occupation initiale à zéro. */
  createHospital(input: Omit<Hospital, "id" | "occ" | "reaOcc">): Hospital {
    const n = Math.max(0, ...this.hospitals.map((h) => parseInt(h.id.replace(/\D/g, ""), 10) || 0)) + 1;
    // `kind` par défaut : militaire — le réseau de commandement historique.
    const hosp: Hospital = { ...input, kind: input.kind ?? "mil", id: `H${n}`, occ: 0, reaOcc: 0 };
    this.hospitals.push(hosp);
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    this.feed.unshift({ time, c: "bg-green-500", txt: `Nouvel hôpital intégré au réseau : ${hosp.nom}` });
    this.persist();
    return hosp;
  }

  listFieldHospitals(): FieldHospital[] {
    return this.fieldHospitals;
  }

  // --- services de soins (wards) -------------------------------------------

  /** Services d'un établissement, ou tous si `hid` est omis. */
  listWards(hid?: string): HospitalWard[] {
    return hid ? this.wards.filter((w) => w.hid === hid) : this.wards;
  }

  /** Ouvre un service dans un établissement (id séquentiel W-<n>). */
  createWard(hid: string, input: Omit<HospitalWard, "id" | "hid">): HospitalWard {
    const n = Math.max(0, ...this.wards.map((w) => parseInt(w.id.replace(/\D/g, ""), 10) || 0)) + 1;
    const ward: HospitalWard = { ...input, id: `W-${n}`, hid };
    this.wards.push(ward);
    this.persist();
    return ward;
  }

  /** Mise à jour partielle d'un service — restreinte à l'établissement `hid`. */
  updateWard(hid: string, wid: string, patch: Partial<Omit<HospitalWard, "id" | "hid">>): HospitalWard | undefined {
    const w = this.wards.find((x) => x.id === wid && x.hid === hid);
    if (!w) return undefined;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (w as unknown as Record<string, unknown>)[k] = v;
    }
    this.persist();
    return w;
  }

  /** Ferme définitivement un service — restreint à l'établissement `hid`. */
  deleteWard(hid: string, wid: string): boolean {
    const i = this.wards.findIndex((x) => x.id === wid && x.hid === hid);
    if (i < 0) return false;
    this.wards.splice(i, 1);
    this.persist();
    return true;
  }

  // --- abris ----------------------------------------------------------------

  listShelters(): Shelter[] {
    return this.shelters;
  }

  findShelter(id: string): Shelter | undefined {
    return this.shelters.find((s) => s.id === id);
  }

  /** Mise à jour d'un abri par son responsable (cantonnement : ScopeGuard). */
  updateShelter(id: string, patch: Partial<Omit<Shelter, "id">>): Shelter | undefined {
    const sh = this.shelters.find((x) => x.id === id);
    if (!sh) return undefined;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (sh as unknown as Record<string, unknown>)[k] = v;
    }
    this.persist();
    return sh;
  }

  // --- unités -----------------------------------------------------------------

  findUnit(id: string): Unit | undefined {
    return this.units.find((u) => u.id === id);
  }

  /** Mise à jour d'une unité par son responsable (cantonnement : ScopeGuard). */
  /**
   * Ajoute une ligne au fil d'événements du poste de commandement.
   *
   * Point d'entrée unique : le fil est un tableau privé, et un adaptateur
   * extérieur (comme le publieur d'événements des missions) n'a pas à savoir
   * comment il est ordonné ni persisté.
   */
  pushFeed(txt: string, colorClass = "bg-or-500"): void {
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    this.feed.unshift({ time, c: colorClass, txt });
    this.persist();
  }

  updateUnit(id: string, patch: Partial<Omit<Unit, "id">>): Unit | undefined {
    const u = this.units.find((x) => x.id === id);
    if (!u) return undefined;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (u as unknown as Record<string, unknown>)[k] = v;
    }
    this.persist();
    return u;
  }

  // --- morgue / registre DVI ---------------------------------------------

  listMorgues(): MorgueSite[] {
    return this.morgues;
  }

  findMorgue(id: string): MorgueSite | undefined {
    return this.morgues.find((m) => m.id === id);
  }

  updateMorgue(id: string, patch: Partial<Omit<MorgueSite, "id">>): MorgueSite | undefined {
    const m = this.morgues.find((x) => x.id === id);
    if (!m) return undefined;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (m as unknown as Record<string, unknown>)[k] = v;
    }
    this.persist();
    return m;
  }

  /** Registre d'un site mortuaire, du plus récemment modifié au plus ancien. */
  listMortuaryRecords(mid: string): MortuaryRecord[] {
    return this.mortuaryRecords
      .filter((r) => r.mid === mid)
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  /** Admission d'un corps sous référence provisoire (statut « non identifié »). */
  admitBody(
    mid: string,
    input: Omit<MortuaryRecord, "id" | "mid" | "status" | "samples" | "admittedAt" | "updatedAt"> & { samples?: DviSample[] },
  ): MortuaryRecord {
    const n = Math.max(0, ...this.mortuaryRecords.map((r) => parseInt(r.id.replace(/\D/g, ""), 10) || 0)) + 1;
    const now = new Date().toISOString();
    const rec: MortuaryRecord = {
      ...input,
      id: `DVI-${n}`,
      mid,
      status: "unidentified",
      samples: input.samples ?? [],
      admittedAt: now,
      updatedAt: now,
    };
    this.mortuaryRecords.push(rec);
    this.persist();
    return rec;
  }

  /**
   * Fait évoluer un dossier. Les invariants du parcours DVI sont vérifiés par
   * `dvi.rules` ; une violation renvoie le message métier, jamais une exception
   * HTTP (la traduction est faite par le contrôleur).
   */
  updateMortuaryRecord(
    mid: string,
    rid: string,
    patch: Partial<Omit<MortuaryRecord, "id" | "mid" | "admittedAt" | "updatedAt">>,
  ): { record?: MortuaryRecord; error?: string; missing?: boolean } {
    const rec = this.mortuaryRecords.find((r) => r.id === rid && r.mid === mid);
    if (!rec) return { missing: true };
    const error = checkRecordUpdate(rec, patch);
    if (error) return { error };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (rec as unknown as Record<string, unknown>)[k] = v;
    }
    rec.updatedAt = new Date().toISOString();
    this.persist();
    return { record: rec };
  }

  // --- parc d'équipement ----------------------------------------------------
  // Le « parc » d'une unité est l'ensemble de ses équipements. La route porte
  // l'identifiant d'UNITÉ (et non celui de l'article) pour que le ScopeGuard
  // puisse cantonner sans connaître la ressource — même schéma que les services
  // de soins d'un hôpital.

  listEquipment(unitId?: string): EquipItem[] {
    return unitId ? this.equipment.filter((e) => e.unitId === unitId) : this.equipment;
  }

  /** Ajoute un article au parc d'une unité (id séquentiel EQ-<n>). */
  addEquipment(unitId: string, unitLabel: string, input: Omit<EquipItem, "id" | "unit" | "unitId">): EquipItem {
    const n = Math.max(0, ...this.equipment.map((e) => parseInt(e.id.replace(/\D/g, ""), 10) || 0)) + 1;
    const item: EquipItem = { ...input, id: `EQ-${n}`, unit: unitLabel, unitId };
    this.equipment.push(item);
    this.persist();
    return item;
  }

  /** Mise à jour d'un article — restreinte au parc de l'unité `unitId`. */
  updateEquipment(unitId: string, eid: string, patch: Partial<Omit<EquipItem, "id" | "unit" | "unitId">>): EquipItem | undefined {
    const e = this.equipment.find((x) => x.id === eid && x.unitId === unitId);
    if (!e) return undefined;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (e as unknown as Record<string, unknown>)[k] = v;
    }
    this.persist();
    return e;
  }

  /** Sort un article du parc — restreint au parc de l'unité `unitId`. */
  removeEquipment(unitId: string, eid: string): boolean {
    const i = this.equipment.findIndex((x) => x.id === eid && x.unitId === unitId);
    if (i < 0) return false;
    this.equipment.splice(i, 1);
    this.persist();
    return true;
  }

  listFeed(): FeedItem[] {
    return this.feed.slice(0, 8);
  }

  private readonly queue: QueueItem[] = [
    { id: "REQ-5012", kind: "evac", label: "Évacuation 14 blessés graves — Douar Tnirt", incidentId: "INC-2607", target: [-8.36, 31.05], type: "earthquake", urgency: "urgent" },
    { id: "REQ-5011", kind: "logistics", label: "Groupes électrogènes + éclairage — PC Amizmiz", incidentId: "INC-2607", target: [-8.25, 31.22], type: "earthquake", urgency: "high" },
    { id: "REQ-5009", kind: "shelter", label: "Renfort tentes & vivres — abris Talat N'Yaaqoub", incidentId: "INC-2607", target: [-8.26, 30.98], type: "earthquake", urgency: "high" },
    { id: "REQ-5007", kind: "logistics", label: "Pompage & potabilisation — crues Ourika", incidentId: "INC-2606", target: [-7.79, 31.32], type: "flood", urgency: "medium" },
    { id: "REQ-5004", kind: "evac", label: "Rotation EVASAN — point de tri Tizi N'Test", incidentId: "INC-2607", target: [-8.2, 30.9], type: "earthquake", urgency: "urgent" },
  ];

  private readonly movements: TransportMovement[] = [
    { id: "MVT-3301", mission: "Convoi logistique", vehicles: "LOG-1 · 6 véh.", origin: "Rabat", destination: "Marrakech (A7)", cargo: "40 t fret humanitaire", progress: 62, etaMin: 74, delayMin: 0 },
    { id: "MVT-3302", mission: "Recherche & sauvetage", vehicles: "SAR-2 · 4 véh.", origin: "Agadir", destination: "Amizmiz", cargo: "Équipe cynophile + déblaiement", progress: 78, etaMin: 33, delayMin: 12 },
    { id: "MVT-3303", mission: "Évacuation sanitaire", vehicles: "EVASAN-1 · hélico", origin: "Marrakech", destination: "Zone sinistrée", cargo: "6 blessés graves", progress: 41, etaMin: 18, delayMin: 0 },
    { id: "MVT-3304", mission: "Ravitaillement abris", vehicles: "LOG-3 · 3 véh.", origin: "Fès", destination: "Talat N'Yaaqoub", cargo: "12 tentes + vivres", progress: 25, etaMin: 96, delayMin: 24 },
  ];

  listQueue(): QueueItem[] {
    return this.queue;
  }

  listMovements(): TransportMovement[] {
    return this.movements;
  }

  // --- données de référence (géographie, routes d'animation de la carte) ----

  // Les 75 provinces/préfectures du Royaume, coordonnées SVG dérivées des
  // coordonnées géographiques (transformation partagée avec le frontend).
  private readonly provinces = PROVINCES_MA.map((p) => ({ ...p, ...llToSvg(p.ll) }));

  private readonly vehRoutes = [
    { id: "LOG-1", label: "Convoi LOG-1", kind: "Convoi logistique · Rabat → Marrakech (A7)", speed: 0.01, route: [[-6.84, 34.02], [-7.1, 33.87], [-7.38, 33.69], [-7.59, 33.57], [-7.62, 33.42], [-7.63, 33.23], [-7.8, 32.88], [-7.94, 32.6], [-7.95, 32.23], [-8.0, 31.92], [-8.01, 31.63], [-8.13, 31.45], [-8.25, 31.22]] },
    { id: "SAR-2", label: "Convoi SAR-2", kind: "Recherche & sauvetage · Agadir → Amizmiz", speed: 0.012, route: [[-9.6, 30.42], [-9.35, 30.44], [-9.1, 30.46], [-8.88, 30.47], [-8.6, 30.62], [-8.44, 30.83], [-8.38, 31.0], [-8.3, 31.12], [-8.25, 31.22]] },
    { id: "EVASAN-1", label: "EVASAN-1", kind: "Hélicoptère médicalisé · rotation Marrakech ↔ zone sinistrée", speed: 0.03, route: [[-8.01, 31.63], [-8.15, 31.45], [-8.25, 31.22], [-8.26, 30.98], [-8.25, 31.22], [-8.15, 31.45], [-8.01, 31.63]] },
  ];

  reference() {
    return { provinces: this.provinces, cities: CITIES_MA, vehRoutes: this.vehRoutes };
  }

  // --- statistiques de commandement (tableau de bord national) -------------

  /**
   * Vue globale pour le commandement : évolution des déclarations sur 30 jours,
   * répartition par gravité, bilan humain (source unique : tableau ORSEC),
   * saturation hospitalière et posture des unités. Série d'évolution
   * déterministe (pseudo-aléatoire seedé) + comptes réels du registre.
   */
  stats() {
    // Série 30 jours déterministe : même graphe à chaque appel (pas de flicker).
    const evolution: { d: string; opened: number; closed: number }[] = [];
    const today = new Date();
    let seed = 42;
    const rnd = () => {
      // LCG simple — suffisant pour une série de démonstration stable.
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 29; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86400000);
      const label = `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`;
      // Fond de bruit 0–3, pic sismique sur les 4 derniers jours (scénario Al Haouz).
      const base = Math.floor(rnd() * 3);
      const spike = i <= 3 ? Math.floor(rnd() * 5) + 3 : 0;
      const opened = base + spike + (i === 0 ? this.incidents.filter((x) => x.st !== "closed").length % 3 : 0);
      const closed = Math.max(0, Math.floor((base + spike) * (0.4 + rnd() * 0.3)));
      evolution.push({ d: label, opened, closed });
    }

    const severity = {
      high: this.incidents.filter((i) => i.sev === "high").length,
      medium: this.incidents.filter((i) => i.sev === "medium").length,
      low: this.incidents.filter((i) => i.sev === "low").length,
    };

    const status = {
      open: this.incidents.filter((i) => i.st === "open").length,
      prog: this.incidents.filter((i) => i.st === "prog").length,
      closed: this.incidents.filter((i) => i.st === "closed").length,
    };

    // Saturation hospitalière : réseau militaire en tête (chaîne de
    // commandement), puis le réseau civil trié par taux d'occupation
    // décroissant — les établissements les plus tendus remontent en premier.
    const hospitals = this.hospitals
      .map((h) => ({
        id: h.id,
        nom: h.nom,
        ville: h.ville,
        kind: h.kind ?? "civ",
        occPct: Math.round((h.occ / h.lits) * 100),
        icuPct: h.rea > 0 ? Math.round((h.reaOcc / h.rea) * 100) : 0,
      }))
      .sort((a, b) => {
        const ma = a.kind === "mil" ? 0 : 1;
        const mb = b.kind === "mil" ? 0 : 1;
        return ma !== mb ? ma - mb : b.occPct - a.occPct;
      });

    const units = {
      total: this.units.length,
      deployed: this.units.filter((u) => u.dispo === "deployed").length,
      ready: this.units.filter((u) => u.dispo === "ready").length,
      avgReadiness: Math.round(this.units.reduce((s, u) => s + u.readiness, 0) / Math.max(1, this.units.length)),
    };

    return { evolution, severity, status, casualties: ORSEC_BOARD.casualties, hospitals, units };
  }

  // ========================================================================
  // Analytique · KPI + graphiques calculés depuis DONNÉES RÉELLES du domaine
  // Remplace la constante statique ANALYTICS du catalogue (catalog.data.ts).
  // Format contractuel strictement identique à Catalog.analytics pour ne
  // rien casser dans le frontend.
  // ========================================================================

  computeAnalytics() {
    const pct = (num: number, den: number) => (den === 0 ? 0 : Math.round((num / den) * 100));

    // ---- KPIs ------------------------------------------------------------
    const totalIncidents = this.incidents.length;
    const closedInc = this.incidents.filter((i) => i.st === "closed").length;
    const closedRate = totalIncidents === 0 ? 0 : Math.round((closedInc / totalIncidents) * 100);

    // Personnel déployé vs total — COMPTÉ sur le roster, pas figé.
    // Les deux constantes précédentes (87 / 38) annonçaient venir du seed alors
    // qu'il compte 14 entrées : elles auraient dérivé en silence au premier
    // ajout de personnel, dans une fonction dont tout l'intérêt est de ne rien
    // inventer.
    const rosterTotal = ROSTER.length;
    const rosterDeployed = ROSTER.filter((p) => p.av === "deployed").length;
    const personnelPct = pct(rosterDeployed, rosterTotal);

    // Véhicules : ARGOS ne tient pas d'état d'engagement du parc roulant. Ce
    // taux est donc une ESTIMATION à partir du parc d'ambulances et des unités
    // déployées, pas une mesure — les coefficients ci-dessous sont des
    // hypothèses de cadrage, à remplacer par un vrai suivi de parc.
    const AMB_ENGAGED_RATIO = 0.72;   // part d'ambulances supposée engagée
    const VEH_PER_DEPLOYED_UNIT = 3;  // véhicules par unité déployée
    const FLEET_MULTIPLIER = 1.8;     // parc total estimé / parc d'ambulances
    const totalAmb = this.hospitals.reduce((s, h) => s + (h.amb ?? 0), 0);
    const vehDeployedEst = Math.min(
      100,
      Math.round(totalAmb * AMB_ENGAGED_RATIO) + this.units.filter((u) => u.dispo === "deployed").length * VEH_PER_DEPLOYED_UNIT,
    );
    const vehPct = Math.min(100, Math.round((vehDeployedEst / Math.max(1, totalAmb * FLEET_MULTIPLIER)) * 100));

    // Équipements = part stock OK vs seuil + cond === repair
    const eqOk = this.equipment.filter((e) => e.stock >= e.threshold && e.cond === "ok").length;
    const eqPct = pct(eqOk, this.equipment.length);

    // Hôpitaux = moyenne des taux d'occupation (réseau MIL prioritaires + top 6)
    // IMPORTANT: l'id hôpital est gardé dans `satByH` car plusieurs établissements
    // peuvent porter le même nom (« Hôpital Mohammed V » existe dans plusieurs
    // villes). On préfixe le label par `[id]` pour l'unicité React keys, ET on
    // ajoute systématiquement ` · Ville` pour lever l'ambiguïté nom + ville.
    const satByH = this.hospitals
      .filter((h) => (h.kind ?? "civ") === "mil" || h.occ > 0)
      .map((h) => ({
        id: h.id,
        nom: h.nom,
        ville: h.ville,
        sat: pct(h.occ, h.lits),
      }))
      .sort((a, b) => b.sat - a.sat)
      .slice(0, 6);
    const hospPct = satByH.length === 0
      ? 0
      : Math.round(satByH.reduce((s, x) => s + x.sat, 0) / satByH.length);

    // KPI global utilisation moyens · pondération (Personnel 30% / Véhicules 25% / Équipements 20% / Hôpitaux 25%)
    const util = Math.round(personnelPct * 0.3 + vehPct * 0.25 + eqPct * 0.2 + hospPct * 0.25);

    // KPI réponse moyenne · composition 4 segments (alert->départ, départ->surSite, tri->évac, évac->admission)
    // Basé sur la gravité moyenne des incidents ouverts + dispo unités
    const sevWeight = this.incidents.reduce((s, i) => s + (i.sev === "high" ? 1.4 : i.sev === "medium" ? 1 : 0.7), 0) / Math.max(1, totalIncidents);
    const deployBoost = 1 - (this.units.filter((u) => u.dispo === "deployed").length / Math.max(1, this.units.length)) * 0.2;
    const avgResponse = Math.max(12, Math.round((10 + 18 + 15 + 22) * sevWeight * deployBoost));
    const evacAdmit = Math.max(20, Math.round(28 * sevWeight * deployBoost));

    // ---- Graphique G1 · responseTimes (4 segments) ----------------------
    const segAlertDep = Math.max(4, Math.round(8 * sevWeight));
    const segDepSite = Math.max(10, Math.round(22 * sevWeight * deployBoost));
    const segTriEvac = Math.max(8, Math.round(17 * sevWeight));
    const segEvacAdm = Math.max(18, evacAdmit);

    const responseTimes = [
      { label: "Alerte→départ", value: segAlertDep, couleur: "#C9A84C" },
      { label: "Départ→sur site", value: segDepSite, couleur: "#3B82F6" },
      { label: "Tri→évac", value: segTriEvac, couleur: "#F59E0B" },
      { label: "Évac→admission", value: segEvacAdm, couleur: "#EF4444" },
    ];

    // ---- Graphique G2 · incidentTrend 7 jours ----------------------------
    // Basé sur `stats().evolution` (30j) tronqué aux 7 derniers jours ; `opened`
    // injecte aussi le compte réel d'incidents st==open/prog pour J0
    const today = new Date();
    const lbl7 = (d: Date) => {
      const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
      if (diff === 0) return "Auj.";
      if (diff === 1) return "J-1";
      return `J-${diff}`;
    };
    const trend7 = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(today.getTime() - (6 - i) * 86400000);
      const sev = 6 - i <= 3 ? 1.6 : 1;
      const base = Math.max(1, Math.round((((6 - i) * 1.1) % 4) + 1) * sev);
      // J0 = incidents actuellement ouverts + récents (plancher minimum de la tendance)
      const opened = i === 6 ? Math.max(base, this.incidents.filter((x) => x.st !== "closed").length) : base;
      return {
        label: lbl7(day),
        value: opened,
        couleur: opened >= 5 ? "#EF4444" : "#C9A84C",
      };
    });

    // ---- Graphique G3 · triageOutcomes -----------------------------------
    // Agrégat TRIAGE_ZONES (seed statique) — vivra quand DomainService exposera les triages
    const triRed = TRIAGE_ZONES.reduce((s, z) => s + (z.red ?? 0), 0);
    const triYel = TRIAGE_ZONES.reduce((s, z) => s + (z.yellow ?? 0), 0);
    const triGre = TRIAGE_ZONES.reduce((s, z) => s + (z.green ?? 0), 0);
    const triBla = TRIAGE_ZONES.reduce((s, z) => s + (z.black ?? 0), 0);
    const triageOutcomes = [
      { label: "Rouge", value: triRed, couleur: "#EF4444" },
      { label: "Jaune", value: triYel, couleur: "#F59E0B" },
      { label: "Vert", value: triGre, couleur: "#10B981" },
      { label: "Noir", value: triBla, couleur: "#6B7280" },
    ];

    // ---- Graphique G4 · resourceUtil (4 axes) ----------------------------
    const resourceUtil = [
      { label: "Personnel", value: personnelPct, couleur: "#C9A84C" },
      { label: "Véhicules", value: vehPct, couleur: "#3B82F6" },
      { label: "Équipements", value: eqPct, couleur: "#10B981" },
      { label: "Hôpitaux", value: hospPct, couleur: "#EF4444" },
    ];

    // ---- Graphique G5 · hospitalSat (top 6 par saturation) ---------------
    // Palette adaptative : >90 rouge, >75 orange, >60 jaune, reste vert/bleu
    // Label = [id] Nom · Ville · SANS TRONCATURE (affichage texte intégral dans
    // la légende, avec word-wrap côté front). Priorité au contenu complet.
    // L'ajout systématique de la ville évite l'ambiguïté Hôpital Mohammed V qui
    // existe dans plusieurs villes marocaines (Casablanca, Rabat, Fès…).
    const hospitalSat = satByH.map((h) => ({
      label: `[${h.id}] ${h.nom} · ${h.ville}`,
      value: h.sat,
      couleur: h.sat >= 90 ? "#EF4444" : h.sat >= 75 ? "#F59E0B" : h.sat >= 60 ? "#C9A84C" : h.sat >= 40 ? "#3B82F6" : "#10B981",
    }));

    // ---- G6 · severityDist calculé côté FRONT aujourd'hui (donné ici aussi
    // en backup si le front veut s'y référer). On garde le schéma identique
    // à Analytics (pas de champ supplémentaire) pour rester compatible.

    return {
      kpis: {
        avgResponse,
        evacAdmit,
        closedRate,
        util,
      },
      responseTimes,
      incidentTrend: trend7,
      resourceUtil,
      hospitalSat,
      triageOutcomes,
    };
  }
}
