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
| `npm run typecheck` | `tsc --noEmit` sur l'API puis le web (`noUnusedLocals` / `noUnusedParameters` actifs) |
| `npm test` | **la gate** : API (jest, 312 tests, en séquence) puis web (vitest, 70 tests) |
| `npm run test:api` / `npm run test:web` | une seule suite |
| `npm run build` | build de production API + web |
| `npm run openapi` | exporte `apps/api/openapi.json` depuis le code (copie de travail, non versionnée) |
| `npm run contract:check` | exporte et **compare** au contrat versionné `packages/api-client/openapi.json` — échoue en cas de dérive (pour la CI) |
| `npm run contract:sync` | exporte, met à jour le contrat versionné, régénère les types du client et leur copie dans `apps/web` |
| `npm run docs:api` | `contract:sync` **puis** `docs/03-api.md` depuis le contrat et les contrôleurs |

Commandes spécifiques à l'API (depuis `apps/api`) :

```bash
npm run db:generate      # génère le SQL des migrations depuis src/db/schema.ts
npm run db:migrate       # applique les migrations (nécessite PostgreSQL)
npm run nrbc:import      # importe la bibliothèque de substances (lot N-3)
npm run fmc920:simulate  # simule un traceur FMC920 sur l'écouteur TCP (lot N-2)
```

**Exécuter la gate en séquence, jamais en parallèle** : sur un poste chargé,
lancer les tests pendant un build fait expirer les suites longues et donne des
échecs qui n'en sont pas. `npm test` enchaîne déjà API puis web pour cela.

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

Toutes les variables lues par le code, avec leur défaut. Gabarits :
`apps/api/.env.example`, `apps/web/.env.example`, `infra/compose/.env.example`.

