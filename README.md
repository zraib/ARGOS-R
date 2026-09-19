# ARGOS

Plateforme de commandement pour la gestion des catastrophes.

ARGOS agrège en une vue nationale unique ce qui est aujourd'hui dispersé :
incidents en cours, unités engagées, réseau hospitalier, abris, sites
mortuaires, parcs d'équipement, sismologie et météo. Chaque responsable de
terrain y pilote son établissement ; le commandement y lit la situation
d'ensemble.

Monorepo TypeScript strict : une application web Next.js, une API NestJS, un
client généré depuis le contrat OpenAPI, et les livrables de déploiement.

---

## Démarrage

Prérequis : **Node.js ≥ 20**. Ni base de données ni Docker.

```bash
npm run dev
```

Une seule commande lance toute la plateforme depuis la racine et installe les
dépendances manquantes au premier lancement.

| | |
| --- | --- |
| Poste de commandement | http://localhost:3004 |
| API | http://localhost:3005/api |
| Documentation OpenAPI | http://localhost:3005/api/docs |

Compte initial : `m.zraib` / `ARGOS-2026` — code d'amorçage **local**, remplacé
par un mot de passe personnel à la première connexion. Les autres comptes se
créent depuis l'écran *Gestion des utilisateurs*.

---

## Ce que couvre la plateforme

**Situation et commandement** — tableau de bord national, incidents et
sous-incidents, carte opérationnelle MapLibre (unités, hôpitaux, convois
animés, séismes, météo planétaire), répartiteur avec moteur de recommandation
explicable, tableau ORSEC, plans, rapports SITREP, analytique.

**Terrain** — triage de masse, évaluation des dommages (EMS-98), abris,
formulaires ICS 201–214, communications par canaux.

**Ressources** — inventaire d'équipements, roster du personnel, bons de travail
en kanban.

**Veille** — activité sismique CSEM/EMSC en direct avec alerte à deux seuils
(national : SMS et e-mail aux autorités ; mondial : notification), prévisions
Open-Meteo.

**Référentiels** — 75 provinces et préfectures, 113 établissements de santé
(7 hôpitaux militaires, 106 civils) aux symboles cartographiques différenciés.

### Espaces de responsabilité

Cinq rôles pilotent une entité précise, qui leur est affectée nominativement.
Chacun dispose de son écran de gestion et — sauf l'équipement — de son tableau
de bord.

| Rôle | Entité pilotée | Ce qu'il gère |
| --- | --- | --- |
| Responsable Hôpital | un hôpital militaire | capacités, services de soins, hôpitaux de campagne |
| Commandant d'unité | une unité | posture, effectif, taux de préparation |
| Responsable Abri | un abri | capacité, démographie, approvisionnement |
| Responsable Morgue | un site mortuaire | registre d'identification des victimes (DVI) |
| Responsable Équipement | le parc d'une unité | inventaire, seuils d'alerte, état du matériel |

L'API refuse toute action hors de ce périmètre — voir *Sécurité* ci-dessous.

### Deux modes de l'application

Depuis l'ADR 0022, la plateforme connaît deux **profils de rôles** et n'en sert qu'un à la fois — le
**mode de l'application**, réglé par le Super Administrateur dans les Paramètres (mot de passe exigé,
sans redémarrage) et annoncé sur l'écran de connexion :

| Mode | Organisation | Rôles |
| --- | --- | --- |
| **Classique** | l'organisation d'origine, inchangée | Utilisateur Stratégique, Place d'Armes, Wali, OPCOM et ses représentants (Gendarmerie, État-Major, Intérieur), TACOM, PCO, PCT, cellules bleue / verte / orange, Responsable Équipement |
| **Direx** | direction d'exercice et postes de commandement par fonctions | DIREX (Chef, Eval, Anim, RLS) · PC FAR et PCF (Chef, OPS, LOG, Planif & Rens, SYNTH — le PC FAR affecte les unités des FAR, le PCF celles de la DGSN, de la DGPC, des FA et de la Gendarmerie) · PCT et PCO (Chef, Ops, LOG, Rens — Rens & Com au PCO) |

