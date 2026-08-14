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
- Tout le reste est **refusé par défaut**.

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

## 3. Catalogue de permissions

Format **`fonctionnalité:action`**, défini dans `apps/api/src/shared/permissions.ts`.

**Actions** — `view` (V) · `create` (A) · `update` (M) · `archive` (Ar) · `delete`.

> **`delete` n'est jamais accordé par la matrice.** La fonction qui développe une
> cellule V/A/M/Ar ne l'émet pas : seul le Super Administrateur l'obtient, via
> son joker `*`. Personne d'autre ne supprime — au mieux on archive.

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

## 6. Matrice rôle → fonctionnalités

Second niveau, distinct du RBAC : quels **modules** (écrans) un rôle voit.
Pilotable par le Super Administrateur, il filtre la navigation du frontend.

22 fonctionnalités : `dashboard`, `incidents`, `map`, `dispatch`, `triage`,
`equip`, `units`, `personnel`, `workorders`, `hospitals`, `ics`, `damage`,
`shelters`, `orsec`, `plans`, `comms`, `reports`, `analytics`, `assistant`.

C'est un **confort d'ergonomie, pas une barrière** : masquer un écran ne
protège rien. La protection reste l'`@RequirePermission` côté API.

## 7. Journal d'audit chaîné

Toutes les mutations sont journalisées par un intercepteur global. Le journal
est **append-only** et **chaîné** : chaque entrée intègre l'empreinte de la
précédente, ce qui rend toute altération détectable.

- Lecture : `GET /api/audit` (`audit:log:read`)
- Vérification d'intégrité : `GET /api/audit/verify` (`audit:log:verify`)
- Consultable dans l'écran `/parametres` (Super Administrateur).

## 8. Alertes sismiques et notification des autorités

Deux seuils distincts, configurables dans `/parametres` :

| Seuil | Portée | Effet |
| --- | --- | --- |
| National (`maMinMag`) | séisme sur le territoire | alerte rouge dans l'app (visuelle + sonore) **et SMS + e-mail aux autorités** |
| Mondial (`globalMinMag`) | reste du monde | simple notification dans l'app |

En développement, l'envoi SMS/e-mail est **simulé** et journalisé côté serveur.
Le point de branchement de la passerelle de production est isolé dans
`apps/api/src/modules/domain/seismic-alerts.service.ts`.

## 9. Souveraineté et fuite de données

Exigences du `MASTER_PLAN.md` §4.3 :

- **Aucune ressource externe au runtime** — pas de CDN, pas de police distante,
  pas d'analytics. Les polices sont auto-hébergées dans `apps/web/public/fonts`.
- **CSP stricte.**
- Les flux externes (EMSC, Open-Meteo) sont **proxifiés par l'API**, avec cache
  et dégradation gracieuse. Le navigateur ne contacte jamais une source tierce.
- **Aucun secret dans le dépôt.** `.env.example` sert de gabarit ; le secret de
  développement (`AUTH_DEV_SECRET`) doit être remplacé en production.
- Aucune nouvelle dépendance runtime sans [ADR](adr/README.md).

## 10. Tests de sécurité

La gate default-deny est automatisée (`npm test`, 82 tests) :

- `modules/iam/authz.spec.ts` — 401 sans jeton, résolution des permissions
  depuis le rôle, 403 sur accès non autorisé, intégrité de la chaîne d'audit ;
- `modules/iam/users.spec.ts` — cycle de vie des comptes, règles d'attribution ;
- `modules/orders/http/orders.authz.spec.ts` — 401/403 sur les routes de bons
  de travail, cycle de vie complet via HTTP ;
- `modules/iam/scope.spec.ts` — **cantonnement ABAC** : un responsable agit sur
  son entité, est refusé sur toute autre, et un compte sans affectation est
  refusé.

**Ajouter une route sensible sans `@RequirePermission` est une régression de
sécurité** : la route devient accessible à tout utilisateur authentifié.
