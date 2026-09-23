# ADR 0030 — Coordonnées tapées dans chaque formulaire de création ; créer unités, hôpitaux, hôpitaux de campagne et morgues : chefs, Rens, OPS, LOG, Anim

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-23
- **Complète :** ADR 0022 lot 7 (le point se choisit sur la carte à la création comme à la
  modification), ADR 0029 (ouverture d'un abri aux chefs, OPS, LOG, Rens).
- **Portée :** `apps/web/src/lib/geo.ts` (`parseCoordinate`, `parseCoordinatePair`),
  `components/org/LocationPicker.tsx` (`CoordinateFields`), `app/hospinet/page.tsx`,
  `lib/mode.ts` ; `apps/api/src/shared/profiles.ts` (trait `unitMaker`),
  `shared/direx.matrix.ts` (+ `docs/matrice-roles-direx.csv`).

## Contexte

Un point se posait sur la carte — mais un relevé GPS, une coordonnée lue sur une carte
d'état-major ou un point reçu par message ne se tapaient nulle part. L'hôpital de campagne se
déployait sur une carte nue, sans la cascade Région → Province → Commune que les autres entités
avaient. « Ajouter un hôpital » n'apparaissait qu'au Super Administrateur et à l'Administrateur,
et la création d'une unité, d'un hôpital, d'un hôpital de campagne ou d'une morgue restait
fermée aux chefs des PC et aux Rens.

## Décision

1. **Coordonnées dans tous les formulaires.** Le sélecteur de lieu partagé porte désormais
   **Latitude** et **Longitude** : ajouter une unité, un abri, un hôpital, un hôpital de
   campagne, une morgue, une morgue mobile — et les quatre formulaires de modification. Les
   champs montrent le point en cours (posé, ou la commune choisie) ; tapés, ils posent le point
   à la validation (Entrée ou sortie du champ), et le point déduit région, province et commune
   comme un clic sur la carte. On lit ce que le terrain écrit : degrés décimaux (point ou
   virgule), degrés-minutes-secondes (hémisphère devant ou derrière, « O » pour ouest), et une
   **paire collée** dans la latitude (« 31.22, -8.24 », « 31°13'12"N 8°14'24"W »). Ce qui ne se
   lit pas, ou sort du globe, est signalé — jamais converti au hasard.
2. **L'hôpital de campagne se déploie comme une unité** : cascade, carte, coordonnées.
3. **Créer revient au Super Administrateur, aux chefs, aux Rens, aux OPS, aux LOG et à
   l'Anim** (profil direx) : lignes `hospinet` (hôpital, hôpital de campagne), `morgue` (site,
   morgue mobile), `units` et `teams` au moins à `AMV` pour les chefs (DIREX, PC FAR, PCF, PCT,
   PCO), les Rens (Planif & Rens des PC opératifs, Rens / PCT, Rens & Com / PCO, RLS / DIREX),
   les OPS, les LOG et l'Anim ; trait `unitMaker` ajouté aux chefs, à la Planif & Rens et au RLS.
   **Créer n'est pas retirer** : la suppression d'une unité reste aux OPS, aux LOG, à l'Anim et
   au Super Administrateur (trait `unitRemover` inchangé). « Ajouter un hôpital » et « Déployer
   un hôpital de campagne » s'affichent à qui détient `hospinet:create`.
4. Le profil **classique** n'est pas modifié par cette décision (ses rôles ne portent pas ces
   noms) ; l'étendre est un réglage de la matrice.

## Conséquences

- Tests : web `coordinates.test.ts` (décimal, virgule, DMS, hémisphère, paire collée, refus) ;
  API `creators.spec.ts` (neuf rôles — chefs de PC opératif et tactique, Rens des deux niveaux,
  RLS, OPS, LOG, Anim — créent chacun unité, hôpital, hôpital de campagne, morgue et morgue
  mobile, coordonnées rendues à l'identique ; synthèse et évaluation 403 ; un chef de PCT ne
  supprime pas l'unité qu'il crée).
- Vérifié navigateur (dev, mode Direx, Chef / PCT) : « Ajouter un hôpital » visible ; la paire
  DMS « 31°21'29"N 7°44'54"W » tapée pose le point (31.35806, −7.74833) et déduit Marrakech-Safi
  › Al Haouz › Ourika ; hôpital H107 créé à cette position ; hôpital de campagne déployé depuis
  sa fiche avec cascade, carte et coordonnées (« 31.2200, -8.2400 » collé → Amizmiz) ; OPSnet :
  « Créer une unité » visible, coordonnées dans le formulaire.
