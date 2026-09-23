# ADR 0034 — Personnes impliquées, actions entreprises et à entreprendre dans le briefing, fenêtre au thème de l'application

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-23
- **Complète :** ADR 0032 (briefing, fenêtre flottante), le bilan des victimes (victimes nommées,
  `reconcileCasualties`).
- **Portée :** API — `domain.types.ts` (`casualties.involved`, `VICTIM_KINDS`), `dto.ts`
  (`CasualtiesDto.involved`, `VICTIM_KIND_VALUES`), `domain.service.ts` (`updateIncident`,
  `reconcileCasualties`). Web — `lib/incidents/wizard.ts`, `components/incidents/wizard/StepCasualties.tsx`,
  `components/incidents/VictimsModal.tsx`, `app/incidents/_parts/DetailsModal.tsx`,
  `components/dashboard/IncidentDetailModal.tsx`, `lib/briefing.ts`, `lib/ai/llmBriefing.ts`,
  `components/briefing/BriefingWindow.tsx`.

## Contexte

Demandes du 23 septembre 2026 (soir) :

1. Un incident touche des personnes qui ne sont **ni blessées, ni disparues, ni décédées** —
   évacuées, relogées, sinistrées, témoins. Elles n'avaient pas de place : on ne pouvait ni les
   déclarer, ni les compter, ni les nommer.
2. Le briefing dit la situation et le concept ; il doit aussi dire **quoi faire**.
3. La fenêtre du briefing était sombre quel que soit le thème de l'application.

## Décision

1. **Personnes impliquées** — un quatrième compteur du bilan, `casualties.involved`, et une
   quatrième nature de personne nommée, `involved`. On les déclare dans l'assistant (étape
   « Victimes & moyens », avec la définition sous les champs) et on les affine dans « Affiner le
   bilan » (compteur et personnes nommées, avec une simple note). Même règle que les victimes : le
   chiffre lu est le plus grand du déclaré et du nommé. Un client qui corrige le bilan **sans**
   envoyer les impliqués ne les remet pas à zéro. Elles ne comptent **jamais** parmi les victimes :
   ni dans le total du tableau de bord d'incident, ni dans les statistiques, ni dans le bilan du
   briefing ; elles s'affichent à part (fiche, tableau de bord, briefing).
2. **Actions à entreprendre** — cinquième rubrique du briefing, **numérotée par priorité** et
   déduite des données, jamais inventée :
   - ce qui manque au dispositif : poste de commandement à armer, unités à engager, unités
     affectées à déployer, disparus à rechercher, établissements d'évacuation à désigner ou
     saturation hospitalière à anticiper, site mortuaire à affecter, personnes impliquées à
     recenser et mettre à l'abri, aléas possibles à surveiller, périmètre NRBC ;
   - puis les actions recommandées par la prédiction d'évolution (retirées du concept
     d'opération pour ne pas les dire deux fois) ;
   - enfin : consigner chaque action au journal de l'incident et diffuser un point de situation.
   La rédaction par l'IA garde les cinq rubriques et la liste numérotée.
3. **La fenêtre suit le thème** : palette de la modale — fond blanc et texte sombre en clair,
   `rdia` en sombre —, titres de rubrique et numéros en or de la marque.

## Révision du même soir — les actions entreprises dans le briefing

4. **Actions entreprises** — une rubrique à part, juste après la Situation : tout le journal de
   conduite de l'incident et de ses rattachés (ADR 0032), dans l'ordre chronologique — date et
   heure, événement → action, auteur ; une ligne venue d'un rattaché le nomme. La Situation ne
   résume plus les trois dernières. Le briefing se lit désormais : Situation · Actions entreprises
   · Anticipation · Objectifs · Concept d'opération · Actions à entreprendre ; la rédaction par
   l'IA garde les six rubriques.
5. **L'IA du briefing passe devant les calculs de fond** — comme le copilote et l'assistant de
   déclaration (`setAiOperatorBusy`) : le modèle local sert une requête à la fois, et le briefing
   attendait derrière l'analyse de situation et les prédictions jusqu'à dépasser son délai
   (« IA indisponible », constaté). Ces calculs sont annulés le temps du briefing et reprennent
   ensuite. Mesuré : briefing rédigé en 26 s, six rubriques.

## Conséquences

- Le contrat OpenAPI porte `involved` (facultatif) dans le bilan et la nature `involved` pour les
  personnes nommées ; les anciens clients restent compatibles.
- Tests : API `involved.spec.ts` (déclarées à la création, hors du total des victimes du tableau de
  bord, nommées, conservées par une correction qui ne les envoie pas, redescendues au nombre de
  personnes nommées, négatif refusé) ; web `briefing.test.ts` (impliqués à part du bilan, objectif
  de prise en charge, actions déduites des manques — avec et sans poste, unités, hôpital, morgue —,
  texte en cinq rubriques numérotées).
- Vérifié navigateur (dev, mode Direx, Chef / PCT) : « Affiner le bilan » d'INC-2612 — quatre
  compteurs, 30 impliqués enregistrés, bilan des victimes inchangé ; briefing — « Personnes
  impliquées (ni blessées, ni disparues, ni décédées) : 30 », neuf actions à entreprendre
  numérotées ; assistant en modification — champ « Personnes impliquées » pré-rempli à 30 avec
  sa définition ; thème clair — fenêtre blanche, texte sombre, rubriques en or.
