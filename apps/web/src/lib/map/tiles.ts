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
// étranger. Un fond de carte manquant se voit ; une fuite, non. Le mode
// EXTERNE, lui, est un choix explicite et figé à la construction (ADR 0014) :
// la CSP de production n'ouvre ces trois hôtes que dans ce cas.
// ============================================================================

export type TilesMode = "sovereign" | "external";

/**
 * Mode effectif — décidé à la CONSTRUCTION (`NEXT_PUBLIC_MAP_TILES`, figé dans
 * le bundle), jamais à l'exécution.
 *
 * Seule la valeur EXPLICITE `external` ouvre la sortie vers les fournisseurs
 * (Esri/Maxar, OpenStreetMap, relief AWS) : en développement comme sur une
 * station qui a Internet et où l'organisme l'a décidé (ADR 0014,
 * `MAP_TILES=external` dans `deploy/.env`). Vide ou absente : `external` en
 * développement (défaut de l'équipe), `sovereign` en production (défaut fermé
 * d'un déploiement). Toute autre valeur — `sovereign`, une coquille, un
 * réglage inconnu — ferme : on ne devine pas dans le sens de la fuite.
 */
const demande = (process.env.NEXT_PUBLIC_MAP_TILES ?? "").trim();
export const TILES_MODE: TilesMode =
  demande === "external" ? "external" : demande === "" && process.env.NODE_ENV !== "production" ? "external" : "sovereign";

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

/**
 * Hôtes externes contactés en mode `external` — sert aussi à bâtir la CSP :
 * imagerie Esri, fond plan / repères / polices / sprites OpenFreeMap, relief AWS.
 */
export const EXTERNAL_TILE_HOSTS = [
  "https://server.arcgisonline.com",
  "https://tiles.openfreemap.org",
  "https://s3.amazonaws.com",
] as const;

/**
 * URL d'une tuile d'altitude (terrarium) dans le mode courant : la source
 * externe en développement, le serveur de tuiles de la station en mode
 * souverain — `null` si aucune source n'est disponible. C'est par ici que
 * passent l'altitude sous le curseur et le simulateur d'inondation : un seul
 * endroit décide, et le mode souverain ne demande jamais rien à un tiers.
 */
export function demTileUrl(z: number, x: number, y: number): string | null {
  if (TILES_MODE === "external") return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  if (!SOVEREIGN_TILES_URL) return null;
  const raw = SOVEREIGN_TILES_URL.replace(/\/$/, "");
  const base = raw.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${raw}` : raw;
  return `${base}/dem/${z}/${x}/${y}`;
}
