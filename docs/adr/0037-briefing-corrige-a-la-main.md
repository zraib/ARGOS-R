# ADR 0037 — Le briefing se corrige à la main, et la correction est partagée

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-24
- **Complète :** ADR 0032 (briefing calculé, rédaction par l'IA, fenêtre flottante), ADR 0034 (six
  rubriques).
- **Portée :** API — `domain.types.ts` (`Incident.briefing`, `BRIEFING_SECTIONS`, longueurs
  maximales), `dto.ts` (`SaveIncidentBriefingDto`), `domain.service.ts` (`saveIncidentBriefing`,
  `clearIncidentBriefing`), `http/incidents.controller.ts` (`PUT` / `DELETE
  /api/incidents/:id/briefing`). Web — `lib/types.ts`, `lib/briefing.ts` (`briefingSections`,
  `sectionsText`, `briefingHeader`), `lib/ai/llmBriefing.ts` (`aiBriefingSections`),
  `lib/api-client/index.ts`, `components/briefing/BriefingWindow.tsx`. Contrat OpenAPI régénéré.

## Contexte

Demande du 24 septembre 2026 : « ajouter la possibilité d'éditer le briefing manuellement ».

Jusqu'ici, le briefing était **calculé** dans le navigateur sur les données de la station, puis
éventuellement rédigé par l'IA. Rien n'était enregistré : fermer la fenêtre perdait tout, et deux
postes ne lisaient jamais le même texte corrigé. Or un briefing d'état-major se relit, s'amende et
se diffuse : une correction faite par l'officier doit survivre à la fenêtre et être lue par tous.

## Décision

1. **La correction est enregistrée sur l'incident principal**, via le champ `Incident.briefing` :
   - le texte de chacune des six rubriques, tel que saisi (seuls les blancs de fin sont retirés) ;
   - qui l'a enregistrée, et quand.

   Elle voyage avec l'incident (liste, carte de chacun, temps réel) : tous les postes la lisent
   sans recharger.
2. **Deux routes**, auditées comme toute écriture :
   - `PUT /api/incidents/:id/briefing` enregistre les six rubriques ;
   - `DELETE /api/incidents/:id/briefing` revient au calcul.

   Longueur maximale : 6 000 caractères par rubrique, 12 000 pour les actions entreprises, qui
   reprennent tout le journal. Les six ensemble restent sous la limite de 100 Ko d'un corps JSON.
3. **Qui corrige : ceux qui tiennent le journal de conduite** — `actions_log:update`, sans nouvelle
   ligne de matrice :
   - en Direx : l'Anim, les chefs des PC, les OPS, les LOG et les Rens ;
   - en classique : l'OPCOM, le TACOM et ses PC, les cellules, l'administrateur ;
   - les autres lisent.

   On ne corrige que le briefing d'un incident qu'on voit (`assertCanSee`). Depuis la décision du
   19 septembre, c'est tout incident déclaré ; la garde tiendra si une station cantonne un jour.
   Si d'autres fonctions doivent corriger le briefing sans tenir le journal, une ligne `briefing`
   dédiée dans la matrice les séparera.
4. **Dans la fenêtre du briefing** :
   - « Modifier le briefing » (crayon, barre de titre) ouvre une zone de texte par rubrique. Elle
     part de ce qui est lu : la rédaction de l'IA, rangée par titre de rubrique ; sinon la version
     corrigée ; sinon le calcul, une puce par point, actions à entreprendre numérotées.
   - « Enregistrer » partage la correction ; « Annuler » l'abandonne. Pendant l'édition,
     « Actualiser » et « Affiner avec l'IA » sont inactifs, et Échap ne fait pas quitter le plein
     écran de la carte.
   - La version corrigée s'affiche signée et datée : « Corrigé à la main par {matricule} —
     {date} ». « Voir le calcul à jour » montre le calcul à côté, sans rien retirer.
   - « Revenir au briefing calculé » retire la correction, en deux temps.
   - « Copier » et « Affiner avec l'IA » portent sur la version lue.
5. Le calcul, la rédaction IA et la version corrigée partagent **une seule forme de texte**
   (`sectionsText`) : copier, rédiger ou corriger ne change pas la présentation.

## Conséquences

- Une version corrigée ne suit plus les données : sa date le dit, et le calcul à jour reste à un
  clic.
- Les instantanés de station d'avant ce lot n'ont pas le champ : rien à migrer (ADR 0033).
- Tests :
  - API `briefing.spec.ts` :
    - enregistrement signé et daté, lu par un wali sur la carte ;
    - en Direx, l'Anim corrige et le Chef DIREX est refusé ; en classique, l'OPCOM corrige et le
      wali est refusé ;
    - longueurs, rubrique manquante, incident inconnu ;
    - retour au calcul, puis 404 s'il n'y a plus rien à retirer.
  - Web `briefing.test.ts` :
    - rubriques du calcul en texte ;
    - forme commune du texte ;
    - rédaction IA rangée par titre, même dans le désordre ou avec des titres décorés.
  - Suites : API 590 tests, web 249.
- Vérifié dans le navigateur (dev, Direx, superadmin, INC-2612) :
  - édition partie du calcul, « Concept d'opération » corrigé puis enregistré ;
  - statut signé et daté ; bascule calcul ↔ version corrigée ;
  - nouvelle édition repartie de la version corrigée ;
  - bouton et retour au calcul masqués sans le droit ;
  - retour au calcul en deux temps, qui laisse l'incident comme avant.
