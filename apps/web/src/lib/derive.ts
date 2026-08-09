// ============================================================================
// ARGOS — générateurs de détail déterministes
// Le prototype fabrique les effectifs par unité / services par hôpital à partir
// d'un calcul sur l'index, si bien qu'une unité affiche toujours les mêmes
// lignes. Reproduit ici pour que les écrans de détail collent à l'export au
// pixel près, jusqu'à ce qu'une vraie API le remplace.
// ============================================================================

import type { Dict } from "@/lib/i18n/translations";
import type { BadgeType } from "@/components/ui/Badge";
import type { FieldHospital, Hospital, HospitalKind, Unit } from "@/lib/types";
import { MED_GRADES, MED_GRADES_CIV, MED_SPECS, POOLS } from "@/lib/data/seed";
import { occBarClass, persStatut } from "@/lib/helpers";
import { fieldKind, hospKind } from "@/lib/hospitals";

/**
 * Index déterministe dérivé de l'identifiant (ex. « U3 » → 2), pour reproduire à
 * l'identique les rosters de détail sans dépendre d'un tableau local d'entités.
 */
function idIndex(id: string): number {
  const n = parseInt(id.replace(/\D/g, ""), 10);
  if (!Number.isNaN(n) && n > 0) return n - 1;
  return [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
}

export interface PersonRow {
  grade: string;
  nom: string;
  fonction: string;
  stType: BadgeType;
  stLabel: string;
}
export interface EquipRow {
  desig: string;
  cat: string;
  qty: string;
  etat: string;
  maint: boolean;
}
export interface VehRow {
  type: string;
  plate: string;
  assign: string;
  etat: string;
  maint: boolean;
}

export function unitDetail(unit: Unit) {
  const idx = idIndex(unit.id);

  const pers: PersonRow[] = Array.from({ length: 6 }, (_, j) => {
    const st = persStatut(idx + j);
    const grade = POOLS.grades[(idx + j) % 6];
    return {
      grade,
      nom: grade.startsWith("C") ? POOLS.names[(idx * 2 + j) % 12] : POOLS.names[(idx * 3 + j) % 12],
      fonction: POOLS.fonctions[(idx + j) % 6],
      stType: st.type,
      stLabel: st.label,
    };
  });

  const equip: EquipRow[] = POOLS.equip.map((e, j) => {
    const maint = (idx + j) % 4 === 1;
    return { desig: e[0], cat: e[1], qty: String((((idx + 1) * 7 + j * 3) % 18) + 2), etat: maint ? "Maintenance" : "Opérationnel", maint };
  });

  const vehs: VehRow[] = POOLS.vehs.map((v, j) => {
    const maint = (idx + j) % 5 === 2;
    return {
      type: v,
      plate: `FAR-${2140 + idx * 61 + j * 17}`,
      assign: unit.dispo === "deployed" && j % 2 === 0 ? "Zone Al Haouz" : unit.ville,
      etat: maint ? "Maintenance" : "Opérationnel",
      maint,
    };
  });

  return { pers, equip, vehs };
}

export interface StaffRow {
  grade: string;
  nom: string;
  spec: string;
  stType: BadgeType;
  stLabel: string;
}
export interface BedService {
  name: string;
  total: string;
  occ: string;
  pct: string;
  pctNum: number;
  barCls: string;
}
export interface HospVehRow {
  type: string;
  qty: string;
  assign: string;
  etat: string;
  maint: boolean;
}
export interface FieldCard {
  nom: string;
  /** Catégorie (campagne militaire / campagne civile) pour le symbole. */
  kind: HospitalKind;
  cap: string;
  depuis: string;
  pct: string;
  pctNum: number;
  barCls: string;
  badgeType: BadgeType;
  badgeLabel: string;
}

export function hospitalDetail(h: Hospital, fieldHosps: FieldHospital[], t: Dict) {
  const idx = idIndex(h.id);

  // Le vocabulaire des grades suit le réseau : grades militaires pour le
  // Service de Santé des FAR, qualifications hospitalières pour le civil.
  const grades = hospKind(h) === "mil" ? MED_GRADES : MED_GRADES_CIV;
  const staffRows: StaffRow[] = Array.from({ length: 6 }, (_, j) => {
    const st: [string, BadgeType][] = [["Garde", "medium"], ["Disponible", "active"], ["Repos", "on_hold"]];
    const s = st[(idx + j) % 3];
    return { grade: grades[(idx + j) % 6], nom: POOLS.names[(idx * 5 + j * 2) % 12], spec: MED_SPECS[(idx * 2 + j) % 6], stType: s[1], stLabel: s[0] };
  });

  const ratio = h.occ / h.lits;
  const mkSvc = (name: string, share: number, r: number): BedService => {
    const total = Math.round(h.lits * share);
    const occ = Math.min(total, Math.round(total * r));
    const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
    return { name, total: String(total), occ: String(occ), pct: `${pct} %`, pctNum: pct, barCls: occBarClass(pct) };
  };
  const beds: BedService[] = [
    mkSvc(t.icu, h.rea / h.lits, h.reaOcc / h.rea),
    mkSvc("Chirurgie", 0.28, ratio * 1.05),
    mkSvc("Médecine interne", 0.32, ratio * 0.95),
    mkSvc("Urgences", 0.18, ratio * 1.1),
    mkSvc("Pédiatrie", 0.14, ratio * 0.8),
  ];

  const vehRows: HospVehRow[] = [
    { type: "Ambulance médicalisée", qty: String(h.amb), assign: h.ville, etat: "Opérationnel", maint: false },
    { type: "VAB sanitaire", qty: String(Math.max(2, Math.round(h.amb / 3))), assign: idx === 1 ? "Zone Al Haouz" : h.ville, etat: "Opérationnel", maint: false },
    { type: "Hélicoptère médicalisé", qty: String(h.heli), assign: idx === 1 ? "Rotations EVASAN" : h.ville, etat: idx === 3 ? "Maintenance" : "Opérationnel", maint: idx === 3 },
  ];

  const fields: FieldCard[] = fieldHosps
    .filter((f) => f.hid === h.id)
    .map((f) => {
      const pct = Math.round((f.occ / f.cap) * 100);
      return {
        nom: f.nom,
        kind: fieldKind(f),
        cap: String(f.cap),
        depuis: f.depuis,
        pct: `${pct} %`,
        pctNum: pct,
        barCls: occBarClass(pct),
        badgeType: f.statut === "op" ? "active" : "on_hold",
        badgeLabel: f.statut === "op" ? t.op_ok : t.op_partial,
      };
    });

  return { staffRows, beds, vehRows, fields };
}
