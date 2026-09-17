# ADR 0017 — Tout le menu dans la matrice rôle → modules, « Gestion de mon entité » du commandant d'unité

- **Statut :** accepté
- **Date :** 2026-09-17
- **Portée :** `apps/api/src/shared/permissions.ts` (`MODULE_KEYS` à 30, `CORE_MODULES`,
  `SWITCHABLE_MODULES`, `MODULE_DEFAULT_RULE`), `common/guards/permissions.guard.ts`
  (règle « gestion de mon entité »), `modules/iam/users.service.ts` (cœur verrouillé,
  modules effectifs), `modules/flags/{flags.repository,flags.controller}.ts` ; côté web
  `lib/nav.ts` (`MODULE_KEYS`, `NAV_MODULE`, `CORE_MODULES`, `firstOpenHref`, `navLabel`
  nommé par le rôle), `lib/data/users.ts` (miroir des défauts), `app/utilisateurs/_parts/
  {RolesTab,UserForm}.tsx`, `components/shell/{Sidebar,Header}.tsx`, `app/page.tsx`,
  dictionnaires (`nav_manage_*`, `users.core_locked`, libellé du rôle `resp_unit`).
- **Révise :** l'ADR 0015 (la liste des modules et la notion de cœur), l'ADR 0016 (bascule
  par compte : le cœur y échappe).

## Contexte

La matrice « Rôles & fonctionnalités » ne proposait que 23 modules : le tableau de bord,
« Ma responsabilité », « Gestion de mon entité », l'OPSnet (qui suivait le module des
unités), la gestion des utilisateurs, la supervision des responsabilités et les paramètres
n'y figuraient pas. Le propriétaire du produit demande que **tout ce que le menu de gauche
propose figure dans la matrice, pour être activé ou désactivé**, et que **la gestion de
son unité soit donnée au commandant d'unité**.

## Décision

1. **Un module par entrée du menu**, dans l'ordre du menu. `MODULE_KEYS` passe à 30 :
   `dashboard`, `myresp`, `myrespManage` et `opsnet` s'ajoutent en modules
   basculables ; `users`, `supervision`, `settings` s'ajoutent comme **cœur**. La matrice
   du web se lit comme la barre latérale ; l'assistant, tiroir ouvert depuis l'en-tête,
   reste un module sans entrée de menu.

2. **Le cœur figure mais ne se coupe par rien.** `CORE_MODULES` (`users`, `supervision`,
   `settings`) est affiché verrouillé, dans l'état que lui donne le RBAC (réservé au
   Super Administrateur et à l'Administrateur). L'API refuse (400) toute bascule sur ces
   modules — matrice de rôle, bascule par compte et drapeau global — et `/iam/me` en sert
   l'état RBAC quoi qu'il arrive : un drapeau `settings` à faux aurait enfermé
   l'administrateur dehors. Les drapeaux globaux (`GET /flags`) ne les portent plus.

3. **Défauts qui ont un sens pour le rôle.** Un module sans fonctionnalité RBAC propre
   suit une règle plutôt que « ouvert à tous » : `myresp` et `myrespManage` vont aux cinq
   responsables d'entité (et aux administrateurs, dont les lignes disent « accès
   total ») — **le commandant d'unité a la gestion de son unité d'office** ; `opsnet` à
   qui lit les unités ou les abris ; `users` et `settings` suivent `users:view` /
   `settings:view` ; `supervision` revient au seul Super Administrateur ; le tableau de
   bord national et la simulation restent ouverts à tous.

4. **« Gestion de mon entité » est effective côté API.** Pour un responsable d'entité,
   toute écriture cantonnée à son entité (`@RequireScope` de sa nature et action autre que
   `view`) relève aussi du module `myrespManage` : la garde des permissions le vérifie
   après le module de la fonctionnalité. Couper le module retire au directeur, au
   commandant, au chef d'abri, de morgue ou de parc la main sur son entité — ses lectures
   et les autres rôles qui passent par les mêmes routes ne bougent pas. Les autres
   nouveaux modules (`dashboard`, `myresp`, `opsnet`) sont des vues du navigateur sur des
   données que le rôle lit déjà par d'autres modules : les couper masque l'écran (garde de
   route et menu), les données restent gouvernées par les modules qui les portent. Les
   routes `dashboard:view` (`/dashboard/*`, `/catalog`, `/feed`) restent du cœur : le
   catalogue et le fil servent bien d'autres écrans.

5. **Nommée par l'entité du rôle.** « Gestion de mon entité » se lit « Gestion de mon
   unité » pour le commandant d'unité, « Gestion de mon hôpital » pour le directeur,
   « … de mon abri », « … de ma morgue », « … de mon parc » — dans le menu, l'en-tête,
   la matrice et la fiche d'un compte. Le rôle `resp_unit` s'appelle désormais
   « Commandant d'unité » (identifiant inchangé).

6. **Accueil de repli.** Si l'écran d'accueil d'un rôle (tableau de bord, ou « Ma
   responsabilité » pour un responsable) lui est coupé, la racine envoie vers le premier
   écran ouvert du menu (`firstOpenHref`).

## Conséquences

- Les instantanés `iam` existants n'ont pas les sept nouvelles clés : au démarrage, la
  matrice part des défauts puis reçoit l'instantané, les nouveaux modules prennent donc
  leur défaut. Une station mise à jour voit « Gestion de mon unité » ouverte à ses
  commandants sans rien faire.
- Le contrat OpenAPI change (`ModuleFeature` : 30 valeurs) : client régénéré, `docs/03-api.md`.
- Tests : `modules/iam/sidebar-modules.spec.ts` (défauts, cœur verrouillé, gestion de mon
  entité coupée puis rouverte par le compte, lectures intactes, autres rôles intacts) ;
  web `lib/__tests__/nav.test.ts` (menu = matrice, cœur hors drapeaux, accueil de repli,
  libellés par rôle).
