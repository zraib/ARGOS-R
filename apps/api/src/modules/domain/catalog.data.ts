// ============================================================================
// ARGOS — données simulées des modules opérationnels
// Basées sur le MASTER_PLAN §6. Même rôle que lib/data/seed.ts : source unique
// lue par les écrans des modules, à remplacer plus tard par le client API.
// ============================================================================

import type { Placement } from "@/modules/domain/domain.types";

export type EquipCondition = "ok" | "repair" | "oos";
export interface EquipItem {
  id: string;
  desig: string;
  cat: string;
  /** Libellé court de l'unité détentrice (affichage). */
  unit: string;
  /**
   * Unité détentrice — identifiant du référentiel (U1…U6). C'est LUI qui porte
   * le cantonnement ABAC du parc ; `unit` reste un libellé d'affichage.
   */
  unitId: string;
  /**
   * Nature du détenteur (ADR 0016) : une unité par défaut ; un hôpital ou un
   * abri tiennent aussi leur matériel. `unitId` porte alors l'identifiant de
   * l'établissement ou de l'abri.
   */
  ownerKind?: "unit" | "hospital" | "shelter";
  /** Type / numéro d'inventaire (ADR 0016), facultatif. */
  type?: string;
  serial?: string;
  /** Posé sur le terrain par le TACOM (ADR 0018). */
  position?: Placement;
  stock: number;
  threshold: number;
  cond: EquipCondition;
}
export type MovementType = "in" | "out" | "transfer";
export interface Movement {
  id: string;
  date: string;
  type: MovementType;
  item: string;
  qty: number;
  from: string;
  to: string;
  by: string;
}

export const EQUIPMENT: EquipItem[] = [
  { id: "EQ-1012", desig: "Groupe électrogène 20 kVA", cat: "Énergie", unit: "1er GI", unitId: "U1", stock: 14, threshold: 6, cond: "ok" },
  { id: "EQ-1027", desig: "Station de pompage mobile", cat: "Hydraulique", unit: "3e BG", unitId: "U2", stock: 5, threshold: 8, cond: "ok" },
  { id: "EQ-1031", desig: "Tente modulaire 12 places", cat: "Campement", unit: "2e GL", unitId: "U4", stock: 46, threshold: 20, cond: "ok" },
  { id: "EQ-1044", desig: "Kit de déblaiement hydraulique", cat: "Sauvetage", unit: "3e BG", unitId: "U2", stock: 3, threshold: 5, cond: "repair" },
  { id: "EQ-1058", desig: "Radio tactique PR4G", cat: "Transmissions", unit: "1er GI", unitId: "U1", stock: 62, threshold: 30, cond: "ok" },
  { id: "EQ-1063", desig: "Station de potabilisation", cat: "Eau", unit: "5e BS", unitId: "U5", stock: 4, threshold: 4, cond: "ok" },
  { id: "EQ-1071", desig: "Lot de brancards pliants", cat: "Médical", unit: "7e RA", unitId: "U3", stock: 28, threshold: 15, cond: "ok" },
  { id: "EQ-1088", desig: "Ballon d'éclairage 2 kW", cat: "Énergie", unit: "2e GL", unitId: "U4", stock: 2, threshold: 6, cond: "repair" },
  { id: "EQ-1094", desig: "Motopompe thermique", cat: "Hydraulique", unit: "3e BG", unitId: "U2", stock: 9, threshold: 5, cond: "ok" },
  { id: "EQ-1102", desig: "Détecteur multigaz NRBC", cat: "NRBC", unit: "4e NRBC", unitId: "U6", stock: 7, threshold: 4, cond: "ok" },
  { id: "EQ-1119", desig: "Citerne souple 5 000 L", cat: "Eau", unit: "5e BS", unitId: "U5", stock: 1, threshold: 3, cond: "oos" },
  { id: "EQ-1126", desig: "Groupe froid mortuaire", cat: "Logistique", unit: "2e GL", unitId: "U4", stock: 2, threshold: 2, cond: "ok" },
];

