# ARGOS — API (`apps/api`)

Monolithe modulaire **NestJS** (TypeScript strict). **Phase 0/1** du MASTER_PLAN :
squelette production-grade + **IAM/RBAC**, **audit chaîné**, **feature flags**,
**OpenAPI**. Frontière de modules stricte (chaque module = dossier isolé),
prête à extraire en services (MASTER_PLAN §4.1).

## Démarrage

```bash
npm install
npm run dev          # http://localhost:3005/api (docs: /api/docs)
npm run build && npm start
npm run typecheck
npm test             # gate de sécurité (default-deny)
npm run openapi      # génère openapi.json (client frontend)
npm run db:generate  # génère le SQL des migrations depuis src/db/schema.ts
npm run db:migrate   # applique les migrations (nécessite Postgres)
```

Sans Docker, l'API tourne en **mode dev** (dépôts in-memory, jetons HS256
locaux) — aucun Postgres/Keycloak requis pour la Phase 0. La couche de données
Postgres (Drizzle) et Keycloak sont livrés dans `infra/` pour le déploiement.

## Persistance (bascule `DB_DRIVER`)

- `DB_DRIVER=memory` (défaut) : dépôts in-memory, aucune base.
- `DB_DRIVER=postgres` : dépôts **Drizzle/PostgreSQL** (`src/db/schema.ts`,
  `src/db/database.module.ts`, `*.drizzle.repository.ts`). Prérequis :
  `npm run db:generate && DATABASE_URL=… npm run db:migrate`, puis
  `DB_DRIVER=postgres npm run dev`.

Chaque module persistant expose une interface de dépôt et deux implémentations
(`*.memory.repository.ts` / `*.drizzle.repository.ts`) sélectionnées par
`DB_DRIVER` — les services ne connaissent que l'interface.

## Authentification

- **Production** (`AUTH_MODE=keycloak`) : jetons **Keycloak** (OIDC) validés en
  RS256 via le JWKS distant, `issuer` + `audience` contrôlés. Realm et clients
  dans `infra/keycloak/argos-realm.json` (MFA/TOTP par défaut, brute-force,
  politique de mot de passe).
- **Développement** (`AUTH_MODE=dev`) : `POST /api/auth/dev-token { username, role }`
  émet un jeton HS256 signé localement pour tester sans Keycloak.

Le **rôle** est lu dans le jeton ; les **permissions** sont résolues côté serveur
(RBAC) — jamais fait confiance à des permissions portées par le client.

## RBAC / default-deny

- Catalogue de permissions `module:action:qualifier` + rôles → permissions
  (`src/shared/permissions.ts`, destiné à `packages/shared`).
- Gardes globales : `JwtAuthGuard` (auth) puis `PermissionsGuard`. Une route
  sensible déclare `@RequirePermission('...')` ; sans la permission → **403**.
- `@Public()` ouvre une route (santé, dev-token).

## Endpoints (extrait)

