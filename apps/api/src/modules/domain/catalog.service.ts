import { Injectable } from "@nestjs/common";
import {
  DAMAGE,
  ICS_FORMS,
  MOVEMENTS,
  ORSEC_BOARD,
  PLANS,
  REPORTS,
  ROSTER,
  TRIAGE_FLOW,
  TRIAGE_ZONES,
  VICTIMS,
  WORK_ORDERS,
} from "@/modules/domain/catalog.data";
import { DomainService } from "@/modules/domain/domain.service";
import { DEMO_DATA } from "@/common/data-profile";

/**
 * La même forme, vidée : nombres à zéro, chaînes en tiret, tableaux vides.
 * Le profil « empty » (ADR 0015) sert les tableaux ORSEC, triage, plans… sans
 * un seul chiffre de démonstration, et l'écran garde sa structure.
 */
function blankLike<T>(v: T): T {
  if (Array.isArray(v)) return [] as unknown as T;
  if (typeof v === "number") return 0 as unknown as T;
  if (typeof v === "string") return "—" as unknown as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, blankLike(x)])) as T;
  return v;
}

/**
 * Catalogue des modules opérationnels (Phase 2) : inventaire, personnel, bons de
 * travail, triage, abris, dommages, ORSEC, plans, ICS, rapports, analytique.
 * Servi en un seul appel (`GET /catalog`) pour limiter les allers-retours ;
 * en production, chaque domaine aura sa propre table/endpoint.
 */
@Injectable()
export class CatalogService {
  // Les abris sont désormais MUTABLES (pilotés par leur responsable) : on sert
  // la liste vivante de DomainService, plus le tableau figé du catalogue.
  constructor(private readonly domain: DomainService) {}

  all() {
    // Les tableaux figés du catalogue sont le jeu de démonstration : le profil
    // « empty » les sert vides — les listes vivantes (parcs, abris) et
    // l'analytique, calculées sur le domaine réel, restent.
    const demo = DEMO_DATA;
    return {
      equipment: this.domain.listEquipment(),
      movements: demo ? MOVEMENTS : [],
      roster: demo ? ROSTER : [],
      workOrders: demo ? WORK_ORDERS : [],
      triageZones: demo ? TRIAGE_ZONES : [],
      triageFlow: demo ? TRIAGE_FLOW : blankLike(TRIAGE_FLOW),
      victims: demo ? VICTIMS : [],
      shelters: this.domain.listShelters(),
      damage: demo ? DAMAGE : [],
      orsec: demo ? ORSEC_BOARD : blankLike(ORSEC_BOARD),
      plans: demo ? PLANS : [],
      ics: demo ? ICS_FORMS : [],
      reports: demo ? REPORTS : [],
      analytics: this.domain.computeAnalytics(),
    };
  }
}