export const MOVEMENTS: Movement[] = [
  { id: "MV-4471", date: "Aujourd'hui 07:20", type: "out", item: "Tente modulaire 12 places", qty: 12, from: "2e GL — Fès", to: "HMC Amizmiz", by: "Lt-Col. S. Amrani" },
  { id: "MV-4470", date: "Aujourd'hui 06:05", type: "transfer", item: "Groupe électrogène 20 kVA", qty: 4, from: "1er GI — Rabat", to: "3e BG — Marrakech", by: "Col. Y. Benjelloun" },
  { id: "MV-4468", date: "Hier 18:40", type: "in", item: "Radio tactique PR4G", qty: 20, from: "Base logistique EMG", to: "1er GI — Rabat", by: "Magasinier" },
  { id: "MV-4465", date: "Hier 14:12", type: "out", item: "Kit de déblaiement hydraulique", qty: 2, from: "3e BG — Marrakech", to: "Zone Al Haouz", by: "Lt-Col. A. Tazi" },
  { id: "MV-4461", date: "J-1 09:30", type: "transfer", item: "Station de potabilisation", qty: 1, from: "5e BS — Oujda", to: "Zone Al Haouz", by: "Cdt. H. Berrada" },
  { id: "MV-4457", date: "J-2 16:00", type: "in", item: "Brancards pliants", qty: 10, from: "Réserve santé", to: "7e RA — Agadir", by: "Magasinier" },
  { id: "MV-4452", date: "J-2 11:25", type: "out", item: "Ballon d'éclairage 2 kW", qty: 2, from: "2e GL — Fès", to: "PC Opérations Amizmiz", by: "Lt-Col. S. Amrani" },
  { id: "MV-4448", date: "J-3 08:10", type: "transfer", item: "Motopompe thermique", qty: 3, from: "3e BG — Marrakech", to: "Vallée de l'Ourika", by: "Lt-Col. A. Tazi" },
];

export type Availability = "available" | "deployed" | "rest" | "unavailable";
export interface PersonRecord {
  id: string;
  grade: string;
  nom: string;
  unit: string;
  fonction: string;
  spec: string;
  av: Availability;
}

export const ROSTER: PersonRecord[] = [
  { id: "MLE-20481", grade: "Cne.", nom: "Y. El Amrani", unit: "1er GI", fonction: "Chef de section", spec: "SAR urbain", av: "deployed" },
  { id: "MLE-20517", grade: "Lt.", nom: "K. Bouazza", unit: "1er GI", fonction: "Opérateur radio", spec: "Transmissions", av: "available" },
  { id: "MLE-20560", grade: "Adj.", nom: "R. Rahmouni", unit: "3e BG", fonction: "Sapeur sauveteur", spec: "Déblaiement", av: "deployed" },
  { id: "MLE-20604", grade: "Sgt.", nom: "H. Sebti", unit: "3e BG", fonction: "Conducteur d'engin", spec: "Génie", av: "deployed" },
  { id: "MLE-20638", grade: "Méd. Cdt.", nom: "S. Ouazzani", unit: "7e RA", fonction: "Médecin d'unité", spec: "Médecine d'urgence", av: "deployed" },
  { id: "MLE-20671", grade: "Inf. Maj.", nom: "N. Idrissi", unit: "7e RA", fonction: "Infirmier chef", spec: "Réanimation", av: "available" },
  { id: "MLE-20702", grade: "Cne.", nom: "A. Kabbaj", unit: "2e GL", fonction: "Officier logistique", spec: "Ravitaillement", av: "available" },
  { id: "MLE-20744", grade: "Sgt.", nom: "M. Lamrani", unit: "2e GL", fonction: "Conducteur PL", spec: "Transport", av: "deployed" },
  { id: "MLE-20789", grade: "Lt.", nom: "F. Zeroual", unit: "5e BS", fonction: "Chef d'équipe", spec: "Soutien", av: "rest" },
  { id: "MLE-20810", grade: "Cpl.", nom: "T. Bennis", unit: "5e BS", fonction: "Électromécanicien", spec: "Maintenance", av: "available" },
  { id: "MLE-20853", grade: "Cne.", nom: "O. Haddadi", unit: "4e NRBC", fonction: "Officier NRBC", spec: "Décontamination", av: "unavailable" },
  { id: "MLE-20897", grade: "Adj.", nom: "L. Mounir", unit: "4e NRBC", fonction: "Spécialiste détection", spec: "NRBC", av: "available" },
  { id: "MLE-20921", grade: "Sgt.", nom: "D. El Amrani", unit: "1er GI", fonction: "Maître-chien", spec: "Cynotechnie", av: "deployed" },
  { id: "MLE-20958", grade: "1re Cl.", nom: "B. Sebti", unit: "3e BG", fonction: "Sapeur", spec: "Sauvetage", av: "rest" },
];