Le Super Administrateur, l'Administrateur et les chefs d'entité (unité, hôpital, abri, morgue) sont
communs aux deux modes. Sous un mode, les comptes de l'autre profil ne se connectent pas — « Le Mode X
est activé sur cette station — contactez l'administrateur » — et leurs rôles ne s'attribuent pas.
La grille de départ du profil Direx est `docs/matrice-roles-direx.xlsx` (reportée dans le code par
`apps/api/scripts/direx-matrix.mjs`). L'administration gère les comptes des deux profils (onglets
« Utilisateurs classique » et « Utilisateurs Direx ») et règle, rôle par rôle et par profil, les
modules du menu et les **43 fonctionnalités de l'API** (dont les sous-incidents) dans « Rôles &
fonctionnalités ».

---

## Architecture

```
apps/web  ─── client généré depuis l'OpenAPI ───▶  apps/api
Next.js 16 · React 19                             NestJS 10 · 80 endpoints
24 écrans · MapLibre GL                           6 modules
Zustand · FR / AR (RTL) / EN                      JWT → RBAC → ABAC
                                                          │
                                    DB_DRIVER=memory ─────┴───── postgres
                                    dépôts in-memory          PostgreSQL 16
                                    + instantané JSON         PostGIS · Drizzle
```

**Le contrat d'abord.** Le frontend ne consomme que le client typé généré depuis
l'OpenAPI. Aucun `fetch` écrit à la main : modifier un endpoint sans régénérer
le client fait échouer le typecheck.

**La sécurité est côté serveur.** Trois gardes globales sur toutes les routes —
authentification, autorisation par rôle, cantonnement au périmètre affecté. Le
frontend ne fait que *masquer* ce que l'API *refuse* déjà.

**Souveraineté.** Aucune ressource externe au runtime : polices auto-hébergées,
pas de CDN ni d'analytics, flux tiers proxifiés par l'API, LLM local privilégié
pour l'assistant. Toute nouvelle dépendance runtime passe par un ADR.

Le module `orders` est bâti en architecture hexagonale et sert de modèle aux
suivants : domaine sans aucune dépendance, ports possédés par le métier,
adaptateurs interchangeables, et une règle de dépendance vérifiée par un test
qui échoue sur import interdit.

---

## Carte du dépôt

```
apps/web              Poste de commandement (Next.js, port 3004)
apps/api              API modulaire (NestJS, port 3005)
packages/api-client   Client typé généré depuis l'OpenAPI — source canonique
infra                 Docker Compose, realm Keycloak, schéma de base
docs                  Documentation technique
design_handoff_argos  Référence de design haute-fidélité (lue comme une spec)
scripts/dev.mjs       Lanceur de développement, sans dépendance externe
```

---

## Développement

| Commande | Effet |
| --- | --- |
| `npm run dev` | API + web, journaux préfixés, `Ctrl+C` arrête l'ensemble |
| `npm run dev:api` · `npm run dev:web` | un seul service |
| `npm run typecheck` | `tsc --noEmit` sur l'API puis le web |
| `npm test` | suite de l'API — **82 tests**, dont la gate de sécurité |
| `npm run build` | build de production |
| `npm run openapi` | régénère le contrat OpenAPI |

En mode mémoire, l'état survit aux redémarrages via un instantané JSON dans
`apps/api/.dev-data/` (git-ignoré ; `rm -rf` pour réinitialiser).

Bascule sur PostgreSQL :

```bash
cd apps/api
export DATABASE_URL=postgres://argos:mot-de-passe@localhost:5432/argos
npm run db:generate && npm run db:migrate
DB_DRIVER=postgres npm run dev
```

**Conventions** — interface et documentation en français, identifiants du code
et messages de commit en anglais ; `strict: true`, pas de `any` ; toute chaîne
affichée passe par l'i18n ; tokens de design uniquement.

