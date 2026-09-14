import type { ResponsibleKind } from "@/lib/responsibles";
import type { Role } from "@/lib/roles";
// Aides partagées par les composants de page.tsx (extraites, exportées).
import { type BadgeType } from "@/components/ui/Badge";
import type { LayerState } from "@/lib/store";
import { OVERLAY_STYLE } from "@/lib/map/overlay";
import type { MarkerKind } from "@/lib/types";

// Surcouches neutres (ardoise sombre) : le vert du thème se confondait avec
// l'imagerie satellite et rendait les panneaux illisibles.
export const GLASS = OVERLAY_STYLE;

export interface SelLine { k: string; v: string }

export interface SelInfo {
  titre: string; sub: string; badgeType: BadgeType; badgeLabel: string;
  lines: SelLine[]; action?: () => void;
  /** Le titulaire de l'élément (commandant, directeur, poste déployé…) : présence et contact. */
  responsible?: { kind: ResponsibleKind; entityId: string; role?: Role; matricule?: string; incidentId?: string };
  /** Retirer l'élément de la carte — un poste, en mode édition. */
  remove?: () => void;
}

// ---------------------------------------------------------------------------
// Surcouches adaptatives
//
// À partir de `lg` les panneaux flottent sur la carte comme auparavant (colonne
// gauche : couches, suivi aérien, légende ; colonne droite : contrôles et
// détail de sélection).
//
// En dessous, la carte n'a plus la place de porter 300 px de panneaux : à
// 375 px ils la recouvraient entièrement et se chevauchaient. Les mêmes
// contenus — sans rien retirer — passent donc dans une **feuille ancrée en
// bas**, ouverte par un bouton flottant et organisée en onglets. Par défaut la
// feuille est fermée : la carte occupe tout l'espace. Les contrôles (2D/3D,
// fond, plein écran) restent en haut, hors de la feuille, en cibles de 44 px ;
// les commandes natives de MapLibre (zoom, boussole, recentrage) sont remontées
// en haut par `globals.css` pour la même raison.
// ---------------------------------------------------------------------------
export type SheetTab = "layers" | "aircraft" | "legend" | "edit" | "flood" | "selection";

/** Élément réel de la carte, listé sous sa couche. */
export interface TreeLeaf { id: string; label: string; kind: MarkerKind }

/** Couche cartographique : interrupteur + éléments qu'elle contient. */
export interface TreeLayer { key: keyof LayerState; label: string; leaves: TreeLeaf[] }

export interface TreeFamily { label: string; layers: TreeLayer[] }
