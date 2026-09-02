import { Injectable } from "@nestjs/common";
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
import { loadDevState, saveDevState } from "@/common/dev-store";

// ============================================================================
// ARGOS — données de domaine (Phase 2, in-memory)
// Source de vérité serveur pour les entités opérationnelles consommées par le
// frontend (incidents, unités, hôpitaux, fil d'événements). En production :
// PostgreSQL + PostGIS. Les formes correspondent aux types du frontend.
// ============================================================================

// Les types du domaine vivent dans domain.types.ts ; ré-exportés ici pour les
// importateurs existants (contrôleurs, autres modules).
export type { Incident, SubIncident, Unit, Sitrep, Hospital, FieldHospital, HospitalWard, Shelter, MorgueSite, DviStatus, DviSample, MortuaryRecord, FeedItem, QueueItem, TransportMovement } from "@/modules/domain/domain.types";
export { DVI_STATUSES, DVI_SAMPLES } from "@/modules/domain/domain.types";
import type { Incident, SubIncident, Unit, Sitrep, Hospital, FieldHospital, HospitalWard, Shelter, MorgueSite, DviSample, MortuaryRecord, FeedItem, QueueItem, TransportMovement } from "@/modules/domain/domain.types";


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

function canonicalizeRegion(inc: Incident): Incident {
  const fixed = LEGACY_REGION_MAP[inc.region];
  return fixed ? { ...inc, region: fixed } : inc;
}

@Injectable()
export class DomainService {
  private incidents: Incident[] = structuredClone(SEED_INCIDENTS);

  private readonly units: Unit[] = structuredClone(SEED_UNITS);

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
    const sameSeed = snap.seedVersion === DOMAIN_SEED_VERSION;

    // Incidents et unités : reprise INTÉGRALE tant que le seed n'a pas changé.
    // Sur une montée de version, on reconstruit le jeu de démonstration et on
    // CONSERVE ce qu'un utilisateur a créé pendant la séance — écraser les deux
    // ferait perdre du travail, n'écraser ni l'un ni l'autre rendrait tout
    // nouveau jeu de données sans effet là où il en faut un.
    if (snap.incidents) {
      const restored = snap.incidents.map(canonicalizeRegion);
      const seedIds = new Set(SEED_INCIDENTS.map((i) => i.id));
      const kept = sameSeed
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
      const kept = sameSeed
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
    const inc: Incident = { ...input, id: `INC-${highest + 1}`, time };
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
   * Entités engagées sur un incident — unités ET hôpitaux confondus.
   *
   * Sert la portée « entity » : un responsable d'hôpital voit les opérations où
   * SON établissement sert. La liste vit ici parce que la donnée y vit ; la
   * doctrine de visibilité la reçoit sans connaître la forme d'un incident.
   */
  entitiesOnIncident(incidentId: string): string[] {
    const inc = this.incidents.find((i) => i.id === incidentId);
    return [...(inc?.responders?.units ?? []), ...(inc?.responders?.hospitals ?? [])];
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

  /**
   * Ouvre un abri (lot OPSnet).
   *
   * Les répartitions par âge partent à zéro plutôt que d'être devinées depuis
   * les occupants : un abri qu'on ouvre n'a pas encore de recensement, et des
   * chiffres inventés se liraient comme un dénombrement.
   */
  createShelter(input: {
    nom: string;
    ville: string;
    capacity: number;
    occupants?: number;
    staff?: number;
    supplies?: Shelter["supplies"];
    needs?: string;
  }): Shelter {
    const n = Math.max(0, ...this.shelters.map((x) => parseInt(x.id.replace(/\D/g, ""), 10) || 0)) + 1;
    const shelter: Shelter = {
      id: `AB-${String(n).padStart(2, "0")}`,
      nom: input.nom,
      ville: input.ville,
      capacity: input.capacity,
      occupants: Math.min(input.occupants ?? 0, input.capacity),
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