export type WoPriority = "low" | "medium" | "high" | "urgent";
export type WoStatus = "requested" | "approved" | "assigned" | "inprogress" | "done" | "verified";
export interface WorkOrder {
  id: string;
  subject: string;
  unit: string;
  assignee: string;
  priority: WoPriority;
  status: WoStatus;
  sla: string;
  created: string;
}

export const WORK_ORDERS: WorkOrder[] = [
  { id: "BT-3391", subject: "Rétablir l'accès RP2010 (déblaiement)", unit: "3e BG", assignee: "Adj. R. Rahmouni", priority: "urgent", status: "inprogress", sla: "Aujourd'hui 14:00", created: "06:15" },
  { id: "BT-3390", subject: "Installer 3 groupes électrogènes — PC Amizmiz", unit: "2e GL", assignee: "Cne. A. Kabbaj", priority: "high", status: "assigned", sla: "Aujourd'hui 12:00", created: "06:40" },
  { id: "BT-3388", subject: "Réparer motopompe MV-4448", unit: "3e BG", assignee: "Cpl. T. Bennis", priority: "medium", status: "inprogress", sla: "Aujourd'hui 16:00", created: "05:55" },
  { id: "BT-3386", subject: "Acheminer 12 tentes vers Talat N'Yaaqoub", unit: "2e GL", assignee: "Sgt. M. Lamrani", priority: "high", status: "done", sla: "Aujourd'hui 09:00", created: "J-1 21:10" },
  { id: "BT-3383", subject: "Station de potabilisation — vallée Ourika", unit: "5e BS", assignee: "Lt. F. Zeroual", priority: "urgent", status: "verified", sla: "Hier 20:00", created: "J-1 15:20" },
  { id: "BT-3380", subject: "Contrôle NRBC entrepôt Mohammedia", unit: "4e NRBC", assignee: "Cne. O. Haddadi", priority: "medium", status: "requested", sla: "Demain 10:00", created: "J-1 12:00" },
  { id: "BT-3378", subject: "Maintenance ballon d'éclairage EQ-1088", unit: "2e GL", assignee: "—", priority: "low", status: "requested", sla: "Demain", created: "J-1 10:30" },
  { id: "BT-3375", subject: "Remplacer citerne souple hors service", unit: "5e BS", assignee: "Lt. F. Zeroual", priority: "high", status: "approved", sla: "Aujourd'hui 18:00", created: "J-1 09:05" },
  { id: "BT-3372", subject: "Renfort brancardage HMC Amizmiz", unit: "7e RA", assignee: "Inf. Maj. N. Idrissi", priority: "medium", status: "inprogress", sla: "Aujourd'hui 17:00", created: "J-2 22:40" },
  { id: "BT-3369", subject: "Balisage héliport de campagne Amizmiz", unit: "1er GI", assignee: "Cne. Y. El Amrani", priority: "high", status: "verified", sla: "J-1 12:00", created: "J-2 18:15" },
];

