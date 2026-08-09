# ARGOS

**Plateforme de commandement sécurisée pour la gestion des catastrophes**, à
l'usage de l'état-major des Forces Armées Royales (Maroc).

Vue nationale en temps réel : incidents, unités engagées, réseau hospitalier,
dispatching, sismologie, météo, communications, planification ORSEC et
analytique — le tout sous contrôle d'accès appliqué côté serveur et journal
d'audit vérifiable.

---

## Démarrage

Prérequis : **Node.js ≥ 20**. Aucune base de données ni Docker nécessaire.

```bash
npm run dev
```

Une seule commande, depuis la racine, lance **toute la plateforme**. Les
dépendances manquantes sont installées au premier lancement.

| Service | URL |
| --- | --- |
| Poste de commandement | `http://localhost:3004` |
| API | `http://localhost:3005/api` |
| Documentation OpenAPI | `http://localhost:3005/api/docs` |

Compte Super Administrateur par défaut : **`m.zraib` / `ARGOS-2026`**
(mot de passe personnel obligatoire à la première connexion).
`Ctrl+C` arrête l'ensemble.

```bash
npm run dev:api    # API seule
npm run dev:web    # application web seule
npm run typecheck  # tsc --noEmit (API + web)
npm test           # suite de tests de l'API (50 tests)
npm run build      # build de production
```

## Carte du dépôt

```
apps/web              Poste de commandement — Next.js 15 · React 19 · TS strict
                      Tailwind · Zustand · MapLibre GL · i18n FR/AR/EN (RTL)
apps/api              API NestJS (monolithe modulaire)
                      IAM/RBAC default-deny · audit chaîné · feature flags
                      domaine opérationnel · bons de travail (hexagonal)
packages/api-client   Client typé généré depuis l'OpenAPI (source canonique)
infra                 Docker Compose, realm Keycloak, notes base de données
docs                  Documentation technique
design_handoff_argos  Référence de design haute-fidélité (spécification)
scripts/dev.mjs       Lanceur de développement, sans dépendance externe
```

## Principes structurants

- **Le contrat d'abord.** Le frontend ne consomme que le client généré depuis
  l'OpenAPI — jamais de `fetch` écrit à la main.
- **La sécurité est côté serveur.** Le RBAC est appliqué dans l'API ; le
  frontend ne fait que *masquer* ce que l'API *refuse* déjà.
- **Souveraineté.** Aucune ressource externe au runtime : polices
  auto-hébergées, pas de CDN ni d'analytics, flux tiers proxifiés par l'API,
  LLM local privilégié. Aucune nouvelle dépendance runtime sans ADR.
- **Interface en français**, arabe en RTL, anglais disponible. Commentaires et
  documentation en français ; identifiants du code et messages de commit en
  anglais.

## Documentation

| Document | Contenu |
| --- | --- |
| [docs/](docs/README.md) | **index de la documentation** |
| [Architecture](docs/01-architecture.md) | composants, flux, frontières, couches |
| [SOLID et hexagonal](docs/02-solid-hexagonal.md) | processus appliqué + playbook pour un nouveau module |
| [Référence API](docs/03-api.md) | endpoints et permissions |
| [Sécurité](docs/04-securite.md) | RBAC, 12 rôles, audit, souveraineté |
| [Application web](docs/05-frontend.md) | écrans, store, i18n, carte |
| [Développement](docs/06-developpement.md) | commandes, variables, tests, dépannage |
| [ADR](docs/adr/README.md) | décisions d'architecture |
| [MASTER_PLAN.md](MASTER_PLAN.md) | vision produit, architecture cible, phases |
| [CLAUDE.md](CLAUDE.md) | règles permanentes de travail dans le dépôt |
| [CONTEXT.md](CONTEXT.md) | journal de session |

## Modes de persistance

| Mode | Activation | Usage |
| --- | --- | --- |
| Mémoire | `DB_DRIVER=memory` (défaut) | développement — instantané JSON dans `apps/api/.dev-data/` |
| PostgreSQL | `DB_DRIVER=postgres` + `DATABASE_URL` | cible de déploiement (PostGIS + TimescaleDB) |

```bash
cd apps/api
export DATABASE_URL=postgres://argos:mot-de-passe@localhost:5432/argos
npm run db:generate && npm run db:migrate
DB_DRIVER=postgres npm run dev
```

## Sécurité

**Ne jamais committer de secret.** `.env.example` sert de gabarit ; le secret
d'authentification de développement doit être remplacé en production, où
l'authentification passe par Keycloak/OIDC.

Détail complet : [docs/04-securite.md](docs/04-securite.md).
