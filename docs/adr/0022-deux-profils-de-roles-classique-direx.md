# ADR 0022 — Deux profils de rôles dans une même application : « classique » (l'organisation actuelle) et « direx » (DIREX / PC FAR / PCF / PCT / PCO)

- **Statut :** accepté — lots 1 et 2 livrés (socle, profil `direx`, mode de l'application, fonctionnalités
  commutables par rôle, comptes par profil) ; la grille reste telle quelle jusqu'à décision
- **Date :** 2026-09-19 (révisée le même jour : un seul port, une seule base, deux profils ; PCF ajouté ; le
  mode est un réglage de station changé par le Super Administrateur seul)
- **Branche :** `fusion-V2` (ouverte depuis `fusion`, qui reste la version livrée)
- **Portée envisagée :** `apps/api/src/shared/permissions.ts` (catalogue des rôles, matrice, rôles
  dérivés), `shared/responsibilities.ts`, `modules/domain/{assignment,mode,post,resources,edit}.rules.ts`,
  `visibility.service.ts`, `iam/{dto,users.service,iam.service}.ts`, `realtime/notices.service.ts`,
  `domain.service.ts` (comptes et graines de démonstration) ; côté web `lib/roles.ts`, `lib/nav.ts`,
  `lib/mode.ts`, `lib/edit.ts`, `lib/posts.ts`, `lib/data/users.ts`, `app/utilisateurs/*`,
  `app/parametres/*` ; `docs/` (tableau des rôles, guides, matrices).
- **Révise :** le MASTER_PLAN §rôles et l'ADR 0016 (chaîne de commandement) — sans les abroger :
  l'organisation actuelle reste livrée telle quelle, sous le profil `classique`.

## Contexte

Le propriétaire du produit veut **rebâtir les rôles** de l'application autour d'une organisation de
poste de commandement par fonctions, **sans perdre l'organisation actuelle** : la même application,
sur le même port et les mêmes données, connaît deux **profils de rôles** — `classique` donne accès à
la version actuelle, `direx` aux nouveaux rôles — et n'en sert qu'un à la fois : le **mode de
l'application**, réglé par le Super Administrateur.