// --- Triage ---------------------------------------------------------------
export type TriageColor = "red" | "yellow" | "green" | "black";
export interface TriageZone {
  id: string;
  name: string;
  red: number;
  yellow: number;
  green: number;
  black: number;
}
export interface Victim {
  tag: string;
  color: TriageColor;
  zone: string;
  time: string;
  destination: string;
}

export const TRIAGE_ZONES: TriageZone[] = [
  { id: "TZ-1", name: "PMA Amizmiz", red: 6, yellow: 14, green: 31, black: 3 },
  { id: "TZ-2", name: "PMA Talat N'Yaaqoub", red: 4, yellow: 9, green: 18, black: 2 },
  { id: "TZ-3", name: "Point de tri Tizi N'Test", red: 2, yellow: 6, green: 11, black: 1 },
];

export const TRIAGE_FLOW = { site: 47, evac: 21, hospital: 63 };

export const VICTIMS: Victim[] = [
  { tag: "T-1042", color: "red", zone: "PMA Amizmiz", time: "07:14", destination: "HM Avicenne" },
  { tag: "T-1041", color: "yellow", zone: "PMA Amizmiz", time: "07:12", destination: "HMC Amizmiz" },
  { tag: "T-1039", color: "red", zone: "PMA Talat N'Yaaqoub", time: "07:09", destination: "EVASAN-1" },
  { tag: "T-1036", color: "green", zone: "Point de tri Tizi N'Test", time: "07:03", destination: "HMC Amizmiz" },
  { tag: "T-1034", color: "black", zone: "PMA Amizmiz", time: "06:58", destination: "—" },
  { tag: "T-1031", color: "yellow", zone: "PMA Talat N'Yaaqoub", time: "06:52", destination: "HMC Talat N'Yaaqoub" },
  { tag: "T-1029", color: "green", zone: "PMA Amizmiz", time: "06:47", destination: "Sur site" },
  { tag: "T-1025", color: "red", zone: "Point de tri Tizi N'Test", time: "06:39", destination: "HM Avicenne" },
];

// --- Abris ----------------------------------------------------------------
export type SupplyStatus = "ok" | "low" | "critical";
export interface Shelter {
  id: string;
  nom: string;
  ville: string;
  capacity: number;
  occupants: number;
  staff: number;
  supplies: SupplyStatus;
  needs: string;
  adults: number;
  children: number;
  elderly: number;
}

export const SHELTERS: Shelter[] = [
  { id: "AB-01", nom: "Complexe sportif Amizmiz", ville: "Amizmiz", capacity: 800, occupants: 742, staff: 24, supplies: "low", needs: "Couvertures, eau", adults: 410, children: 245, elderly: 87 },
  { id: "AB-02", nom: "École Talat N'Yaaqoub", ville: "Talat N'Yaaqoub", capacity: 450, occupants: 421, staff: 15, supplies: "critical", needs: "Vivres, tentes, médical", adults: 210, children: 168, elderly: 43 },
  { id: "AB-03", nom: "Centre communal Ouirgane", ville: "Ouirgane", capacity: 300, occupants: 188, staff: 11, supplies: "ok", needs: "—", adults: 96, children: 71, elderly: 21 },
  { id: "AB-04", nom: "Stade municipal Tahannaout", ville: "Tahannaout", capacity: 600, occupants: 356, staff: 18, supplies: "ok", needs: "Éclairage", adults: 190, children: 128, elderly: 38 },
  { id: "AB-05", nom: "Foyer Asni", ville: "Asni", capacity: 250, occupants: 244, staff: 9, supplies: "low", needs: "Chauffage, eau", adults: 121, children: 96, elderly: 27 },
  { id: "AB-06", nom: "Camp de toile Moulay Brahim", ville: "Moulay Brahim", capacity: 500, occupants: 312, staff: 14, supplies: "ok", needs: "Sanitaires", adults: 168, children: 112, elderly: 32 },
];

// --- Évaluation des dommages ----------------------------------------------
export type Habitability = "ok" | "restricted" | "no";
export interface DamageRecord {
  id: string;
  building: string;
  zone: string;
  grade: 1 | 2 | 3 | 4 | 5;
  habitability: Habitability;
  assessor: string;
  date: string;
}

