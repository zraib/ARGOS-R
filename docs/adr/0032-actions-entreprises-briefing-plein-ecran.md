# ADR 0032 — Actions entreprises, briefing opérationnel en fenêtre flottante, carte plein écran habitée

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-23
- **Complète :** ADR 0020 (la carte de tous), ADR 0022 (profils de rôles), ADR 0029 (changements
  poussés), le copilote (§ 6.17 couche 2).
- **Portée :** API — `shared/permissions.ts` (ligne `actions_log`), `direx.matrix.ts` (+ grille
  CSV), `domain.types.ts` (`IncidentActionEntry`), `domain.service.ts`, `dto.ts`,
  `http/incidents.controller.ts`. Web — `components/incidents/ActionsLog.tsx`,
  `lib/briefing.ts`, `lib/ai/llmBriefing.ts`, `lib/ai/provider.ts` (`chatStream`),
  `components/briefing/BriefingWindow.tsx`, `lib/store/slices/ui.ts`, `components/shell/AppFrame.tsx`,
  `components/ui/Modal.tsx`, `app/map/page.tsx`, `app/incidents/_parts/DetailsModal.tsx`,
  `app/utilisateurs/_parts/RolesTab.tsx`.

## Contexte

Trois besoins de la conduite, exprimés le 23 septembre 2026 :

1. La fiche d'un incident dit ce qui est **recommandé** (prédiction d'évolution), jamais ce qui a
   été **fait**. Il manque le journal de conduite : à telle heure, tel événement, telle action.
2. Présenter la situation d'une opération demande un **briefing** — Situation, Anticipation,
   Objectifs, Concept d'opération — qui couvre l'incident principal, ses incidents rattachés et
   leurs sous-incidents, et qui sorte vite ; l'IA peut aider, pas faire attendre.
3. Sur la carte en **plein écran**, le centre de communication et le copilote disparaissaient :
   le calque plein écran (`z-9999`) passait par-dessus tout ce que le cadre de l'application monte
   (bulles, tiroirs, fenêtres de conversation, avis, et même les modales).

## Décision

1. **Actions entreprises** — sous « Actions recommandées », dans la modale d'un incident : un
   tableau Date / heure · Événement · Action entreprise, chaque ligne avec son sélecteur date et
   heure. Le journal est tenu par l'API (`Incident.actionsLog`, routes
   `POST/PATCH/DELETE /incidents/:id/actions[/:aid]`), reste **chronologique**, garde l'auteur de
   chaque ligne et de sa dernière correction ; le fil d'activité annonce chaque ajout ; l'écriture
   est poussée à tous les postes (intercepteur de l'ADR 0029). Une ligne porte au moins un
   événement ou une action.
2. **Qui tient le journal** — nouvelle ligne de la matrice, `actions_log` (« Actions
   entreprises ») :
   - profil direx : `FULL` (ajouter, corriger, retirer) pour l'Anim, les chefs des PC (PC FAR,
     PCF, PCT, PCO), tous les OPS, tous les LOG et les Rens (Planif & Rens des PC opératifs, Rens
     de PCT, Rens & Com de PCO, RLS de la DIREX) ; `V` pour le Chef DIREX, l'évaluation et les
     synthèses ;
   - profil classique : `AMV` (sans retrait) pour l'OPCOM, le TACOM et ses PC, les trois
     cellules ; `V` pour les représentants de l'OPCOM, le stratégique, les autorités et les chefs
     d'entité.
   La ligne se règle ensuite comme les autres dans Gestion des utilisateurs › Rôles.
3. **Briefing** — établi **en un instant** sur les données (couche 1, `lib/briefing.ts`, sans
   réseau ni modèle) :
   - *Situation* : nature, lieu, date, gravité, contexte ; bilan cumulé de la famille (incident,
     rattachés, aléas secondaires) ; rattachés ; aléas secondaires ; moyens engagés ; dernières
     actions entreprises ;
   - *Anticipation* : prédiction d'évolution (niveau, tendance, probabilité, horizon, facteurs),
     aléas secondaires possibles non déclarés (catalogue par type), disparus, capacité
     hospitalière engagée, météo sur zone ;
   - *Objectifs* : sauver les vies, puis les objectifs propres à la nature de l'incident et de ses
     rattachés, la prise en charge médicale, les défunts, l'information de la population ;
   - *Concept d'opération* : commandement déployé, effort principal, moyens par corps,
     affectations PCO / PCT, soutien santé, actions recommandées, coordination.
   « Affiner avec l'IA » fait **rédiger** ce briefing par le modèle local — mêmes rubriques, mêmes
   chiffres, rien d'ajouté —, au fil de l'eau, génération plafonnée (700 jetons), délai de 45 s,
   annulable ; sans modèle joignable, le briefing calculé reste.
4. **Fenêtre flottante** — le briefing s'ouvre dans une fenêtre, pas une modale : elle se déplace
   (barre de titre, souris ou flèches du clavier), se redimensionne, retient sa position sur le
   poste, propose le choix de l'incident principal, et laisse la carte vivre autour d'elle. On
   l'ouvre depuis la modale d'un incident (bouton Briefing — un rattaché ouvre le briefing de son
   principal), depuis la fiche d'un incident sélectionné sur la carte, ou depuis la barre d'outils
   de la carte.
5. **Plein écran habité** — la carte dit au reste de l'application qu'elle occupe l'écran
   (`mapFull`) : le cadre place alors ses couches flottantes (centre de communication, copilote,
   briefing, alerte sismique, avis) dans une couche au-dessus de la carte, et les modales passent
   elles aussi au-dessus. Échap ferme d'abord ce qui est ouvert par-dessus (copilote, modale) ; le
   plein écran ne se quitte qu'ensuite.

## Conséquences

- La matrice compte 44 lignes (le test `role-grants` suit) ; le client OpenAPI porte les trois
  routes.
- Le briefing ne voit que ce que le poste voit (incidents du compte et carte de tous) ; il ne
  sort rien de la station — le modèle est local.
- Tests : API `incident-actions.spec.ts` (13 rôles direx saisissent, corrigent, retirent ;
  chronologie ; Chef DIREX, évaluation, synthèse en lecture ; classique sans retrait ; 400 / 404 ;
  fil) ; web `briefing.test.ts` (bilan cumulé de la famille, aléas possibles, objectifs par nature,
  concept, texte en quatre rubriques, racine d'un rattaché).
- Vérifié navigateur (dev, mode Direx) : Chef / PCT — deux lignes saisies (21:25 puis 18:40,
  rangées 18:40 d'abord), une corrigée (« corrigé par c.pct ») ; évaluation — lecture seule, ni
  formulaire ni boutons ; Briefing d'INC-2612 (1 rattaché, 2 sous-incidents) : bilan cumulé
  26 blessés et 3 disparus ; IA locale : premier texte à 2,5 s, briefing rédigé en 18 s, fidèle ;
  fenêtre déplacée à la souris et position retenue ; carte en plein écran : briefing, copilote et
  conversations au-dessus ; Échap ferme le copilote puis, seulement ensuite, le plein écran.
