# ADR 0016 — Chaîne de commandement pendant un incident, modes de la station, ressources des entités

- **Statut :** accepté
- **Date :** 2026-09-17
- **Portée :** `apps/api/src/shared/permissions.ts` (cinq rôles, quatre fonctionnalités,
  rôles dérivés, module `resources`), `shared/responsibilities.ts`,
  `common/app-mode.ts`, `modules/mode/`, `modules/domain/{assignment,mode,resources}.rules.ts`,
  `resources.{types,service}.ts`, `http/resources-registry.controller.ts`,
  `http/incidents.controller.ts` (affectations, déploiements), `http/resources.controller.ts`
  (règles de mode sur les unités), `http/admin.controller.ts` (mode), `users.service.ts`
  (bascules par compte), `common/guards/permissions.guard.ts`, `realtime/notices.service.ts`
  (acquittement persisté), `aviation.service.ts` (trajectoires), `environment.controller.ts`
  (`weather:view`) ; côté web `lib/roles.ts`, `lib/nav.ts`, `lib/resources.ts`, `lib/corps.ts`,
  `app/ressources`, `components/resources/`, `components/incidents/UnitAssignments.tsx`,
  `app/utilisateurs/_parts/UserForm.tsx` (modules du compte), `app/parametres/_parts/DataProfileCard.tsx`
  (mode), `components/shell/{Header,NotificationBell}.tsx`, `components/flux/QuakeAlert.tsx`,
  `components/map/layers/aircraft.ts`, `components/map/MapCanvas.tsx` (météo).
- **Révise :** l'ADR 0015 (le profil de données découle désormais du mode), l'ADR 0009
  (lignes `units`, `teams`, `map`, `comms`, `tracking`, `seismic` : lecture de la météo
  détachée de la sismologie).

## Contexte

La doctrine de conduite d'un incident telle que le propriétaire du produit l'a fixée :

- l'**utilisateur stratégique** supervise tous les incidents et dicte la stratégie ;
- l'**OPCOM** (PC état-major incident, un par incident) regroupe un ou plusieurs walis,
  un ou plusieurs commandants de place d'armes, des représentants de la Gendarmerie
  Royale, de l'État-Major des FAR et du ministère de l'Intérieur ;
- le **TACOM** (PC tactique terrain) regroupe un **PCO** (PC opérationnel : un poste de
  commandement et les cellules bleue, verte, orange qui regroupent les unités civiles —
  DGSN, Forces Auxiliaires, Protection Civile — et la gendarmerie) et un **PCT** (PC
  tactique : un poste de commandement, qui participe aux cellules) ;
- l'OPCOM **affecte** des unités à l'incident : les représentants civils affectent les
  unités civiles, la gendarmerie les siennes (vers le PCO), l'état-major et les
  commandants d'armes les unités des FAR vers le PCO ou le PCT ;
- le TACOM **reçoit** les unités selon leur destination et les **déploie** ; les cellules
  les déploient sur le terrain ou les retirent ;
- les **ressources** — personnes (grade, nom, prénom, matricule, fonction ; corps),
  équipes de personnes, équipements (type, numéro, nombre), véhicules, logistique
  (carburant, vivres, couchage, campement) — sont tenues par les commandants d'unité,
  directeurs d'hôpital et chefs d'abri, et par les cellules selon leur fonction ; elles
  sont visibles des intervenants qui y ont accès ;
- trois **modes** : démonstration (données simulées), exercice (rien de simulé, l'OPCOM
  et les cellules créent unités et ressources), opérationnel (unités par le Super
  Administrateur, ressources par les chefs d'entité, affectation par l'OPCOM,
  exploitation par le TACOM, déploiement par les cellules) ;
- une fonctionnalité coupée **pour un utilisateur** doit l'être pour lui.

Ce qui existait : quinze rôles, `responders.units` figé à la déclaration de l'incident,
aucun corps sur les unités, aucun registre de personnes, de véhicules ni de logistique
(rosters fictifs dérivés des identifiants), des bascules par rôle et par drapeau
(ADR 0015) mais rien par compte, un profil de données `demo|empty` réglé par
l'environnement.

## Décision

**Cinq rôles de plus.** `gendarmerie`, `etat_major`, `interieur` (membres de l'OPCOM) et
`pco`, `pct` (chefs des PC du TACOM). Ils sont **dérivés** dans la matrice : chacun hérite,
ligne par ligne, de la dotation d'un rôle de référence (`opcom` pour les représentants —
sans conduite de l'incident : ils affectent, ils ne déclarent ni n'archivent —, `tacom` pour
les PC). Tous sont déployés sur UNE opération (`ROLE_SCOPE_KEY`), comme la conduite qu'ils
composent. Les postes `pco` et `pct` existent sur la carte.

**Le corps d'une unité** (`far`, `gendarmerie`, `dgsn`, `dgpc`, `fa`) décide qui peut
l'affecter et où elle va : `assignment.rules.ts`. La gendarmerie et les unités civiles
rejoignent le PCO ; une unité des FAR va au PCO ou au PCT au choix de qui l'affecte.

**L'affectation est un objet de l'incident** (`Incident.assignments`, dénormalisé sur
`Unit.assignment`) : `POST/DELETE incidents/:id/assignments[/:unitId]` (`assign:*`),
`POST .../deploy` et `.../withdraw` (`deploy:*`). Une unité n'est affectée qu'à une
opération à la fois ; l'affectation l'engage (`responders.units`), le déploiement la met
`deployed`, le retrait la rend `ready`. Retirer ou élaguer une unité efface ses
affectations.

