# @argos/api-client — Client API généré (contract-first)

Client TypeScript typé de l'API ARGOS, **généré depuis l'OpenAPI**. Les écrans du
frontend ne consomment que ce client — jamais de `fetch` écrits à la main
(MASTER_PLAN §4.2 / §4.4).

## Contenu

- `openapi.json` — contrat exporté depuis l'API (`apps/api`, endpoint
  `/api/openapi.json` ou `npm run openapi`).
- `src/openapi.d.ts` — types générés (`openapi-typescript`).
- `src/index.ts` — `createArgosClient({ baseUrl, getToken })` (via `openapi-fetch`).

## Régénérer après un changement d'API

```bash
# 1. exporter le contrat à jour depuis l'API
curl http://localhost:4100/api/openapi.json -o packages/api-client/openapi.json
# 2. régénérer les types
cd packages/api-client && npm run generate
```

## Utilisation (apps/web)

```ts
import { createArgosClient } from "@/lib/api-client";
const api = createArgosClient({ baseUrl: "http://localhost:4100", getToken: () => token });
const { data } = await api.getFlags();
```

> **Copie embarquée.** Turbopack ne résout pas de façon fiable un package `.ts`
> hors de la racine de `apps/web` ; la source de `src/` est donc **recopiée**
> dans `apps/web/src/lib/api-client/` et importée via `@/lib/api-client`. Ce
> package reste la **source canonique + le générateur** : après un changement
> d'API, régénérez ici (`npm run generate`) puis recopiez `src/` dans
> `apps/web/src/lib/api-client/`.
