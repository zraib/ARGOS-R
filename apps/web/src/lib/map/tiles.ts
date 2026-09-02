// ============================================================================
// ARGOS — origine du fond de carte : souverain ou externe (ADR 0006, phase 1)
//
// Un seul endroit décide d'où viennent les tuiles, parce qu'un seul endroit
// peut alors garantir qu'elles ne viennent PAS d'ailleurs.
//
// Le risque traité n'est pas le contenu des tuiles — elles sont publiques —
// mais le PROFIL D'ACTIVITÉ : la séquence des requêtes révèle quelle région
// l'état-major observe, à quelle heure et avec quelle intensité. C'est
// exploitable sans qu'aucune donnée classifiée ne transite.
//
// Règle : le mode SOUVERAIN échoue en fermé. Sans source locale configurée, la
// carte reste sans fond — jamais de repli silencieux vers un fournisseur
// étranger. Un fond de carte manquant se voit ; une fuite, non.
// ============================================================================

export type TilesMode = "sovereign" | "external";

/**
 * Mode effectif. En production le mode SOUVERAIN est imposé : aucune variable
 * d'environnement ne peut ouvrir la sortie vers un fournisseur externe depuis
 * un déploiement. En développement, `external` reste le défaut pour que
 * l'équipe travaille sans la pile Docker — mais l'interface l'affiche.
 */
// Seule la valeur EXPLICITE `external` ouvre la sortie ; vide ou absente vaut
// `external` en développement (défaut de l'équipe), toute autre valeur —
// `sovereign`, une coquille, un réglage inconnu — ferme : on ne devine pas dans
// le sens de la fuite.
const demande = (process.env.NEXT_PUBLIC_MAP_TILES ?? "").trim();
export const TILES_MODE: TilesMode =
  process.env.NODE_ENV === "production" ? "sovereign" : demande === "" || demande === "external" ? "external" : "sovereign";

/**
 * Base des tuiles auto-hébergées (martin, `infra/compose`).
 *
 * ATTENTION : martin ne sert aujourd'hui AUCUNE donnée — le pipeline
 * `infra/geo` qui alimenterait PostGIS depuis un extrait OSM n'est pas encore
 * construit. En mode souverain, la carte est donc volontairement sans fond
 * tant que ce pipeline n'existe pas. C'est le comportement voulu : mieux vaut
 * une carte vide et un bandeau explicite qu'une fuite invisible.
 */
export const SOVEREIGN_TILES_URL = process.env.NEXT_PUBLIC_TILES_URL ?? "";

/** Le fond de carte est-il réellement disponible dans le mode courant ? */
export const TILES_AVAILABLE = TILES_MODE === "external" || SOVEREIGN_TILES_URL !== "";

/** Hôtes externes contactés en mode `external` — sert aussi à bâtir la CSP. */
export const EXTERNAL_TILE_HOSTS = [
  "https://server.arcgisonline.com",
  "https://tile.openstreetmap.org",
  "https://s3.amazonaws.com",
] as const;