export const DAMAGE: DamageRecord[] = [
  { id: "EV-8801", building: "Habitat rural (pisé)", zone: "Douar Tnirt", grade: 5, habitability: "no", assessor: "Cne. Y. El Amrani", date: "Aujourd'hui 07:05" },
  { id: "EV-8799", building: "École primaire", zone: "Amizmiz", grade: 3, habitability: "restricted", assessor: "Adj. R. Rahmouni", date: "Aujourd'hui 06:40" },
  { id: "EV-8796", building: "Habitat collectif", zone: "Tahannaout", grade: 2, habitability: "ok", assessor: "Lt. K. Bouazza", date: "Hier 19:20" },
  { id: "EV-8792", building: "Pont routier", zone: "Oued Rheraya", grade: 4, habitability: "no", assessor: "Sgt. H. Sebti", date: "Hier 17:50" },
  { id: "EV-8788", building: "Mosquée", zone: "Talat N'Yaaqoub", grade: 4, habitability: "restricted", assessor: "Cne. Y. El Amrani", date: "Hier 15:10" },
  { id: "EV-8784", building: "Dispensaire", zone: "Ouirgane", grade: 3, habitability: "restricted", assessor: "Méd. Cdt. S. Ouazzani", date: "Hier 12:35" },
  { id: "EV-8779", building: "Habitat rural (pisé)", zone: "Douar Imghrasse", grade: 5, habitability: "no", assessor: "Adj. R. Rahmouni", date: "J-1 20:05" },
  { id: "EV-8775", building: "Réseau électrique", zone: "Asni", grade: 3, habitability: "restricted", assessor: "Cpl. T. Bennis", date: "J-1 16:40" },
  { id: "EV-8770", building: "Habitat collectif", zone: "Moulay Brahim", grade: 2, habitability: "ok", assessor: "Lt. K. Bouazza", date: "J-1 11:15" },
  { id: "EV-8765", building: "Château d'eau", zone: "Amizmiz", grade: 1, habitability: "ok", assessor: "Sgt. H. Sebti", date: "J-2 09:50" },
];

// --- Tableau ORSEC --------------------------------------------------------
export const ORSEC_BOARD = {
  planLevel: 3,
  activatedAt: "J-2 · 06:55",
  casualties: { dead: 42, injured: 318, missing: 11, rescued: 176 },
  units: { engaged: 4, available: 2 },
  personnel: { engaged: 1043, available: 620 },
  vehicles: { engaged: 128, available: 74 },
  hospitalLoad: 86,
  sheltersActive: 6,
  org: [
    { role: "Directeur des Opérations de Secours", name: "Gén. R. Alaoui" },
    { role: "Commandant des Opérations de Secours", name: "Col. K. Benjelloun" },
    { role: "Chef Section Opérations", name: "Col. M. El Fassi" },
    { role: "Chef Section Logistique", name: "Lt-Col. S. Amrani" },
    { role: "Chef Section Planification", name: "Lt-Col. A. Tazi" },
    { role: "Officier de Communication", name: "Cdt. H. Berrada" },
  ],
  decisions: [
    { time: "07:05", author: "Gén. R. Alaoui", decision: "Passage au niveau ORSEC renforcé — mobilisation générale des HMC." },
    { time: "06:40", author: "Col. K. Benjelloun", decision: "Ouverture du pont aérien Agadir–Amizmiz (7e RA)." },
    { time: "06:10", author: "Col. M. El Fassi", decision: "Priorité déblaiement axe RP2010 — réouverture visée 14h00." },
    { time: "J-1 22:30", author: "Gén. R. Alaoui", decision: "Déploiement HMC Amizmiz (60 lits) et Talat N'Yaaqoub (40 lits)." },
  ],
  duty: [
    { role: "Officier de permanence EMG", name: "Col. K. Benjelloun" },
    { role: "Régulateur médical", name: "Méd. Col. A. Fassi" },
    { role: "Officier renseignement", name: "Cdt. N. Chraibi" },
  ],
};

