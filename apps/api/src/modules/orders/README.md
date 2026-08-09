# Module `orders` — bons de travail

Service de gestion des **bons de travail** (module « Bons de travail » du poste
de commandement), construit en **architecture hexagonale**. Décision et
justification : [ADR 0003](../../../../../docs/adr/0003-module-orders-architecture-hexagonale.md).

## Règle de dépendance

Les flèches vont **toujours vers l'intérieur**. Aucune couche interne ne connaît
une couche externe.

```
        http/                infrastructure/
   (contrôleur, DTO)   (mémoire, Drizzle, horloge, ID, événements)
          │                          │
          └──────────┬───────────────┘
                     ▼
              application/          OrderService — cas d'usage
                     ▼
                 ports/             interfaces + jetons d'injection
                     ▼
                 domain/            WorkOrder, transitions, erreurs
                                    (zéro import externe)
```

`architecture.spec.ts` vérifie cette règle en lisant le code source : un import
interdit fait échouer la campagne de tests.

## Arborescence

| Fichier | Rôle |
| --- | --- |
| `domain/order.ts` | agrégat `WorkOrder` : invariants et table de transitions |
| `domain/order-errors.ts` | erreurs métier (jamais des `HttpException`) |
| `ports/order-repository.port.ts` | `OrderReader` + `OrderWriter` + jeton `ORDER_REPOSITORY` |
| `ports/clock.port.ts` | horloge injectable (déterminisme des tests) |
| `ports/order-id.port.ts` | génération d'identifiants |
| `ports/order-events.port.ts` | diffusion d'événements métier |
| `application/order.service.ts` | **OrderService** — dépend uniquement des ports |
| `infrastructure/in-memory-order.repository.ts` | dépôt mémoire (+ instantané dev) |
| `infrastructure/drizzle-order.repository.ts` | dépôt PostgreSQL (table `work_orders`) |
| `http/orders.controller.ts` | adaptateur HTTP + traduction des erreurs |
| `orders.module.ts` | **racine de composition** : seul point qui câble ports ↔ adaptateurs |

## Cycle de vie d'un bon

```
requested ──▶ approved ──▶ assigned ──▶ inprogress ──▶ done ──▶ verified
    │            │            │             │            │
    └────────────┴────────────┴─────────────┘            │
                    cancelled                            │
                                        inprogress ◀─────┘  (contrôle refusé)
```

- `verified` et `cancelled` sont **terminaux** : plus aucune mutation acceptée.
- `assigned`, `inprogress`, `done`, `verified` exigent un **exécutant désigné**.
- L'annulation exige un **motif**.

## Endpoints

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/api/orders?status=&priority=&unit=&assignee=&incidentId=` | `workorders:read` |
| `GET` | `/api/orders/summary` | `workorders:read` |
| `GET` | `/api/orders/:id` | `workorders:read` |
| `POST` | `/api/orders` | `workorders:create` |
| `PATCH` | `/api/orders/:id` | `workorders:update` |
| `PATCH` | `/api/orders/:id/assignee` | `workorders:assign` |
| `PATCH` | `/api/orders/:id/status` | `workorders:update` |
| `PATCH` | `/api/orders/:id/cancel` | `workorders:update` |

Erreurs de domaine → HTTP : validation `400`, introuvable `404`, transition
interdite `409`.

## Changer de persistance

Une seule ligne, dans `orders.module.ts` :

```ts
provide: ORDER_REPOSITORY,
useFactory: (config, db) =>
  config.get("dbDriver") === "postgres" ? new DrizzleOrderRepository(db) : new InMemoryOrderRepository(),
```

Ni `OrderService`, ni le domaine, ni le contrôleur ne changent. Pour un nouveau
support (autre SGBD, API distante), il suffit d'écrire une classe qui implémente
`OrderRepository` et de la faire passer par
`infrastructure/order-repository.contract.spec.ts`.

## Tests

```bash
npm test --prefix apps/api
```

- `application/order.service.spec.ts` — cas d'usage, **sans base ni conteneur DI** ;
- `infrastructure/order-repository.contract.spec.ts` — contrat du port, rejoué par adaptateur ;
- `http/orders.authz.spec.ts` — RBAC default-deny et cycle de vie via HTTP ;
- `architecture.spec.ts` — règle de dépendance.
