# ARGOS — API (`apps/api`)

Monolithe modulaire **NestJS** (TypeScript strict). Frontière de modules
stricte : chaque module est un dossier isolé, prêt à être extrait en service
(`MASTER_PLAN.md` §4.1).

Port **3005**, préfixe **`/api`**, documentation Swagger sur **`/api/docs`**.

> Documentation transverse : [référence des endpoints](../../docs/03-api.md) ·
> [sécurité et RBAC](../../docs/04-securite.md) ·
> [architecture](../../docs/01-architecture.md) ·
> [processus SOLID / hexagonal](../../docs/02-solid-hexagonal.md).

---

## Démarrage

Depuis la racine du dépôt, `npm run dev` lance l'API et le web ensemble.
Pour l'API seule :

```bash
npm install
npm run dev          # http://localhost:3005/api
npm run build && npm start
npm run typecheck
npm test             # 79 tests, dont la gate de sécurité default-deny
npm run openapi      # génère openapi.json (client frontend)
npm run db:generate  # SQL des migrations depuis src/db/schema.ts
npm run db:migrate   # applique les migrations (nécessite PostgreSQL)
```

Sans Docker, l'API tourne en **mode développement** : dépôts in-memory, jetons
HS256 locaux. Ni PostgreSQL ni Keycloak requis.

## Modules

| Module | Responsabilité | Style |
| --- | --- | --- |
| `health` | sonde publique | — |
| `iam` | authentification, utilisateurs, rôles, matrice rôle→fonctionnalités | service classique |
| `flags` | feature flags par module | interface de dépôt + 2 adaptateurs |
| `audit` | journal append-only chaîné + vérification | interface de dépôt + 2 adaptateurs |
| `domain` | incidents, unités, hôpitaux, fil, dispatching, comms, catalogue, sismologie, météo | service classique |
| `orders` | bons de travail | **hexagonal** — [README](src/modules/orders/README.md) |

`orders` est le **modèle de référence** pour les nouveaux modules : domaine sans
dépendance, ports possédés par le métier, adaptateurs interchangeables, règle de
dépendance vérifiée par un test. Voir
[ADR 0003](../../docs/adr/0003-module-orders-architecture-hexagonale.md) et le
[playbook](../../docs/02-solid-hexagonal.md#4-playbook-pour-le-prochain-module).

## Persistance (`DB_DRIVER`)

- `memory` (défaut) — dépôts in-memory, aucune base. Un **instantané JSON**
  (`.dev-data/`, git-ignoré) fait survivre l'état aux redémarrages.
  Désactivable par `DEV_PERSIST=off`, ignoré en production et en test.
  Réinitialisation : `rm -rf .dev-data`.
- `postgres` — dépôts **Drizzle/PostgreSQL** (`src/db/schema.ts`,
  `src/db/database.module.ts`). Prérequis : `npm run db:generate` puis
  `DATABASE_URL=… npm run db:migrate`.

Les modules persistants exposent une interface de dépôt et deux implémentations
sélectionnées par `DB_DRIVER` — **les services ne connaissent que l'interface**.

Les référentiels embarqués portent une **version de seed** : l'incrémenter fait
ignorer l'instantané antérieur pour ces collections uniquement, sans perdre les
données créées.

## Authentification

| Mode | Mécanisme |
| --- | --- |
| `AUTH_MODE=keycloak` (production) | jetons Keycloak (OIDC), validation RS256 via JWKS distant, `issuer` + `audience` contrôlés. Realm : `infra/keycloak/argos-realm.json` (MFA/TOTP, brute-force, politique de mot de passe). |
| `AUTH_MODE=dev` (défaut hors production) | `POST /api/auth/dev-token { username, role }` émet un jeton HS256 local. |

Le **rôle** est lu dans le jeton ; les **permissions sont résolues côté
serveur**. Une permission portée par le client est ignorée.

## RBAC — default-deny

- Catalogue `module:action:qualifier` et attribution par rôle dans
  `src/shared/permissions.ts` (destiné à migrer vers `packages/shared`).
- Gardes globales : `JwtAuthGuard` puis `PermissionsGuard`.
- Une route sensible déclare `@RequirePermission('…')` — sans la permission,
  **403** ; sans jeton, **401**. `@Public()` ouvre explicitement une route.

**Ajouter une route sensible sans `@RequirePermission` est une régression de
sécurité.**

## Audit

Intercepteur global : toute mutation est journalisée dans un journal
**append-only chaîné** (chaque entrée intègre l'empreinte de la précédente).
`GET /api/audit/verify` valide l'intégrité de la chaîne.

## Tests

```bash
npm test
```

| Suite | Objet |
| --- | --- |
| `modules/iam/authz.spec.ts` | gate de sécurité default-deny, permissions, audit |
| `modules/iam/users.spec.ts` | cycle de vie des comptes, attribution de rôles |
| `modules/orders/application/order.service.spec.ts` | cas d'usage sans base ni conteneur DI |
| `modules/orders/infrastructure/order-repository.contract.spec.ts` | contrat du port par adaptateur |
| `modules/orders/http/orders.authz.spec.ts` | RBAC et cycle de vie via HTTP |
| `modules/orders/architecture.spec.ts` | règle de dépendance |

## Modifier le contrat OpenAPI

Après toute modification d'un endpoint ou d'un DTO, régénérer le client, sinon
le typecheck du frontend échoue :
[procédure](../../docs/06-developpement.md#4-régénérer-le-client-api).

## Variables d'environnement

Gabarit : `.env.example`. Table complète :
[docs/06-developpement.md § 5](../../docs/06-developpement.md#5-variables-denvironnement).
