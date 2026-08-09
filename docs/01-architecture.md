# Architecture

Vue d'ensemble technique d'ARGOS : composants, flux de données, frontières et
règles structurantes.

## 1. Composants

```
┌───────────────────────────────────────────────────────────────────────┐
│  apps/web — Poste de commandement (Next.js 15 · React 19 · TS strict) │
│  24 écrans · store Zustand · MapLibre GL · i18n FR/AR/EN (RTL)        │
└───────────────────────────────┬───────────────────────────────────────┘
                                │  client généré depuis l'OpenAPI
                                │  (JAMAIS de fetch écrit à la main)
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│  apps/api — Monolithe modulaire NestJS (port 3005, préfixe /api)      │
│                                                                        │
│   health · iam · flags · audit · domain · orders                      │
│                                                                        │
│   Gardes globales : JwtAuthGuard → PermissionsGuard  (default-deny)   │
│   Intercepteur global : audit chaîné des mutations                    │
└───────┬───────────────────────────────────────┬───────────────────────┘
        │ DB_DRIVER=memory (défaut)             │ DB_DRIVER=postgres
        ▼                                       ▼
  dépôts in-memory                        PostgreSQL 16 + PostGIS
  + instantané JSON dev                   via Drizzle ORM
  (.dev-data/, git-ignoré)                (infra/compose)
```

**Sources externes** (proxifiées par l'API, jamais appelées depuis le
navigateur — voir [ADR 0002](adr/0002-flux-externes-sismologie-meteo.md)) :
CSEM/EMSC pour la sismologie, Open-Meteo pour la météo.

## 2. Le contrat d'abord

Règle non négociable : **le frontend ne consomme que le client généré depuis
l'OpenAPI**. Aucun `fetch` écrit à la main vers l'API.

```
apps/api (décorateurs @ApiProperty, DTO)
   │  npm run openapi
   ▼
apps/api/openapi.json
   │  copie
   ▼
packages/api-client/openapi.json
   │  npm run generate  (openapi-typescript)
   ▼
packages/api-client/src/openapi.d.ts        ← source canonique
   │  copie
   ▼
apps/web/src/lib/api-client/openapi.d.ts    ← consommé par le store
```

Conséquence pratique : **toute modification d'un endpoint impose de rejouer
cette chaîne**, sinon le typecheck du web échoue. La procédure est détaillée
dans [06-developpement.md](06-developpement.md).

## 3. Couches de l'API

Deux styles coexistent, assumés (voir [ADR 0003](adr/0003-module-orders-architecture-hexagonale.md)) :

### Style historique — `domain`, `iam`, `flags`, `audit`

Service NestJS classique. `flags` et `audit` isolent déjà la persistance
derrière une interface de dépôt avec deux implémentations
(`*.memory.repository.ts` / `*.drizzle.repository.ts`) sélectionnées par
`DB_DRIVER`. `domain` et `iam` appellent encore `common/dev-store` directement.

### Style de référence — `orders`

Architecture hexagonale complète, règle de dépendance dirigée vers l'intérieur :

```
http/ · infrastructure/   →   application/   →   ports/   →   domain/
(adaptateurs)                 OrderService     interfaces    règles métier
                                                             (zéro import)
```

Vérifiée mécaniquement par `architecture.spec.ts`. C'est le modèle pour les
modules à venir — méthode et playbook dans
[02-solid-hexagonal.md](02-solid-hexagonal.md).

## 4. Modules de l'API

| Module | Responsabilité | Persistance |
| --- | --- | --- |
| `health` | sonde publique `/api/health` | — |
| `iam` | authentification, utilisateurs, rôles, matrice rôle→fonctionnalités | in-memory + instantané dev |
| `flags` | feature flags par module | interface + mémoire / Drizzle |
| `audit` | journal append-only chaîné + vérification d'intégrité | interface + mémoire / Drizzle |
| `domain` | incidents, unités, hôpitaux, fil, dispatching, comms, catalogue, sismologie, météo | in-memory + instantané dev |
| `orders` | bons de travail (hexagonal) | port + mémoire / Drizzle |

## 5. Sécurité — appliquée côté serveur

Le principe structurant : **le RBAC est appliqué dans l'API ; le frontend ne
fait que *masquer* ce que l'API *refuse* déjà**. Le filtrage côté client n'est
pas un contrôle de sécurité.

- Deux gardes globales, dans l'ordre : `JwtAuthGuard` (authentification) puis
  `PermissionsGuard` (autorisation). Par défaut, tout est refusé.
- Une route sensible déclare `@RequirePermission("module:action")`. Sans la
  permission → **403**. Sans jeton → **401**.
- `@Public()` ouvre explicitement une route (santé, `dev-token`, `login`).
- Le **rôle** est lu dans le jeton ; les **permissions** sont résolues côté
  serveur depuis le rôle — jamais reçues du client.

Détail complet : [04-securite.md](04-securite.md).

## 6. Persistance

| Mode | Activation | Usage |
| --- | --- | --- |
| Mémoire | `DB_DRIVER=memory` (défaut) | développement sans Docker ni base |
| PostgreSQL | `DB_DRIVER=postgres` + `DATABASE_URL` | cible de déploiement |

En mode mémoire, un **instantané JSON** (`apps/api/.dev-data/`, git-ignoré)
fait survivre l'état aux redémarrages. Désactivable par `DEV_PERSIST=off`,
ignoré en production et pendant les tests. Réinitialisation : supprimer le
dossier.

Les référentiels embarqués (hôpitaux, bons de démonstration) portent une
**version de seed** : quand le code change, l'instantané écrit avec une version
antérieure est ignoré pour ces collections, sans perdre les incidents et unités
créés.

## 7. Souveraineté

Exigence du `MASTER_PLAN.md` §4.3, appliquée partout :

- aucune police, CDN, analytics ou ressource externe au runtime — tout est
  auto-hébergé (`apps/web/public/fonts`) ;
- les flux externes passent par un **proxy côté API**, avec cache et
  dégradation gracieuse ; le navigateur ne contacte jamais une source tierce ;
- aucune nouvelle dépendance runtime sans ADR ;
- aucun secret dans le dépôt ; `.env.example` sert de gabarit.

## 8. Où aller ensuite

| Sujet | Document |
| --- | --- |
| Processus SOLID / hexagonal, playbook | [02-solid-hexagonal.md](02-solid-hexagonal.md) |
| Endpoints et permissions | [03-api.md](03-api.md) |
| Rôles, permissions, audit | [04-securite.md](04-securite.md) |
| Application web | [05-frontend.md](05-frontend.md) |
| Commandes, tests, conventions | [06-developpement.md](06-developpement.md) |
| Décisions d'architecture | [adr/](adr/README.md) |
| Vision produit et phases | [../MASTER_PLAN.md](../MASTER_PLAN.md) |
