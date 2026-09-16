# Sécurité — RBAC, rôles, audit, souveraineté

Référence des mécanismes de sécurité. Le principe qui gouverne tout le reste :

> **Le RBAC+ABAC est appliqué dans la couche API. Le frontend ne fait que
> *masquer* ce que l'API *refuse* déjà. Le filtrage côté client n'est pas un
> contrôle de sécurité.**

---

## 1. Chaîne d'autorisation

Trois gardes globales, dans cet ordre, sur **toutes** les routes :

```
requête ─▶ JwtAuthGuard ─▶ PermissionsGuard ─▶ ScopeGuard ─▶ contrôleur
           401 si absent   403 si permission   403 si hors
           ou invalide      manquante (RBAC)   périmètre (ABAC, §5)
```

- Le **rôle** est lu dans le jeton.
- Les **permissions sont résolues côté serveur** depuis le rôle
  (`permissionsForRole`). Une permission portée par le client est ignorée.
- `@Public()` ouvre explicitement une route. Trois seulement : `/health`,
  `/auth/login`, `/auth/dev-token`.
- `@SelfService()` marque les six routes qui n'agissent que sur la **session
  appelante** (`GET reference`, `GET iam/me`, `GET/PATCH auth/profile`,
  `POST auth/select-role`, `POST auth/change-password`) : authentification
  exigée, aucune permission de la matrice.
- Tout le reste est **refusé par défaut** — et **chaque route doit le dire** :
  `modules/iam/authz-coverage.spec.ts` parcourt tous les contrôleurs et échoue
  si une route ne porte ni `@RequirePermission`, ni `@SelfService`, ni
  `@Public`. Une garde par défaut qui laisse passer les routes muettes est un
  trou qui se rouvre à chaque ajout de route ; ce test le referme.

Source : `apps/api/src/common/guards/`, `apps/api/src/shared/permissions.ts`.

## 2. Authentification

| Mode | Activation | Mécanisme |
| --- | --- | --- |
| Production | `AUTH_MODE=keycloak` | jetons Keycloak (OIDC), validation **RS256** via JWKS distant, `issuer` + `audience` contrôlés |
| Développement | `AUTH_MODE=dev` (défaut hors production) | jetons **HS256** signés localement — aucun Keycloak requis |

Le realm Keycloak (MFA/TOTP par défaut, protection brute-force, politique de
mot de passe) est livré dans `infra/keycloak/argos-realm.json`.

**Cycle de vie d'un compte** : créé inactif avec un code temporaire → première
connexion → changement de mot de passe obligatoire → actif. Le Super
Administrateur peut forcer l'activation ou régénérer le code.

**Borne des échecs de connexion** (`POST /auth/login`, `RateWindow`) : dix
échecs par compte et par quart d'heure, trois cents par adresse ; seuls les
échecs comptent, et au-delà la réponse est `429` (« trop de tentatives »),
pas `401` — l'appelant apprend qu'il doit attendre, pas si le mot de passe
est faux. Derrière le proxy de la station toutes les requêtes portent la même
adresse : la borne par compte fait le travail, celle par adresse n'est qu'un
frein global. Verrouillé par `modules/iam/login-rate.spec.ts`.

### Mot de passe oublié

Pas de messagerie sur un réseau isolé, donc ni e-mail ni lien secret. Le
circuit est celui de la création du compte :

1. depuis l'écran de connexion, `POST /auth/password-reset-request` (route
   publique) pose la demande sur le compte — la réponse est **identique que
   le compte existe ou non** (202, `{ ok: true }`) : l'écran de connexion
   n'est pas un annuaire ;
2. les administrateurs **capables de servir la demande** reçoivent une alerte
   adressée (`kind: password_reset_requested`, cloche + flux temps réel) — un
   Administrateur n'est pas prévenu d'une demande sur un compte privilégié
   qu'il ne peut pas gérer ; le compte système n'a pas d'administrateur
   au-dessus de lui, son code se remet hors-bande ;
