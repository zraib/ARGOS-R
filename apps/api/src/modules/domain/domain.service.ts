import { Injectable } from "@nestjs/common";
import { PROVINCES_MA, llToSvg } from "@/modules/domain/provinces.data";
import { CITIES_MA } from "@/modules/domain/cities.data";
import { ORSEC_BOARD } from "@/modules/domain/catalog.data";
import { HOSPITALS_MA, type HospitalKind } from "@/modules/domain/hospitals.data";
import { loadDevState, saveDevState } from "@/common/dev-store";

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
 * v2 — réseau hospitalier militaire officiel (7 établissements).
 * v3 — ajout du réseau hospitalier public civil (106 établissements) et du
 *      champ `kind` différenciant les symboles cartographiques.
 */
const DOMAIN_SEED_VERSION = 3;

@Injectable()
export class DomainService {
  private readonly incidents: Incident[] = [
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

  // --- statistiques de commandement (tableau de bord état-major) -----------

  /**
   * Vue globale pour l'état-major : évolution des déclarations sur 30 jours,
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
}
