# ADR 0009 — Dotations provisoires de la matrice : ce que l'état-major doit arbitrer

- **Statut :** proposé — en attente d'arbitrage de l'état-major (registre R-4)
- **Date :** 2 septembre 2026
- **Portée :** `apps/api/src/shared/permissions.ts` (bloc `LEGACY`), `docs/04-securite.md`

## Contexte

La source de vérité des droits est la matrice `docs/MATRICE ROLES.xlsx`,
transcrite ligne par ligne dans `permissions.ts` (`MATRIX`). Quatorze
fonctionnalités n'y figurent pas encore : elles ont reçu une **dotation
provisoire** dans le bloc `LEGACY`, reprise de l'état antérieur ou déduite de la
doctrine du module, toujours en défaut-refus (un rôle absent d'une ligne n'a
aucun droit). Le code les signale comme provisoires ; l'API les applique comme
définitives. Il faut donc que l'état-major les confirme ou les corrige — et que
la matrice les intègre, pour que la table `LEGACY` disparaisse.

Codes de cellule : **V** visualiser · **A** ajouter · **M** modifier ·
**R** archiver · **AMRV** = tout. Le Super Administrateur détient un joker sur
tout et n'apparaît pas dans les lignes.

## Ce qui est appliqué aujourd'hui

### Lignes signalées « à confirmer » dans le code

| Fonctionnalité | admin | opcom | tacom | bluecell | greencell | orangecell | strategic | place_arme | wali | responsables |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `aviation` — suivi aérien, liste de suivi | AMRV | AMV | AMV | V | V | V | V | V | V | — |
| `tracking` — traceurs GPS (déclarer un boîtier = l'autoriser à parler à ARGOS) | AMRV | AMV | AMV | V | V | V | V | V | V | — |
| `comms_admin` — créer, renommer, supprimer un canal | AMRV | — | — | — | — | — | — | — | — | — |
| `nrbc` — déclarer la substance, choisir le référentiel du panache | AMRV | AMV | AMV | V | V | V | V | V | V | — |
| `missions` — émettre, accuser, jalonner les boucles | AMRV | AMV | AMV | AMV | V | V | V | V | V | `update` (+ `A` pour demander un moyen) |

Raisonnement retenu : la **conduite** (opératif, tactique) agit ; l'état-major,
le wali, la place d'armes et les cellules **consultent** ; l'administration des
canaux est **séparée** de la participation (`comms` accorde lecture et parole à
tous les rôles) parce qu'un canal renommé ou supprimé pendant une conduite ne se
rattrape pas.

### Lignes reprises de l'état antérieur (hors matrice)

| Fonctionnalité | Dotation actuelle |
| --- | --- |
| `dispatch` | admin V · tacom AMV · bluecell AMV · opcom AMV |
| `triage` | admin V · tacom V · bluecell AMV · resp_morgue V |
| `ics` | admin V · tacom V · bluecell AMV |
| `damage` | admin V · tacom V · bluecell V |
| `orsec` | admin V · strategic V · tacom AMV · opcom AMV |
| `plans` | admin V · strategic V · tacom V · opcom AMV |
| `personnel` | admin V · greencell AMV · resp_unit V |
| `workorders` | admin V · greencell AMV · resp_equipment AMV |
| `seismic` | V pour admin, strategic, tacom, bluecell, opcom, wali, place_arme |

## Questions à trancher

1. **Aviation et traceurs** : la déclaration d'un aéronef ou d'un boîtier
   revient-elle bien à la conduite (opcom/tacom), ou à la cellule logistique
   (greencell) qui tient l'inventaire des moyens ?
2. **Administration des canaux** : réservée à l'Administrateur, ou ouverte au
   commandement tactique pour ouvrir un canal d'incident sans attendre ?
3. **NRBC** : la cellule spécialisée (orangecell ?) doit-elle pouvoir déclarer
   la substance et choisir le référentiel, plutôt que seulement consulter ?
4. **Missions** : la cellule bleue émet aujourd'hui des boucles au même titre
   que la conduite — confirmé ? Les responsables d'entité doivent-ils pouvoir
   *créer* une demande montante (lot P2-a) au-delà d'accepter/refuser/jalonner ?
5. **Les neuf lignes reprises** : à valider telles quelles ou à réviser ; le
   wali et la place d'armes n'apparaissent que sur `seismic` — voulu ?

## Comment une décision s'applique

1. Reporter la ligne arbitrée dans `docs/MATRICE ROLES.xlsx`.
2. La transcrire dans `MATRIX` (`permissions.ts`) et la retirer de `LEGACY`.
3. `npm run test:api` : `authz.spec`, `scope.spec`, `governance.authz.spec`,
   `missions.authz.spec`, `comms.spec`, `tracking.spec` rejouent les refus et
   les accès attendus ; ajuster les attentes qui changent **avec** la décision.
4. `npm run docs:api` : la référence API affiche la nouvelle permission de
   chaque route ; mettre à jour `docs/04-securite.md` §6.

## Alternatives écartées

- **Ouvrir large en attendant** (tout rôle authentifié) : contraire au
  défaut-refus ; une permission trop large ne se reprend jamais sans friction.
- **Fermer tout jusqu'à l'arbitrage** : rendrait inutilisables le suivi aérien,
  les traceurs, le NRBC et les missions, donc invérifiables par ceux qui
  doivent les arbitrer.
- **Décider ici** : ce n'est pas au code de fixer qui commande quoi ; il
  applique, signale, et attend.
