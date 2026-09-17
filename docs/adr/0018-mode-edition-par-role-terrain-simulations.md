# ADR 0018 — Mode édition par rôle, ressources sur le terrain, simulations réservées à la conduite

- **Statut :** accepté
- **Date :** 2026-09-17
- **Portée :** `apps/api/src/modules/domain/edit.rules.ts` (règles pures), `shared/permissions.ts`
  (ligne `map_edit` par rôle, fonctionnalité `plume`, modules `mapEdit`, `simFlood`, `simFire`,
  `simNrbc`), `domain.types.ts` (`Placement`), `resources.types.ts` (position des équipes et
  véhicules, `PlacedResource`, `PlaceableResource`), `catalog.data.ts` (position des équipements),
  `resources.service.ts` (terrain), `http/resources-registry.controller.ts` (`/resources/placed`,
  `/resources/placeable`, `PUT|DELETE /resources/:kind/:id/position`), `http/posts.controller.ts`
  (natures de poste par rôle, visibilité), `http/incidents.controller.ts` (`deployable-posts`
  sous `incidents:view`), `nrbc.controller.ts` (`plume:view`), `realtime.service.ts` (signal
  `placed`) ; côté web `lib/edit.ts`, `lib/nav.ts` (capacités de la carte, `moduleLabel`,
  `moduleKeyOpen`), `components/map/PostToolbox.tsx`, `components/map/MapCanvas.tsx`,
  `components/map/layers/markers.ts`, `app/map/page.tsx`, `lib/store/slices/{domain,map,realtime}.ts`,
  `components/flux/WeatherPopup.tsx`, `components/shell/NotificationBell.tsx`, `lib/sound.ts`,
  `app/communication/page.tsx`.
- **Révise :** le lot #12 (mode édition réservé au Super Administrateur), l'ADR 0017 (liste des
  modules : quatre capacités de la carte s'ajoutent).

## Contexte

Le mode édition de la carte posait des postes d'opération et n'existait que pour le Super
Administrateur. La doctrine demande un mode édition **par rôle, au contenu différent** :

- l'**utilisateur stratégique** pose les OPCOM — et eux seuls ;
- l'**OPCOM** pose son dispositif tactique : les TACOM (PC, PCO, PCT) et les cellules ;
- le **TACOM** pose *ses* équipes, *ses* équipements et *ses* véhicules sur le terrain — pas un
  poste, pas un parc ;
- les **cellules** bleue, verte et orange posent de même leurs équipes, équipements et véhicules,
  et ne voient ni OPCOM, ni TACOM, ni les autres cellules ;
- en **mode exercice**, les cellules créent, modifient et retirent les ressources (personnel,
  équipements, véhicules) dans l'écran Ressources — ce que les règles de l'ADR 0016 permettent
  déjà (cellule orange : sur les seules forces de l'ordre).

Les **simulations** de crue, de feu de forêt et le **panache NRBC** ne doivent servir qu'à la
conduite : Super Administrateur, Administrateur, stratégique, OPCOM et TACOM. Le mode édition et
ces trois simulations doivent figurer dans « Rôles & fonctionnalités ».

## Décision

1. **Le contenu du mode édition est une règle pure par rôle** (`edit.rules.ts`, miroir
   `lib/edit.ts`) : `placeablePostKinds(role)` et `placeableResourceKinds(role)`. La ligne RBAC
   `map_edit` (`AMV`) dit **qui** a un mode édition — stratégique, OPCOM, TACOM (PCO et PCT
   dérivés), cellules ; les représentants de l'OPCOM en sont exclus (poser le dispositif est de
   la conduite) et l'Administrateur n'en a pas. Les routes des postes vérifient la nature contre
   la règle (403 qui dit ce que le rôle pose) et la **visibilité** de l'opération (404 sinon) ;
   retirer un poste est une mise à jour de la carte (`map_edit:update`), pas une suppression.

2. **Les ressources se posent sur le terrain.** Une équipe, un véhicule, un équipement porte une
   `position` (`ll`, opération rattachée, qui, quand). `PUT /resources/:kind/:id/position` pose
   ou déplace, `DELETE` retire ; `GET /resources/placed` sert la carte (à qui lit les ressources),
   `GET /resources/placeable` sert la boîte à outils — ce que le compte peut poser. La règle
   `canPlaceResource` : le rôle pose cette nature ; en démonstration et en exercice, sur toute
   entité ; en **opérationnel**, seules les ressources des **unités affectées à l'opération que
   le compte sert**. Un signal temps réel `placed` fait relire la carte à tous.

3. **Les simulations deviennent des capacités de la carte dans la matrice.** Quatre modules sans
   écran — `mapEdit`, `simFlood`, `simFire`, `simNrbc` — s'ajoutent aux 30 de l'ADR 0017 (34).
   `map_edit` relève du module `mapEdit` (couper le module coupe les poses côté API). Le panache
   NRBC obtient sa fonctionnalité `plume` (`plume:view` : administrateurs, stratégique, OPCOM et
   ses représentants, TACOM et ses PC) rattachée à `simNrbc` ; les simulateurs de crue et de feu
   tournent dans le navigateur (relief, météo) : leurs modules suivent une règle de défaut
   (mêmes rôles) et coupent l'outil sur la carte. La bibliothèque des substances (`nrbc:view`)
   reste ouverte à qui l'avait.

4. **Ce que l'on a corrigé en passant**, sur retour du terrain : chaque jour de la fenêtre météo
   se consulte (détail du jour choisi) ; le rappel sonore d'une notification est net, joué dès
   3 s puis toutes les 20 s tant qu'on n'a pas répondu ; la cloche ouvre **la** conversation
   concernée ; le centre de communication signale les conversations qui ont reçu du nouveau ; un
   message reçu pendant la relecture du domaine n'est plus perdu (conversation ouverte vide).

## Conséquences

- `GET /deployable-posts` passe sous `incidents:view` : le stratégique doit lire qui peut être
  posé en OPCOM. Un annuaire de comptes déployables, rien que le commandement ne sache déjà.
- Les instantanés existants ignorent `position` : rien à migrer, rien n'est posé au départ.
- Contrat OpenAPI : trois routes, `ModuleFeature` à 34 valeurs, client et `docs/03-api.md`.
- Tests : `edit.rules.spec.ts` (règles pures), `map-edit.spec.ts` (postes par rôle, terrain par
  rôle et par mode, module coupé, panache réservé), web `nav.test.ts` (capacités).
