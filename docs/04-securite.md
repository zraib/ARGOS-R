# Sécurité — RBAC, rôles, audit, souveraineté

Référence des mécanismes de sécurité. Le principe qui gouverne tout le reste :

> **Le RBAC+ABAC est appliqué dans la couche API. Le frontend ne fait que
> *masquer* ce que l'API *refuse* déjà. Le filtrage côté client n'est pas un
> contrôle de sécurité.**

---

## 1. Chaîne d'autorisation

Deux gardes globales, dans cet ordre, sur **toutes** les routes :

```
requête ──▶ JwtAuthGuard ──▶ PermissionsGuard ──▶ contrôleur
            (401 si absent    (403 si permission
             ou invalide)      manquante)
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

Format `module:action:qualifier`. Défini dans `apps/api/src/shared/permissions.ts`.

**Administration / gouvernance**
`iam:users:read` · `iam:users:create` · `iam:users:update` · `iam:users:delete` ·
`iam:users:activate` · `iam:roles:read` · `iam:roles:create` · `iam:roles:assign` ·
`iam:roles:features` · `iam:permissions:read` · `admin:feature_flags:read` ·
`admin:feature_flags:toggle` · `admin:settings:read` · `admin:settings:update` ·
`audit:log:read` · `audit:log:verify`

**Structure organisationnelle**
`org:zones:read` · `org:zones:manage` · `org:units:read` · `org:units:manage` ·
`org:hospitals:read` · `org:hospitals:manage`

**Opérations**
`incidents:read` · `incidents:create` · `incidents:update` ·
`map:tracking:view_all` · `dispatch:assign` · `hospinet:beds:update`

**Bons de travail**
`workorders:read` · `workorders:create` · `workorders:update` · `workorders:assign`

## 4. Les 12 rôles

| Rôle | Libellé | Portée |
| --- | --- | --- |
| `superadmin` | Super Administrateur | toutes les permissions (`*`) |
| `admin` | Administrateur | IAM, flags, paramètres, organisation, lecture incidents et bons |
| `strategic` | Utilisateur Stratégique | lecture large + audit |
| `tacom` | TACOM | incidents (CRUD), dispatching, organisation en lecture |
| `bluecell` | Cellule Bleue — Opérations | incidents (CRUD), dispatching |
| `greencell` | Cellule Verte — Logistique | unités, incidents, **pilotage des bons de travail** |
| `orangecell` | Cellule Orange — Sécurité | zones, incidents, carte |
| `resp_hospital` | Responsable Hôpital | hôpitaux (gestion), lits, incidents |
| `resp_shelter` | Responsable Abri | zones, incidents |
| `resp_morgue` | Responsable Morgue | incidents |
| `resp_unit` | Responsable Unité | unités (gestion), incidents |
| `resp_equipment` | Responsable Équipement | unités, incidents, **bons de travail** |

> **Dotations provisoires.** Hors `superadmin` et `admin`, les attributions
> par rôle sont marquées PROVISOIRES dans le code. L'attribution définitive
> viendra de la matrice `docs/matrice-roles-fonctionnalites.xlsx`
> (12 rôles × 22 fonctionnalités, cellules OUI/NON), à remplir puis à reporter
> dans `ROLE_PERMISSIONS` et dans l'onglet « Rôles & fonctionnalités ».

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

## 5. Matrice rôle → fonctionnalités

Second niveau, distinct du RBAC : quels **modules** (écrans) un rôle voit.
Pilotable par le Super Administrateur, il filtre la navigation du frontend.

22 fonctionnalités : `dashboard`, `incidents`, `map`, `dispatch`, `triage`,
`equip`, `units`, `personnel`, `workorders`, `hospitals`, `ics`, `damage`,
`shelters`, `orsec`, `plans`, `comms`, `reports`, `analytics`, `assistant`.

C'est un **confort d'ergonomie, pas une barrière** : masquer un écran ne
protège rien. La protection reste l'`@RequirePermission` côté API.

## 6. Journal d'audit chaîné

Toutes les mutations sont journalisées par un intercepteur global. Le journal
est **append-only** et **chaîné** : chaque entrée intègre l'empreinte de la
précédente, ce qui rend toute altération détectable.

- Lecture : `GET /api/audit` (`audit:log:read`)
- Vérification d'intégrité : `GET /api/audit/verify` (`audit:log:verify`)
- Consultable dans l'écran `/parametres` (Super Administrateur).

## 7. Alertes sismiques et notification des autorités

Deux seuils distincts, configurables dans `/parametres` :

| Seuil | Portée | Effet |
| --- | --- | --- |
| National (`maMinMag`) | séisme sur le territoire | alerte rouge dans l'app (visuelle + sonore) **et SMS + e-mail aux autorités** |
| Mondial (`globalMinMag`) | reste du monde | simple notification dans l'app |

En développement, l'envoi SMS/e-mail est **simulé** et journalisé côté serveur.
Le point de branchement de la passerelle de production est isolé dans
`apps/api/src/modules/domain/seismic-alerts.service.ts`.

## 8. Souveraineté et fuite de données

Exigences du `MASTER_PLAN.md` §4.3 :

- **Aucune ressource externe au runtime** — pas de CDN, pas de police distante,
  pas d'analytics. Les polices sont auto-hébergées dans `apps/web/public/fonts`.
- **CSP stricte.**
- Les flux externes (EMSC, Open-Meteo) sont **proxifiés par l'API**, avec cache
  et dégradation gracieuse. Le navigateur ne contacte jamais une source tierce.
- **Aucun secret dans le dépôt.** `.env.example` sert de gabarit ; le secret de
  développement (`AUTH_DEV_SECRET`) doit être remplacé en production.
- Aucune nouvelle dépendance runtime sans [ADR](adr/README.md).

## 9. Tests de sécurité

La gate default-deny est automatisée (`npm test`, 50 tests) :

- `modules/iam/authz.spec.ts` — 401 sans jeton, résolution des permissions
  depuis le rôle, 403 sur accès non autorisé, intégrité de la chaîne d'audit ;
- `modules/iam/users.spec.ts` — cycle de vie des comptes, règles d'attribution ;
- `modules/orders/http/orders.authz.spec.ts` — 401/403 sur les nouvelles routes,
  cycle de vie complet via HTTP.

**Ajouter une route sensible sans `@RequirePermission` est une régression de
sécurité** : la route devient accessible à tout utilisateur authentifié.
