# infra/db — Couche de données (Drizzle / PostgreSQL + PostGIS)

Le **schéma canonique** est désormais dans l'API :
[`apps/api/src/db/schema.ts`](../../apps/api/src/db/schema.ts) (compilé et
typé avec le reste de l'API), avec sa config
[`apps/api/drizzle.config.ts`](../../apps/api/drizzle.config.ts).

## Contenu du schéma

Tables : IAM/RBAC (`roles`, `permissions`, `role_permissions`, `users`,
`user_roles` avec scope ABAC), `feature_flags`, `audit_log` (append-only, chaîné
par hash), structure organisationnelle (`org_zones`, `org_units`,
`org_hospitals` avec géométrie PostGIS `geometry(Point,4326)`).

## Mise en route

```bash
cd apps/api
export DATABASE_URL=postgres://argos:...@localhost:5432/argos   # docker compose up db
npm run db:generate     # génère le SQL des migrations (drizzle/*.sql)
npm run db:migrate      # applique contre Postgres
# Puis lancer l'API en persistance réelle :
DB_DRIVER=postgres AUTH_MODE=dev npm run dev
```

> Activer les extensions dans la base (fournies par `timescale/timescaledb-ha:pg16`) :
> `CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS timescaledb;`
> `audit_log` et les positions temps réel deviennent des hypertables TimescaleDB
> (MASTER_PLAN §5.3).

## Bascule de persistance

L'API lit `DB_DRIVER` : `memory` (défaut, Phase 0, sans base) ou `postgres`
(dépôts Drizzle). Voir `apps/api/src/db/database.module.ts` et les dépôts
`*.memory.repository.ts` / `*.drizzle.repository.ts`.
