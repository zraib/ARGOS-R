import { Injectable } from "@nestjs/common";
import {
  ANALYTICS,
  DAMAGE,
  EQUIPMENT,
  ICS_FORMS,
  MOVEMENTS,
  ORSEC_BOARD,
  PLANS,
  REPORTS,
  ROSTER,
  SHELTERS,
  TRIAGE_FLOW,
  TRIAGE_ZONES,
  VICTIMS,
  WORK_ORDERS,
} from "@/modules/domain/catalog.data";

/**
 * Catalogue des modules opérationnels (Phase 2) : inventaire, personnel, bons de
 * travail, triage, abris, dommages, ORSEC, plans, ICS, rapports, analytique.
 * Servi en un seul appel (`GET /catalog`) pour limiter les allers-retours ;
 * en production, chaque domaine aura sa propre table/endpoint.
 */
@Injectable()
export class CatalogService {
  all() {
    return {
      equipment: EQUIPMENT,
      movements: MOVEMENTS,
      roster: ROSTER,
      workOrders: WORK_ORDERS,
      triageZones: TRIAGE_ZONES,
      triageFlow: TRIAGE_FLOW,
      victims: VICTIMS,
      shelters: SHELTERS,
      damage: DAMAGE,
      orsec: ORSEC_BOARD,
      plans: PLANS,
      ics: ICS_FORMS,
      reports: REPORTS,
      analytics: ANALYTICS,
    };
  }
}
