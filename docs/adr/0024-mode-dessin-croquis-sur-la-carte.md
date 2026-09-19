# ADR 0024 — Mode dessin : des croquis nommés sur la carte (points, cercles, polygones)

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-20
- **Portée :** `apps/api/src/modules/domain/{domain.types,dto,domain.service}.ts`, `http/drawings.controller.ts`,
  `realtime.service.ts` ; `apps/web/src/lib/map/drawings.ts`, `lib/store/slices/drawings.ts`,
  `components/map/{DrawToolbox.tsx,layers/drawings.ts,MapCanvas.tsx}`, `app/map/page.tsx`.
- **S'appuie sur :** ADR 0018 (mode édition de la carte, fonctionnalité `map_edit`).

## Contexte

Un état-major annote sa carte : un point de regroupement, une zone d'exclusion, un secteur. Ces
croquis doivent se dessiner à la souris, se nommer, se corriger (déplacer un sommet, changer un
rayon, déplacer le texte pour qu'il reste lisible dans la forme), se retirer — et être vus par
tous les postes, en temps réel, sans dépendre d'une bibliothèque de dessin tierce (souveraineté :
aucune dépendance d'exécution nouvelle sans ADR).

## Décision

1. **Un croquis est une entité du domaine** (`Drawing` : nature `point` / `circle` / `polygon`,
   nom, sommets `[lng, lat][]` — le point, le centre, l'anneau —, rayon en mètres, emplacement de
   l'étiquette `labelLL`, couleur parmi les tons de la charte, note, opération éventuelle, auteur
   et dates). Persisté avec le domaine ; servi par `GET /drawings` à qui voit la carte
   (`map:view`) ; dessiné et modifié par qui édite la carte (`map_edit:create` / `:update`) ;
   **retiré par son auteur ou par un administrateur** (la matrice n'accorde `delete` sur la carte
   à personne — la règle est portée par la route, audité). La géométrie est vérifiée (400). Un
   événement temps réel `drawings` fait relire tous les postes.
2. **Le dessin est fait maison sur MapLibre** : les formes sont des couches GeoJSON (remplissage,
   contour, points, poignées, brouillon en pointillé) ; le tracé se fait au clic (point : un
   clic ; cercle : centre puis bord ; polygone : sommets, fermé par un double-clic ou sur le
   premier sommet ; Échap annule) ; les **poignées** du croquis sélectionné se saisissent à la
   souris (sommets, centre, rayon) et le glisser suspend le déplacement de la carte.
3. **Les étiquettes sont des marqueurs DOM déplaçables** (comme celles des unités et des postes) :
   sans police de carte, elles se lisent en mode externe comme en souverain ; le nom d'un point
   se lit à côté du point (et déplacer l'étiquette déplace le point), celui d'un cercle ou d'un
   polygone à l'intérieur de la forme, là où l'opérateur l'a posé (`labelLL`, au centre par
   défaut). La géométrie est pure et testée (`lib/map/drawings.ts`).
4. **Le panneau « Dessin »** de la carte (bouton de la barre d'outils, onglet de la feuille
   mobile) porte les quatre outils, la liste des croquis, et la fiche du croquis sélectionné
   (nom, note, couleur, rayon, suppression confirmée). Les modifications rapides (une lettre du
   nom, un sommet qui glisse) sont regroupées en une requête (350 ms) et appliquées de façon
   optimiste.

## Conséquences

- Aucune dépendance nouvelle. Les croquis pèsent quelques kilooctets et voyagent avec
  l'instantané du domaine (sauvegarde, restauration, mise à jour).
- Le rôle qui édite la carte dessine ; couper la fonctionnalité `map_edit` à un rôle lui retire
  aussi le dessin — c'est voulu : dessiner, c'est éditer la carte.
- Tests : `modules/domain/drawings.spec.ts` (API), `lib/map/__tests__/drawings.test.ts` (géométrie).

## Questions restantes

- Lignes (itinéraires, axes) et flèches : non faits ; le modèle les accueille (une nature de plus).
- Export des croquis (GeoJSON) vers les rapports : non fait.
