import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from "@nestjs/common";
import { resolveShelterTypology, type ShelterTypologyInput } from "@/modules/domain/shelter.rules";
import { computeAnalyticsOf, computeStats, type DomainSnapshot } from "@/modules/domain/domain.analytics";
import { PROVINCES_MA, llToSvg } from "@/modules/domain/provinces.data";
import { CITIES_MA } from "@/modules/domain/cities.data";
import { EQUIPMENT, SHELTERS, type EquipItem } from "@/modules/domain/catalog.data";
import { HOSPITALS_MA } from "@/modules/domain/hospitals.data";
import {
  LEGACY_SEED_INCIDENT_IDS,
  LEGACY_SEED_UNIT_IDS,
  SEED_INCIDENTS,
  SEED_UNITS,
} from "@/modules/domain/seed.data";
import { checkRecordUpdate } from "@/modules/domain/dvi.rules";
import { checkCapacity, checkReceive, checkTransfer, custodyEvent, defaultMorgueType, displayName, nextReference, siteStatus } from "@/modules/domain/morgue.rules";
import { pruneDemo, type DomainCollections } from "@/modules/domain/profile.rules";
import { CORPS_LABELS, canAssignCorps, destinationFor } from "@/modules/domain/assignment.rules";
import type { Role } from "@/shared/permissions";
import { loadDevState, saveDevState } from "@/common/dev-store";
import { DATA_PROFILE, DEMO_DATA } from "@/common/data-profile";
import { APP_MODE } from "@/common/app-mode";

// ============================================================================
// ARGOS — données de domaine (Phase 2, in-memory)
// Source de vérité serveur pour les entités opérationnelles consommées par le
// frontend (incidents, unités, hôpitaux, fil d'événements). En production :
// PostgreSQL + PostGIS. Les formes correspondent aux types du frontend.
// ============================================================================

// Les types du domaine vivent dans domain.types.ts ; ré-exportés ici pour les
// importateurs existants (contrôleurs, autres modules).
export type { Incident, SubIncident, Unit, Sitrep, Hospital, FieldHospital, HospitalWard, Shelter, MorgueSite, DviStatus, DviSample, MortuaryRecord, RecordChange, FeedItem, QueueItem, TransportMovement, IncidentPost, PostKind, IncidentVictim, VictimKind } from "@/modules/domain/domain.types";
export { DVI_STATUSES, DVI_SAMPLES } from "@/modules/domain/domain.types";
import type { Incident, SubIncident, Unit, UnitAssignment, UnitCorps, Destination, Sitrep, Hospital, FieldHospital, HospitalWard, Shelter, MorgueSite, DviSample, MortuaryRecord, RecordChange, FeedItem, QueueItem, TransportMovement, IncidentPost, PostKind, IncidentVictim, VictimKind, PersonIdentity, MorgueType } from "@/modules/domain/domain.types";
import { checkPost, type PostLookup } from "@/modules/domain/post.rules";
import type { ResponsibilityKind } from "@/shared/responsibilities";


/**
 * Version des données de référence embarquées (hôpitaux, hôpitaux de campagne).
 * À INCRÉMENTER à chaque mise à jour du réseau : l'instantané dev écrit avec une
 * version antérieure est alors ignoré pour ces collections.
 * v4 — services de soins par établissement (wards).
 * v3 — ajout du réseau hospitalier public civil (106 établissements) et du
 *      champ `kind` différenciant les symboles cartographiques.
 */
const DOMAIN_SEED_VERSION = 6;

/**
 * Écarte les doublons d'identifiant, en gardant la PREMIÈRE occurrence.
 *
 * Appliqué à CHAQUE lecture du disque, et non seulement lors d'une montée de
 * version du seed. Un instantané peut porter des doublons — écrit par une
 * version antérieure, ou par une reconstruction interrompue — et la reprise
 * suivante le restituerait tel quel, puisqu'aucune reconstruction ne serait
 * déclenchée. Deux lignes de même identifiant ne sont jamais valides : une
 * boucle adressée à l'une atteindrait l'autre.
 */
function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/**
 * Régions non canoniques déjà écrites sur disque → valeur du référentiel.
 *
 * Corriger le seed ne répare que les installations neuves : un instantané écrit
 * avant le lot V-1 porte encore « Oriental ». Or la région est devenue une CLÉ
 * DE VISIBILITÉ — un wali affecté à « L'Oriental » ne verrait pas un incident
 * libellé « Oriental », et la liste des filtres afficherait deux entrées pour
 * une même région. La reprise se fait donc à la lecture, comme `LEGACY_ROLE_MAP`
 * le fait pour les rôles renommés.
 */
const LEGACY_REGION_MAP: Record<string, string> = {
  Oriental: "L'Oriental",
};

