# ADR 0020 — Tableau de bord sur les données introduites, l'incident sur la carte de tous, les unités par auteur et concernement

- **Statut :** accepté
- **Date :** 2026-09-17
- **Portée :** `apps/api/src/modules/domain/domain.analytics.ts` (`computeStats` réel), `domain.types.ts`
  (`Incident.declaredAt/closedAt`, `Unit.createdBy`), `domain.service.ts` (horodatages, graines datées,
  auteur, `attachUnitToOperation`, `stats(view)`), `visibility.service.ts` (`filterUnits` par auteur et
  concernement, `createdByMe` pour les ressources), `http/{dashboard,resources,incidents,resources-registry}.controller.ts`,
  `shared/permissions.ts` (ligne `dashboard` ouverte à tous) ; côté web `app/dashboard/page.tsx` (KPI et
  moyens réels), `lib/store/slices/domain.ts` (`mapIncidents`), `components/map/layers/markers.ts`,
  `lib/map/markers.ts`, `app/map/page.tsx`, `components/map/MapCanvas.tsx`, `components/org/EditEntityModals.tsx`.
- **Révise :** la doctrine de visibilité (lot V-1) pour les unités et pour la carte des incidents ; la
  matrice (ligne `dashboard`) ; l'ADR 0019 (ressources : une unité qu'on a inscrite se voit).

## Contexte

Retours du propriétaire du produit : le tableau de bord montrait des chiffres figés ou tirés au sort
(série de trente jours pseudo-aléatoire, bilan humain lu dans une constante, KPI « 1 043 », « +2 · 24h »,
barres « véhicules / ambulances / génie / hélicos » sans source) et n'était même pas lisible par les
rôles sans `dashboard:view` ; l'incident n'apparaissait sur la carte que de ceux dont la portée le
couvrait ; chaque compte voyait toutes les unités ; l'organe d'une unité ne se lisait pas sur la carte.

## Décision

1. **Le tableau de bord compte ce qui a été introduit, sur la portée du compte.** Les incidents se
   datent (`declaredAt` à la déclaration, `closedAt` à la clôture ; les graines de démonstration
   sont datées de façon stable sur douze jours). `computeStats` compte les déclarés et clôturés par
   jour, somme les bilans des incidents actifs — plus rien de tiré au sort ni de constante. La ligne
   `dashboard` s'ouvre à tous les rôles ; `/dashboard/stats` et `/feed` se calculent sur les incidents
   et les unités que le compte voit. Côté web, les KPI et le graphique des moyens se comptent sur les
   données du compte (déclarés depuis 24 h, effectif déployé sur effectif total, unités en alerte et
   déployées, posture des unités).

2. **Tout le monde voit l'incident sur la carte.** `GET /incidents/map` (sous `map:view`) sert tous
   les incidents actifs à quiconque lit la carte ; la liste et la fiche restent sous la doctrine de
   visibilité. Le web tient `mapIncidents` à côté de `incidents` : la carte dessine le premier.

3. **Chaque utilisateur voit les unités qu'il a inscrites, et celles qui le concernent.** Une unité
   porte son auteur (`createdBy`). `filterUnits` : administration et stratégique tout ; chacun ses
   unités inscrites, la sienne (commandant), celle de son parc ; le wali et la place d'armes celles
   de leur région ; la conduite déployée celles affectées ou intervenantes sur son opération — et
   qui AFFECTE (OPCOM, représentants, wali, place d'armes) voit le vivier de la région de
   l'opération, sans quoi il n'aurait rien à affecter ; les responsables celles de l'opération où
   ils sont déployés. Une unité inscrite par un compte déployé rejoint aussitôt son opération
   (`attachUnitToOperation`, destination par corps) : l'OPCOM et le TACOM de l'opération la voient.
   Modifier une unité qu'on ne voit pas répond 404. Les ressources suivent (ADR 0019 : une unité
   qu'on a inscrite se voit).

4. **L'organe devant le nom.** Sur la carte, l'étiquette d'une unité lit « FAR · 3e Bataillon du
   Génie » (corps abrégé puis nom) ; la fiche de sélection, l'arbre des couches et le titre de la
   modale de modification font de même.

## Conséquences

- Les incidents d'avant l'horodatage n'ont pas de date : ils ne comptent dans aucun jour de la
  série, mais bien dans les totaux (gravité, statut, bilan). Les unités d'avant n'ont pas d'auteur :
  elles ne se voient que par concernement.
- Deux tests changent de verdict avec la doctrine des unités (`sidebar-modules.spec.ts` : l'OPCOM
  doit être déployé sur une opération de la région pour modifier une unité).
- Contrat OpenAPI : `GET /incidents/map`, champs `declaredAt`, `closedAt`, `createdBy` ; client et
  `docs/03-api.md` régénérés.
- Tests : `modules/domain/units-visibility.spec.ts` (auteur, rattachement, portées, 404, carte de
  tous, tableau de bord réel et par portée, clôture datée).