**Le mode de la station** (`common/app-mode.ts`, `ModeService`) est un réglage persisté
(`settings.json`) changé par le Super Administrateur, signé par son mot de passe
(`PATCH domain/mode`). Il décide du profil de données (démonstration = jeu semé ; exercice
et opérationnel = station vide, ADR 0015) et resserre la matrice (`mode.rules.ts`,
`resources.rules.ts`). Comme le jeu se sème au démarrage et que plusieurs modules
choisissent leurs adaptateurs à la construction, changer de mode **redémarre l'API** : sur
la station elle s'arrête d'elle-même et Docker la relance ; en développement on la relance.
Un retour en démonstration resème les graines sans toucher à ce que les opérateurs ont
créé. Le mode est annoncé partout (`/health`, `/reference`, `/iam/me`, bandeau).

**Les ressources** (`resources.types.ts`, `ResourcesService`, instantané `resources.json`)
appartiennent à une entité — unité, hôpital, abri — et suivent le parc d'équipement dans
sa mécanique (tableaux, identifiants séquentiels `P-n`, `T-n`, `V-n`, `S-n`, `persist()`).
Le parc d'équipement s'ouvre aux hôpitaux et aux abris (`EquipItem.ownerKind`). Les routes
`/resources/*` portent la fonctionnalité `resources` ; qui tient quoi est tranché par
`canManageResource` : le chef sur sa seule entité (tous modes), la cellule bleue et la
cellule orange hors mode opérationnel (l'orange sur les seules forces de l'ordre), la
cellule verte en tout mode pour la logistique et hors opérationnel pour le reste, la
conduite et les autorités en lecture. Retirer une entité emporte ses ressources (cascade).
« Retirer » une ressource est l'action `archive` de la matrice — jamais `delete`.

**Bascule par compte** : `ManagedUser.modules` (`PATCH iam/users/:id/modules`, `null` rend
la main au rôle), consultée par la garde avant le rôle ; `/iam/me` sert les modules
EFFECTIFS (drapeaux ∧ rôle ∧ compte) que le navigateur applique tel quel.

**Communication pour tous** : les alertes adressées s'acquittent côté serveur
(`POST comms/notices/:id/ack`, `all`), l'acquittement survit au rechargement et au
redémarrage ; la cloche bat et un rappel sonore discret revient toutes les 45 s tant qu'une
alerte n'est pas acquittée ou qu'un message n'est pas lu (préférences sonores du poste
respectées). L'alerte sismique se pose à côté du bouton des conversations et replie les
conversations ouvertes.

**Divers, demandés avec le lot** : la météo se lit avec `weather:view`, accordé à tous
(elle était gardée par `seismic:view`, que la plupart des rôles n'ont pas — d'où une météo
« absente en production ») ; choisir un jour ou une heure met la lecture animée en pause
(elle écrasait le saut) ; les aéronefs suivis gardent une trajectoire bornée côté serveur
(`AIRCRAFT_TRAIL_MAX`), dessinée sur la carte ; le tiroir du Copilot ne montre plus ni
fournisseur ni nom de modèle (réglage d'administration) ; les modales de suppression
sont lisibles en thème clair.

## Conséquences

Positives :

- la doctrine est un modèle, pas une convention orale : qui affecte quoi, vers où, qui
  déploie, qui tient quelles ressources, dans quel mode — chaque règle est un fichier pur
  testé (`command-chain.rules.spec.ts`) et une preuve de bout en bout
  (`command-chain.spec.ts`) ;
- un exercice se joue sur une station vide sans toucher à la doctrine opérationnelle, et
  un retour en démonstration ne coûte rien à ce que les opérateurs ont créé ;
- une bascule — globale, par rôle, par compte — est effective côté API, et le navigateur
  reflète exactement ce que l'API refuse.

Négatives, assumées :

- vingt rôles, dont cinq dérivés : la table `DERIVED_ROLES` est un point d'entretien, et
  `docs/MATRICE ROLES.xlsx` reste à mettre à jour (les quatre lignes ajoutées et les cinq
  colonnes dérivées y sont absentes) ;
- le changement de mode redémarre l'API (une trentaine de secondes sur la station) ; un
  mode ne se change donc pas en pleine conduite — et le bandeau le rappelle ;
- en démonstration et en exercice, l'OPCOM et les cellules **retirent** des unités : c'est
  une dérogation à la doctrine « `delete` au Super Administrateur seul », limitée à ces
  deux modes et portée par `teams:update` + `canDeleteUnit` ;
- les trajectoires d'aéronefs vivent dans la mémoire du processus : un redémarrage les
  efface ; elles ne grandissent que si un poste interroge le flux ;
- l'ancien écran « Personnel » (roster fictif) disparaît au profit des Ressources ; son
  adresse redirige.

## Alternatives écartées

- **Une seule entité « OPCOM » avec des membres nommés** plutôt que des rôles : les
  comptes portent déjà un rôle, une portée et un déploiement ; ajouter une entité
  d'organisation aurait dupliqué ce que l'IAM sait faire.
- **Changer de mode sans redémarrer** : possible pour le domaine, pas pour les
  adaptateurs choisis à la construction (noria d'exercice, salons de démonstration, bons de
  travail semés) ; un demi-mode aurait menti à l'opérateur.
- **Des permissions par mode dans la matrice** (trois matrices) : illisible et jamais
  arbitrable ; une matrice maximale resserrée par des règles pures se lit et se teste.
- **Des ressources sans détenteur, dans un catalogue plat** : c'est le modèle démo que
  l'ADR 0015 abandonne ; une ressource sans entité n'a ni chef ni portée.
- **Une trajectoire d'aéronef accumulée par le navigateur** : chaque poste aurait vu une
  trace différente ; le serveur la tient, comme pour les traceurs (ADR 0008).