3. un administrateur régénère le code provisoire (`POST /iam/users/:id/reset-code`)
   et le remet par la voie hiérarchique ; l'ancien mot de passe cesse de
   valoir et le compte repasse par le premier login (mot de passe personnel).

Débit borné par compte (une demande par minute) et par adresse (vingt par
dix minutes), en mémoire (`RateWindow`) ; une demande déjà en attente ne fait
pas sonner deux fois ; le journal d'audit garde le nom demandé et si une
demande a été posée. Le drapeau s'efface quand le code est régénéré, qu'un mot
de passe est posé, ou que le compte se reconnecte de lui-même. Tests :
`iam/password-reset.spec.ts`, `iam/rate-window.spec.ts`.

## 3. Catalogue de permissions

Format **`fonctionnalité:action`**, défini dans `apps/api/src/shared/permissions.ts`.

**Actions** — `view` (V) · `create` (A) · `update` (M) · `archive` (Ar) · `delete`.

> **`delete` n'est jamais accordé par la matrice.** La fonction qui développe une
> cellule V/A/M/Ar ne l'émet pas : seul le Super Administrateur l'obtient, via
> son joker `*`. Personne d'autre ne supprime — au mieux on archive.
>
> Depuis l'ADR 0015 les entités se suppriment aussi — `DELETE units/:id`,
> `shelters/:id`, `morgues/:id`, `hospitals/:id` (`teams:delete`,
> `shelters:delete`, `morgue:delete`, `hospinet:delete`) — et la remise à zéro
> du domaine (`POST domain/purge`, `settings:delete`, signée par le mot de passe).
> Le domaine refuse (409) ce qui laisserait une opération sans ses moyens, un
> registre sans son site ou un compte sans son entité, et dit ce qui retient ;
> `?force=true` passe outre en connaissance de cause.

**21 fonctionnalités de la matrice** — `dashboard`, `dash_incident`,
`dash_hospital`, `dash_shelter`, `dash_morgue`, `dash_unit`, `map`, `incidents`,
`subincidents`, `hospinet`, `shelters`, `morgue`, `units`, `equipment`, `teams`,
`comms`, `reports`, `analytics`, `assistant`, `users`, `settings`.

**10 modules hors matrice** (`LEGACY`, dotations d'avant conservées, à
arbitrer) — `dispatch`, `triage`, `ics`, `damage`, `orsec`, `plans`,
`personnel`, `workorders`, `seismic`, `audit`.

## 4. Les 15 rôles

Les attributions sont la **transcription littérale** de
`docs/MATRICE ROLES.xlsx` : la table `MATRIX` du code
reprend le tableur ligne par ligne, et les dotations en sont **calculées**.
Faire évoluer les droits = modifier cette table, jamais des listes à la main.

