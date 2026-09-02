# Carte du code

Où se trouve quoi, et quelles règles de dépendance tiennent l'ensemble. Ce
document se lit avec [01-architecture.md](01-architecture.md) (les composants
et les flux) et [05-frontend.md](05-frontend.md) (l'application web en détail).
Les chiffres (routes, tests) datent de la passe de refonte du 2 septembre 2026.

## 1. Le dépôt

```
ARGOS-RDIA/
├── apps/api/          API NestJS — monolithe modulaire, hexagonal par module
├── apps/web/          application web Next.js 15 (App Router, React 19)
├── packages/api-client/  client TypeScript généré depuis l'OpenAPI
├── infra/             compose (Postgres+PostGIS+Timescale, Redis, Keycloak,
│                      MinIO, EMQX, martin, Traefik), realm Keycloak, schéma Drizzle
├── docs/              cette documentation + docs/adr/ (décisions)
├── scripts/           dev.mjs (lance API + web) · gen-api-doc.mjs (03-api.md)
├── design_handoff_argos/  référence UI haute-fidélité (spécification, pas runtime)
└── README.md · package.json (commandes racine)
```

Trois fichiers de pilotage sont **volontairement hors de git** (`.gitignore`) :
`MASTER_PLAN.md` (vision), `CLAUDE.md` (règles de travail), `CONTEXT.md`
(journal de session). Ils vivent sur le poste de travail, pas dans le dépôt.

## 2. L'API (`apps/api/src`)

```
src/
├── main.ts · app.module.ts        amorçage, préfixe /api, validation, ETag
├── openapi.ts · openapi-export.ts contrat (Swagger /api/docs, export JSON)
├── config/                        chargement de l'environnement
├── common/
│   ├── guards/       jwt-auth · permissions (default-deny) · scope (ABAC)
│   ├── decorators/   @RequirePermission · @SelfService · @Public
│   │                 · @RequireScope · @AuditMeta · @CurrentUser
│   ├── interceptors/ audit des mutations
│   ├── ports/ · types/ · dev-store.ts (instantané JSON de développement)
├── shared/
│   ├── permissions.ts       LA matrice : 15 rôles × ressources × lettres A/M/R/V
│   └── responsibilities.ts  rattachement ABAC (le périmètre d'un responsable)
├── db/                      schéma Drizzle (cible PostgreSQL)
└── modules/                 douze modules, voir ci-dessous
```

| Module | Entrées HTTP (`http/` ou `*.controller.ts`) | Cœur | Tests |
| --- | --- | --- | --- |
| `health` | `GET /health` (publique) | — | — |
| `iam` | `auth.controller` (login, dev-token, profil, rôle actif, mot de passe) · `iam.controller` (me, rôles, permissions, matrice rôle→fonctionnalités) · `users.controller` (comptes) | `iam.service`, `users.service` | authz, authz-coverage, scope, users |
| `flags` | `flags.controller` | port + mémoire/Drizzle | — |
| `audit` | `audit.controller` | journal chaîné | (couvert par authz) |
| `domain` | `http/incidents` · `http/comms` · `http/resources` · `http/hospitals` · `http/dashboard` · `http/environment` | `domain.service` (état), `domain.types` (contrat), `domain.analytics` (calculs purs), `catalog`, `deployment`, `visibility`, `risk.*`, `incident-types`, `dvi.rules` | visibility, deployment, governance, sitrep, dvi, seed, risk.engine |
| `incident-dashboard` | `GET /incidents/{id}/dashboard` | agrégation par opération | incident-dashboard |
| `missions` | `http/missions.controller` | `domain/` machine d'états · `application/mission.service` · `ports/` · `infrastructure/` (mémoire, publication opérationnelle) | 5 suites (service, contrat, authz, publisher, architecture) |
| `orders` | `http/orders.controller` | idem, bons de travail | 4 suites |
| `nrbc` | `http/nrbc.controller` (library, substances, plume) | `plume/` moteur ATP-45 · `infrastructure/substance-import` | library, plume.engine |
| `aviation` | `http/aviation.controller` (states, aircraft) | `ports/feed` · `infrastructure/opensky.feed` · `exercise.feed` | aircraft.matching |
| `tracking` | `http/tracking.controller` (trackers, positions) | `infrastructure/fmc920.tcp-server` (Codec 8/8E) · `ports/` | codec8, tracking |
| `realtime` | `realtime.controller` (stream SSE, presence, attachments) | `realtime.service` (présence = connexion) · `attachments.service` (liste blanche + octets) | comms |

**Règle de dépendance** (vérifiée par `architecture.spec.ts` dans `orders` et
`missions`) : `domain` ne dépend de rien ; `application` dépend de `domain` et
des `ports` ; `infrastructure` implémente les ports ; `http` n'appelle que
`application`. Un import qui remonte le courant fait échouer la suite.

## 3. L'application web (`apps/web/src`)

### Les routes (`app/`)

| Route | Écran |
| --- | --- |
| `/` · `/dashboard` | connexion, tableau de bord national |
| `/incidents` · `/incidents/[id]/dashboard` | liste et déclaration ; tableau de bord d'une opération |
| `/map` | carte opérationnelle (2D/3D, satellite, couches, météo, panache, suivi aérien) |
| `/seismologie` · `/repartition` · `/triage` | sismologie, répartiteur, triage de masse |
| `/traceurs` · `/substances` | traceurs GPS (N-2), substances dangereuses (N-3/N-5) |
| `/hospinet` · `/opsnet` · `/abris` · `/dommages` | réseau hospitalier, réseau opérationnel, abris, dommages |
| `/ics` · `/orsec` · `/plans` · `/equipes` · `/personnel` · `/inventaire` · `/bons-de-travail` | commandement et ressources |
| `/communication` | centre de communication temps réel (COMMS) |
| `/rapports` · `/analytique` · `/simulation` | rapports, analytique, simulation What-If |
| `/responsabilites` · `/ma-responsabilite(/gestion)` | rattachements ABAC, périmètre du responsable |
| `/utilisateurs` · `/parametres` · `/profil` | administration (Super Admin), profil |

### Les couches

```
components/   ce qui se voit — un composant par fichier ; les écrans composés
              rangent leurs sous-composants dans parts/ ou _parts/ ; la carte
              range son rendu par couche dans map/layers/ (fonctions
              impératives + objet d'état, sans React) ; le Copilot range ses
              parties dans shell/copilot/ et ses blocs dans shell/copilot/blocks/
lib/          ce qui se calcule — n'importe JAMAIS components/
lib/store/    l'état client : dix tranches Zustand qui ne s'importent pas
lib/api-client/  le contrat généré — ne pas éditer ; jamais de fetch manuel
              (deux exceptions documentées : le flux SSE et les pièces jointes,
              parce qu'EventSource ne porte pas d'en-tête d'autorisation)
lib/i18n/     trois langues, fichiers séparés, parité vérifiée par test
```

| Dossier de `lib/` | Contenu | Tests |
| --- | --- | --- |
| `store/` | `shared.ts` + `slices/{session,ui,domain,seismic,map,missions,nrbc,realtime,ai,aviation}.ts` | — (comportement couvert par les écrans) |
| `ai/assistant/` | Couche 1 : `router.ts` (`interpret`), `intents/*`, `prompt.ts`, `enrich.ts`, `temporal.ts`, `labels.ts` | — |
| `ai/copilot/` | `history.ts` · `blocks.ts` · `turn.ts` | copilot.test |
| `ai/draft/` | `lexicon.ts` · `semantic.ts` · `pools.ts` · `proposal.ts` | draft.test |
| `ai/risk/` · `ai/situational/` · `ai/whatif/` | moteurs de prédiction et de simulation | — |
| `map/` | `canvas/{dem,weather-raster,weather-grid,weather-render,quakes,plume}.ts`, `wind.ts`, style, marqueurs | canvas.test, wind.test |
| `incidents/` | `wizard.ts` : formulaire de déclaration — validation par étape, appariement d'adresse, rattachement région, charge envoyée, pré-remplissage | wizard.test |
| `realtime/` | `stream.ts` (SSE par `fetch`, reconnexion, arrêt sur 401/403) | realtime-stream.test |
| `tracking/` · `nrbc/` · `hazard/` | traceurs, substances, pictogrammes | tracking, substance, pictograms |
| `i18n/` · `nav.ts` · `roles.ts` · `helpers.ts` | langues, navigation, rôles, aides | i18n, nav, roles, helpers |

## 4. Le contrat entre les deux

```
apps/api (décorateurs @ApiOperation, DTO)
   └─ npm run openapi ─▶ apps/api/openapi.json (non versionné)
        ├─ npm run generate (packages/api-client) ─▶ apps/web/src/lib/api-client/
        └─ npm run docs:api ─▶ docs/03-api.md (routes × permissions)
```

Toute évolution d'une route suit ce chemin, dans cet ordre. Le web ne connaît
l'API que par le client généré.

## 5. Où mettre une nouveauté

| Je veux… | Je vais dans… |
| --- | --- |
| une nouvelle route API | le module concerné, `http/` ; déclarer `@RequirePermission` (ou `@SelfService`/`@Public`) — sinon `authz-coverage` échoue ; puis le chemin du §4 |
| une règle métier côté API | `domain/` du module (hexagonal) ou une fonction pure à côté du service, avec sa suite jest |
| une permission | `shared/permissions.ts` (une ligne, 15 rôles) et `04-securite.md` |
| un écran | `app/<route>/page.tsx` + `lib/nav.ts` + trois fichiers i18n ; sous-composants dans `_parts/` |
| un calcul pour l'écran | `lib/<domaine>/` avec un test dans `__tests__/` — pas dans le composant |
| de l'état client | la tranche existante de `lib/store/slices/`, ou une nouvelle tranche déclarée dans `lib/store.ts` |
| une chaîne affichée | `lib/i18n/translations.{fr,en,ar}.ts` (cœur) ou `modules.{fr,en,ar}.ts` — les trois, ou `i18n.test` échoue |
| une dépendance runtime | un ADR d'abord (`docs/adr/`) |
