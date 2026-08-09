// ============================================================================
// ARGOS — port de persistance des bons de travail
//
// C'est L'ABSTRACTION du principe d'inversion des dépendances : `OrderService`
// dépend de cette interface, jamais d'un dépôt concret. Le contrat est défini
// ICI, dans la couche métier, et non par la couche technique — c'est le sens
// même de l'inversion : le module de haut niveau possède l'interface, les
// modules de bas niveau (mémoire, Drizzle, demain un autre SGBD) s'y plient.
//
// Ségrégation des interfaces : lecture et écriture sont deux interfaces
// distinctes. Un futur consommateur en lecture seule (tableau de bord, export,
// projection CQRS) dépendra de `OrderReader` seul, sans hériter de méthodes
// d'écriture qu'il n'utilisera jamais.
//
// Le contrat est asynchrone y compris pour l'implémentation en mémoire : une
// signature synchrone rendrait tout adaptateur réseau non substituable
// (principe de substitution de Liskov).
// ============================================================================

import type { OrderPriority, OrderSnapshot, OrderStatus } from "@/modules/orders/domain/order";

/** Critères de filtrage d'une recherche de bons de travail. */
export interface OrderQuery {
  status?: OrderStatus;
  priority?: OrderPriority;
  unit?: string;
  assignee?: string;
  incidentId?: string;
}

/** Opérations de lecture. */
export interface OrderReader {
  findById(id: string): Promise<OrderSnapshot | null>;
  /** Bons correspondant aux critères, triés du plus récemment modifié au plus ancien. */
  findAll(query?: OrderQuery): Promise<OrderSnapshot[]>;
  /** Plus grand numéro de séquence déjà attribué (génération d'identifiants). */
  lastSequence(): Promise<number>;
}

/** Opérations d'écriture. */
export interface OrderWriter {
  /** Insère ou remplace un bon (idempotent sur l'identifiant). */
  save(order: OrderSnapshot): Promise<void>;
}

/** Contrat complet attendu par le service applicatif. */
export type OrderRepository = OrderReader & OrderWriter;

/**
 * Jeton d'injection. Un `Symbol` plutôt qu'une chaîne : impossible de le
 * collisionner accidentellement avec un autre fournisseur du conteneur.
 */
export const ORDER_REPOSITORY = Symbol("ORDER_REPOSITORY");