### API (`apps/api/.env`)

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3005` | port d'écoute HTTP |
| `NODE_ENV` | `development` | environnement |
| `AUTH_MODE` | `dev` (hors prod) | `dev` = HS256 local · `keycloak` = OIDC RS256/JWKS |
| `AUTH_DEV_SECRET` | `argos-dev-secret-change-me` | secret HS256 de développement — **à remplacer en production** |
| `KEYCLOAK_ISSUER` | `http://localhost:8080/realms/argos` | émetteur OIDC |
| `KEYCLOAK_AUDIENCE` | `argos-api` | audience attendue |
| `CORS_ORIGINS` | `http://localhost:3004,http://127.0.0.1:3004,http://localhost:3100` | origines autorisées (liste séparée par des virgules) |
| `DB_DRIVER` | `memory` | `memory` ou `postgres` |
| `DATABASE_URL` | `postgres://argos:…@localhost:5432/argos` | chaîne de connexion PostgreSQL (si `postgres`) |
| `DEV_PERSIST` | `on` | `off` désactive l'instantané JSON de développement |
| `DEV_DATA_DIR` | `<cwd>/.dev-data` | dossier de l'instantané |
| `AVIATION_FEED` | `opensky` | `opensky` (flux réel) ou `exercise` (flux d'exercice, hors ligne) |
| `AVIATION_FEED_TTL_MS` | `5000` | durée de vie du cache de positions |
| `OPENSKY_USERNAME` / `OPENSKY_PASSWORD` | — | identifiants OpenSky (quota étendu ; anonymes sinon) |
| `NRBC_DATA_DIR` | `apps/api/data` | données de la bibliothèque de substances |
| `FMC920_PORT` | — (écouteur **non démarré** si absent) | port TCP de l'écouteur Teltonika Codec 8/8E |
| `FMC920_HOST` | `127.0.0.1` | interface d'écoute TCP — **ne jamais exposer sur toutes les interfaces sans pare-feu** |
| `ARGOS_ATTACHMENTS_DIR` | `<cwd>/data/attachments` | stockage des pièces jointes des communications (hors dépôt) |
| `SMTP_HOST` | — (envoi **journalisé**, rien ne part) | relais SMTP des notifications aux autorités (mailpit : `localhost`) |
| `SMTP_PORT` | `1025` | port SMTP (465/587 en production) |
| `SMTP_FROM` | `argos@localhost` | expéditeur des notifications |
| `SMTP_TLS` | `off` | `on` = connexion TLS implicite |
| `SMTP_USER` / `SMTP_PASSWORD` | — | authentification PLAIN si le relais l'exige — **jamais commités** |

### Web (`apps/web/.env`)

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:3005` | base de l'API |
| `NEXT_PUBLIC_MAP_TILES` | `external` | `external` = fond de carte tiers **(développement seulement, non souverain, bandeau affiché)** · `sovereign` = tuiles auto-hébergées (martin) ; toute autre valeur ferme ; en production le mode souverain est imposé |
| `NEXT_PUBLIC_TILES_URL` | — | base du serveur de tuiles auto-hébergé (martin : `/{source}/{z}/{x}/{y}`, sources `sat`, `plan`, `lbl`, `dem` — voir `infra/geo/README.md`) ; sans elle en mode souverain, la carte est sans fond |
| `NEXT_PUBLIC_ROUTING_ENGINE` | `valhalla` | moteur de routage (ADR 0001) |
| `NEXT_PUBLIC_ROUTING_URL` | `http://localhost:8002` | URL du moteur de routage |

**Aucun secret ne doit être commité.** Les fichiers `.env*` sont ignorés par
git ; seuls les `.env.example` sont versionnés.

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
npm test              # API (jest --runInBand) puis web (vitest) — la gate
npm run test:api      # 312 tests, 27 suites
npm run test:web      # 70 tests, 14 fichiers
```

### API (jest)

| Suite | Objet |
| --- | --- |
| `iam/authz.spec.ts` · `iam/authz-coverage.spec.ts` · `iam/scope.spec.ts` · `iam/users.spec.ts` | gate de sécurité default-deny, couverture des gardes, cantonnement ABAC, comptes |
| `domain/visibility.spec.ts` · `domain/deployment.spec.ts` · `domain/governance.authz.spec.ts` | doctrine de visibilité, déploiement, qui supprime quoi |
| `domain/sitrep.spec.ts` · `domain/dvi.spec.ts` · `domain/seed.spec.ts` · `domain/risk.engine.spec.ts` | comptes rendus, identification des victimes, jeu de démonstration, moteur de risques |
| `incident-dashboard/incident-dashboard.spec.ts` | tableau de bord d'une opération |
| `missions/**` (5 suites) · `orders/**` (4 suites) | cas d'usage **sans base ni conteneur**, contrat des ports, RBAC via HTTP, règle de dépendance hexagonale |
| `nrbc/nrbc-library.spec.ts` · `nrbc/plume/plume.engine.spec.ts` | bibliothèque de substances, moteur de panache |
| `aviation/aircraft.matching.spec.ts` | appariement des aéronefs |
| `tracking/codec8.spec.ts` · `tracking/tracking.spec.ts` | décodeur Codec 8/8E (CRC, IMEI, positions), registre et chaîne TCP complète |
| `realtime/comms.spec.ts` | gardes du centre de communication, présence, pièces jointes |

### Web (vitest)

`src/lib/**/__tests__/*.test.ts` — logique pure uniquement (i18n, navigation,
rôles, affecteurs, flux SSE, traceurs, substances, aides de la carte, moteur de
brouillon, orchestration du Copilot). Pas de rendu React : ce qui vaut d'être
testé a été sorti des composants vers `lib/`.

### Écrire un test

Un test se place **à côté de la logique qu'il protège** et fixe un invariant
qu'une retouche pourrait casser en silence (« aucun chiffre inventé », « jamais
40 000 caractères dans l'historique », « toute route déclare son accès »). Un
test qui rejoue une implémentation ligne à ligne n'apporte rien.

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
- **Rien d'inutilisé** : `noUnusedLocals` et `noUnusedParameters` sont actifs
  dans les deux `tsconfig` ; un import ou une variable morte est une erreur de
  typecheck, pas un avertissement.
- **La logique pure vit dans `lib/`** (web) ou dans un service/une fonction
  pure (API), jamais dans un composant ou un contrôleur ; un fichier de `lib/`
  n'importe jamais `components/`.
- **Un composant par fichier** au-delà de l'écran principal ; un magasin en
  tranches qui ne s'importent pas entre elles.
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