// --- Plans ----------------------------------------------------------------
export type PlanStatus = "active" | "draft" | "review" | "expired";
export interface PlanRecord {
  id: string;
  name: string;
  type: string;
  zone: string;
  version: string;
  updated: string;
  status: PlanStatus;
}

export const PLANS: PlanRecord[] = [
  { id: "PL-014", name: "ORSEC Séisme — Haut Atlas", type: "ORSEC / Risque", zone: "Marrakech-Safi", version: "v4.2", updated: "J-2", status: "active" },
  { id: "PL-009", name: "Plan Inondation — Bassin de l'Ourika", type: "Risque", zone: "Marrakech-Safi", version: "v3.0", updated: "J-30", status: "active" },
  { id: "PL-021", name: "Plan Héliportage EVASAN", type: "Spécialisé", zone: "National", version: "v2.1", updated: "J-12", status: "active" },
  { id: "PL-018", name: "Plan NRBC — Zone portuaire", type: "Risque", zone: "Casablanca-Settat", version: "v1.4", updated: "J-90", status: "review" },
  { id: "PL-025", name: "Plan Feux de forêt — Rif", type: "Risque", zone: "Tanger-Tétouan-Al Hoceïma", version: "v2.0", updated: "J-45", status: "active" },
  { id: "PL-007", name: "Plan Grand Froid — Moyen Atlas", type: "Risque", zone: "Béni Mellal-Khénifra", version: "v1.2", updated: "J-210", status: "expired" },
  { id: "PL-030", name: "Contingence Épidémie — Sud", type: "Contingence", zone: "Drâa-Tafilalet", version: "v0.9", updated: "J-8", status: "draft" },
  { id: "PL-012", name: "Plan Évacuation urbaine — Agadir", type: "Zone", zone: "Souss-Massa", version: "v3.3", updated: "J-60", status: "active" },
];

// --- Formulaires ICS ------------------------------------------------------
export type IcsStatus = "draft" | "review" | "approved";
export interface IcsForm {
  code: string;
  titleKey: "f201" | "f202" | "f203" | "f204" | "f205" | "f206" | "f209" | "f214";
  incident: string;
  status: IcsStatus;
  updated: string;
  author: string;
}

export const ICS_FORMS: IcsForm[] = [
  { code: "ICS-201", titleKey: "f201", incident: "INC-2607", status: "approved", updated: "06:20", author: "Col. K. Benjelloun" },
  { code: "ICS-202", titleKey: "f202", incident: "INC-2607", status: "approved", updated: "06:35", author: "Col. K. Benjelloun" },
  { code: "ICS-203", titleKey: "f203", incident: "INC-2607", status: "review", updated: "06:50", author: "Lt-Col. A. Tazi" },
  { code: "ICS-204", titleKey: "f204", incident: "INC-2607", status: "review", updated: "07:02", author: "Col. M. El Fassi" },
  { code: "ICS-205", titleKey: "f205", incident: "INC-2607", status: "approved", updated: "06:15", author: "Cdt. H. Berrada" },
  { code: "ICS-206", titleKey: "f206", incident: "INC-2607", status: "draft", updated: "07:10", author: "Méd. Cdt. S. Ouazzani" },
  { code: "ICS-209", titleKey: "f209", incident: "INC-2607", status: "draft", updated: "07:12", author: "Lt-Col. A. Tazi" },
  { code: "ICS-214", titleKey: "f214", incident: "INC-2607", status: "approved", updated: "07:08", author: "PC Opérations" },
];

// --- Rapports SITREP ------------------------------------------------------
export type ReportStatus = "draft" | "published";
export interface Report {
  id: string;
  title: string;
  incident: string;
  period: string;
  author: string;
  status: ReportStatus;
  published: string;
}