---

## Sécurité

```
requête ─▶ JwtAuthGuard ─▶ PermissionsGuard ─▶ ScopeGuard ─▶ contrôleur
           401             403 — le rôle       403 — l'entité
                           a-t-il le droit ?   est-elle la sienne ?
```

- **Default-deny** : trois routes publiques seulement (santé, connexion, jeton
  de développement). Tout le reste exige une permission explicite.
- **36 permissions** au format `module:action:qualifier`, **12 rôles**, résolues
  côté serveur depuis le jeton — jamais reçues du client.
- **Cantonnement ABAC** : un responsable n'agit que sur l'entité qui lui est
  affectée. La portée est relue à chaque requête, donc une réaffectation prend
  effet sans reconnexion. Un compte sans affectation est refusé.
- **Journal d'audit chaîné** : chaque entrée intègre l'empreinte de la
  précédente ; `GET /api/audit/verify` valide l'intégrité.
- **Authentification** : Keycloak/OIDC en production (RS256, JWKS, MFA) ; jetons
  HS256 locaux en développement.

Ne jamais committer de secret. `.env.example` sert de gabarit ; le secret de
développement doit être remplacé en production.

---

## Documentation

| | |
| --- | --- |
| [docs/](docs/README.md) | index de la documentation technique |
| [Architecture](docs/01-architecture.md) | composants, flux, frontières, couches |
| [SOLID et hexagonal](docs/02-solid-hexagonal.md) | méthode appliquée et playbook |
| [Référence API](docs/03-api.md) | endpoints et permissions — générée depuis le code |
| [Sécurité](docs/04-securite.md) | RBAC, rôles, ABAC, audit, souveraineté |
| [Application web](docs/05-frontend.md) | écrans, store, i18n, carte |
| [Développement](docs/06-developpement.md) | commandes, variables, tests, dépannage |
| [Carte du code](docs/09-carte-du-code.md) | où se trouve quoi, règles de dépendance |
| [Qualité et audit](docs/10-qualite-et-audit.md) | la gate, le nettoyage, la refonte, le registre des risques |
| [ADR](docs/adr/README.md) | décisions d'architecture |
| [MASTER_PLAN.md](MASTER_PLAN.md) | vision produit, architecture cible, phases |

---

## État

Prototype fonctionnel de bout en bout : les écrans consomment l'API, qui
applique le contrôle d'accès et journalise les mutations. La gate
(`npm run typecheck && npm test` : 312 tests API en séquence, 70 tests web)
et la référence API générée depuis le code (`npm run docs:api`) sont décrites
dans [docs/10-qualite-et-audit.md](docs/10-qualite-et-audit.md). Reste à
traiter avant un déploiement réel :

- l'attribution fine des permissions par rôle, aujourd'hui provisoire hors
  administration, en attente de la matrice `docs/matrice-roles-fonctionnalites.xlsx` ;
- la passerelle SMS (l'e-mail part par SMTP dès que `SMTP_HOST` est défini ; sans lui, l'envoi est journalisé et l'historique le dit) ;
- la bascule du **domaine** sur PostgreSQL (aujourd'hui l'audit, les drapeaux
  et les bons de travail y sont ; incidents, comptes et communications vivent
  dans un instantané JSON durable) et Keycloak, dont les livrables sont prêts
  dans `infra/`.

## Déploiement sur une station

[`deploy/`](deploy/README.md) fait tourner la pile complète sur une machine
Windows avec Docker Desktop : proxy, poste web, API, PostgreSQL/PostGIS,
serveur de tuiles hors ligne (plan et toponymes rendus depuis OpenStreetMap
pour tout le Maroc, imagerie et relief par zones — [`infra/geo/`](infra/geo/README.md)),
moteur d'itinéraire Valhalla, et l'Ollama de la station pour l'IA. Sauvegarde
et restauration par scripts PowerShell.
