import { Injectable } from "@nestjs/common";
import {
  ANALYTICS,
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
    return {
      equipment: this.domain.listEquipment(),
      movements: MOVEMENTS,
      roster: ROSTER,
      workOrders: WORK_ORDERS,
      triageZones: TRIAGE_ZONES,
      triageFlow: TRIAGE_FLOW,
      victims: VICTIMS,
      shelters: this.domain.listShelters(),
      damage: DAMAGE,
      orsec: ORSEC_BOARD,
      plans: PLANS,
      ics: ICS_FORMS,
      reports: REPORTS,
      analytics: ANALYTICS,
    };
  }
}