export const REPORTS: Report[] = [
  { id: "SITREP-072", title: "Situation Op. SALAMA — 07h00", incident: "INC-2607", period: "03:00 → 07:00", author: "Col. K. Benjelloun", status: "published", published: "07:05" },
  { id: "SITREP-071", title: "Situation Op. SALAMA — 03h00", incident: "INC-2607", period: "23:00 → 03:00", author: "Col. K. Benjelloun", status: "published", published: "03:10" },
  { id: "SITREP-070", title: "Bilan EVASAN nuit J-1", incident: "INC-2607", period: "J-1 20:00 → 00:00", author: "Méd. Col. A. Fassi", status: "published", published: "J-1 23:55" },
  { id: "SITREP-069", title: "Point logistique convois", incident: "INC-2607", period: "J-1 12:00 → 18:00", author: "Lt-Col. S. Amrani", status: "published", published: "J-1 18:20" },
  { id: "SITREP-073", title: "Situation Op. SALAMA — 11h00 (préparation)", incident: "INC-2607", period: "07:00 → 11:00", author: "Col. K. Benjelloun", status: "draft", published: "—" },
  { id: "SITREP-068", title: "Évaluation dommages — secteur Amizmiz", incident: "INC-2607", period: "J-1 08:00 → 20:00", author: "Cne. Y. El Amrani", status: "published", published: "J-1 20:40" },
  { id: "SITREP-067", title: "Crues Ourika — point de situation", incident: "INC-2606", period: "J-1 06:00 → 12:00", author: "Lt-Col. A. Tazi", status: "published", published: "J-1 12:30" },
  { id: "SITREP-074", title: "Synthèse abris & personnes hébergées", incident: "INC-2607", period: "07:00 →", author: "Cdt. H. Berrada", status: "draft", published: "—" },
];

// --- Analytique -----------------------------------------------------------
export const ANALYTICS = {
  kpis: { avgResponse: 34, evacAdmit: 52, closedRate: 68, util: 71 },
  responseTimes: [
    { label: "Alerte→départ", value: 8, couleur: "#C9A84C" },
    { label: "Départ→sur site", value: 26, couleur: "#3B82F6" },
    { label: "Tri→évac", value: 19, couleur: "#F59E0B" },
    { label: "Évac→admission", value: 33, couleur: "#EF4444" },
  ],
  incidentTrend: [
    { label: "J-6", value: 2, couleur: "#C9A84C" },
    { label: "J-5", value: 3, couleur: "#C9A84C" },
    { label: "J-4", value: 3, couleur: "#C9A84C" },
    { label: "J-3", value: 5, couleur: "#C9A84C" },
    { label: "J-2", value: 8, couleur: "#EF4444" },
    { label: "J-1", value: 6, couleur: "#EF4444" },
    { label: "Auj.", value: 5, couleur: "#EF4444" },
  ],
  resourceUtil: [
    { label: "Personnel", value: 63, couleur: "#C9A84C" },
    { label: "Véhicules", value: 71, couleur: "#3B82F6" },
    { label: "Équipements", value: 58, couleur: "#10B981" },
    { label: "Hôpitaux", value: 86, couleur: "#EF4444" },
  ],
  hospitalSat: [
    { label: "HM Mohammed V", value: 79, couleur: "#C9A84C" },
    { label: "HM Avicenne", value: 92, couleur: "#EF4444" },
    { label: "HM Moulay Youssef", value: 77, couleur: "#F59E0B" },
    { label: "HM Moulay Ismaïl", value: 67, couleur: "#10B981" },
    { label: "HM Agadir", value: 88, couleur: "#F59E0B" },
    { label: "HM Laâyoune", value: 51, couleur: "#3B82F6" },
  ],
  triageOutcomes: [
    { label: "Rouge", value: 34, couleur: "#EF4444" },
    { label: "Jaune", value: 71, couleur: "#F59E0B" },
    { label: "Vert", value: 148, couleur: "#10B981" },
    { label: "Noir", value: 12, couleur: "#6B7280" },
  ],
};