/** Clé de comparaison d'un nom de ville : minuscules, sans accents ni séparateurs. */
function cityKey(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

/** La région de la ville du référentiel qui porte ce nom, si elle y est. */
function cityRegion(ville: string | undefined): string | undefined {
  if (!ville) return undefined;
  const k = cityKey(ville);
  return CITIES_MA.find((c) => cityKey(c.v) === k)?.region;
}

/** La région de la ville du référentiel la plus proche d'un point. */
function pointRegion(ll: [number, number] | undefined): string | undefined {
  if (!ll) return undefined;
  let best: (typeof CITIES_MA)[number] | undefined;
  let bestD = Infinity;
  for (const c of CITIES_MA) {
    const d = (c.ll[0] - ll[0]) ** 2 + (c.ll[1] - ll[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best?.region;
}

function canonicalizeRegion(inc: Incident): Incident {
  const fixed = LEGACY_REGION_MAP[inc.region];
  return fixed ? { ...inc, region: fixed } : inc;
}

/**
 * Les sites mortuaires de départ — la morgue suit la logique des hôpitaux :
 * une morgue RÉGIONALE (institut médico-légal, grande, équipée) par grande
 * région, des morgues DE VILLE (chambres mortuaires d'établissement), chacune
 * rattachée à l'hôpital qui l'abrite.
 */
const MORGUE_SEEDS: readonly MorgueSite[] = [
  { id: "M1", nom: "Institut médico-légal — HMI Mohammed V", ville: "Rabat", region: "Rabat-Salé-Kénitra", province: "Rabat", level: "regional", type: "hospital", hospitalId: "H1", capacity: 60, staff: 18, statut: "op", kind: "fixed", code: "RBT", ll: [-6.8498, 33.9716] },
  { id: "M2", nom: "Chambre mortuaire — HM Avicenne", ville: "Marrakech", region: "Marrakech-Safi", province: "Marrakech", level: "city", type: "hospital", hospitalId: "H4", capacity: 45, staff: 14, statut: "op", kind: "fixed", code: "MRK", ll: [-8.0136, 31.6465] },
  { id: "M3", nom: "Site mortuaire de circonstance — Amizmiz", ville: "Amizmiz", region: "Marrakech-Safi", province: "Al Haouz", level: "city", type: "temporary", capacity: 80, staff: 11, statut: "partial", kind: "fixed", code: "AMZ", ll: [-8.2417, 31.2186] },
  { id: "M4", nom: "Morgue régionale — HM Moulay Youssef", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", level: "regional", type: "hospital", hospitalId: "H2", capacity: 90, staff: 22, statut: "op", kind: "fixed", code: "CAS", ll: [-7.6114, 33.5822] },
  { id: "M5", nom: "Morgue régionale — HM Avicenne", ville: "Marrakech", region: "Marrakech-Safi", province: "Marrakech", level: "regional", type: "hospital", hospitalId: "H4", capacity: 70, staff: 16, statut: "op", kind: "fixed", code: "MRR", ll: [-8.0102, 31.6438] },
  { id: "M6", nom: "Chambre mortuaire — HM Moulay Ismaïl", ville: "Meknès", region: "Fès-Meknès", province: "Meknès", level: "city", type: "hospital", hospitalId: "H3", capacity: 30, staff: 8, statut: "op", kind: "fixed", code: "MKN", ll: [-5.5473, 33.8935] },
  { id: "M7", nom: "Morgue régionale — HM Ben Sergao", ville: "Agadir", region: "Souss-Massa", province: "Agadir Ida-Ou-Tanane", level: "regional", type: "hospital", hospitalId: "H5", capacity: 50, staff: 12, statut: "op", kind: "fixed", code: "AGA", ll: [-9.5495, 30.3811] },
];

/**
 * Tout ce que le jeu de démonstration crée hors incidents et unités (qui
 * portent le marqueur `seeded`) : abris, sites mortuaires, dossiers DVI, parc.
 * Le profil « empty » (ADR 0015) les retire à la reprise ; les hôpitaux — le
 * référentiel — ne sont jamais dans cette liste.
 */
/** Hôpitaux de campagne du jeu de démonstration. */
const FIELD_HOSPITAL_SEEDS: FieldHospital[] = [
    { hid: "H4", nom: "HMC Amizmiz", cap: 60, occ: 48, statut: "op", depuis: "J+2", kind: "mil_field" },
    { hid: "H4", nom: "HMC Talat N'Yaaqoub", cap: 40, occ: 37, statut: "op", depuis: "J+1", kind: "mil_field" },
    { hid: "H5", nom: "HMC Taroudant", cap: 40, occ: 22, statut: "partial", depuis: "J+1", kind: "mil_field" },
    // Structures de campagne civiles déployées par le ministère de la Santé
    // en appui du CHU Mohammed VI (Marrakech) et du CHP d'Al Haouz.
    { hid: "HC072", nom: "HCC Asni", cap: 50, occ: 41, statut: "op", depuis: "J+2", kind: "civ_field" },
    { hid: "HC076", nom: "HCC Ouirgane", cap: 30, occ: 14, statut: "partial", depuis: "J+1", kind: "civ_field" },
];

/** Dossiers d'identification du jeu de démonstration. */
const DVI_SEEDS: MortuaryRecord[] = [
    { id: "DVI-1", mid: "M3", reference: "AH-2026-001", incidentId: "INC-2607", foundAt: "Douar Tinzert", sex: "m", ageRange: "40-55", status: "identified", samples: ["dental", "fingerprint"], identifiedAs: "M. Brahim Ait Oussaid", admittedAt: "2026-08-08T07:20:00Z", updatedAt: "2026-08-09T09:10:00Z" },
    { id: "DVI-2", mid: "M3", reference: "AH-2026-002", incidentId: "INC-2607", foundAt: "Douar Tinzert", sex: "f", ageRange: "20-35", status: "in_progress", samples: ["dna"], admittedAt: "2026-08-08T07:35:00Z", updatedAt: "2026-08-08T18:00:00Z" },
    { id: "DVI-3", mid: "M3", reference: "AH-2026-003", incidentId: "INC-2607", foundAt: "Piste RP2010", sex: "unknown", status: "unidentified", samples: [], admittedAt: "2026-08-08T11:05:00Z", updatedAt: "2026-08-08T11:05:00Z" },
    { id: "DVI-4", mid: "M2", reference: "MK-2026-014", incidentId: "INC-2606", foundAt: "Oued Ourika", sex: "m", ageRange: "10-18", status: "released", samples: ["dna", "dental"], identifiedAs: "Youssef El Alaoui", releasedTo: "Famille El Alaoui (père)", admittedAt: "2026-08-07T16:40:00Z", updatedAt: "2026-08-09T08:00:00Z" },
    { id: "DVI-5", mid: "M2", reference: "MK-2026-015", incidentId: "INC-2606", foundAt: "Oued Ourika", sex: "f", ageRange: "55-70", status: "identified", samples: ["fingerprint"], identifiedAs: "Mme Fatima Benhima", admittedAt: "2026-08-07T17:10:00Z", updatedAt: "2026-08-09T07:30:00Z" },
];

const DEMO_SEED_IDS: ReadonlySet<string> = new Set([
  ...SEED_INCIDENTS.map((i) => i.id),
  ...LEGACY_SEED_INCIDENT_IDS,
  ...SEED_UNITS.map((u) => u.id),
  ...LEGACY_SEED_UNIT_IDS,
  ...SHELTERS.map((s) => s.id),
  ...MORGUE_SEEDS.map((m) => m.id),
  ...EQUIPMENT.map((e) => e.id),
  "DVI-1", "DVI-2", "DVI-3", "DVI-4", "DVI-5",
]);

@Injectable()
export class DomainService implements OnApplicationBootstrap {
  private readonly logger = new Logger("DataProfile");
  private incidents: Incident[] = structuredClone(SEED_INCIDENTS);

  private readonly units: Unit[] = structuredClone(SEED_UNITS);

  // Référentiel hospitalier national : réseau militaire (7) + réseau public
  // civil (106). Voir hospitals.data.ts. x/y positionnent le marqueur sur la
  // silhouette du tableau de bord.
  private readonly hospitals: Hospital[] = HOSPITALS_MA.map((h) => ({ ...h }));

  private readonly fieldHospitals: FieldHospital[] = structuredClone(FIELD_HOSPITAL_SEEDS);

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
  private readonly morgues: MorgueSite[] = structuredClone(MORGUE_SEEDS as MorgueSite[]);

  /** Postes posés sur la carte des opérations (lot #12). */
  private posts: IncidentPost[] = [];
  /** Le bilan nommé des incidents : décédés (identification préliminaire), blessés, disparus. */
  private readonly victims: IncidentVictim[] = [];

  private readonly mortuaryRecords: MortuaryRecord[] = structuredClone(DVI_SEEDS);

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
      victims?: IncidentVictim[];
      equipment?: EquipItem[];
      feed?: FeedItem[];
      posts?: IncidentPost[];
      tombstones?: string[];
      dataProfile?: string;
    }>("domain", {});
    const sameSeed = snap.seedVersion === DOMAIN_SEED_VERSION;
    // Les graines explicitement supprimées ne renaissent pas au redémarrage.
    this.tombstones = new Set(snap.tombstones ?? []);

    // Station vide dont l'instantané a DÉJÀ été écrit vide (ADR 0015) : tout
    // ce qu'il contient est l'œuvre des opérateurs — y compris des entités qui
    // portent les mêmes identifiants que d'anciennes graines (U1, AB-01, M1 :
    // la numérotation repart de zéro sur une station vide). On reprend donc
    // tout tel quel, sans jamais élaguer par identifiant, et sans reconstruire
    // le jeu de démonstration.
    if (!DEMO_DATA && snap.dataProfile === "empty") {
      this.restoreEmpty(snap, sameSeed);
      if (!sameSeed) this.persist();
      return;
    }

    // Incidents et unités : reprise INTÉGRALE tant que le seed n'a pas changé.
    // Sur une montée de version, on reconstruit le jeu de démonstration et on
    // CONSERVE ce qu'un utilisateur a créé pendant la séance — écraser les deux
    // ferait perdre du travail, n'écraser ni l'un ni l'autre rendrait tout
    // nouveau jeu de données sans effet là où il en faut un.
    // Retour en démonstration depuis un instantané écrit vide (ADR 0016) : le
    // jeu est reconstruit comme sur une montée de version — ce que les
    // opérateurs ont créé reste, les graines reviennent.
    const rebuild = !sameSeed || (DEMO_DATA && snap.dataProfile === "empty");
    if (snap.incidents) {
      const restored = snap.incidents.map(canonicalizeRegion);
      const seedIds = new Set(SEED_INCIDENTS.map((i) => i.id));
      const kept = !rebuild
        ? restored
        : [
            // Ce qu'un utilisateur a créé est conservé — sauf si son identifiant
            // heurte le nouveau jeu. Cela ne peut arriver qu'aux instantanés
            // écrits AVANT la correction de la numérotation ci-dessus ; le seed
            // fait alors foi, plutôt que de laisser deux incidents porter le
            // même identifiant.
            ...restored.filter(
              (i) => !i.seeded && !LEGACY_SEED_INCIDENT_IDS.has(i.id) && !seedIds.has(i.id),
            ),
            ...structuredClone(SEED_INCIDENTS),
          ];
      this.incidents.splice(0, this.incidents.length, ...dedupeById(kept));
    }
    if (snap.units) {
      const seedUnitIds = new Set(SEED_UNITS.map((u) => u.id));
      const kept = !rebuild
        ? snap.units
        : [
            ...snap.units.filter(
              (u) => !u.seeded && !LEGACY_SEED_UNIT_IDS.has(u.id) && !seedUnitIds.has(u.id),
            ),
            ...structuredClone(SEED_UNITS),
          ];
      this.units.splice(0, this.units.length, ...dedupeById(kept));
    }
    // Référentiel hospitalier : repris du disque UNIQUEMENT si l'instantané a
    // été écrit avec la version de seed courante. Sinon (mise à jour du réseau
    // hospitalier officiel), les seeds du code font autorité et écrasent
    // l'ancienne liste — les incidents et unités, eux, sont conservés.
    if (sameSeed && snap.hospitals) this.hospitals.splice(0, this.hospitals.length, ...snap.hospitals);
    if (sameSeed && snap.fieldHospitals) this.fieldHospitals.splice(0, this.fieldHospitals.length, ...snap.fieldHospitals);
    if (sameSeed && snap.wards) this.wards.splice(0, this.wards.length, ...snap.wards);
    if (sameSeed && snap.shelters) this.shelters.splice(0, this.shelters.length, ...snap.shelters);
    if (sameSeed && snap.morgues) {
      this.morgues.splice(0, this.morgues.length, ...snap.morgues);
      // Les instantanés antérieurs au service morgue ignorent la nature, le
      // code, la position, l'échelon et le rattachement des sites : on les
      // complète depuis les graines — et les sites de départ apparus depuis
      // (morgues régionales) rejoignent la liste.
      for (const m of this.morgues) {
        const graine = MORGUE_SEEDS.find((g) => g.id === m.id);
        if (!graine) continue;
        m.kind ??= graine.kind;
        m.code ??= graine.code;
        m.ll ??= graine.ll;
        m.level ??= graine.level;
        m.region ??= graine.region;
        m.province ??= graine.province;
        m.hospitalId ??= graine.hospitalId;
        m.type ??= graine.type;
      }
      for (const m of this.morgues) m.type ??= defaultMorgueType(m);
      for (const graine of MORGUE_SEEDS) {
        if (!this.morgues.some((m) => m.id === graine.id)) this.morgues.push(structuredClone(graine));
      }
    }
    if (sameSeed && snap.mortuaryRecords) this.mortuaryRecords.splice(0, this.mortuaryRecords.length, ...snap.mortuaryRecords);
    if (snap.posts) this.posts = snap.posts;
    if (snap.victims) this.victims.splice(0, this.victims.length, ...snap.victims);
    if (sameSeed && snap.equipment) this.equipment.splice(0, this.equipment.length, ...snap.equipment);
    // Retour en démonstration (ADR 0016) : les graines des collections reprises
    // telles quelles (abris, parc, dossiers) reviennent, sans doublon.
    if (rebuild && DEMO_DATA && snap.dataProfile === "empty") {
      for (const g of SHELTERS as Shelter[]) if (!this.shelters.some((x) => x.id === g.id)) this.shelters.push(structuredClone(g));
      for (const g of EQUIPMENT as EquipItem[]) if (!this.equipment.some((x) => x.id === g.id)) this.equipment.push(structuredClone(g));
      for (const g of DVI_SEEDS) if (!this.mortuaryRecords.some((x) => x.id === g.id)) this.mortuaryRecords.push(structuredClone(g));
      for (const g of MORGUE_SEEDS) if (!this.morgues.some((x) => x.id === g.id)) this.morgues.push(structuredClone(g as MorgueSite));
      for (const g of FIELD_HOSPITAL_SEEDS) if (!this.fieldHospitals.some((x) => x.nom === g.nom)) this.fieldHospitals.push(structuredClone(g));
    }
    if (snap.feed) this.feed.splice(0, this.feed.length, ...snap.feed);

    // Profil de données (ADR 0015). « empty » — premier démarrage vide, ou
    // conversion d'un instantané de démonstration : aucune graine ne survit,
    // celles que la reprise vient de reconstruire comprises, et les hôpitaux
    // de campagne, qui n'ont pas de chemin de création, partent avec. Ce qu'un
    // opérateur avait créé pendant la démonstration reste. L'instantané est
    // ensuite écrit « empty » : les redémarrages suivants passent par
    // `restoreEmpty` et n'élaguent plus rien.
    // « demo » : seules les graines dont on a posé la pierre tombale restent
    // absentes ; la reconstruction ci-dessus les avait réinjectées.
    if (!DEMO_DATA) {
      const r = pruneDemo(this.collections(), { ids: DEMO_SEED_IDS, seeded: true, fieldHospitals: true, orphanFeed: true });
      this.applyPrune(r);
      // Les cascades des incidents retirés (boucles, déploiements) ne peuvent
      // pas courir ici : les modules qui les portent ne sont pas encore
      // construits. Elles courent au démarrage de l'application.
      this.pendingCascades = r.removedIncidentIds;
      if (r.total > 0) this.logger.log(`Profil « empty » : ${r.total} élément(s) de démonstration retiré(s), dont ${r.removedIncidentIds.length} incident(s).`);
    } else if (this.tombstones.size > 0) {
      this.applyPrune(pruneDemo(this.collections(), { ids: this.tombstones }));
    }
    if (!sameSeed || snap.dataProfile !== DATA_PROFILE) this.persist();
  }

  /** Incidents retirés à la reprise, dont les cascades restent à courir une fois les modules construits. */
  private pendingCascades: string[] = [];

  /**
   * Une fois tous les modules construits (donc toutes les cascades
   * enregistrées) : ce que la conversion démo → vide a retiré emporte ses
   * boucles et ses déploiements — sinon des comptes resteraient affectés à
   * des incidents fantômes.
   */
  async onApplicationBootstrap(): Promise<void> {
    const ids = this.pendingCascades;
    this.pendingCascades = [];
    for (const id of ids) for (const fn of this.cascades) await fn(id);
  }

  /** Identifiants des graines qu'un opérateur a supprimées — pour ne pas les réinjecter à la reprise. */
  private tombstones = new Set<string>();

  /**
   * Reprise d'un instantané écrit par une station vide : les collections
   * opérationnelles sont reprises telles quelles (elles ne contiennent que ce
   * que les opérateurs ont créé). Le réseau hospitalier et ses services suivent
   * la règle habituelle — le code fait autorité sur une montée de version du
   * référentiel — mais ce qu'un opérateur y a AJOUTÉ est conservé.
   */
  private restoreEmpty(
    snap: {
      incidents?: Incident[]; units?: Unit[]; hospitals?: Hospital[]; fieldHospitals?: FieldHospital[]; wards?: HospitalWard[];
      shelters?: Shelter[]; morgues?: MorgueSite[]; mortuaryRecords?: MortuaryRecord[]; victims?: IncidentVictim[];
      equipment?: EquipItem[]; feed?: FeedItem[]; posts?: IncidentPost[];
    },
    sameSeed: boolean,
  ): void {
    const replace = <T,>(target: T[], next: readonly T[]): void => { target.splice(0, target.length, ...next); };
    if (sameSeed && snap.hospitals) replace(this.hospitals, snap.hospitals);
    else if (snap.hospitals) {
      const seedIds = new Set(this.hospitals.map((h) => h.id));
      this.hospitals.push(...snap.hospitals.filter((h) => !seedIds.has(h.id)));
    }
    if (sameSeed && snap.wards) replace(this.wards, snap.wards);
    else if (snap.wards) {
      const seedIds = new Set(this.wards.map((w) => w.id));
      this.wards.push(...snap.wards.filter((w) => !seedIds.has(w.id)));
    }
    this.incidents = (snap.incidents ?? []).map(canonicalizeRegion);
    replace(this.units, snap.units ?? []);
    replace(this.fieldHospitals, snap.fieldHospitals ?? []);
    replace(this.shelters, snap.shelters ?? []);
    replace(this.morgues, snap.morgues ?? []);
    for (const m of this.morgues) m.type ??= defaultMorgueType(m);
    replace(this.mortuaryRecords, snap.mortuaryRecords ?? []);
    replace(this.victims, snap.victims ?? []);
    replace(this.equipment, snap.equipment ?? []);
    replace(this.feed, snap.feed ?? []);
    this.posts = snap.posts ?? [];
  }

  /** Vue mutable des collections, pour l'élagage. */
  private collections(): DomainCollections {
    return {
      incidents: this.incidents,
      units: this.units,
      hospitals: this.hospitals,
      fieldHospitals: this.fieldHospitals,
      wards: this.wards,
      shelters: this.shelters,
      morgues: this.morgues,
      mortuaryRecords: this.mortuaryRecords,
      victims: this.victims,
      equipment: this.equipment,
      feed: this.feed,
      posts: this.posts,
    };
  }

  /** Remplace le contenu des collections par le résultat d'un élagage (les tableaux `readonly` sont vidés en place). */
  private applyPrune(r: ReturnType<typeof pruneDemo>): void {
    this.incidents = r.next.incidents;
    this.units.splice(0, this.units.length, ...r.next.units);
    this.fieldHospitals.splice(0, this.fieldHospitals.length, ...r.next.fieldHospitals);
    this.shelters.splice(0, this.shelters.length, ...r.next.shelters);
    this.morgues.splice(0, this.morgues.length, ...r.next.morgues);
    this.mortuaryRecords.splice(0, this.mortuaryRecords.length, ...r.next.mortuaryRecords);
    this.victims.splice(0, this.victims.length, ...r.next.victims);
    this.equipment.splice(0, this.equipment.length, ...r.next.equipment);
    this.feed.splice(0, this.feed.length, ...r.next.feed);
    this.posts = r.next.posts;
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
      victims: this.victims,
      equipment: this.equipment,
      feed: this.feed,
      posts: this.posts,
      tombstones: [...this.tombstones],
      dataProfile: DATA_PROFILE,
    });
  }

  // --- région d'une entité ------------------------------------------------------

  /**
   * La région où une entité se trouve : celle qu'elle déclare, sinon celle de
   * sa ville dans le référentiel, sinon celle de la ville la plus proche de
   * son point. Sert deux choses qui doivent dire la même chose : QUI est
   * prévenu d'un incident déclaré dans une région, et QUI voit cet incident.
   */
  regionOfEntity(kind: ResponsibilityKind, id: string): string | undefined {
    switch (kind) {
      case "hospital": {
        const h = this.hospitals.find((x) => x.id === id);
        return h && (h.region ?? cityRegion(h.ville) ?? pointRegion(h.ll));
      }
      case "unit":
      case "equipment": {
        const u = this.units.find((x) => x.id === id);
        return u && (cityRegion(u.ville) ?? pointRegion(u.ll));
      }
      case "shelter": {
        const sh = this.shelters.find((x) => x.id === id);
        return sh && (sh.region ?? cityRegion(sh.ville) ?? (sh.ll ? pointRegion(sh.ll) : undefined));
      }
      case "morgue": {
        const m = this.morgues.find((x) => x.id === id);
        return m && (m.region ?? cityRegion(m.ville) ?? (m.ll ? pointRegion(m.ll) : undefined));
      }
    }
  }

  // --- postes d'opération sur la carte (lot #12) ------------------------------

  /** Postes posés sur la carte — ceux de ces incidents seulement, si la liste est donnée. */
  listPosts(incidentIds?: readonly string[]): IncidentPost[] {
    if (!incidentIds) return this.posts;
    const set = new Set(incidentIds);
    return this.posts.filter((p) => set.has(p.incidentId));
  }

  /** Ce que les règles d'un poste ont besoin de savoir de la plateforme. */
  private postLookup(accountHasRole: (matricule: string, role: PostKind) => boolean): PostLookup {
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    return {
      shelter: (id) => this.shelters.some((x) => x.id === id),
      unit: (id) => this.units.some((u) => u.id === id),
      account: accountHasRole,
      placedAccount: (m) => this.posts.find((p) => !!p.matricule && same(p.matricule, m))?.incidentId,
      placedEntity: (kind, id) => this.posts.find((p) => p.kind === kind && p.entityId === id)?.incidentId,
    };
  }

  /**
   * Vérifie qu'un poste PEUT se poser — sans le poser. L'appelant déploie le
   * compte AVANT de poser, et ne doit pas déployer pour rien : on tranche ici
   * d'abord. Incident inconnu → 404 ; instance invalide → 400 ; déjà posée → 409.
   */
  assertPostAllowed(
    input: { incidentId: string; kind: PostKind; entityId?: string; matricule?: string },
    accountHasRole: (matricule: string, role: PostKind) => boolean,
  ): { entityId?: string; matricule?: string } {
    if (!this.incidents.some((i) => i.id === input.incidentId)) throw new NotFoundException(`Incident inconnu : ${input.incidentId}`);
    const check = checkPost(input, this.postLookup(accountHasRole));
    if (!check.ok) {
      if (check.conflict) throw new ConflictException(check.reason);
      throw new BadRequestException(check.reason);
    }
    return { entityId: check.entityId, matricule: check.matricule };
  }

  /** Pose un poste sur une opération — après `assertPostAllowed`, qui est rejoué ici. */
  createPost(
    input: { incidentId: string; kind: PostKind; ll: [number, number]; label?: string; entityId?: string; matricule?: string },
    author: string,
    accountHasRole: (matricule: string, role: PostKind) => boolean,
  ): IncidentPost {
    const ids = this.assertPostAllowed(input, accountHasRole);
    const n = Math.max(0, ...this.posts.map((p) => parseInt(p.id.replace(/\D/g, ""), 10) || 0)) + 1;
    const now = new Date().toISOString();
    const post: IncidentPost = {
      id: `P${n}`,
      incidentId: input.incidentId,
      kind: input.kind,
      ll: input.ll,
      label: input.label?.trim() || undefined,
      entityId: ids.entityId,
      matricule: ids.matricule,
      createdBy: author,
      createdAt: now,
      updatedAt: now,
    };
    this.posts.push(post);
    this.pushFeed(
      `${input.incidentId} — poste ${post.kind.toUpperCase()}${post.matricule ? ` (${post.matricule})` : ""} posé sur la carte par ${author}`,
      "bg-or-500",
      input.incidentId,
    );
    this.persist();
    return post;
  }

  /** Déplace ou renomme un poste. `undefined` si le poste est inconnu. */
  updatePost(id: string, patch: { ll?: [number, number]; label?: string }): IncidentPost | undefined {
    const post = this.posts.find((p) => p.id === id);
    if (!post) return undefined;
    if (patch.ll) post.ll = patch.ll;
    if (patch.label !== undefined) post.label = patch.label.trim() || undefined;
    post.updatedAt = new Date().toISOString();
    this.persist();
    return post;
  }

  /** Retire un poste ; `false` s'il n'existait pas. */
  deletePost(id: string, actor: string): boolean {
    const post = this.posts.find((p) => p.id === id);
    if (!post) return false;
    this.posts = this.posts.filter((p) => p.id !== id);
    this.pushFeed(`${post.incidentId} — poste ${post.kind.toUpperCase()} retiré de la carte par ${actor}`, "bg-gray-400", post.incidentId);
    this.persist();
    return true;
  }

  listIncidents(): Incident[] {
    return this.incidents;
  }

  createIncident(input: Omit<Incident, "id" | "time"> & { time?: string }): Incident {
    const d = new Date();
    const time = input.time ?? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    // Numérotation par le PLUS GRAND rang existant, et non par le NOMBRE
    // d'incidents. Compter produisait un identifiant déjà pris dès qu'un
    // incident avait été supprimé — et, depuis le jeu de démonstration V-4 qui
    // en amorce onze, dès la PREMIÈRE création. Deux incidents partageant un
    // identifiant sur une plateforme de commandement, c'est une boucle adressée
    // à la mauvaise opération.
    const highest = this.incidents.reduce((max, i) => {
      const n = Number.parseInt(i.id.replace(/^INC-/, ""), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 2607);
    // `archived: false` explicite : un incident fraîchement déclaré est actif ;
    // l'absence du champ laissait les filtres « actifs » interpréter `undefined`.
    const inc: Incident = { archived: false, ...input, id: `INC-${highest + 1}`, time };
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
    // Un bilan corrigé par l'opérateur devient le nouveau chiffre déclaré ; la lecture garde le plancher des victimes nommées.
    if (patch.casualties) {
      inc.declaredCasualties = { dead: patch.casualties.dead, injured: patch.casualties.injured, missing: patch.casualties.missing };
      this.reconcileCasualties(inc);
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

  /** Ce qui suit une entité retirée (ADR 0016) : ses ressources partent avec elle. */
  private readonly entityCascades: ((kind: "unit" | "shelter" | "morgue" | "hospital", id: string) => void)[] = [];
  registerEntityCascade(fn: (kind: "unit" | "shelter" | "morgue" | "hospital", id: string) => void): void {
    this.entityCascades.push(fn);
  }

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
    // Les postes partent avec leur opération : un PC sans opération n'est rien.
    this.posts = this.posts.filter((p) => p.incidentId !== id);
    this.pushFeed(`${id} — SUPPRIMÉ par ${actor}`, "bg-danger-500", id);
    this.persist();
    return { id, cascades: this.cascades.length };
  }

  /**
   * Réserve un lit à l'acceptation d'une EVASAN.
   *
   * La réservation ne consomme rien : elle rend le lit invisible aux autres
   * transferts tant que le patient n'est pas là. C'est ce qui empêche deux
   * évacuations de viser le même dernier lit.
   */
  reserveBed(hospitalId: string, n = 1): void {
    const h = this.hospitals.find((x) => x.id === hospitalId);
    if (!h) return;
    h.reserved = Math.max(0, (h.reserved ?? 0) + n);
    this.persist();
  }

  /** Convertit une réservation en occupation réelle (arrivée confirmée). */
  admitReservedBed(hospitalId: string, n = 1): void {
    const h = this.hospitals.find((x) => x.id === hospitalId);
    if (!h) return;
    h.reserved = Math.max(0, (h.reserved ?? 0) - n);
    h.occ = Math.min(h.lits, h.occ + n);
    this.persist();
  }

  /** Libère une réservation sans admission (refus, annulation). */
  releaseBed(hospitalId: string, n = 1): void {
    const h = this.hospitals.find((x) => x.id === hospitalId);
    if (!h) return;
    h.reserved = Math.max(0, (h.reserved ?? 0) - n);
    this.persist();
  }

  // ==========================================================================
  // Comptes rendus de situation — SITREP (lot P3-b)
  //
  // L'état-major lisait des jauges, jamais des comptes rendus : impossible de
  // savoir si le silence d'un abri voulait dire « rien à signaler » ou
  // « débordé ». Le SITREP est volontairement LÉGER — trois champs saisis,
  // le reste photographié automatiquement — parce qu'un compte rendu long
  // n'est pas rendu.
  //
  // Publié = IMMUABLE et numéroté (MASTER_PLAN § rapports) : un compte rendu
  // qu'on peut réécrire après coup ne prouve rien.
  // ==========================================================================

  private sitreps: Sitrep[] = loadDevState<Sitrep[]>("sitreps", []);

  /** Cadence attendue, en minutes, selon le niveau d'alerte national. */
  private cadenceMinutes(): number {
    return { 1: 24 * 60, 2: 8 * 60, 3: 4 * 60, 4: 60 }[this.alertLevel];
  }

  /** Publie un compte rendu — immuable une fois écrit. */
  publishSitrep(input: Omit<Sitrep, "id" | "number" | "publishedAt">): Sitrep {
    const number = this.sitreps.length + 1;
    const rec: Sitrep = {
      ...input,
      id: `SIT-${String(number).padStart(4, "0")}`,
      number,
      publishedAt: new Date().toISOString(),
    };
    this.sitreps.unshift(rec);
    saveDevState("sitreps", this.sitreps);
    this.pushFeed(`${rec.id} — compte rendu de ${rec.entityId} (${rec.state})`, "bg-blue-500");
    return rec;
  }

  /** Comptes rendus, du plus récent au plus ancien. */
  listSitreps(entityId?: string): Sitrep[] {
    return entityId ? this.sitreps.filter((r) => r.entityId === entityId) : this.sitreps;
  }

  /**
   * Entités EN RETARD de compte rendu.
   *
   * C'est le cœur du lot : le silence devient un signal. Une entité qui n'a
   * jamais rendu compte est en retard dès qu'elle est engagée — sinon un
   * abri muet depuis toujours passerait pour à jour.
   */
  missingSitreps(): { entityKind: string; entityId: string; nom: string; lastAt: string | null; overdueMin: number }[] {
    const cadence = this.cadenceMinutes();
    const now = Date.now();
    const watched: { kind: string; id: string; nom: string }[] = [
      ...this.hospitals.map((h) => ({ kind: "hospital", id: h.id, nom: h.nom })),
      ...this.units.map((u) => ({ kind: "unit", id: u.id, nom: u.nom })),
      ...this.shelters.map((s) => ({ kind: "shelter", id: s.id, nom: s.nom })),
      ...this.morgues.map((m) => ({ kind: "morgue", id: m.id, nom: m.nom })),
    ];
    return watched
      .map((e) => {
        const last = this.sitreps.find((r) => r.entityId === e.id);
        const lastMs = last ? Date.parse(last.publishedAt) : null;
        const elapsed = lastMs === null ? Number.POSITIVE_INFINITY : Math.round((now - lastMs) / 60_000);
        return {
          entityKind: e.kind,
          entityId: e.id,
          nom: e.nom,
          lastAt: last?.publishedAt ?? null,
          overdueMin: elapsed === Number.POSITIVE_INFINITY ? -1 : Math.max(0, elapsed - cadence),
        };
      })
      .filter((e) => e.lastAt === null || e.overdueMin > 0);
  }

  /** Cadence attendue en minutes (exposée à l'IHM). */
  sitrepCadence(): number {
    return this.cadenceMinutes();
  }

  // ==========================================================================
  // Niveau d'alerte national (lot P3-a)
  //
  // Il vivait dans une CONSTANTE du frontend (`lib/config.ts`) : chaque poste
  // affichait la même valeur figée, et rien ne permettait de la changer sans
  // redéployer. C'est pourtant une décision de commandement — et c'est elle
  // qui cadence les comptes rendus (P3-b).
  // ==========================================================================

  private alertLevel: 1 | 2 | 3 | 4 = loadDevState<1 | 2 | 3 | 4>("alert-level", 3);

  /** Niveau d'alerte national courant. */
  getAlertLevel(): 1 | 2 | 3 | 4 {
    return this.alertLevel;
  }

  /** Change le niveau — décision de commandement, auditée par l'intercepteur. */
  setAlertLevel(level: 1 | 2 | 3 | 4, actor: string): 1 | 2 | 3 | 4 {
    const before = this.alertLevel;
    this.alertLevel = level;
    saveDevState("alert-level", level);
    if (before !== level) {
      this.pushFeed(
        `NIVEAU D'ALERTE ${before} → ${level} — décidé par ${actor}`,
        level >= 3 ? "bg-danger-500" : "bg-or-500",
      );
    }
    return this.alertLevel;
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

  /**
   * Entités engagées sur un incident — unités, hôpitaux ET sites mortuaires.
   *
   * Sert la portée « entity » : un responsable d'hôpital voit les opérations où
   * SON établissement sert. La liste vit ici parce que la donnée y vit ; la
   * doctrine de visibilité la reçoit sans connaître la forme d'un incident.
   *
   * Une morgue n'est pas « engagée » par la fiche d'incident : elle sert dès
   * qu'un corps de cet incident lui est admis. Sans cette lecture, le
   * responsable de morgue — classé multi-incidents par la doctrine — ne voyait
   * AUCUNE opération, et le default-deny passait pour une panne.
   */
  entitiesOnIncident(incidentId: string): string[] {
    const inc = this.incidents.find((i) => i.id === incidentId);
    const morgues = new Set(this.mortuaryRecords.filter((r) => r.incidentId === incidentId).map((r) => r.mid));
    return [...(inc?.responders?.units ?? []), ...(inc?.responders?.hospitals ?? []), ...(inc?.responders?.morgues ?? []), ...morgues];
  }

  listUnits(): Unit[] {
    return this.units;
  }

  /** Crée une unité (id séquentiel U<n>) et trace l'événement dans le fil. */
  createUnit(input: Omit<Unit, "id" | "cmdt"> & { cmdt?: string }): Unit {
    const n = Math.max(0, ...this.units.map((u) => parseInt(u.id.replace(/\D/g, ""), 10) || 0)) + 1;
    // Le commandant n'est plus saisi à la création : c'est le compte
    // « responsable d'unité » affecté à l'unité qui le désigne. Un tiret tant
    // qu'aucun n'est affecté — jamais un nom inventé.
    // Le corps par défaut est celui des FAR : le champ est apparu avec l'ADR
    // 0016 et les unités d'avant sont des unités militaires.
    const unit: Unit = { ...input, corps: input.corps ?? "far", cmdt: input.cmdt?.trim() || "—", id: `U${n}` };
    this.units.push(unit);
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    this.feed.unshift({ time, c: "bg-green-500", txt: `Nouvelle unité enregistrée : ${unit.nom} (${unit.ville})` });
    this.persist();
    return unit;
  }

  /**
   * Ouvre un abri (lot OPSnet).
   *
   * Les répartitions par âge partent à zéro plutôt que d'être devinées depuis
   * les occupants : un abri qu'on ouvre n'a pas encore de recensement, et des
   * chiffres inventés se liraient comme un dénombrement.
   */
  createShelter(input: ShelterTypologyInput & {
    nom: string;
    ville: string;
    region?: string;
    province?: string;
    ll?: [number, number];
    occupants?: number;
    staff?: number;
    supplies?: Shelter["supplies"];
    needs?: string;
  }): Shelter {
    // La typologie décide de la capacité — et refuse ce qui ne tient pas.
    const typo = resolveShelterTypology(input);
    if (!typo.ok) throw new BadRequestException(typo.reason);
    const n = Math.max(0, ...this.shelters.map((x) => parseInt(x.id.replace(/\D/g, ""), 10) || 0)) + 1;
    const shelter: Shelter = {
      id: `AB-${String(n).padStart(2, "0")}`,
      nom: input.nom,
      ville: input.ville,
      ...(input.region ? { region: input.region } : {}),
      ...(input.province ? { province: input.province } : {}),
      ...(input.ll ? { ll: input.ll } : {}),
      kind: typo.value.kind,
      ...(typo.value.kind === "dur" ? { building: typo.value.building } : { tents: typo.value.tents, perTent: typo.value.perTent }),
      capacity: typo.value.capacity,
      occupants: Math.min(input.occupants ?? 0, typo.value.capacity),
      staff: input.staff ?? 0,
      supplies: input.supplies ?? "ok",
      needs: input.needs?.trim() || "—",
      adults: 0,
      children: 0,
      elderly: 0,
    };
    this.shelters.push(shelter);
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    this.feed.unshift({ time, c: "bg-green-500", txt: `Abri ouvert : ${shelter.nom} (${shelter.ville})` });
    this.persist();
    return shelter;
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
    // Camp de tentes : la capacité SUIT les tentes, elle ne se saisit pas.
    if (sh.kind === "tentes" && (patch.tents !== undefined || patch.perTent !== undefined)) {
      const typo = resolveShelterTypology({ ...sh, kind: "tentes" });
      if (!typo.ok) throw new BadRequestException(typo.reason);
      sh.capacity = typo.value.capacity;
      sh.occupants = Math.min(sh.occupants, sh.capacity);
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
  pushFeed(txt: string, colorClass = "bg-or-500", incidentId?: string): void {
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    this.feed.unshift({ time, c: colorClass, txt, incidentId });
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

  /** Les sites avec leur statut tel qu'il se lit : « plein » quand la capacité est atteinte. */
  listMorgues(): MorgueSite[] {
    return this.morgues.map((m) => ({ ...m, type: m.type ?? defaultMorgueType(m), statut: siteStatus(m, this.mortuaryRecords) }));
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

  private nextRecordId(): string {
    const n = Math.max(0, ...this.mortuaryRecords.map((r) => parseInt(r.id.replace(/\D/g, ""), 10) || 0)) + 1;
    return `DVI-${n}`;
  }

  /** La prochaine référence d'un site : code, année, numéro d'ordre — jamais réattribuée. */
  nextReference(site: MorgueSite): string {
    return nextReference(site.code ?? site.id, new Date().getUTCFullYear(), this.mortuaryRecords.map((r) => r.reference));
  }

  /**
   * Admission d'un corps sous référence provisoire (statut « non identifié »),
   * première étape de sa chaîne de garde — reçu par le site, signé par qui l'acte.
   */
  admitBody(
    mid: string,
    input: Omit<MortuaryRecord, "id" | "mid" | "status" | "samples" | "admittedAt" | "updatedAt" | "reference"> & { reference?: string; samples?: DviSample[] },
    by = "—",
  ): MortuaryRecord {
    const site = this.findMorgue(mid);
    const now = new Date().toISOString();
    const reference = input.reference?.trim() || (site ? this.nextReference(site) : `${mid}-${now.slice(0, 4)}-001`);
    const rec: MortuaryRecord = {
      ...input,
      reference,
      id: this.nextRecordId(),
      mid,
      // Un nom connu à l'admission : l'identification est « en cours », pas confirmée.
      status: displayName(input) ? "in_progress" : "unidentified",
      samples: input.samples ?? [],
      origin: input.origin ?? { kind: "field", label: input.foundAt ?? "" },
      custody: [custodyEvent("received", by, { to: site?.nom ?? mid }, now)],
      admittedAt: now,
      updatedAt: now,
    };
    this.mortuaryRecords.push(rec);
    this.persist();
    return rec;
  }

  /** Le registre de TOUS les sites (service morgue), du plus récent au plus ancien, par incident au besoin. */
  listMortuaryRegistry(incidentId?: string): MortuaryRecord[] {
    return this.mortuaryRecords
      .filter((r) => !incidentId || r.incidentId === incidentId)
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  /**
   * Décès en établissement : l'hôpital annonce le transfert du corps vers un
   * site mortuaire ; le dossier naît là-bas, « réception à confirmer », avec
   * ses deux premières étapes de garde (l'hôpital, puis le transfert).
   */
  declareHospitalDeath(
    hospitalId: string,
    input: PersonIdentity & { mid: string; reference?: string; incidentId?: string; identifiedAs?: string; ageRange?: string; note?: string; deathAt?: string },
    by: string,
  ): { record?: MortuaryRecord; error?: string; missing?: "hospital" | "morgue" } {
    const hospital = this.hospitals.find((h) => h.id === hospitalId);
    if (!hospital) return { missing: "hospital" };
    const site = this.findMorgue(input.mid);
    if (!site) return { missing: "morgue" };
    const plein = checkCapacity(site, this.mortuaryRecords);
    if (plein) return { error: plein };
    const reference = input.reference?.trim() || this.nextReference(site);
    if (this.mortuaryRecords.some((r) => r.reference === reference)) return { error: `Référence ${reference} déjà attribuée.` };
    const now = new Date().toISOString();
    const identite = input.identifiedAs?.trim() || displayName(input);
    const rec: MortuaryRecord = {
      id: this.nextRecordId(),
      mid: site.id,
      reference,
      incidentId: input.incidentId || undefined,
      foundAt: hospital.nom,
      sex: input.sex,
      ageRange: input.ageRange?.trim() || undefined,
      lastName: input.lastName?.trim() || undefined,
      firstName: input.firstName?.trim() || undefined,
      cni: input.cni?.trim() || undefined,
      age: input.age,
      deathAt: input.deathAt || undefined,
      // L'hôpital connaît son patient : l'identité qu'il donne est confirmée.
      status: identite ? "identified" : "unidentified",
      samples: [],
      identifiedAs: identite || undefined,
      origin: { kind: "hospital", id: hospital.id, label: hospital.nom },
      custody: [
        custodyEvent("hospital", by, { to: hospital.nom, note: input.note }, now),
        custodyEvent("transferred", by, { from: hospital.nom, to: site.nom }, now),
      ],
      pendingReceipt: true,
      admittedAt: now,
      updatedAt: now,
    };
    this.mortuaryRecords.push(rec);
    this.persist();
    return { record: rec };
  }

  /** Le site confirme qu'il a le corps : la réception clôt le transfert. */
  receiveBody(mid: string, rid: string, by: string): { record?: MortuaryRecord; error?: string; missing?: boolean } {
    const rec = this.mortuaryRecords.find((r) => r.id === rid && r.mid === mid);
    const site = this.findMorgue(mid);
    if (!rec || !site) return { missing: true };
    const error = checkReceive(rec);
    if (error) return { error };
    rec.pendingReceipt = false;
    rec.custody = [...(rec.custody ?? []), custodyEvent("received", by, { to: site.nom })];
    rec.updatedAt = new Date().toISOString();
    this.persist();
    return { record: rec };
  }

  /** Le corps part vers un autre site (morgue mobile → institut, par exemple) ; réception à confirmer là-bas. */
  transferBody(mid: string, rid: string, toMid: string, by: string, note?: string): { record?: MortuaryRecord; error?: string; missing?: boolean } {
    const rec = this.mortuaryRecords.find((r) => r.id === rid && r.mid === mid);
    const from = this.findMorgue(mid);
    if (!rec || !from) return { missing: true };
    const to = this.findMorgue(toMid);
    const error = checkTransfer(rec, from, to) ?? (to ? checkCapacity(to, this.mortuaryRecords) : null);
    if (error || !to) return { error: error ?? "Site de destination introuvable." };
    rec.mid = to.id;
    rec.pendingReceipt = true;
    rec.custody = [...(rec.custody ?? []), custodyEvent("transferred", by, { from: from.nom, to: to.nom, note })];
    rec.updatedAt = new Date().toISOString();
    this.persist();
    return { record: rec };
  }

  // --- bilan des victimes d'un incident -----------------------------------------------
  // Les compteurs disent COMBIEN ; les victimes nommées disent QUI. Un décédé
  // affecté à une morgue y ouvre son dossier — la préliminaire du terrain part
  // avec lui, la morgue confirme.

  findIncident(id: string): Incident | undefined {
    return this.incidents.find((i) => i.id === id);
  }

  listVictims(incidentId: string): IncidentVictim[] {
    return this.victims.filter((v) => v.incidentId === incidentId);
  }

  private nextVictimId(): string {
    const n = Math.max(0, ...this.victims.map((v) => parseInt(v.id.replace(/\D/g, ""), 10) || 0)) + 1;
    return `VIC-${n}`;
  }

  /**
   * Les compteurs lus = max(déclaré, victimes nommées) par nature, RECALCULÉ
   * depuis le chiffre déclaré à chaque changement : reclasser ou retirer une
   * victime nommée fait redescendre ce qu'elle avait fait monter.
   */
  private reconcileCasualties(inc: Incident): void {
    const c = inc.casualties ?? { dead: 0, injured: 0, missing: 0 };
    const base = (inc.declaredCasualties ??= { dead: c.dead, injured: c.injured, missing: c.missing });
    const nommes = (k: VictimKind) => this.victims.filter((v) => v.incidentId === inc.id && v.kind === k).length;
    inc.casualties = { ...c, dead: Math.max(base.dead, nommes("dead")), injured: Math.max(base.injured, nommes("injured")), missing: Math.max(base.missing, nommes("missing")) };
  }

  addVictim(
    incidentId: string,
    input: PersonIdentity & { kind: VictimKind; note?: string; deathAt?: string; hospitalId?: string; lastSeen?: string },
    by: string,
  ): IncidentVictim | undefined {
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!inc) return undefined;
    const now = new Date().toISOString();
    const v: IncidentVictim = {
      id: this.nextVictimId(),
      incidentId,
      kind: input.kind,
      lastName: input.lastName?.trim() || undefined,
      firstName: input.firstName?.trim() || undefined,
      cni: input.cni?.trim() || undefined,
      sex: input.sex ?? "unknown",
      age: input.age,
      note: input.note?.trim() || undefined,
      deathAt: input.kind === "dead" ? input.deathAt || undefined : undefined,
      hospitalId: input.kind === "injured" ? input.hospitalId || undefined : undefined,
      lastSeen: input.kind === "missing" ? input.lastSeen?.trim() || undefined : undefined,
      createdAt: now,
      updatedAt: now,
      by,
    };
    this.victims.push(v);
    this.reconcileCasualties(inc);
    this.persist();
    return v;
  }

  updateVictim(
    incidentId: string,
    vid: string,
    patch: Partial<PersonIdentity & { kind: VictimKind; note: string; deathAt: string; hospitalId: string; lastSeen: string }>,
    by: string,
  ): { victim?: IncidentVictim; error?: string; missing?: boolean } {
    const v = this.victims.find((x) => x.id === vid && x.incidentId === incidentId);
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!v || !inc) return { missing: true };
    if (patch.kind && patch.kind !== v.kind && v.recordId) return { error: `${v.id} est affecté à une morgue : sa nature ne change plus.` };
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) (v as unknown as Record<string, unknown>)[k] = typeof val === "string" ? val.trim() || undefined : val;
    }
    v.updatedAt = new Date().toISOString();
    v.by = by;
    // La préliminaire suit jusqu'à la morgue tant qu'elle n'a pas confirmé.
    const rec = v.recordId ? this.mortuaryRecords.find((r) => r.id === v.recordId) : undefined;
    if (rec && rec.status !== "identified" && rec.status !== "released") {
      rec.lastName = v.lastName;
      rec.firstName = v.firstName;
      rec.cni = v.cni;
      rec.sex = v.sex;
      rec.age = v.age;
      rec.deathAt ??= v.deathAt;
      rec.updatedAt = v.updatedAt;
    }
    this.reconcileCasualties(inc);
    this.persist();
    return { victim: v };
  }

  removeVictim(incidentId: string, vid: string): { ok?: true; error?: string; missing?: boolean } {
    const i = this.victims.findIndex((x) => x.id === vid && x.incidentId === incidentId);
    if (i < 0) return { missing: true };
    if (this.victims[i].recordId) return { error: `${vid} est affecté à une morgue : le dossier existe là-bas, la victime ne s'efface plus.` };
    const [v] = this.victims.splice(i, 1);
    const inc = this.incidents.find((x) => x.id === v.incidentId);
    if (inc) this.reconcileCasualties(inc);
    this.persist();
    return { ok: true };
  }

  /**
   * Affecte un décédé à une morgue : son dossier s'ouvre là-bas avec la
   * préliminaire du terrain, réception à confirmer, deux premières étapes de
   * garde (relevé sur le terrain, transfert). La morgue confirme ensuite
   * l'identité — c'est elle qui « identifie ».
   */
  assignVictimMorgue(incidentId: string, vid: string, mid: string, by: string): { victim?: IncidentVictim; record?: MortuaryRecord; error?: string; missing?: boolean } {
    const v = this.victims.find((x) => x.id === vid && x.incidentId === incidentId);
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!v || !inc) return { missing: true };
    if (v.kind !== "dead") return { error: `${vid} n'est pas un décédé.` };
    if (v.recordId) return { error: `${vid} est déjà affecté à une morgue (${v.morgueId}).` };
    const site = this.findMorgue(mid);
    if (!site) return { error: `Site mortuaire introuvable : ${mid}.` };
    const plein = checkCapacity(site, this.mortuaryRecords);
    if (plein) return { error: plein };
    const now = new Date().toISOString();
    const lieu = inc.adresse?.trim() || inc.titre;
    const rec: MortuaryRecord = {
      id: this.nextRecordId(),
      mid: site.id,
      reference: this.nextReference(site),
      incidentId,
      foundAt: lieu,
      sex: v.sex,
      lastName: v.lastName,
      firstName: v.firstName,
      cni: v.cni,
      age: v.age,
      deathAt: v.deathAt,
      status: displayName(v) ? "in_progress" : "unidentified",
      samples: [],
      origin: { kind: "field", label: lieu },
      custody: [custodyEvent("recovered", by, { to: lieu, note: v.note }, now), custodyEvent("transferred", by, { from: lieu, to: site.nom }, now)],
      pendingReceipt: true,
      victimId: v.id,
      admittedAt: now,
      updatedAt: now,
    };
    this.mortuaryRecords.push(rec);
    v.morgueId = site.id;
    v.recordId = rec.id;
    v.updatedAt = now;
    v.by = by;
    // La morgue sert désormais cet incident.
    const resp = (inc.responders ??= { units: [], hospitals: [] });
    if (!(resp.morgues ??= []).includes(site.id)) resp.morgues.push(site.id);
    this.persist();
    return { victim: v, record: rec };
  }

  /** Un site mortuaire fixe de plus — de ville ou régional, rattaché à un établissement, à sa position. */
  createMorgue(input: { nom: string; type: MorgueType; level?: "regional" | "city"; region: string; province?: string; ville: string; hospitalId?: string; capacity: number; staff?: number; ll?: [number, number] }): { site?: MorgueSite; error?: string } {
    const hospital = input.hospitalId ? this.hospitals.find((h) => h.id === input.hospitalId) : undefined;
    if (input.hospitalId && !hospital) return { error: `Établissement introuvable : ${input.hospitalId}.` };
    let n = this.morgues.filter((m) => m.kind !== "mobile").length + 1;
    while (this.morgues.some((m) => m.id === `M${n}`)) n++;
    // Le code des références : trois lettres de la ville, sans accents, uniques.
    const base = input.ville.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3).padEnd(3, "X");
    let code = base;
    let k = 2;
    while (this.morgues.some((m) => m.code === code)) code = `${base}${k++}`;
    const m: MorgueSite = {
      id: `M${n}`,
      nom: input.nom.trim(),
      ville: input.ville.trim(),
      region: input.region.trim(),
      province: input.province?.trim() || undefined,
      level: input.level ?? "city",
      type: input.type,
      hospitalId: hospital?.id,
      capacity: input.capacity,
      staff: input.staff ?? 0,
      statut: "op",
      kind: "fixed",
      code,
      ll: input.ll ?? hospital?.ll,
    };
    this.morgues.push(m);
    this.persist();
    return { site: m };
  }

  /** Une morgue mobile part sur le terrain : un site de plus, à sa position, pour un incident. */
  deployMobileMorgue(input: { nom: string; type?: MorgueType; capacity: number; staff?: number; ll: [number, number]; site: string; incidentId?: string }, by: string): MorgueSite {
    let n = this.morgues.filter((m) => m.kind === "mobile").length + 1;
    while (this.morgues.some((m) => m.id === `MM${n}`)) n++;
    const m: MorgueSite = {
      id: `MM${n}`,
      nom: input.nom.trim(),
      ville: input.site.trim(),
      capacity: input.capacity,
      staff: input.staff ?? 0,
      statut: "op",
      kind: "mobile",
      type: input.type ?? "truck",
      code: `MM${n}`,
      ll: input.ll,
      deployment: { site: input.site.trim(), ll: input.ll, incidentId: input.incidentId || undefined, at: new Date().toISOString(), by },
    };
    this.morgues.push(m);
    this.persist();
    return m;
  }

  /** Une morgue mobile se replie : fermée, plus déployée ; ses dossiers restent, à transférer. */
  recallMorgue(id: string): { site?: MorgueSite; error?: string; missing?: boolean } {
    const m = this.findMorgue(id);
    if (!m) return { missing: true };
    if (m.kind !== "mobile") return { error: "Seule une morgue mobile se replie." };
    const presents = this.mortuaryRecords.filter((r) => r.mid === id && r.status !== "released").length;
    if (presents > 0) return { error: `${presents} corps encore présents : transférez-les avant de replier l'unité.` };
    m.statut = "closed";
    m.deployment = null;
    this.persist();
    return { site: m };
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
    by = "—",
  ): { record?: MortuaryRecord; error?: string; missing?: boolean } {
    const rec = this.mortuaryRecords.find((r) => r.id === rid && r.mid === mid);
    if (!rec) return { missing: true };
    // Nom et prénom saisis à la morgue composent l'identité confirmée que la règle DVI attend.
    const nom = displayName({ lastName: patch.lastName ?? rec.lastName, firstName: patch.firstName ?? rec.firstName });
    if (nom && patch.identifiedAs === undefined && (patch.lastName !== undefined || patch.firstName !== undefined)) patch = { ...patch, identifiedAs: nom };
    const error = checkRecordUpdate(rec, patch);
    if (error) return { error };
    // Traçabilité : ce qui change vraiment, avant → après, signé. Une clé
    // fournie à l'identique ne fait pas une modification ; un patch qui ne
    // change rien ne laisse aucune trace — et ne change pas `updatedAt`.
    const cible = rec as unknown as Record<string, unknown>;
    const change: RecordChange = { at: new Date().toISOString(), by, fields: [], before: {}, after: {} };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const avant = cible[k];
      if (JSON.stringify(avant ?? null) === JSON.stringify(v ?? null)) continue;
      change.fields.push(k);
      if (avant !== undefined) change.before[k] = avant;
      change.after[k] = v;
      cible[k] = v;
    }
    if (change.fields.length === 0) return { record: rec };
    rec.history = [...(rec.history ?? []), change];
    // La restitution est la dernière étape de la chaîne de garde : datée, signée, à qui.
    if (patch.status === "released") rec.custody = [...(rec.custody ?? []), custodyEvent("released", by, { to: rec.releasedTo })];
    rec.updatedAt = change.at;
    this.persist();
    return { record: rec };
  }

  // --- parc d'équipement ----------------------------------------------------
  // Le « parc » d'une unité est l'ensemble de ses équipements. La route porte
  // l'identifiant d'UNITÉ (et non celui de l'article) pour que le ScopeGuard
  // puisse cantonner sans connaître la ressource — même schéma que les services
  // de soins d'un hôpital.

  /** Le détenteur d'une ressource (ADR 0016) : existe-t-il, comment s'appelle-t-il, de quel corps ? */
  resourceOwner(owner: { kind: "unit" | "hospital" | "shelter"; id: string }): { label: string; corps?: UnitCorps } | undefined {
    if (owner.kind === "unit") {
      const u = this.units.find((x) => x.id === owner.id);
      return u ? { label: u.nom, corps: u.corps ?? "far" } : undefined;
    }
    if (owner.kind === "hospital") {
      const h = this.hospitals.find((x) => x.id === owner.id);
      return h ? { label: h.nom } : undefined;
    }
    const s = this.shelters.find((x) => x.id === owner.id);
    return s ? { label: s.nom } : undefined;
  }

  /** Le parc d'un détenteur quel qu'il soit (unité par défaut). */
  listEquipmentOf(owner: { kind: "unit" | "hospital" | "shelter"; id: string }): EquipItem[] {
    return this.equipment.filter((e) => e.unitId === owner.id && (e.ownerKind ?? "unit") === owner.kind);
  }

  listEquipment(unitId?: string): EquipItem[] {
    return unitId ? this.equipment.filter((e) => e.unitId === unitId && (e.ownerKind ?? "unit") === "unit") : this.equipment;
  }

  /** Article au parc d'un hôpital ou d'un abri (ADR 0016) — les unités passent par `addEquipment`. */
  addEquipmentFor(owner: { kind: "unit" | "hospital" | "shelter"; id: string }, label: string, input: Omit<EquipItem, "id" | "unit" | "unitId" | "ownerKind">): EquipItem {
    const n = Math.max(0, ...this.equipment.map((e) => parseInt(e.id.replace(/\D/g, ""), 10) || 0)) + 1;
    const item: EquipItem = { ...input, id: `EQ-${n}`, unit: label, unitId: owner.id, ownerKind: owner.kind };
    this.equipment.push(item);
    this.persist();
    return item;
  }

  updateEquipmentOf(owner: { kind: "unit" | "hospital" | "shelter"; id: string }, eid: string, patch: Partial<Omit<EquipItem, "id" | "unit" | "unitId" | "ownerKind">>): EquipItem | undefined {
    const e = this.equipment.find((x) => x.id === eid && x.unitId === owner.id && (x.ownerKind ?? "unit") === owner.kind);
    if (!e) return undefined;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (e as unknown as Record<string, unknown>)[k] = v;
    this.persist();
    return e;
  }

  removeEquipmentOf(owner: { kind: "unit" | "hospital" | "shelter"; id: string }, eid: string): boolean {
    const i = this.equipment.findIndex((x) => x.id === eid && x.unitId === owner.id && (x.ownerKind ?? "unit") === owner.kind);
    if (i < 0) return false;
    this.equipment.splice(i, 1);
    this.persist();
    return true;
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

  // --- suppression d'entités (ADR 0015) ---------------------------------------
  //
  // Supprimer une unité, un abri, une morgue ou un hôpital est un geste
  // définitif, réservé par le RBAC au Super Administrateur (`*:delete`). Le
  // domaine refuse ce qui laisserait une opération sans ses moyens ou un
  // registre sans son site : les garde-fous ci-dessous disent chacun ce qui
  // retient l'entité, pour que l'opérateur sache quoi défaire d'abord.

  /** Ce qui retient encore l'entité ; vide si elle peut partir. */
  entityBlockers(kind: "unit" | "shelter" | "morgue" | "hospital", id: string): string[] {
    const out: string[] = [];
    const active = this.incidents.filter((i) => !i.archived && i.st !== "closed");
    if (kind === "unit") {
      const engaged = active.filter((i) => i.responders?.units?.includes(id)).map((i) => i.id);
      if (engaged.length) out.push(`engagée sur ${engaged.join(", ")}`);
    }
    if (kind === "hospital") {
      const engaged = active.filter((i) => i.responders?.hospitals?.includes(id)).map((i) => i.id);
      if (engaged.length) out.push(`engagé sur ${engaged.join(", ")}`);
      const attached = this.morgues.filter((m) => m.hospitalId === id).map((m) => m.id);
      if (attached.length) out.push(`morgue(s) rattachée(s) : ${attached.join(", ")}`);
      const field = this.fieldHospitals.filter((f) => f.hid === id).length;
      if (field) out.push(`${field} hôpital(aux) de campagne`);
    }
    if (kind === "morgue") {
      const bodies = this.mortuaryRecords.filter((r) => r.mid === id && r.status !== "released").length;
      if (bodies) out.push(`${bodies} corps au registre`);
      const engaged = active.filter((i) => i.responders?.morgues?.includes(id)).map((i) => i.id);
      if (engaged.length) out.push(`affectée à ${engaged.join(", ")}`);
    }
    if (kind === "shelter") {
      const s = this.shelters.find((x) => x.id === id);
      if (s && s.occupants > 0) out.push(`${s.occupants} occupant(s)`);
    }
    return out;
  }

  /**
   * Retire définitivement une entité. `force` passe outre les garde-fous
   * (l'opérateur l'a demandé en connaissance de cause) ; rien ne passe outre
   * l'existence : une entité inconnue rend `missing`.
   */
  deleteEntity(
    kind: "unit" | "shelter" | "morgue" | "hospital",
    id: string,
    actor: string,
    force = false,
    /** Comptes qui ont la responsabilité de l'entité (IAM) — un garde-fou de plus, fourni par l'appelant. */
    responsibles: readonly string[] = [],
  ): { ok?: true; missing?: boolean; blockers?: string[]; removed?: number } {
    const exists =
      kind === "unit" ? this.units.some((u) => u.id === id)
      : kind === "shelter" ? this.shelters.some((s) => s.id === id)
      : kind === "morgue" ? this.morgues.some((m) => m.id === id)
      : this.hospitals.some((h) => h.id === id);
    if (!exists) return { missing: true };
    const blockers = this.entityBlockers(kind, id);
    if (responsibles.length) blockers.push(`responsable(s) affecté(s) : ${responsibles.join(", ")}`);
    if (blockers.length && !force) return { blockers };

    let removed = 1;
    if (kind === "hospital") {
      // Le référentiel hospitalier n'est pas élagué par les règles de profil :
      // on retire l'établissement, ses services, ses hôpitaux de campagne, et
      // on détache ce qui s'y référait (morgues rattachées, moyens engagés).
      this.hospitals.splice(0, this.hospitals.length, ...this.hospitals.filter((h) => h.id !== id));
      removed += this.wards.filter((w) => w.hid === id).length + this.fieldHospitals.filter((f) => f.hid === id).length;
      this.wards.splice(0, this.wards.length, ...this.wards.filter((w) => w.hid !== id));
      this.fieldHospitals.splice(0, this.fieldHospitals.length, ...this.fieldHospitals.filter((f) => f.hid !== id));
      for (const m of this.morgues) if (m.hospitalId === id) delete m.hospitalId;
      for (const i of this.incidents) if (i.responders?.hospitals) i.responders.hospitals = i.responders.hospitals.filter((h) => h !== id);
    } else {
      const r = pruneDemo(this.collections(), { ids: new Set([id]) });
      this.applyPrune(r);
      removed = r.total;
      for (const i of this.incidents) {
        if (kind === "unit" && i.responders?.units) i.responders.units = i.responders.units.filter((u) => u !== id);
        if (kind === "unit" && i.assignments) i.assignments = i.assignments.filter((a) => a.unitId !== id);
        if (kind === "morgue" && i.responders?.morgues) i.responders.morgues = i.responders.morgues.filter((m) => m !== id);
      }
    }
    // Une graine supprimée reste supprimée : la reprise ne la réinjecte pas.
    // (En station vide rien n'est réinjecté ; la pierre tombale y serait un
    // contresens — U1 peut y être une unité bien réelle.)
    if (DEMO_DATA && DEMO_SEED_IDS.has(id)) this.tombstones.add(id);
    for (const fn of this.entityCascades) fn(kind, id);
    const label = { unit: "Unité", shelter: "Abri", morgue: "Morgue", hospital: "Hôpital" }[kind];
    this.pushFeed(`${label} ${id} — SUPPRIMÉ par ${actor}`, "bg-danger-500");
    this.persist();
    return { ok: true, removed };
  }

  /** Le volume du domaine, pour l'écran d'administration : ce que la purge emporterait, ce qu'elle garderait. */
  volume(): { counts: Record<string, number>; seededLeft: number } {
    const c = this.collections();
    const counts = Object.fromEntries((Object.keys(c) as (keyof DomainCollections)[]).map((k) => [k, c[k].length]));
    // En station vide, un identifiant de graine peut désigner une entité réelle : le compte n'a de sens qu'en démonstration.
    const seededLeft = DEMO_DATA
      ? [...this.incidents, ...this.units, ...this.shelters, ...this.morgues].filter((e) => DEMO_SEED_IDS.has(e.id) && !this.tombstones.has(e.id)).length
      : 0;
    return { counts, seededLeft };
  }

  /**
   * Purge : tout le domaine sauf le réseau hospitalier et ses services. Les
   * cascades d'incident (missions, déploiements) courent pour chaque incident
   * retiré. Réservée au Super Administrateur, signée par son mot de passe
   * (contrôleur). C'est le geste qui fait d'une station de démonstration une
   * station vide sans toucher aux comptes ni à la base.
   */
  async purgeDemo(actor: string): Promise<{ removed: number; incidents: number }> {
    const r = pruneDemo(this.collections(), { ids: new Set(), all: true });
    for (const id of r.removedIncidentIds) for (const fn of this.cascades) await fn(id);
    this.applyPrune(r);
    if (DEMO_DATA) for (const id of DEMO_SEED_IDS) this.tombstones.add(id);
    this.pushFeed(`Domaine remis à zéro par ${actor} — réseau hospitalier conservé`, "bg-danger-500");
    this.persist();
    return { removed: r.total, incidents: r.removedIncidentIds.length };
  }

  // File de répartition et mouvements de transport : un jeu de démonstration
  // figé, servi en profil « demo » seulement — les vraies demandes passent
  // par les boucles opérationnelles (module missions).
  // --- chaîne de commandement : affectation et déploiement (ADR 0016) ---------

  /** Les affectations d'une opération (vide si elle n'en a pas). */
  listAssignments(incidentId: string): UnitAssignment[] {
    return this.incidents.find((i) => i.id === incidentId)?.assignments ?? [];
  }

  /**
   * L'OPCOM affecte une unité à l'opération, vers le PCO ou le PCT. Une unité
   * n'est affectée qu'à une opération à la fois ; la retirer d'abord.
   */
  assignUnit(
    incidentId: string,
    unitId: string,
    actor: string,
    role: Role,
    requested?: Destination,
  ): { ok?: true; assignment?: UnitAssignment; missing?: "incident" | "unit"; error?: string; conflict?: boolean } {
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!inc) return { missing: "incident" };
    if (inc.archived || inc.st === "closed") return { error: "Opération close : aucune affectation possible." };
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit) return { missing: "unit" };
    const corps = unit.corps ?? "far";
    if (!canAssignCorps(role, corps)) {
      return { error: `Le rôle ${role} n'affecte pas les unités du corps « ${CORPS_LABELS[corps]} ».` };
    }
    if (unit.assignment && unit.assignment.incidentId !== incidentId) {
      return { error: `${unit.nom} est déjà affectée à ${unit.assignment.incidentId} — la retirer d'abord.`, conflict: true };
    }
    const destination = destinationFor(corps, requested);
    inc.assignments ??= [];
    let a = inc.assignments.find((x) => x.unitId === unitId);
    const now = new Date().toISOString();
    if (a) {
      // Réaffecter vers l'autre PC : seulement tant qu'elle n'est pas déployée.
      if (a.deployedAt && a.destination !== destination) return { error: `${unit.nom} est déployée : la retirer avant de changer sa destination.`, conflict: true };
      a.destination = destination;
    } else {
      a = { unitId, destination, by: actor, at: now };
      inc.assignments.push(a);
    }
    inc.responders ??= { units: [], hospitals: [] };
    if (!inc.responders.units.includes(unitId)) inc.responders.units.push(unitId);
    unit.assignment = { incidentId, destination, deployed: !!a.deployedAt };
    this.pushFeed(`${unit.nom} affectée à ${incidentId} → ${destination.toUpperCase()} par ${actor}`, "bg-blue-500", incidentId);
    this.persist();
    return { ok: true, assignment: a };
  }

  /** L'OPCOM retire une affectation ; une unité déployée est d'abord retirée du terrain. */
  unassignUnit(incidentId: string, unitId: string, actor: string): { ok?: true; missing?: boolean } {
    const inc = this.incidents.find((i) => i.id === incidentId);
    const a = inc?.assignments?.find((x) => x.unitId === unitId);
    if (!inc || !a) return { missing: true };
    inc.assignments = inc.assignments!.filter((x) => x.unitId !== unitId);
    if (inc.responders) inc.responders.units = inc.responders.units.filter((u) => u !== unitId);
    const unit = this.units.find((u) => u.id === unitId);
    if (unit) {
      delete unit.assignment;
      if (a.deployedAt && unit.dispo === "deployed") unit.dispo = "ready";
      this.pushFeed(`${unit.nom} retirée de ${incidentId} par ${actor}`, "bg-gray-500", incidentId);
    }
    this.persist();
    return { ok: true };
  }

  /** Le TACOM, ses PC ou une cellule déploient sur le terrain (ou retirent) une unité affectée. */
  setDeployed(incidentId: string, unitId: string, deployed: boolean, actor: string): { ok?: true; missing?: boolean; assignment?: UnitAssignment } {
    const inc = this.incidents.find((i) => i.id === incidentId);
    const a = inc?.assignments?.find((x) => x.unitId === unitId);
    const unit = this.units.find((u) => u.id === unitId);
    if (!inc || !a || !unit) return { missing: true };
    if (deployed) {
      a.deployedAt = new Date().toISOString();
      a.deployedBy = actor;
      unit.dispo = "deployed";
      this.pushFeed(`${unit.nom} déployée sur ${incidentId} (${a.destination.toUpperCase()}) par ${actor}`, "bg-or-500", incidentId);
    } else {
      delete a.deployedAt;
      delete a.deployedBy;
      unit.dispo = "ready";
      this.pushFeed(`${unit.nom} retirée du terrain de ${incidentId} par ${actor}`, "bg-gray-500", incidentId);
    }
    unit.assignment = { incidentId, destination: a.destination, deployed };
    this.persist();
    return { ok: true, assignment: a };
  }

  private readonly queue: QueueItem[] = DEMO_DATA ? [
    { id: "REQ-5012", kind: "evac", label: "Évacuation 14 blessés graves — Douar Tnirt", incidentId: "INC-2607", target: [-8.36, 31.05], type: "earthquake", urgency: "urgent" },
    { id: "REQ-5011", kind: "logistics", label: "Groupes électrogènes + éclairage — PC Amizmiz", incidentId: "INC-2607", target: [-8.25, 31.22], type: "earthquake", urgency: "high" },
    { id: "REQ-5009", kind: "shelter", label: "Renfort tentes & vivres — abris Talat N'Yaaqoub", incidentId: "INC-2607", target: [-8.26, 30.98], type: "earthquake", urgency: "high" },
    { id: "REQ-5007", kind: "logistics", label: "Pompage & potabilisation — crues Ourika", incidentId: "INC-2606", target: [-7.79, 31.32], type: "flood", urgency: "medium" },
    { id: "REQ-5004", kind: "evac", label: "Rotation EVASAN — point de tri Tizi N'Test", incidentId: "INC-2607", target: [-8.2, 30.9], type: "earthquake", urgency: "urgent" },
  ] : [];

  private readonly movements: TransportMovement[] = DEMO_DATA ? [
    { id: "MVT-3301", mission: "Convoi logistique", vehicles: "LOG-1 · 6 véh.", origin: "Rabat", destination: "Marrakech (A7)", cargo: "40 t fret humanitaire", progress: 62, etaMin: 74, delayMin: 0 },
    { id: "MVT-3302", mission: "Recherche & sauvetage", vehicles: "SAR-2 · 4 véh.", origin: "Agadir", destination: "Amizmiz", cargo: "Équipe cynophile + déblaiement", progress: 78, etaMin: 33, delayMin: 12 },
    { id: "MVT-3303", mission: "Évacuation sanitaire", vehicles: "EVASAN-1 · hélico", origin: "Marrakech", destination: "Zone sinistrée", cargo: "6 blessés graves", progress: 41, etaMin: 18, delayMin: 0 },
    { id: "MVT-3304", mission: "Ravitaillement abris", vehicles: "LOG-3 · 3 véh.", origin: "Fès", destination: "Talat N'Yaaqoub", cargo: "12 tentes + vivres", progress: 25, etaMin: 96, delayMin: 24 },
  ] : [];

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

  // Convois animés côté navigateur : une SIMULATION, servie en profil « demo »
  // seulement. Une station vide n'a rien qui bouge sans qu'on l'ait déclaré.
  private readonly vehRoutes = DEMO_DATA ? [
    { id: "LOG-1", label: "Convoi LOG-1", kind: "Convoi logistique · Rabat → Marrakech (A7)", speed: 0.01, route: [[-6.84, 34.02], [-7.1, 33.87], [-7.38, 33.69], [-7.59, 33.57], [-7.62, 33.42], [-7.63, 33.23], [-7.8, 32.88], [-7.94, 32.6], [-7.95, 32.23], [-8.0, 31.92], [-8.01, 31.63], [-8.13, 31.45], [-8.25, 31.22]] },
    { id: "SAR-2", label: "Convoi SAR-2", kind: "Recherche & sauvetage · Agadir → Amizmiz", speed: 0.012, route: [[-9.6, 30.42], [-9.35, 30.44], [-9.1, 30.46], [-8.88, 30.47], [-8.6, 30.62], [-8.44, 30.83], [-8.38, 31.0], [-8.3, 31.12], [-8.25, 31.22]] },
    { id: "EVASAN-1", label: "EVASAN-1", kind: "Hélicoptère médicalisé · rotation Marrakech ↔ zone sinistrée", speed: 0.03, route: [[-8.01, 31.63], [-8.15, 31.45], [-8.25, 31.22], [-8.26, 30.98], [-8.25, 31.22], [-8.15, 31.45], [-8.01, 31.63]] },
  ] : [];

  /** Référentiel + profil de données : le navigateur y lit s'il doit couper ses propres simulateurs. */
  reference() {
    return { provinces: this.provinces, cities: CITIES_MA, vehRoutes: this.vehRoutes, dataProfile: DATA_PROFILE, appMode: APP_MODE };
  }

  // --- statistiques de commandement (tableau de bord national) -------------

  stats() {
    return computeStats(this.snapshot());
  }

  /** L'instantané que lisent les calculs purs (domain.analytics.ts). */
  private snapshot(): DomainSnapshot {
    return { incidents: this.incidents, units: this.units, hospitals: this.hospitals, equipment: this.equipment };
  }

  // ========================================================================
  // Analytique · KPI + graphiques calculés depuis DONNÉES RÉELLES du domaine
  // Remplace la constante statique ANALYTICS du catalogue (catalog.data.ts).
  // Format contractuel strictement identique à Catalog.analytics pour ne
  // rien casser dans le frontend.
  // ========================================================================

  computeAnalytics() {
    return computeAnalyticsOf(this.snapshot());
  }
}