| Méthode | Route | Permission | |
|---|---|---|---|
| GET | `/api/health` | — (publique) | sonde |
| POST | `/api/auth/dev-token` | — (dev) | jeton de test |
| POST | `/api/auth/login` | — (publique) | connexion compte géré (code/mdp) → jeton + état de cycle de vie |
| POST | `/api/auth/change-password` | authentifié | 1er login : pose le mot de passe, active le compte |
| POST | `/api/auth/select-role` | authentifié | compte multi-rôles : choisit le rôle actif → nouveau jeton |
| GET | `/api/iam/me` | authentifié | profil + permissions résolues |
| GET | `/api/iam/users` | `iam:users:read` | liste des utilisateurs |
| POST | `/api/iam/users` | `iam:users:create` | créer (règles d'attribution appliquées serveur) |
| PATCH | `/api/iam/users/:id` | `iam:users:update` | modifier (nom, grade, rôles) |
| DELETE | `/api/iam/users/:id` | `iam:users:delete` | supprimer |
| POST | `/api/iam/users/:id/active` | `iam:users:activate` | activer/suspendre (Super Admin) |
| POST | `/api/iam/users/:id/reset-code` | `iam:users:update` | régénérer le code temporaire |
| GET | `/api/iam/users/:id/temp-code` | `iam:users:read` | consulter le code temporaire |
| GET | `/api/iam/roles` | `iam:roles:read` | rôles + permissions |
| GET | `/api/iam/role-features` | `iam:roles:read` | matrice rôle → fonctionnalités |
| PATCH | `/api/iam/role-features/:role` | `iam:roles:features` | basculer une fonctionnalité (Super Admin) |
| GET | `/api/iam/permissions` | `iam:permissions:read` | catalogue |
| GET | `/api/incidents` · `/units` · `/hospitals` · `/field-hospitals` · `/feed` | `incidents:read` / `org:units:read` / `org:hospitals:read` | entités opérationnelles |
| POST | `/api/incidents` | `incidents:create` | déclarer un incident (audité) |
| POST | `/api/units` · `/api/hospitals` | `org:units:manage` / `org:hospitals:manage` | créer une unité / un hôpital (audité) |
| GET | `/api/dispatch/queue` · `/dispatch/movements` | `dispatch:assign` | file + mouvements du Répartiteur |
| GET/POST | `/api/comms` · `/comms/messages` · `/comms/categories` · `/comms/channels` | authentifié | centre de communication (canaux, messages, présence) |
| GET | `/api/catalog` | `incidents:read` | catalogue des modules (inventaire, triage, ORSEC, plans, ICS, rapports, analytique…) |
| GET | `/api/flags` | `admin:feature_flags:read` | matrice de flags |
| PATCH | `/api/flags/:key` | `admin:feature_flags:toggle` | bascule (audité) |
| GET | `/api/audit` | `audit:log:read` | journal chaîné |
| GET | `/api/audit/verify` | `audit:log:verify` | intégrité (tamper-evidence) |

## Audit

Journal **append-only chaîné par hash** (SHA-256, chaque ligne référence la
précédente). L'`AuditInterceptor` journalise automatiquement chaque mutation
(POST/PUT/PATCH/DELETE) réussie. `GET /api/audit/verify` recalcule la chaîne et
détecte toute altération.

## Structure

```
src/
├── main.ts, app.module.ts, openapi.ts
├── config/            # configuration typée (env)
├── shared/            # catalogue permissions + rôles (→ packages/shared)
├── common/            # décorateurs, gardes (JWT, permissions), intercepteur d'audit
└── modules/
    ├── health/  auth+iam/  audit/  flags/
```

## Persistance dev (sans base ni Docker)

En mode mémoire, l'état est normalement perdu à chaque redémarrage (le compte
fondateur repasse en « 1er login », les données sont réinitialisées). Un
**instantané JSON sur disque** (`src/common/dev-store.ts`) le fait **survivre aux
redémarrages** sur le poste du développeur :

- Dossier : `apps/api/.dev-data/` (git-ignoré) — comptes/mot de passe (`iam.json`),
  domaine (`domain.json`), types d'incident personnalisés (`incident-types.json`).
- **Réinitialiser** (repartir du seed, ex. oubli du mot de passe) : `rm -rf apps/api/.dev-data`.
- **Désactiver** : `DEV_PERSIST=off`. Ignoré si `DB_DRIVER=postgres` ou en test/prod.
- Dossier réglable via `DEV_DATA_DIR`.

Ainsi, on **ne repose son mot de passe qu'une seule fois** ; les lancements
suivants réutilisent l'état enregistré.

## Limites (Phase 0)

- Persistance par défaut **in-memory** (instantané dev sur disque ci-dessus) ;
  le chemin **Postgres/Drizzle est câblé** (`DB_DRIVER=postgres`) et ses
  migrations générées, mais non exécuté ici (Docker/Postgres absents du bac à sable).
- IAM users/roles restent seedés (à synchroniser avec l'API Admin Keycloak).
- Le jeton dev est réservé au mode dev ; interdit en production.
