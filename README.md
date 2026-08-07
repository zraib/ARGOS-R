# ARGOS-R

ARGOS-R is a secure command-and-control platform for disaster management. The repository contains a command web application, a modular backend API, deployment assets, and a generated API client used by the frontend.

## Repository Contents

- `apps/web` — Next.js command web application with French-first operational screens, mapping, communications, dispatching, reporting, and a local AI assistant workflow based on Ollama or vLLM.
- `apps/api` — NestJS modular API with authentication, RBAC, audit logging, feature flags, domain endpoints, OpenAPI export, and optional PostgreSQL persistence through Drizzle.
- `packages/api-client` — typed client generated from the API OpenAPI contract and embedded into the frontend.
- `infra` — deployment assets for Docker Compose, Keycloak realm export, and database notes.

## Core Capabilities

- Operational dashboard, incident tracking, dispatching, communications, mapping, triage, inventory, planning, analytics, and reporting modules.
- Role-based access control with server-side permission resolution.
- Append-only audit log with chained integrity verification.
- Contract-first frontend/backend integration through the generated API client.
- Local-first AI assistant path using self-hosted runtimes.

## Prerequisites

- Node.js 20+
- npm 10+

## Quick Start

Depuis la RACINE du dépôt, une seule commande lance toute la plateforme
(API + application web). Les dépendances manquantes sont installées au premier
lancement.

```bash
npm run dev
```

- Application web : `http://localhost:3004`
- API : `http://localhost:3005/api` (documentation : `/api/docs`)
- `Ctrl+C` arrête l'ensemble.

Compte Super Administrateur par défaut : `m.zraib` / `ARGOS-2026`
(mot de passe personnel obligatoire à la première connexion).

### Lancer un seul service

```bash
npm run dev:api    # API seule (port 3005)
npm run dev:web    # Application web seule (port 3004)
```

L'application web appelle l'API via `NEXT_PUBLIC_API_URL`
(défaut : `http://127.0.0.1:3005`).

### Installation explicite (optionnel)

```bash
npm run setup      # npm install dans packages/api-client, apps/api, apps/web
```

## Validation Commands

### Web App

```bash
cd apps/web
npm run build
npm run typecheck
```

### API

```bash
cd apps/api
npm run build
npm run typecheck
npm test
```

## Persistence Modes

The API supports two storage modes:

- `DB_DRIVER=memory` — default development mode, no database required
- `DB_DRIVER=postgres` — PostgreSQL/Drizzle persistence

To use PostgreSQL:

```bash
cd apps/api
export DATABASE_URL=postgres://argos:password@localhost:5432/argos
npm run db:generate
npm run db:migrate
DB_DRIVER=postgres AUTH_MODE=dev npm run dev
```

## Repository Notes

- UI copy and documentation in the project are primarily French.
- Local assets are preferred for sovereignty-sensitive runtime resources.
- Do not commit secrets; use `.env.example` files as templates.