| Rôle | Libellé | Dans la matrice |
| --- | --- | --- |
| `superadmin` | Super Administrateur | absent — détient tout (`*`), **seul à supprimer** |
| `admin` | Administrateur | A-M-Ar-V sur toutes les lignes |
| `strategic` | Utilisateur Stratégique | lecture ; V-M sur comms et assistant |
| `place_arme` | Place d'Armes | lecture de la situation ; V-M sur comms et assistant |
| `wali` | Wali / Gouverneur | idem Place d'Armes |
| `opcom` | OPCOM | A-M-Ar-V sur incidents, sous-incidents et rapports |
| `tacom` | TACOM | V-M incidents ; A-M-Ar-V sous-incidents |
| `bluecell` | Cellule Bleue — Opérations | A-M-V sous-incidents ; lecture ailleurs |
| `greencell` | Cellule Verte — Logistique | A-M-V Hospinet ; lecture ailleurs |
| `orangecell` | Cellule Orange — Sécurité | lecture |
| `resp_hospital` | Responsable Hôpital | A-M-V Hospinet (pas d'archivage) |
| `resp_shelter` | Responsable Abri | A-M-V Abri |
| `resp_morgue` | Responsable Morgue | A-M-V Morgue |
| `resp_unit` | Responsable Unité | A-M-V Unité |
| `resp_equipment` | Responsable Équipement | A-M-V Gestion Équipement |

Une **cellule vide du tableur = aucun droit** sur la fonctionnalité
(default-deny). Un rôle absent d'une ligne n'y a donc rien.

### Visibilité du registre des comptes

Un compte **Super Administrateur est invisible** à tout autre rôle. Le filtrage
est fait **côté serveur**, dans `UsersService` :

- `GET /iam/users` ne renvoie jamais de superadmin à un Administrateur ;
- toute opération ciblée sur un superadmin (consulter son code, l'activer, le
  modifier) répond **404 et non 403** — un 403 confirmerait son existence ;
- l'Administrateur peut **désactiver** un compte (`M` sur Utilisateurs) mais
  **jamais le supprimer** : `users:delete` n'appartient qu'au superadmin.

Tests : `modules/iam/users.spec.ts`.

### Règles d'attribution de rôles

Appliquées côté serveur ; le frontend ne fait que les refléter.

- **Super Administrateur** : peut attribuer tous les rôles, y compris
  `superadmin` et `admin`, et **plusieurs rôles** à un même compte.
- **Administrateur** : peut attribuer tous les rôles **sauf** `superadmin` et
  `admin`, et **un seul** rôle par compte.
- Tout autre rôle : ne peut attribuer aucun rôle.

Un compte multi-rôles choisit son rôle actif à la connexion et peut en changer
en session (menu utilisateur) sans se déconnecter.

### Migration des anciens rôles

Les comptes persistés avec l'ancien modèle sont migrés au démarrage :
`auditor → strategic`, `command → tacom`, `dispatcher → bluecell`,
`unit_commander → resp_unit`, `field_agent → resp_unit`.

## 5. Rattachement ABAC — le périmètre d'un responsable

Le RBAC répond à « ce rôle peut-il modifier un hôpital ? ». Il ne répond pas à
« **lequel** ? ». C'est l'objet du rattachement.

Cinq rôles sont **responsables d'une entité précise**, affectée par
l'administrateur à la création du compte :

| Rôle | Nature d'entité | Référentiel |
| --- | --- | --- |
| `resp_hospital` | hôpital militaire | 7 HM servis par l'API |
| `resp_unit` | unité | 6 unités servies par l'API |
| `resp_shelter` | abri | 6 abris servis par l'API |
| `resp_morgue` | site mortuaire | 3 sites + registre DVI |
| `resp_equipment` | parc d'équipement | parc de l'unité détentrice (`unitId`) |

Les autres rôles (superadmin, admin, TACOM, cellules) ne sont rattachés à rien :
leur accès est gouverné par le seul RBAC.

### Chaîne complète

```
requête ─▶ JwtAuthGuard ─▶ PermissionsGuard ─▶ ScopeGuard ─▶ contrôleur
           401 si absent   403 si permission   403 si l'entité
                            manquante           n'est pas la sienne
```

Une route se cantonne en ajoutant `@RequireScope` à côté de `@RequirePermission` :

```ts
@Patch("hospitals/:id")
@RequirePermission("hospinet:update")        // RBAC : a-t-il le droit ?
@RequireScope("hospital")                    // ABAC : est-ce bien le sien ?
```

### Règles appliquées côté serveur

- **Affectation obligatoire** — créer ou promouvoir un compte à un rôle `resp_*`
  sans lui affecter d'entité est refusé (`400`).
- **Pas de portée orpheline** — affecter une entité d'une nature qu'aucun rôle
  du compte ne couvre est refusé (`400`). Retirer le rôle **purge** l'affectation.
- **Default-deny** — un responsable sans affectation est refusé (`403`) : un
  compte mal configuré ne vaut jamais passe-partout.
- **Réaffectation immédiate** — la portée est relue dans le registre **à chaque
  requête**, jamais lue dans le jeton. Déplacer un responsable d'un
  établissement à un autre prend effet sans reconnexion, et le client ne peut
  revendiquer aucun périmètre.

La portée effective est visible dans `GET /api/iam/me` (champ `scope`).

### Routes cantonnées

| Route | Permission | Portée |
| --- | --- | --- |
| `PATCH /hospitals/:id` | `hospinet:update` | `hospital` |
| `POST` · `PATCH` · `DELETE /hospitals/:id/wards[/:wid]` | `hospinet:create` · `:update` · `:archive` | `hospital` |
| `PATCH /units/:id` | `units:update` | `unit` |
| `PATCH /shelters/:id` | `shelters:update` | `shelter` |
| `PATCH /morgues/:id` | `morgue:update` | `morgue` |
| `POST` · `PATCH /morgues/:id/records[/:rid]` | `morgue:create` · `:update` | `morgue` |
| `POST` · `PATCH` · `DELETE /equipment-parks/:id/items[/:eid]` | `equipment:create` · `:update` · `:archive` | `equipment` |

**Convention de route** : quand la ressource est un enfant (service de soins,
dossier DVI, article de parc), l'identifiant porté par le chemin est celui de
l'**entité affectée** — l'hôpital, le site, l'unité détentrice. Le `ScopeGuard`
peut ainsi cantonner sans avoir à charger la ressource.

La **lecture** (`GET /hospitals/:id/wards`) reste ouverte à qui peut lire le
réseau : le cantonnement porte sur l'écriture.

Implémentation : `shared/responsibilities.ts`, `common/guards/scope.guard.ts`,
`common/ports/scope-resolver.port.ts`. Tests : `modules/iam/scope.spec.ts`.

## 6. Matrice rôle → modules, drapeaux globaux

Second niveau, distinct du RBAC : quels **modules** (écrans) un rôle voit, et
quels modules sont ouverts pour tout le monde. Deux bascules, un vocabulaire
(`MODULE_KEYS`, 23 modules : `incidents`, `map`, `seismic`, `dispatch`,
`triage`, `equip`, `units`, `personnel`, `workorders`, `hospitals`, `ics`,
`damage`, `shelters`, `morgue`, `orsec`, `plans`, `comms`, `reports`,
`analytics`, `assistant`, `simulation`, `trackers`, `chemlib`) :

- la **matrice rôle → modules** (`PATCH /iam/role-features/:role`, Super
  Administrateur ; défauts dérivés de la matrice RBAC : un module est ouvert
  dès que le rôle peut visualiser l'une de ses fonctionnalités) ;
- les **drapeaux globaux** (`PATCH /flags/:key`, Super Administrateur).

Depuis l'ADR 0015 ce n'est plus un simple masquage : `FEATURE_MODULE` relie
chaque fonctionnalité RBAC à son module, et la garde des permissions refuse
(403) toute route d'un module coupé — pour le rôle (matrice) ou pour tous
(drapeau, joker compris : c'est un interrupteur, pas un droit). Le cœur —
tableau de bord, comptes, paramètres, audit, boucles opérationnelles — n'a pas
de module et ne se coupe pas : c'est par lui qu'on rallume le reste. Tout
compte authentifié lit les deux bascules (`GET /flags`, `GET
/iam/role-features`) pour masquer ce que l'API refuse déjà.

## 7. Journal d'audit chaîné

Toutes les mutations sont journalisées par un intercepteur global. Le journal
est **append-only** et **chaîné** : chaque entrée intègre l'empreinte de la
précédente, ce qui rend toute altération détectable.

- Lecture : `GET /api/audit` (`audit:log:read`)
- Vérification d'intégrité : `GET /api/audit/verify` (`audit:log:verify`)
- Consultable dans l'écran `/parametres` (Super Administrateur).

Deux routes portent un **signal**, pas un acte, et restent hors du journal
(`@SkipAudit()`, lu par `AuditInterceptor`) : « en train d'écrire »
(`POST /comms/channels/:id/typing`) et les accusés de réception/lecture
(`POST /comms/channels/:id/receipts`). Elles se répètent à chaque frappe et
n'engagent rien ; les journaliser noierait la chaîne. Elles restent gardées
(`comms:view`) et cantonnées aux conversations directes dont l'appelant est
membre — test `realtime/comms.spec.ts`.

## 8. Alertes sismiques et notification des autorités

Deux seuils distincts, configurables dans `/parametres` :

| Seuil | Portée | Effet |
| --- | --- | --- |
| National (`maMinMag`) | séisme sur le territoire | alerte rouge dans l'app (visuelle + sonore) **et SMS + e-mail aux autorités** |
| Mondial (`globalMinMag`) | reste du monde | simple notification dans l'app |

L'envoi passe par un **port** (`common/ports/notification-gateway.port.ts`) et
deux adaptateurs : la **journalisation** (rien ne part — et l'historique le
dit : `via: "log"`, `ok: false`) et le **SMTP** (`common/notifications/
smtp-notification.gateway.ts`, client minimal sans dépendance, TLS et
authentification PLAIN optionnels), choisi dès que `SMTP_HOST` est défini —
mailpit dans `infra/compose`, le relais de l'organisme en production. Chaque
notification historisée porte ses **livraisons** (destinataire, canal, voie
réelle, résultat) : `GET /api/seismic/notifications`. Les SMS restent
journalisés tant qu'aucune passerelle télécom n'est contractualisée ; son
adaptateur se branche sur le même port, sans toucher au domaine.

## 9. Souveraineté et fuite de données

Exigences du `MASTER_PLAN.md` §4.3 :

- **Aucune ressource externe au runtime** — pas de CDN, pas de police distante,
  pas d'analytics. Les polices sont auto-hébergées dans `apps/web/public/fonts`.
- **CSP stricte.** Une exception nommée (ADR 0014) : quand la station est
  construite avec `MAP_TILES=external`, `img-src` et `connect-src` admettent
  les trois hôtes du fond de carte (imagerie Esri/Maxar, plan et toponymes
  OpenFreeMap, relief AWS) — et eux seuls. Le greffon RTL des étiquettes est
  auto-hébergé (`public/vendor`), jamais pris sur un CDN ; il est en
  WebAssembly, d'où `'wasm-unsafe-eval'` dans `script-src` en production
  (compilation Wasm seulement, aucune évaluation de JS). C'est le défaut de la pile de déploiement aujourd'hui ; le
  mode `sovereign` (tuiles servies par la station) reste disponible pour un
  réseau isolé.
- Les prévisions de crue (ADR 0010) suivent la même règle : appel côté
  serveur — GloFAS via Open-Meteo sans clé, Google Flood Hub avec
  `FLOOD_API_KEY`, jamais depuis le navigateur ; le simulateur d'inondation,
  local, n'en dépend pas.
- Le service morgue (ADR 0012) : lecture du registre pour `morgue:view`
  (commandement, stratégique, autorités de région, responsable d'hôpital) ;
  toute écriture cantonnée au site du compte (`@RequireScope("morgue")`) ou
  à son établissement (`hospitals/:id/deceased`, `@RequireScope("hospital")`) ;
  la chaîne de garde porte le matricule qui acte chaque étape. Toute
  modification d'un dossier (`PATCH morgues/:id/records/:rid`) est **signée**
  par le mot de passe du compte (step-up vérifié côté API, 403 sinon) et
  **tracée** dans `history[]` (qui, quand, avant → après) — ADR 0012 (ter).
- Partage de position par l'application (ADR 0008, révision) : deux routes
  `@SelfService` (`GET tracking/trackers/mine`, `POST tracking/trackers/:id/position`)
  dont le service vérifie que le partage est celui du compte appelant — un
  compte ne dit que sa propre position, jamais celle d'un moyen.
- Les flux externes (EMSC, Open-Meteo) sont **proxifiés par l'API**, avec cache
  et dégradation gracieuse. Le navigateur ne contacte jamais une source tierce.
- **Exposition temporaire par tunnel** (ADR 0013, `deploy/scripts/tunnel.ps1`) :
  déviation assumée pour les **démonstrations seulement** — un relais tiers
  (tunnelto.dev) voit le trafic en clair et tout Internet atteint l'écran de
  connexion. Données fictives, tunnel fermé dès la fin, client épinglé par son
  empreinte. L'API borne les échecs de connexion (dix par compte et par quart
  d'heure → `429`), tunnel ou pas.
- **Aucun secret dans le dépôt.** `.env.example` sert de gabarit ; le secret de
  développement (`AUTH_DEV_SECRET`) doit être remplacé en production.
- Aucune nouvelle dépendance runtime sans [ADR](adr/README.md).

## 10. Tests de sécurité

La gate est automatisée : `npm run test:api` (**340 tests, 31 suites**, exécutés
en séquence — `jest --runInBand` — parce qu'en parallèle la suite `deployment`
expire sous la contention CPU). Les suites qui portent la sécurité :

| Suite | Ce qu'elle refuse de laisser passer |
| --- | --- |
| `iam/authz.spec.ts` | 401 sans jeton, permissions résolues depuis le rôle, 403 sur accès non autorisé, intégrité de la chaîne d'audit |
| `iam/authz-coverage.spec.ts` | **toute route sans marqueur d'accès** (`@RequirePermission` / `@SelfService` / `@Public`) |
| `iam/keycloak.spec.ts` | **le mode production** : RS256 vérifié contre un JWKS (joué par un serveur local avec une clé générée), émetteur et audience contrôlés, expiration, autre clé et HS256 refusés, rôle ARGOS résolu depuis `realm_access.roles` ; hors mode dev l'API ne fabrique aucun jeton |
| `iam/scope.spec.ts` | **cantonnement ABAC** : un responsable agit sur son entité, est refusé sur toute autre, un compte sans affectation est refusé |
| `iam/users.spec.ts` | cycle de vie des comptes, règles d'attribution des rôles |
| `domain/governance.authz.spec.ts` | qui supprime quoi : la suppression définitive n'appartient qu'au Super Administrateur |
| `domain/visibility.spec.ts` | la doctrine de visibilité (lot V-1) : wali → sa région, place d'armes → sa zone, opcom/tacom/cellules → leur incident |
| `domain/deployment.spec.ts` | le déploiement comme acte gardé (lot V-2) |
| `orders/http/orders.authz.spec.ts` · `missions/http/missions.authz.spec.ts` | 401/403 sur les routes des bons de travail et des missions, cycle de vie via HTTP |
| `realtime/comms.spec.ts` | routes du centre de communication **gardées**, participer ≠ administrer (`comms_admin`), présence = connexion, pièces jointes : liste blanche de types vérifiée sur les octets, nom d'origine jamais utilisé comme chemin |
| `tracking/tracking.spec.ts` | registre des traceurs = liste blanche de l'écouteur TCP ; un IMEI inconnu est rejeté avant tout décodage |
| `orders/architecture.spec.ts` · `missions/architecture.spec.ts` | règle de dépendance hexagonale (échoue sur import interdit) |

**Ajouter une route sensible sans `@RequirePermission` n'est plus seulement une
régression de sécurité : c'est un test rouge.**

Trois lignes de la matrice sont **provisoires, à arbitrer** avec l'état-major
(commentées comme telles dans `shared/permissions.ts`) : `aviation`,
`tracking` et `comms_admin` (administration des canaux, aujourd'hui réservée à
`admin`).
