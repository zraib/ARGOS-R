// Bascules au niveau du déploiement. En production, elles proviennent du
// service de feature flags (MASTER_PLAN §6.15) ; pour le prototype, statiques.

/** Niveau d'alerte national affiché dans l'en-tête (1–4). */
export const ALERT_LEVEL: 1 | 2 | 3 | 4 = 3;

/** Simulation d'activité en direct (fil d'événements + convois en mouvement). */
export const LIVE_SIM = true;

/** Période du tick de simulation en ms. */
export const SIM_INTERVAL = 2500;
