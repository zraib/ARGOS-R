# Guide de développement

Commandes, procédures, conventions et dépannage.

---

## 1. Prérequis

- **Node.js ≥ 20**, npm 10+
- Aucune base de données ni Docker requis en développement (mode mémoire).

## 2. Démarrer

Depuis la **racine** du dépôt :

```bash
npm run dev
```

Lance l'API **et** l'application web dans un seul terminal, avec les journaux
préfixés `[api]` / `[web]`. Les dépendances manquantes sont installées au
premier lancement. `Ctrl+C` arrête l'ensemble ; si un service s'arrête, l'autre
est coupé.

| Service | URL |
| --- | --- |
| Application web | `http://localhost:3004` |
| API | `http://localhost:3005/api` |
| Documentation OpenAPI | `http://localhost:3005/api/docs` |

Compte Super Administrateur par défaut : **`m.zraib` / `ARGOS-2026`**
(mot de passe personnel obligatoire à la première connexion).

### Un seul service

```bash
npm run dev:api    # API seule (3005)
npm run dev:web    # web seule (3004)
```

Le lanceur est `scripts/dev.mjs` — zéro dépendance externe, modules natifs de
Node uniquement (exigence de souveraineté).

## 3. Toutes les commandes (racine)

| Commande | Effet |
| --- | --- |
| `npm run dev` | API + web |
| `npm run dev:api` / `npm run dev:web` | un seul service |
| `npm run setup` | `npm install` dans `packages/api-client`, `apps/api`, `apps/web` |
| `npm run typecheck` | `tsc --noEmit` sur l'API puis le web |
| `npm test` | suite de tests de l'API (**82 tests**, dont la gate de sécurité) |
| `npm run build` | build de production API + web |
| `npm run openapi` | régénère `apps/api/openapi.json` |

Commandes spécifiques à l'API (depuis `apps/api`) :

```bash
npm run db:generate   # génère le SQL des migrations depuis src/db/schema.ts
npm run db:migrate    # applique les migrations (nécessite PostgreSQL)
```

## 4. Régénérer le client API

**Obligatoire après toute modification d'un endpoint, d'un DTO ou d'un
décorateur `@ApiProperty`.** Sinon le typecheck du web échoue.

```bash
npm run openapi
cp apps/api/openapi.json packages/api-client/openapi.json
npm run generate --prefix packages/api-client
cp packages/api-client/src/openapi.d.ts apps/web/src/lib/api-client/openapi.d.ts
npm run typecheck
```

`packages/api-client/src/openapi.d.ts` est la **source canonique** ; la copie
dans `apps/web` en est le miroir. Ne jamais éditer ces fichiers à la main.

## 5. Variables d'environnement

### API (`apps/api/.env`, gabarit `.env.example`)

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3005` | port d'écoute |
| `NODE_ENV` | `development` | environnement |
| `AUTH_MODE` | `dev` (hors prod) | `dev` = HS256 local · `keycloak` = OIDC RS256/JWKS |
| `AUTH_DEV_SECRET` | `argos-dev-secret-change-me` | secret HS256 de développement — **à remplacer en production** |
| `KEYCLOAK_ISSUER` | `http://localhost:8080/realms/argos` | émetteur OIDC |
| `KEYCLOAK_AUDIENCE` | `argos-api` | audience attendue |
| `CORS_ORIGINS` | `localhost:3004,127.0.0.1:3004,localhost:3100` | origines autorisées |
| `DB_DRIVER` | `memory` | `memory` ou `postgres` |
| `DATABASE_URL` | — | chaîne de connexion PostgreSQL |
| `DEV_PERSIST` | `on` | `off` désactive l'instantané JSON de développement |
| `DEV_DATA_DIR` | `<cwd>/.dev-data` | dossier de l'instantané |

### Web (`apps/web/.env`)

