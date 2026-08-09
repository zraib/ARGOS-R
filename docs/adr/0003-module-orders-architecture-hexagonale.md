# ADR 0003 — Module `orders` : architecture hexagonale et inversion des dépendances

- **Statut :** accepté
- **Date :** 2026-08-09
- **Portée :** `apps/api/src/modules/orders` (nouveau), `apps/api/src/db/schema.ts`
  (table `work_orders`), `apps/api/src/shared/permissions.ts` (permissions
  `workorders:*`)

## Contexte

Les modules existants de l'API (`domain`, `iam`) suivent le style NestJS
courant : un service qui porte à la fois les règles métier, l'accès aux données
et la persistance dev (`loadDevState` / `saveDevState` appelés depuis le
service). C'est efficace pour un prototype, mais cela crée trois problèmes qui
deviendront coûteux à la mise en production :

1. **Couplage à la persistance.** `DomainService` importe `common/dev-store`
   (donc `node:fs`). Le passage à PostgreSQL suppose de rouvrir le service.
2. **Testabilité.** Vérifier une règle métier suppose de démarrer le module
   NestJS complet ; les tests actuels sont des tests HTTP de bout en bout.
3. **Non-déterminisme.** `new Date()` est appelé directement dans les services,
   ce qui rend les cas limites temporels difficiles à couvrir.

Le besoin fonctionnel — un service de **bons de travail** (module « Bons de
travail » du frontend, `MASTER_PLAN` §6, écran `/bons-de-travail`) — est
l'occasion d'établir le modèle de référence pour les modules à venir, sans
toucher à l'existant.

## Décision

Le module `orders` est construit en **architecture hexagonale** (ports et
adaptateurs), avec une règle de dépendance stricte, dirigée vers l'intérieur :

```
http/ · infrastructure/   →   application/   →   ports/   →   domain/
(adaptateurs)                 (OrderService)   (interfaces)  (règles métier)
```

### Découpage

| Couche | Contenu | Dépendances autorisées |
| --- | --- | --- |
| `domain/` | agrégat `WorkOrder`, table de transitions, erreurs métier | **aucune** |
| `ports/` | `OrderRepository`, `Clock`, `OrderIdGenerator`, `OrderEventPublisher` | `domain` |
| `application/` | `OrderService` (cas d'usage) | `domain`, `ports`, `@nestjs/common` |
| `infrastructure/` | dépôts mémoire et Drizzle, horloge système, générateur d'ID, diffuseur | tout |
| `http/` | contrôleur, DTO, traduction erreurs → codes HTTP | tout |

### Application des principes SOLID

- **SRP** — l'agrégat détient les invariants, le service orchestre, le dépôt
  persiste, le contrôleur traduit HTTP. Aucune de ces responsabilités n'est
  partagée entre deux fichiers.
- **OCP** — le cycle de vie est une **table de données** (`ALLOWED_TRANSITIONS`)
  et non une cascade de `if` : ajouter une étape ne modifie ni le service ni les
  adaptateurs. Ajouter un canal de diffusion d'événements = un nouvel adaptateur.
- **LSP** — les adaptateurs de persistance sont vérifiés par une **suite de
  tests de contrat** commune (`order-repository.contract.spec.ts`), écrite
  contre le port et exécutée contre chaque implémentation.
- **ISP** — le port de persistance est scindé en `OrderReader` / `OrderWriter`.
  `SequentialOrderIdGenerator` ne dépend que de `OrderReader` : il n'a
  structurellement aucun moyen d'écrire.
- **DIP** — `OrderService` ne dépend que d'interfaces, injectées par jeton
  (`Symbol`). Il n'importe ni `drizzle-orm`, ni `pg`, ni `node:fs`, ni un DTO
  HTTP. L'interface est **définie par le métier**, pas par la couche technique.

### Choix de l'implémentation

La **racine de composition** (`orders.module.ts`) est le seul fichier qui
connaît à la fois les ports et les adaptateurs. Elle choisit le dépôt à la
lecture de `DB_DRIVER` — `InMemoryOrderRepository` (défaut) ou
`DrizzleOrderRepository` (`postgres`), exactement comme `FlagsModule` déjà en
place. Basculer de base ne modifie ni le service, ni le domaine, ni le
contrôleur.

### Contrainte vérifiée, pas seulement documentée

`architecture.spec.ts` lit le code source du module et **échoue** si une couche
interne importe une couche externe. La règle de dépendance est donc appliquée
par la CI, pas par la discipline.

## Conséquences

**Positives**

- Les règles métier des bons de travail sont couvertes par des tests unitaires
  qui s'exécutent **sans base, sans Docker et sans conteneur NestJS**.
- Le passage à PostgreSQL est un changement d'une ligne dans un seul fichier.
- Le domaine étant sans dépendance, il pourra migrer tel quel vers
  `packages/shared` si le frontend doit un jour rejouer les mêmes invariants.

**Négatives**

- Plus de fichiers qu'un service NestJS classique (quatre couches au lieu d'une).
  Le coût est assumé pour un module destiné à grossir ; il ne serait pas
  justifié pour un simple CRUD de référentiel.
- Deux styles coexistent temporairement dans `apps/api` : les modules
  historiques (`domain`, `iam`) et ce module. **Aucune migration rétroactive
  n'est engagée** — l'exigence explicite était de ne pas altérer les
  fonctionnalités existantes. `orders` sert de modèle pour les modules suivants.

## Impact sur l'existant

Volontairement nul :

- `OrdersModule` n'importe aucun module métier et n'est importé par aucun ;
  seul `app.module.ts` l'enregistre.
- L'adaptateur d'événements par défaut se contente de journaliser : le fil
  d'événements du poste de commandement est inchangé.
- Les permissions `workorders:*` sont **ajoutées** au catalogue et attribuées à
  `superadmin` (via `*`), `admin` (lecture), `greencell` et `resp_equipment`
  (pilotage). Aucune permission existante n'est retirée ni déplacée, et les
  dotations des autres rôles sont inchangées — la gate de sécurité Phase 0
  passe sans modification.
- L'écran `/bons-de-travail` continue de lire le catalogue statique. Le brancher
  sur `GET /api/orders` est une étape séparée, à décider (les indicateurs servis
  par `GET /api/orders/summary` reproduisent déjà à l'identique ceux calculés
  aujourd'hui par la page : 7 ouverts / 3 en cours / 1 en retard).

## Alternatives écartées

- **Suivre le style existant** (service unique appelant `dev-store`) : reconduit
  les trois problèmes du contexte sur un module appelé à devenir central en
  logistique.
- **Repository générique `Repository<T>`** : mutualise le code mais impose aux
  consommateurs des méthodes qu'ils n'utilisent pas (violation d'ISP) et fuit
  le vocabulaire de la persistance dans le métier.
- **Refondre `domain` et `iam` dans la foulée** : hors périmètre et contraire à
  l'exigence de non-régression fonctionnelle.
