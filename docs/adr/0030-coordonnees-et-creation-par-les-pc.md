# ADR 0030 — Coordonnées tapées dans chaque formulaire de création ; créer — et supprimer — unités, hôpitaux, hôpitaux de campagne, morgues et abris : chefs, Rens, OPS, LOG, Anim

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
   ~~Créer n'est pas retirer~~ — **remplacé par la révision ci-dessous : qui crée supprime.**
   « Ajouter un hôpital » et « Déployer un hôpital de campagne » s'affichent à qui détient
   `hospinet:create`.
4. Le profil **classique** n'est pas modifié par cette décision (ses rôles ne portent pas ces
   noms) ; l'étendre est un réglage de la matrice.

## Révision du 23 septembre 2026 — qui crée supprime

Décision de l'utilisateur, le jour même : « donne-leur la possibilité de suppression ».

5. **Le même groupe retire ce qu'il crée** (profil direx) : chefs (DIREX, PC FAR, PCF, PCT,
   PCO), Rens (Planif & Rens des PC opératifs, Rens / PCT, Rens & Com / PCO, RLS / DIREX), OPS,
   LOG et Anim passent à `FULL` (AMRVD) sur les lignes `shelters`, `morgue` et `hospinet` —
   fermer un abri, retirer un site mortuaire ou une morgue mobile, retirer un établissement ou
   un hôpital de campagne ; le trait `unitRemover` rejoint les chefs, la Planif & Rens et le RLS
   (retrait d'une unité, en tout mode comme le reste du profil direx). La synthèse, l'évaluation
   et les chefs d'entité ne suppriment rien ; le profil classique est inchangé.
6. **L'hôpital de campagne reçoit un identifiant** (`HDC-01`, `HDC-02`…) — il n'en avait pas, on
   ne pouvait donc pas le désigner pour le retirer. Les instantanés antérieurs sont complétés à
   la reprise (une graine retrouve le sien par son nom, un détachement d'opérateur en reçoit un
   neuf) ; un numéro de détachement libéré se réemploie, jamais deux détachements du même nom.
   `DELETE /field-hospitals/:id` (`hospinet:delete`) refuse (409) un détachement qui soigne des
   patients ou sert une opération active — `?force=true` passe outre, comme pour les autres
   entités ; l'établissement de rattachement reste engagé. La purge « empty » ne retire plus que
   les détachements de démonstration : ceux qu'un opérateur a déployés restent.
7. **Le réseau hospitalier est poussé à tous les postes** : le contrôleur Hospinet porte
   désormais l'intercepteur de l'ADR 0029 — créer, modifier, retirer un établissement, un
   service ou un hôpital de campagne réveille chaque poste (`what: "hospitals"`).
8. Côté web : le bouton de suppression (modale à identifiant recopié) apparaît sur chaque carte
   de détachement de l'onglet « Hôpitaux de campagne » et suit `hospinet:delete` ; le miroir
   `EXERCISE_UNIT_REMOVERS` suit le trait.

## Conséquences

- Tests : web `coordinates.test.ts` (décimal, virgule, DMS, hémisphère, paire collée, refus) ;
  API `creators.spec.ts` (neuf rôles — chefs de PC opératif et tactique, Rens des deux niveaux,
  RLS, OPS, LOG, Anim — créent chacun unité, hôpital, hôpital de campagne, morgue et morgue
  mobile, coordonnées rendues à l'identique ; synthèse et évaluation 403). Révision : chacun
  des neuf retire l'unité, l'hôpital, l'hôpital de campagne, la morgue, la morgue mobile et
  l'abri qu'il a créés ; synthèse et évaluation 403 sur chaque suppression ; détachement engagé
  retenu (409) puis forcé, inconnu 404, numéro réemployé sans doublon de nom
  (`creators.spec.ts`) ; `profiles.spec.ts` (19 rôles créateurs : `*:delete` et `unitRemover` en
  tout mode) ; `mode-rights.spec.ts` (le Chef / PC FAR ferme l'abri qu'il a ouvert) ;
  `everyone-sees-changes.spec.ts` (hôpital créé, détachement déployé puis retiré : `hospitals`
  poussé) ; web `mode-rights.test.ts`.
- Vérifié navigateur, révision (dev, mode Direx, Chef / PCT) : « Retirer l'établissement » sur
  les hôpitaux, « Supprimer l'unité » sur les 12 unités d'OPSnet ; dans « Hôpitaux de
  campagne », le détachement HDC-08 qu'il avait déployé se retire (identifiant recopié) et
  disparaît ; HMC Amizmiz (HDC-01, 48 patients) est retenu — « Suppression refusée · 48
  patient(s) hospitalisé(s) », case « passer outre » proposée.
- Vérifié navigateur (dev, mode Direx, Chef / PCT) : « Ajouter un hôpital » visible ; la paire
  DMS « 31°21'29"N 7°44'54"W » tapée pose le point (31.35806, −7.74833) et déduit Marrakech-Safi
  › Al Haouz › Ourika ; hôpital H107 créé à cette position ; hôpital de campagne déployé depuis
  sa fiche avec cascade, carte et coordonnées (« 31.2200, -8.2400 » collé → Amizmiz) ; OPSnet :
  « Créer une unité » visible, coordonnées dans le formulaire.