| Variable | Défaut |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:3005` |

**Aucun secret ne doit être commité.**

## 6. Persistance de développement

En mode mémoire, l'état survit aux redémarrages via des instantanés JSON dans
`apps/api/.dev-data/` (git-ignoré) : `domain.json`, `iam.json`, `orders.json`,
`incident-types.json`, grilles météo, configuration d'alerte sismique.

- **Réinitialiser tout** : `rm -rf apps/api/.dev-data`
- **Réinitialiser une collection** : supprimer le fichier correspondant.
- **Désactiver** : `DEV_PERSIST=off`.

Les référentiels embarqués portent une **version de seed** : quand le code
change (nouveau réseau hospitalier, nouveaux bons de démonstration), incrémenter
la constante `*_SEED_VERSION` fait que l'instantané ancien est ignoré **pour ces
collections uniquement**, sans perdre les incidents et unités créés.

## 7. Passer sur PostgreSQL

```bash
cd apps/api
export DATABASE_URL=postgres://argos:mot-de-passe@localhost:5432/argos
npm run db:generate
npm run db:migrate
DB_DRIVER=postgres npm run dev
```

La pile complète (PostgreSQL + PostGIS + TimescaleDB, Redis, Keycloak, MinIO,
EMQX, martin, Traefik, mailpit) est dans `infra/compose/`.

## 8. Tests

```bash
npm test          # depuis la racine
```

| Suite | Objet |
| --- | --- |
| `modules/iam/authz.spec.ts` | gate de sécurité default-deny, résolution des permissions, chaîne d'audit |
| `modules/iam/users.spec.ts` | cycle de vie des comptes, règles d'attribution de rôles |
| `modules/orders/application/order.service.spec.ts` | cas d'usage — **sans base, sans Docker, sans conteneur NestJS** |
| `modules/orders/infrastructure/order-repository.contract.spec.ts` | contrat du port, rejoué par adaptateur |
| `modules/orders/http/orders.authz.spec.ts` | RBAC et cycle de vie via HTTP |
| `modules/orders/architecture.spec.ts` | règle de dépendance (échoue sur import interdit) |

## 9. Conventions

Règles permanentes dans [`CLAUDE.md`](../CLAUDE.md). L'essentiel :

- **Interface en français** (AR en RTL, EN disponible).
- **Commentaires et documentation en français.** Les **identifiants** du code
  (fonctions, variables, types) et les **messages de commit** restent en
  anglais.
- Pas de `any`, pas de `any` implicite, gestion exhaustive des énumérations,
  `strict: true`.
- Toutes les chaînes affichées passent par `lib/i18n/`.
- Tokens de design uniquement — ne pas inventer de couleurs.
- Ressources auto-hébergées ; aucune nouvelle dépendance runtime sans
  [ADR](adr/README.md).
- Ne jamais marquer une tâche « terminée » sans l'avoir **vérifiée dans le
  navigateur** — le typecheck ne suffit pas.
- Commencer une session en lisant `CONTEXT.md`, la finir en le mettant à jour.

## 10. Ajouter un module à l'API

Pour un module appelé à grossir, suivre le playbook hexagonal :
[02-solid-hexagonal.md § 4](02-solid-hexagonal.md#4-playbook-pour-le-prochain-module).

Version courte :

1. `domain/` d'abord, **zéro import**.
2. `ports/` — interfaces définies par le besoin, jetons `Symbol`, signatures
   asynchrones, lecture et écriture séparées.
3. `application/` — le service, qui n'importe que domaine + ports +
   `@nestjs/common`.
4. `infrastructure/` — les adaptateurs, en dernier.
5. `http/` — contrôleur + DTO, traduction des erreurs de domaine.
6. `*.module.ts` — **seul** point de câblage.
7. Permissions dans `shared/permissions.ts` + `@RequirePermission` sur chaque
   route.
8. Trois niveaux de tests : unitaires avec doublures, contrat, architecture.
9. Enregistrer le module dans `app.module.ts`.
10. Régénérer le client API (§ 4).

## 11. Dépannage

| Symptôme | Cause probable | Correctif |
| --- | --- | --- |
| `npm run dev` échoue hors de l'éditeur | dépendances non installées | `npm run setup` |
| Port 3004 ou 3005 déjà occupé | instance précédente encore vivante | `lsof -ti:3004 \| xargs kill -9` |
| Typecheck web en échec après une modification d'API | client non régénéré | procédure § 4 |
| `npx tsc` : « This is not the tsc command you are looking for » | lancé depuis la racine | lancer depuis `apps/api` ou `apps/web` |
| Données de démonstration réapparues ou figées | instantané dev | `rm -rf apps/api/.dev-data` |
| Météo vide ou partielle | quota Open-Meteo (429) | transitoire ; le quota se recharge, l'API réessaie |
| Carte sans fond | throttling du CDN de tuiles | transitoire ; recharger |
| 403 sur une route qui devrait passer | rôle sans la permission | vérifier `ROLE_PERMISSIONS` dans `shared/permissions.ts` |
| Un test d'architecture échoue | import interdit dans une couche interne | déplacer la dépendance derrière un port |