| Échelon (profil `direx`) | Fonctions |
| --- | --- |
| **DIREX** (direction de l'exercice) | Chef / Direx · Eval / Direx · Anim / Direx · RLS / Direx (renseignement, logistique et sécurité) |
| **PC FAR** (poste de commandement FAR — unités des FAR) | Chef / PcFAR · LOG / PcFAR · Planif & Rens / PcFAR · OPS / PcFAR · SYNTH / PcFAR |
| **PCF** (mêmes cellules que le PC FAR — intervenants DGSN, DGPC, FA, gendarmerie) | Chef / PCF · LOG / PCF · Planif & Rens / PCF · OPS / PCF · SYNTH / PCF |
| **PCT** (PC tactique) | Chef / PCT · Ops / PCT · LOG / PCT · Rens / PCT |
| **PCO** (PC opérationnel) | Chef PCO · Ops / PCO · LOG / PCO · Rens & Com / PCO |
| **Entités** (catégorie à part, hors PC) | Commandant d'unité · Directeur d'hôpital · Chef d'abri · Directeur de morgue |

Arbitrages du 19 septembre 2026 : la DIREX et le PCT ont un chef ; RLS = renseignement, logistique
et sécurité ; les chefs d'entité restent une catégorie à part (le responsable de parc d'équipement
n'est pas repris, la logistique des PC en hérite) ; l'incident est déclaré par le Chef et l'Anim de
la DIREX ; le PC FAR affecte les unités des FAR, le PCF celles des autres intervenants ; les
sous-incidents (déclarer, modifier, supprimer) sont une fonctionnalité à part ; les deux profils
vivent dans **une seule instance** (même port, mêmes données, mêmes modes) et le jeu de
démonstration sert les deux ; **seul le Super Administrateur change le mode** ; sous un mode, les
comptes de l'autre profil ne se connectent pas et reçoivent « Le Mode X est activé sur cette station
— contactez l'administrateur ».

Ce que le code sait des rôles aujourd'hui :

- un catalogue fermé (`ROLES`, 20 entrées, type `Role` = union littérale) repris à l'identique côté
  web (`lib/roles.ts`) ;
- une matrice de **43 fonctionnalités × 20 rôles** (`permissions.ts`, tables `MATRIX` et `LEGACY`)
  avec des rôles **dérivés** (`DERIVED_ROLES` : un rôle hérite ligne par ligne d'un rôle de
  référence, avec exceptions) — c'est déjà un embryon de « profil » ; les **sous-incidents y sont
  déjà une ligne à part** (`subincidents` : A = déclarer, M = modifier, R = retirer, V = voir),
  distincte de `incidents` ;
- une matrice **rôle → modules** (le menu, 34 entrées, ADR 0017) dérivée de la précédente et
  commutable par rôle et par compte ; les sous-incidents n'y ont pas d'entrée propre ;
- des règles métier qui **testent des noms de rôles** : qui affecte quel corps d'unité
  (`assignment.rules.ts`), qui crée/modifie des unités selon le mode (`mode.rules.ts`), qui tient
  quelles ressources (`resources.rules.ts`), qui pose quels postes et quelles ressources sur la carte
  (`post.rules.ts`, `edit.rules.ts`), qui voit quoi (`visibility.service.ts`), qui répond de quelle
  entité (`responsibilities.ts`), qui est prévenu à la déclaration (`notices.service.ts`) ;
  ~430 occurrences dans 12 fichiers hors tests, 30 suites de tests ; côté web ~220 occurrences dans
  16 fichiers (navigation, mode, édition, postes, sélecteur de rôle, matrice) ;
- un précédent de migration de noms de rôles (`LEGACY_ROLE_MAP` : `auditor → strategic`,
  `command → tacom`…) appliqué aux comptes persistés au démarrage.

## Options étudiées

**A. Bifurcation** — une branche où les nouveaux rôles remplacent les anciens. Deux bases de code
qui divergent au premier correctif, deux paquets à maintenir : écarté.

**B. Remplacement** — les nouveaux rôles remplacent les anciens avec une table de reprise des
comptes : la version actuelle disparaît, contraire à la demande.

**C. Deux profils dans une seule application, un mode en service (retenu)** — le catalogue des
rôles devient une **donnée versionnée** ; l'application en connaît deux : `classique` (les 20 rôles
d'aujourd'hui, comportement inchangé) et `direx` (26 rôles : 4 DIREX, 5 PC FAR, 5 PCF, 4 PCT, 4 PCO,
4 chefs d'entité). Même port, même base, mêmes modes de la station (démo / exercice / opérationnel).
Chaque **rôle** appartient à un profil ; chaque **compte** porte des rôles d'un seul profil. Le
**mode de l'application** (`classique` ou `direx`) est un réglage de la station, comme le mode
démo / exercice / opérationnel : le Super Administrateur seul le change, signé de son mot de passe ;
sous un mode, l'autre profil n'est pas servi. Les règles ne testent plus des noms de rôles mais des
**traits** portés par chaque rôle. Le développement se fait sur la branche `fusion-V2` ; `fusion`
reste la version livrée tant que la V2 n'est pas prête.

Pourquoi pas une seconde instance sur un autre port : elle aurait dupliqué base, comptes, volumes,
sauvegardes et procédures d'installation pour séparer ce qui n'a pas besoin de l'être — les deux
organisations travaillent les mêmes incidents, unités et ressources.

## Décision proposée

### 1. Un profil = des rôles, une matrice, des capacités

```ts
// shared/doctrine.ts — le vocabulaire commun aux deux profils
interface RoleDef {
  id: RoleId;                       // "pcfar_ops"
  profile: "classique" | "direx";
  label: string;                    // "OPS / PC FAR"   (+ EN, AR dans les dictionnaires web)
  echelon: "admin" | "direx" | "pcfar" | "pcf" | "pct" | "pco" | "authority" | "entity" | "opcom" | "tacom" | "cell";
  fonction: "chef" | "ops" | "log" | "rens" | "planif_rens" | "synth" | "eval" | "anim" | "rls" | "rens_com" | "member" | "responsible";
  scope: "global" | "region" | "operation" | "entity";   // la portée ABAC (ROLE_SCOPE_KEY)
  responsibility?: ResponsibilityKind;                   // hôpital, unité, abri, morgue
  like?: RoleId;                                         // héritage de matrice (mécanique DERIVED_ROLES)
  capabilities: Capability[];                            // ce que le CODE teste (voir 2)
}
interface Profile {
  id: "classique" | "direx";
  label: string;
  roles: RoleDef[];
  matrix: Record<Feature, Partial<Record<RoleId, Cell>>>;   // défauts de la matrice rôle → fonctionnalités
  postKinds: PostKind[];                                   // ce que ce profil pose sur la carte
  fixtures: DemoAccount[];                                 // ses comptes de démonstration
}
```

Les deux profils sont chargés ensemble : `ROLES` est l'union des deux catalogues, `ROLE_LABELS`,
`ROLE_PERMISSIONS`, les défauts de modules et les DTO (`IsIn`) en découlent ; la matrice
« Rôles & fonctionnalités » de l'administration montre un onglet par profil. `superadmin` et
`admin` sont hors profil (techniques). Le profil `classique` est **extrait tel quel** du code
actuel : mêmes identifiants, même matrice, mêmes dérivations — c'est la preuve que la version
actuelle est gardée, et les 56 suites existantes tournent dessus sans changement.

### 2. Les règles testent des capacités, plus des noms

Chaque endroit qui écrit `role === "opcom"` ou `["bluecell", "greencell"].includes(role)` est
remplacé par une capacité que le profil attribue à ses rôles. Inventaire des capacités nécessaires
(tirées des règles existantes, rien d'inventé) :

| Capacité | Aujourd'hui portée par | Règle d'origine |
| --- | --- | --- |
| `supervise_all` | superadmin, admin, strategic | `visibility.service.ts` |
| `conduct_incident` (déclarer, archiver, clôturer) | opcom, tacom | matrice `incidents` |
| `conduct_subincidents` (déclarer, modifier, retirer) | opcom, tacom, bluecell | matrice `subincidents` |
| `assign_units(corps[])` | opcom `*`, wali/interieur civils, gendarmerie, etat_major/place_arme FAR | `assignment.rules.ts` |
| `deploy_units` | tacom, pco, pct | `canDeploy` |
| `create_units(mode)` | admin, opcom, cellules hors opérationnel ; superadmin toujours | `mode.rules.ts` |
| `manage_resources(mode, corps?)` | chefs d'entité (la leur), cellules selon mode et corps | `resources.rules.ts` |
| `place_posts(kinds[])` | strategic → opcom ; opcom → tacom/pco/pct/cellules | `post.rules.ts`, `edit.rules.ts` |
| `place_resources` | tacom, pco, pct, cellules | `edit.rules.ts` |
| `region_scope`, `operation_scope`, `entity_scope` | wali/place_arme ; conduite déployée ; chefs d'entité | `ROLE_SCOPE_KEY`, `responsibilities.ts` |
| `notified_on_declaration` | wali, place_arme, chefs d'entité de la région | `notices.service.ts` |
| `simulate` (crues, feu, NRBC) | `SIM_ROLES` | `MODULE_DEFAULT_RULE` |
| `comms_admin` | superadmin, admin | matrice `comms_admin` |

Sous `direx` : `assign_units(["far"])` pour Chef et OPS du PC FAR, `assign_units(["dgsn","dgpc",
"fa","gendarmerie"])` pour Chef et OPS du PCF ; `deploy_units` pour les chefs et cellules Ops des
PCT et PCO ; `place_posts(["pcfar","pcf"])` pour le Chef Direx, `place_posts(["pct","pco"])` pour
les chefs de PC FAR et PCF ; `conduct_incident` pour Chef et Anim de la DIREX.

Le web ne garde aucun nom de rôle : `/iam/me` sert `profile`, `echelon`, `fonction`,
`capabilities`, et `GET /iam/profiles` sert les deux catalogues (rôles, libellés, échelons, icônes)
pour le sélecteur en tuiles, la matrice et les formulaires. `lib/roles.ts`, `lib/mode.ts`,
`lib/edit.ts`, `lib/posts.ts` testent des capacités.

### 3. Le profil `direx` — la grille de départ

Vingt-six rôles, plus les deux rôles techniques. **La grille de départ** (43 fonctionnalités × 28
colonnes, codes V / VM / AMV / ALL de la matrice actuelle) est dans `docs/matrice-roles-direx.xlsx`
(feuilles « Matrice direx », « Rôles » — avec le rôle actuel de départ et les corps que chaque poste
affecte —, « Légende ») et `docs/matrice-roles-direx.csv`. Elle est produite par un script qui part,
pour chaque poste, du rôle actuel le plus proche (cellules effectives, rôles dérivés compris) puis
applique ses écarts ; la version corrigée deviendra la matrice du profil. Le **PCF** a exactement les
cellules du PC FAR : la différence est la règle d'affectation (corps), pas la matrice.

| Rôle | Échelon / fonction | Portée | Capacités proposées (grille : rôle de départ → écarts) |
| --- | --- | --- | --- |
| Chef / Direx | DIREX · chef | globale | dirige l'exercice : **déclare** et archive les incidents, sous-incidents, bilans ; pose PC FAR et PCF sur la carte ; canaux du centre ; simulations, NRBC, suivi aérien ; lit le journal d'audit ; n'affecte ni ne déploie (départ `opcom` → conduite gardée, affectation/déploiement retirés, audit ajouté) |
| Eval / Direx | DIREX · évaluation | globale | lit tout (incidents, carte, ressources, comms, journal d'audit, analyses) ; rédige les rapports d'évaluation ; n'écrit rien d'autre (lecture seule partout → `reports: AMV`, `audit: V`) |
| Anim / Direx | DIREX · animation | globale | joue le scénario : **déclare** et modifie incidents, sous-incidents, victimes, dégâts ; anime hôpitaux, abris, morgues ; crée unités, équipes, équipements, ressources ; NRBC, panache, aviation, traceurs ; place sur la carte ; n'affecte pas d'unités (c'est le jeu des PC) (départ `opcom` → écritures d'animation ajoutées, affectation retirée) |
| RLS / Direx | DIREX · renseignement, logistique, sécurité | globale | anime le renseignement (NRBC, panache, aviation, traceurs), la logistique (équipement, bons de travail, personnel, ressources, abris, répartiteur) et la sécurité (journal d'audit, canaux du centre) ; rapports (lecture seule partout → ces écritures) |
| Chef / PcFAR · Chef / PCF | PC FAR, PCF · chef | opération | conduite : engage l'incident, **affecte** ses unités (FAR pour le PC FAR ; DGSN, DGPC, FA, gendarmerie pour le PCF) et **déploie**, ordonne les missions, valide les sitrep, pose PCT et PCO sur la carte (départ `opcom` → `deploy: AMV`) |
| OPS / PcFAR · OPS / PCF | PC FAR, PCF · opérations | opération | affecte (mêmes corps que son chef) et déploie, missions, répartition, ICS, édition carte (postes) ; modifie l'incident sans l'archiver (départ `opcom` → sans archivage, `deploy: AMV`, `ics: AMV`) |
| LOG / PcFAR · LOG / PCF | PC FAR, PCF · logistique | opération | équipement, bons de travail, personnel, ressources, abris, moyens hospitaliers, répartiteur, missions logistiques (départ cellule verte, portée PC) |
| Planif & Rens / PcFAR · / PCF | PC FAR, PCF · planification & renseignement | opération | plans et ORSEC (tout), NRBC, panache, aviation, traceurs, dommages, ICS, sous-incidents ; lit le reste (lecture seule partout → ces écritures) |
| SYNTH / PcFAR · SYNTH / PCF | PC FAR, PCF · synthèse | opération | rapports et sitrep (tout), tableau de bord, analyses, centre de communication ; lit le reste |
| Chef / PCT · Chef / PCO | PCT, PCO · chef | opération | la dotation actuelle des chefs de PC (départ `pct`, `pco` — dérivés du TACOM) : reçoit et déploie les unités, missions, répartiteur, pose ses cellules et ses moyens |
| Ops / PCT · Ops / PCO | cellules · opérations | opération | départ cellule bleue : sous-incidents, bilans, unités, équipes, ressources, triage, ICS, terrain ; + déploiement et missions |
| LOG / PCT · LOG / PCO | cellules · logistique | opération | départ cellule verte : + équipement, bons de travail, répartiteur, déploiement (le parc d'équipement passe aux LOG) |
| Rens / PCT · Rens & Com / PCO | cellules · renseignement (& communication) | opération | départ cellule orange : + dommages, traceurs, NRBC, rapports, déploiement ; Rens & Com administre en plus les canaux du centre |
| Commandant d'unité · Directeur d'hôpital · Chef d'abri · Directeur de morgue | Entités · responsable | entité | inchangés : leur entité, ses ressources, ses bilans (ADR 0016, 0017) |

Choix conservateurs dans la grille : la gestion des comptes et les réglages restent à
l'administration seule (comme aujourd'hui) ; l'administration des canaux du centre (aujourd'hui
l'administration seule) s'ouvre au Chef Direx, à RLS et à Rens & Com.

Sur la carte, les postes du profil `direx` sont **PC FAR, PCF, PCT, PCO** (les cellules sont dans
les PC, pas des postes à part) ; la DIREX ne se pose pas ; `pct` et `pco` sont les postes déjà
connus, partagés avec le profil `classique`. Les modes de la station restent orthogonaux : la DIREX
n'a de sens qu'en exercice et démonstration ; en opérationnel seuls Eval (lecture) et les PC servent.

### 4. Les 43 fonctionnalités de l'API, commutables par rôle — dont les sous-incidents

Au-delà des modules du menu (ADR 0017), chaque **fonctionnalité de la matrice RBAC** (43 lignes,
dont `subincidents` — « Sous-incidents : ajouter, modifier, supprimer », distincte d'`incidents`)
s'ouvre ou se coupe par rôle depuis « Rôles & fonctionnalités » : `DEFAULT_ROLE_GRANTS` (ouverte au
rôle qui en détient au moins une action), `GET/PATCH iam/role-grants[/:role]`, `POST …/reset`
(Super Administrateur), persistées dans l'instantané IAM. Coupée, une fonctionnalité retire au rôle
**toutes** ses actions (`PermissionsGuard` → 403 « Fonctionnalité coupée pour le rôle … ») et
disparaît des permissions servies par `/iam/me` — le navigateur masque d'après elles (`can()`). La
matrice RBAC elle-même ne bouge pas ; le cœur (`users`, `settings`, `audit`) et les administrateurs
restent verrouillés.

### 5. Une instance, deux profils, un mode en service, les mêmes données

- Le **mode de l'application** (`ProfileService`, réglage `profile` de `settings.json`, défaut
  `classique`) se change par `PATCH domain/profile` — Super Administrateur seul, mot de passe exigé,
  sans redémarrage. La sonde publique `/health` l'annonce (`roleProfile`), `/iam/me` et
  `GET /iam/profiles` (`active`) aussi ; l'écran de connexion l'affiche (« Mode en service »), l'en-tête
  le rappelle, les Paramètres le basculent.
- **Sous un mode, l'autre profil n'existe pas** — pour tout le monde : la connexion d'un compte de
  l'autre profil est refusée (403 « Le Mode X est activé sur cette station — contactez
  l'administrateur ») ; une session déjà ouverte tombe à sa requête suivante (401, la garde JWT compare
  le rôle au mode en service) ; la **gestion des utilisateurs** ne liste que les comptes du mode
  (onglet « Utilisateurs classique » ou « Utilisateurs Direx »), leurs fiches seulement (404 pour
  les autres), leurs rôles seulement (400 sinon), leur matrice seulement ; le **centre de
  communication** (annuaire, correspondants, comptes déployables, autorités prévenues) ne connaît
  que les comptes du mode. Tout passe par un seul point de l'API (`UsersService.fitsMode`). Les
  comptes communs (administration, chefs d'entité) existent dans les deux modes.
- Un compte porte des rôles d'un seul profil ; `/iam/me` dit le mode en service.
- **Les unités portent le mode** où elles ont été créées (`Unit.profile`, posé par `POST units`) et ne
  se montrent que sous lui : liste des unités (carte, répartition, affectation, OPSnet), détenteurs du
  registre, terrain et boîte à outils du mode édition (`unitFitsMode`, un seul point par écran). Les
  unités d'avant (sans mode) et les graines se voient des deux côtés ; hôpitaux, abris et morgues sont
  communs.
- **L'entité d'un responsable est optionnelle** à la création du compte (commandant d'unité,
  directeur d'hôpital, chef d'abri, directeur de morgue) : elle s'affecte plus tard ; sans elle, le
  compte ne voit rien (default-deny). La région d'une autorité reste exigée.
- Les **graines de démonstration** (mode démo, ADR 0015) reçoivent des comptes du profil `direx`
  (Chef Direx, Anim, Eval, RLS, chefs et cellules de PC FAR, PCF, PCT, PCO) à côté des comptes
  actuels, déployés sur les mêmes opérations : le jeu se joue sous l'un ou l'autre profil, ou les
  deux à la fois. Exercice et opérationnel : station vide, comme aujourd'hui.
- Portées : la conduite `direx` est déployée sur une opération (`operation_scope`) comme la conduite
  `classique` ; la DIREX est globale.
- Notifications à la déclaration : sous `direx`, les chefs de PC FAR et PCF déployés et les chefs
  d'entité de la région.
- Reprise éventuelle des comptes `classique` vers `direx` (à la main, compte par compte) : table de
  correspondance proposée — `strategic → direx_eval` · `opcom → pcfar_chef` · `etat_major →
  pcfar_ops` · `interieur, wali → pcf_chef / pcf_ops` · `gendarmerie → pcf_ops` · `tacom, pco →
  pco_chef` · `pct → pct_chef` · `bluecell → pco_ops` · `greencell → pco_log` · `orangecell →
  pco_rens_com` · `resp_unit/hospital/shelter/morgue` inchangés · `place_arme, resp_equipment` sans
  équivalent.

### 6. Le filet : la version actuelle reste livrable

Avant le premier lot : étiquette git `v1-roles-classiques` sur `1ee4239`, paquet
`iris-station-20260918-1ee4239.zip` conservé, `fusion` inchangée jusqu'à la fusion de `fusion-V2`.

## Lots (branche `fusion-V2`)

1. **Socle (livré)** — `shared/profiles.ts` (catalogue des deux profils, `ROLE_TRAITS`), profil
   `classique` extrait à l'identique, règles (`assignment`, `mode`, `resources`, `edit`, `post`),
   visibilité et rattachements réécrits sur les traits ; profil `direx` (26 rôles, libellés FR/EN/AR,
   matrice générée depuis la grille — `scripts/direx-matrix.mjs` → `shared/direx.matrix.ts`), postes
   de carte `pcfar` et `pcf`, douze comptes de démonstration ; mode de l'application (`ProfileService`,
   `PATCH domain/profile`, `/health.roleProfile`, `GET /iam/profiles`) ; web : mode annoncé à la
   connexion, bascule dans les Paramètres, badge d'en-tête, sélecteur et matrice sur le profil en
   service, écritures gardées par la permission servie (`can()`), miroirs des traits. Les gates
   existantes passent inchangées (profil classique) ; suites ajoutées : `shared/profiles.spec.ts`,
   `iam/login-mode.spec.ts`.
2. **Fonctionnalités et comptes (livré)** — les 43 fonctionnalités de l'API commutables par rôle
   (§ 4) ; sous un mode, la gestion des utilisateurs et le centre de communication ne connaissent
   que les comptes du mode ; les unités créées sous un mode ne se montrent que sous lui ; l'entité
   d'un responsable est optionnelle ; la grille `docs/matrice-roles-direx.xlsx` reste telle quelle
   (décision du propriétaire), le script la reporte quand elle changera.
3. **Web** — annuaire et canaux du centre de communication groupés par échelon ; comptes de
   démonstration déployés sur les opérations du jeu.
4. **Livraison** — tableau des rôles par profil dans `README.md`, guides, paquet ; fusion de
   `fusion-V2` dans `fusion` quand les deux profils sont vérifiés.

## Conséquences

- Le type `Role` cesse d'être une union fermée : les `Record<Role, …>` exhaustifs deviennent des
  tables partielles lues dans les profils ; les tests d'exhaustivité (« chaque rôle a un libellé, une
  colonne, une icône ») se déplacent vers un test par profil.
- Le realm Keycloak (`infra/keycloak/argos-realm.json`) porte encore les noms d'avant 0016 ; il
  sera généré depuis les profils le jour de l'OIDC.
- `MATRICE ROLES.xlsx` : une feuille par profil ; `docs/matrice-roles-direx.xlsx` est la grille de
  départ du second.
- Les ADR 0016 à 0021 restent vrais sous `classique` ; sous `direx` leurs règles s'expriment en
  capacités (le tableau du §3 le dit rôle par rôle).

## Questions restantes

1. La grille : corrections cellule par cellule (les cases les moins sûres sont celles de la DIREX —
   Chef, Anim et RLS).
2. Le sigle **PCF** : son libellé long (« PC des forces… » ?) pour les écrans et la carte.
3. Une opération peut-elle être conduite **à la fois** par un OPCOM (`classique`) et un PC FAR
   (`direx`) ? La proposition le permet (capacités) ; si c'est à proscrire, une garde « un seul profil
   par opération » s'ajoute au lot 2.
