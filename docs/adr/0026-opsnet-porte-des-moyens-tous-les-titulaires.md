# ADR 0026 — OPSnet, la porte des moyens : on entre dans l'unité ; tous les titulaires d'une entité, joignables partout

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-20
- **Complète :** ADR 0016 (ressources d'une entité), ADR 0018 (ressources sur le terrain),
  ADR 0019 (visibilité des ressources, OPSnet).
- **Portée :** `apps/web/src/app/opsnet/page.tsx`, `components/opsnet/{OpsnetSheets,OpsnetBits}.tsx`,
  `components/resources/ResourcesScreen.tsx` (mode embarqué), `components/responsibility/ResponsibleCard.tsx`,
  `lib/responsibles.ts`, `app/map/page.tsx` ; API : `modules/iam/users.controller.ts`, événement
  temps réel `responsables`.

## Contexte

Les moyens d'une unité se tenaient sur trois écrans : OPSnet pour la voir (une modale de sept
champs), « Ressources » pour inscrire ses personnes, équipes, véhicules, logistique et
équipements (ADR 0016), « Unités » pour un roster de lecture. L'état-major veut **un seul
geste** : cliquer une unité dans OPSnet, y entrer, et y tenir ses moyens — inscrire une
personne, constituer une équipe, ajouter un équipement — sans changer d'écran.

Par ailleurs, la fiche d'une entité et le panneau de la carte ne montraient que **le premier**
compte rattaché (`responsibleOf` = `find`). Une unité qui a deux commandants rattachés, un
hôpital qui a un directeur et un adjoint : le second n'apparaissait nulle part — ni dans
OPSnet, ni sur la carte —, et un compte rattaché après l'ouverture de la carte n'y apparaissait
qu'au rechargement, faute d'événement temps réel côté IAM.

## Décision

1. **Entrer dans l'entité.** Dans OPSnet, cliquer le nom d'une unité ou d'un abri, ou son
   bouton « Entrer », remplace l'écran par **sa fiche** (`/opsnet?unit=<id>`,
   `/opsnet?shelter=<id>` — l'URL se partage, la carte y mène par « Détails ») : ce qu'elle
   est (organe, ville, état, préparation, effectif, commandant, position), qui la tient, et
   **ses moyens tenus sur place** — l'écran « Ressources » embarqué (`ResourcesScreen`
   `embedded`, entité imposée, onglets Personnel · Équipes · Véhicules · Logistique ·
   Équipements). Les droits d'écriture restent ceux que l'API dit (`canManage`, selon le rôle,
   la portée et le mode) ; la fiche ne fait que masquer ce qui serait refusé. Modifier et
   retirer l'entité se font depuis la fiche. Les modales de détail disparaissent.
2. **Tous les titulaires, partout.** `responsiblesOf(list, kind, id)` rend chaque compte
   rattaché à l'entité (une fois par rôle, dans l'ordre servi) ; `ResponsibleCard` les affiche
   tous — état de connexion et « Contacter » pour chacun — dans OPSnet, Hospinet, le service
   morgue et le panneau de sélection de la carte (unités, hôpitaux, abris, morgues). Un poste
   déployé (OPCOM, TACOM, cellule) reste une ligne, identifié par (incident, rôle, compte).
   `responsibleOf` (le premier) ne sert plus qu'aux légendes.
3. **Le rattachement se propage en temps réel.** Créer, modifier, suspendre ou supprimer un
   compte émet `{ kind: "responsables" }` (module IAM, bus `RealtimeService` global) ; chaque
   poste relit les titulaires et les comptes déployables. La carte ouverte voit le nouveau
   commandant sans rechargement.
4. La carte : « Détails » d'une unité mène à sa fiche OPSnet (et non plus à « Unités »),
   « Détails » d'un abri à la sienne.

## Ce que cela ne change pas

Les écrans « Ressources » et « Unités » du groupe Ressources restent ; l'affectation d'un
compte à une entité reste un acte de la gestion des utilisateurs (rôle responsable +
rattachement, ADR 0016/0019). Les hôpitaux gardent leur fiche Hospinet ; y embarquer leurs
moyens est un lot à part.

## Conséquences

- Un commandant d'unité ouvre OPSnet, entre dans son unité et tient son personnel, ses équipes,
  ses véhicules, sa logistique et ses équipements au même endroit ; l'état-major joint n'importe
  lequel des titulaires depuis la carte.
- Tests : `lib/__tests__/responsibles.test.ts` (tous les titulaires, dédoublonnés), API
  `modules/iam/users.spec.ts` (deux commandants sur une unité → deux lignes ; un compte
  suspendu disparaît). Vérifié navigateur : fiche d'unité (3 titulaires, personne inscrite,
  équipe constituée), fiche d'abri, panneau de la carte mis à jour en direct à l'affectation
  d'un troisième commandant, « Détails » → `/opsnet?unit=U1`.
