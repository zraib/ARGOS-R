# ADR 0015 — Profil de données : la station en service démarre vide

- **Statut :** accepté
- **Date :** 2026-09-16
- **Portée :** `apps/api/src/common/data-profile.ts`, `modules/domain/profile.rules.ts`
  (élagage pur), `domain.service.ts` (reprise par profil, suppressions, purge),
  `http/admin.controller.ts`, `http/resources.controller.ts`,
  `http/hospitals.controller.ts` (routes `DELETE`), `shared/permissions.ts`
  (`MODULE_KEYS`, `FEATURE_MODULE`, lignes `map`/`comms`/`tracking`),
  `common/guards/permissions.guard.ts` et `common/ports/feature-gate.port.ts`
  (bascules effectives), `modules/flags` (clés), `modules/orders` (bons de
  démonstration), `modules/aviation` (noria d'exercice), `catalog.service.ts`,
  `comms.service.ts` ; côté web `lib/nav.ts` (`NAV_MODULE`, `moduleOpen`),
  couches `layers/points.ts`, `shelters.ts`, `trackers.ts`, tranche
  `store/slices/tracking.ts`, `components/org/DeleteEntityModal.tsx`,
  `app/parametres/_parts/DataProfileCard.tsx` ; `deploy/docker-compose.yml`
  et `.env.example` (`DATA_PROFILE`).
- **Révise :** l'ADR 0009 sur trois lignes de la matrice provisoire
  (`map`, `comms`, `tracking` ouvertes aux responsables d'entité).

## Contexte

Le dépôt embarque un jeu de démonstration : incidents, unités, abris, morgues,
dossiers, parcs, fil d'événements, convois animés, noria aérienne d'exercice,
salons de communication fictifs, rosters de personnel dérivés des
identifiants. Il sert à développer et à montrer. Sur la station Windows mise en
service, il est apparu tel quel : des convois circulaient, des incidents
étaient « en cours », des unités portaient des noms inventés — et rien de tout
cela ne pouvait être retiré, la plateforme n'offrant aucune suppression
d'entité. Le propriétaire du produit a demandé un **mode vide** : plus rien de
simulé, le réseau hospitalier conservé, la possibilité de supprimer une unité,
un abri, une morgue ou un hôpital, l'apparition sur la carte de ce qu'un
opérateur déploie ou partage (position GPS), la communication pour tous, et
des bascules de rôles et de modules **effectives** — « si je désactive une
fonctionnalité, elle doit être désactivée ». Le tout sans toucher aux comptes
ni à la base.

Trois constats ont fixé la forme de la réponse :

1. les graines renaissaient à chaque démarrage (reconstruction du jeu à la
   reprise) : supprimer sans persistance de la suppression ne servait à rien ;
2. les bascules d'administration (`role-features`, `flags`) n'étaient lues que
   par le navigateur, avec deux vocabulaires incompatibles (clés de navigation
   côté web, fonctionnalités RBAC côté API) : une case décochée était rejetée
   par l'API (400) ou n'avait aucun effet, et un rôle non administrateur ne
   recevait même pas les bascules (`settings:view`, `users:view` exigés) ;
3. `resp_equipment` n'avait pas la ligne `comms`, `resp_morgue` et
   `resp_equipment` n'avaient pas la ligne `map`, aucun responsable n'avait
   `tracking:view` : ce qu'ils déployaient ne pouvait pas leur apparaître.

## Décision

**Un profil de données, réglé par l'environnement.** `DATA_PROFILE=demo|empty`
(`common/data-profile.ts`). Absent, la production est vide et le développement
en démonstration — le même réflexe que pour le fond de carte : on ne devine
jamais dans le sens de la simulation sur une station. Le profil est annoncé
par `/api/health`, `/api/reference` et `/api/domain/profile`.

**En profil vide, rien n'est semé.** Le domaine, le catalogue (mouvements,
rosters, bons, triage, victimes, dommages, plans, formulaires, rapports), les
salons de communication (un seul canal « général »), les bons de travail, la
file de répartition, les convois animés (`vehRoutes`) et la noria aérienne
d'exercice sont vides ou coupés. Le navigateur coupe ses propres simulateurs
(fil fictif, rosters dérivés) quand l'API annonce le profil vide. Restent les
référentiels : réseau hospitalier et services, géographie, types d'incident,
substances.

**L'élagage est une règle pure** (`profile.rules.ts`, `pruneDemo`) : étant
donné les collections et ce qu'on retire, ce qui reste — et ce qui part avec
(dossiers d'un site disparu, victimes d'un incident retiré, parc d'une unité
retirée, postes d'une entité retirée). Trois usages : le premier démarrage
vide ou la conversion d'un instantané de démonstration (graines par
identifiant et par marqueur `seeded`, hôpitaux de campagne, fil orphelin) ; en
démonstration, les seules graines dont on a posé la **pierre tombale** (une
graine supprimée ne renaît pas) ; la purge signée (tout sauf le réseau
hospitalier). Un instantané déjà écrit vide est repris **tel quel**, sans
élagage par identifiant : sur une station vide la numérotation repart de zéro,
et `U1` y est une unité bien réelle.

**Les entités se suppriment — par le Super Administrateur seulement**, la
doctrine du dépôt ne change pas (`*:delete` n'est jamais accordé par la
matrice). Le domaine refuse (409) ce qui laisserait une opération sans ses
moyens, un registre sans son site, un établissement avec des morgues
rattachées ou des hôpitaux de campagne, un abri avec des occupants, un compte
sans son entité — et dit ce qui retient. `?force=true` passe outre en
connaissance de cause. La **remise à zéro** (`POST domain/purge`) est signée
par le mot de passe, comme l'identification d'un corps.

**Les bascules deviennent effectives, avec un seul vocabulaire.** La
fonctionnalité (`Feature`) reste le grain du RBAC ; le module (`ModuleKey`,
les clés de navigation du web) devient le grain de l'administration, et
`FEATURE_MODULE` relie les deux. La garde des permissions, par le port
`FeatureGate` (même inversion que la portée ABAC), refuse toute route d'un
module coupé pour le rôle ou pour tous. Le cœur n'a pas de module. Tout compte
lit les bascules. La matrice rôle → modules se réinitialise à ses défauts,
dérivés de la matrice RBAC.

**Tout le monde voit la carte, communique, et voit les positions partagées** :
`map` s'ouvre à `resp_morgue` et `resp_equipment`, `comms` à `resp_equipment`,
`tracking` en lecture aux cinq responsables.

**La carte montre ce qu'on déploie** : couche des abris (positionnés — le
formulaire d'ouverture pose un point sur une carte, comme un site mortuaire),
couche des traceurs et positions partagées (relue toutes les 15 s tant qu'elle
est visible), sur une couche de points générique dont les sites mortuaires sont
désormais un habillage. *(Révisé par l'ADR 0036 : un abri sans point propre se
dessine à la position de sa commune, et son infobulle le dit.)*

## Conséquences

Positives :

- une station en service ne montre que du réel, et le dit (profil annoncé,
  volume du domaine, graines restantes) ;
- une suppression survit au redémarrage, et une conversion démo → vide garde
  le travail des opérateurs, les comptes et la base ;
- une case décochée coupe réellement : 403 côté API, écran masqué côté web,
  d'un même mot ; les tests de garde le prouvent par la bascule (les deux
  tests « rôle sans permission » de `comms` et `tracking` ont dû être réécrits :
  plus aucun rôle n'est privé de ces lignes) ;
- les règles d'élagage, de garde-fous et de reprise sont testées sans
  serveur (`profile.rules.spec.ts`, `empty-restore.spec.ts`) et de bout en
  bout (`empty-mode.spec.ts`).

Négatives, assumées :

- deux vocabulaires cohabitent à dessein (fonctionnalités et modules) ; la
  table `FEATURE_MODULE` est un point d'entretien : une fonctionnalité sans
  module (`null`) ne se coupe jamais ;
- un drapeau global coupé ferme le module au Super Administrateur aussi : c'est
  voulu (interrupteur), mais un opérateur qui coupe `comms` par erreur perd le
  dock des conversations jusqu'à ce qu'il le rouvre depuis les Paramètres ;
- la matrice persistée dans l'ancien vocabulaire est migrée par clés connues :
  une personnalisation faite sous l'ancien vocabulaire (`hospinet`, `teams`…)
  est perdue au premier démarrage — il n'y en avait aucune sur la station ;
- le personnel et les véhicules d'une unité restent vides sur une station vide
  tant qu'aucun module ne les tient : c'est l'honnêteté que le mode exige.

## Alternatives écartées

- **Vider la démonstration à la main, sans profil.** Les graines renaissaient
  à la reprise, et le poste du développeur en a besoin. Le profil sépare les
  deux usages sans code conditionnel dans les écrans.
- **Un jeu de données par environnement (fichiers JSON de seed).** Plus lourd,
  et il n'aurait rien réglé des simulateurs client ni des bascules.
- **Faire porter l'effectivité des bascules par le navigateur seulement.** Le
  masquage n'est pas un contrôle ; la demande était explicitement « effectif ».
- **Réécrire la matrice rôle → fonctionnalités dans le vocabulaire RBAC côté
  web.** Trente-cinq fonctionnalités à libeller dans trois langues pour un
  écran qui parle de modules ; le module est le bon grain d'administration.
- **Ouvrir la suppression à l'Administrateur.** La doctrine du dépôt est
  monolithique et testée (`governance.authz.spec.ts`) ; elle reste.
