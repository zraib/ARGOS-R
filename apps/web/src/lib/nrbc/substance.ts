import type { HazardKind } from "@/lib/hazard/pictograms";

// ============================================================================
// Forme d'une substance dangereuse, côté écran (lot N-5)
//
// Extrait de la page pour être partagé avec la fiche modale et la recherche :
// trois vues sur la même donnée ne doivent pas en porter trois descriptions.
//
// DEUX PROVENANCES DISTINCTES, JAMAIS FONDUES. `sheetVerified` porte sur la
// FICHE (comportement, effets, réactivité) ; `ergVerified` sur les DISTANCES.
// Une fiche juste n'implique pas des distances justes.
// ============================================================================

export interface SubstanceSheet {
  appearance: string;
  behaviour: string;
  health: string;
  fire: string;
  reactivity: string;
  ppe: string;
  firstAid?: string;
  fireFighting?: string;
  nonFireResponse?: string;
  specialHazards?: string;
  isolationAdvice?: string;
  idlhPpm?: number;
  flashPointC?: number;
  vaporDensity?: number;
  boilingPointC?: number;
}

export interface ErgDistances {
  isolationM: number;
  protectDayKm: number;
  protectNightKm: number;
}

export interface Substance {
  id: string;
  /** Absent pour ~70 % des fiches CAMEO : toutes ne sont pas des
   *  marchandises réglementées au transport, donc sans étiquette orange. */
  un?: string;
  cas?: string;
  ergGuide: string;
  labels: { fr: string; ar: string; en: string };
  synonyms?: string[];
  hazardClass?: string;
  state: "gas" | "liquid";
  small?: ErgDistances;
  large?: ErgDistances;
  sheet?: SubstanceSheet;
  ergVerified: boolean;
  sheetVerified?: boolean;
  /** La liste ne transporte plus la fiche (22 Mo de texte) — seulement sa présence. */
  hasSheet?: boolean;
}

export interface Provenance {
  total: number;
  ergVerified: number;
  withErgDistances: number;
  sheetVerified: number;
  withSheet: number;
  /** Jeu SOUS LICENCE chargé par-dessus la bibliothèque livrée (lot N-3b). */
  origins: { source: string; retrievedAt: string; authorization: string; count: number }[] | null;
}

/** Réponse de `GET /api/nrbc/library` telle que l'écran la consomme. */
export interface LibraryResponse {
  substances: Substance[];
  /** Nombre d'entrées correspondantes AVANT le plafond serveur. */
  matched: number;
  /** Effectif par lettre sur toute la bibliothèque — alimente l'index A–Z. */
  index: Record<string, number>;
  provenance: Provenance;
}

/** Classe ADR → pictogramme réglementaire (lot N-1). */
export function pictogramFor(s: Pick<Substance, "hazardClass">): HazardKind {
  if (s.hazardClass === "7") return "radioactive";
  if (s.hazardClass === "6.2") return "biohazard";
  // 2.3, 6.1, 8, 3 : le danger dominant reste la toxicité ou la corrosion, que
  // la tête de mort porte. Le fût sert les contextes de stockage, pas la fiche.
  return "toxic";
}

/** Lettre de classement — miroir exact de `indexLetter` côté serveur. */
export function indexLetter(label: string): string {
  const c = label.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

/** Les rayons de l'index, dans l'ordre où ils sont proposés. */
export const ALPHABET = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"] as const;
