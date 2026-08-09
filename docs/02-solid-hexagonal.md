# SOLID et architecture hexagonale — le processus appliqué

Ce document décrit **la méthode suivie** pour construire le module `orders`
(bons de travail) en architecture hexagonale avec application stricte du
principe d'inversion des dépendances, puis la transforme en **playbook
réutilisable** pour les modules suivants.

- La **décision** et ses alternatives : [ADR 0003](adr/0003-module-orders-architecture-hexagonale.md).
- Le **résultat** (arborescence, endpoints, cycle de vie) : [README du module](../apps/api/src/modules/orders/README.md).
- Ce document-ci : **comment on y est arrivé, et comment refaire**.

---

## 1. Le problème de départ

Les modules historiques de l'API (`domain`, `iam`) suivent le style NestJS
courant : un service unique qui porte simultanément les règles métier, l'accès
aux données et la persistance.

```ts
// Style historique — apps/api/src/modules/domain/domain.service.ts
import { loadDevState, saveDevState } from "@/common/dev-store"; // ← node:fs

@Injectable()
export class DomainService {
  private readonly hospitals: Hospital[] = [ /* … */ ];

  constructor() {
    const snap = loadDevState("domain", {});   // le service LIT le disque
    // …
  }

  createIncident(input) {
    const d = new Date();                       // dépendance cachée au temps
    const inc = { ...input, id: `INC-${n}`, time };
    this.incidents.unshift(inc);
    this.persist();                             // le service ÉCRIT sur le disque
    return inc;
  }
}
```

Trois conséquences mesurables :

| Symptôme | Cause | Coût |
| --- | --- | --- |
| Migrer vers PostgreSQL = rouvrir le service | le service **connaît** son stockage | risque de régression métier à chaque changement d'infra |
| Tester une règle = démarrer NestJS + tout le module | pas de point d'entrée sans infrastructure | tests lents, cas limites non couverts |
| Cas temporels intestables | `new Date()` appelé en dur | bugs de bord de journée invisibles |

L'objectif n'était pas de refondre l'existant — la contrainte explicite était de
**ne rien casser** — mais d'établir le modèle de référence sur un module neuf.

---

## 2. Le processus, étape par étape

### Étape 1 — Identifier le domaine réel dans l'application

« OrderService » est un nom générique. Première décision : **ne pas inventer un
domaine parallèle**. Recherche dans le dépôt d'un concept d'« ordre » déjà
existant :

```bash
grep -rn "workorder\|bons" apps/web/src/lib/nav.ts apps/api/src/modules/domain/catalog.data.ts
# → apps/web/src/lib/nav.ts:52:  workorders: "/bons-de-travail"
# → catalog.data.ts:96: export const WORK_ORDERS: WorkOrder[] = [...]
```

Le domaine existait : les **bons de travail** (logistique / maintenance), avec un
écran (`/bons-de-travail`), un jeu de données de démonstration et une entrée dans
la matrice des fonctionnalités. Le service a donc été construit **sur ce
vocabulaire**, en conservant les noms de champs déjà consommés par le frontend
(`subject`, `unit`, `assignee`, `priority`, `status`, `sla`, `created`).

> **Règle** — le domaine se découvre dans le produit, il ne s'invente pas. Un
> service dont le vocabulaire ne correspond à rien dans l'application est un
> service que personne ne branchera.

### Étape 2 — Relever les conventions déjà en place

Avant d'écrire, lecture de ce qui existe pour ne pas introduire un cinquième
style :

| Convention relevée | Où | Réutilisée ? |
| --- | --- | --- |
| Interface de dépôt + jeton + `useFactory` sur `DB_DRIVER` | `modules/flags/flags.module.ts` | **oui**, généralisée |
| `@RequirePermission` + gardes globales default-deny | `common/guards/` | **oui**, telle quelle |
| DTO `class-validator` + `@ApiProperty` | `modules/domain/dto.ts` | **oui**, telle quelle |
| Persistance dev par instantané JSON | `common/dev-store.ts` | **oui**, mais **reléguée dans un adaptateur** |
| Service qui appelle directement `dev-store` | `domain.service.ts` | **non** — c'est précisément ce qu'on corrige |

Le pattern port/adaptateur existait donc déjà dans `FlagsModule`. Le travail a
consisté à le **généraliser et le rendre systématique**, pas à l'importer de
l'extérieur.

### Étape 3 — Recenser TOUTES les dépendances à inverser

L'erreur classique est de n'inverser que la base de données. Méthode employée :
lister tout ce qui, dans les cas d'usage, **sort du processus ou n'est pas
déterministe**.

| Dépendance | Symptôme si non inversée | Port créé |
| --- | --- | --- |
| Stockage | migration = réécriture du service | `OrderRepository` |
| Temps (`new Date()`) | tests non déterministes | `Clock` |
| Génération d'identifiant | format figé dans le métier | `OrderIdGenerator` |
| Diffusion d'événements | le service décide *qui* est notifié | `OrderEventPublisher` |

**Heuristique de détection** — une dépendance est à inverser si la phrase
suivante est vraie : *« si je change cette brique, je dois rouvrir le fichier
métier »*. Elle s'applique aussi à `Math.random()`, aux appels HTTP sortants,
au système de fichiers et aux variables d'environnement.

### Étape 4 — Écrire le domaine en premier, sans aucun import

`domain/order.ts` a été écrit avant toute autre couche, avec une contrainte
absolue : **zéro import externe**. Ni NestJS, ni Drizzle, ni `node:fs`, ni un DTO.

Cette contrainte n'est pas esthétique, elle est **structurelle** : une couche qui
n'a aucun moyen de *nommer* un détail technique ne peut pas en dépendre.

Le cycle de vie a été exprimé en **table de données**, pas en cascade de `if` :

```ts
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  requested:  ["approved", "cancelled"],
  approved:   ["assigned", "cancelled"],
  assigned:   ["inprogress", "cancelled"],
  inprogress: ["done", "cancelled"],
  done:       ["verified", "inprogress"],  // renvoi si le contrôle échoue
  verified:   [],
  cancelled:  [],
};
```

Ajouter une étape au workflow se fait dans cette table, sans toucher au service
ni aux adaptateurs — c'est le principe ouvert/fermé rendu concret.

Les erreurs levées sont des **erreurs métier**, jamais des `HttpException` :

```ts
export class OrderTransitionError extends OrderDomainError { /* … */ }
```

Le domaine ignore qu'il sera un jour exposé en HTTP. C'est ce qui permettra de
le piloter depuis une CLI, un consommateur de file ou un test.

### Étape 5 — Définir les ports depuis le BESOIN, pas depuis la base

Point le plus souvent manqué. Un port n'est pas le reflet des capacités de la
base de données ; c'est **ce dont le métier a besoin**, écrit dans le vocabulaire
du métier, et **possédé par la couche métier**.

```ts
// ports/order-repository.port.ts — défini par le métier, pas par l'infra
export interface OrderReader {
  findById(id: string): Promise<OrderSnapshot | null>;
  findAll(query?: OrderQuery): Promise<OrderSnapshot[]>;
  lastSequence(): Promise<number>;
}

export interface OrderWriter {
  save(order: OrderSnapshot): Promise<void>;
}

export type OrderRepository = OrderReader & OrderWriter;
export const ORDER_REPOSITORY = Symbol("ORDER_REPOSITORY");
```

Trois décisions à retenir :

1. **Lecture et écriture séparées** (ségrégation des interfaces). Bénéfice
   immédiat : `SequentialOrderIdGenerator` ne reçoit que `OrderReader` — il n'a
   *structurellement* aucun moyen d'écrire.
2. **Signatures asynchrones même pour l'implémentation mémoire.** Une signature
   synchrone rendrait tout adaptateur réseau non substituable (Liskov).
3. **Jeton `Symbol` plutôt que chaîne.** Aucune collision accidentelle possible
   dans le conteneur d'injection.

### Étape 6 — Écrire le service contre les ports uniquement

```ts
@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ORDER_ID_GENERATOR) private readonly ids: OrderIdGenerator,
    @Inject(ORDER_EVENT_PUBLISHER) private readonly events: OrderEventPublisher,
  ) {}

  async create(input: CreateOrderInput, actor?: string): Promise<OrderSnapshot> {
    const id = await this.ids.next();
    const order = WorkOrder.open({ ...input, id }, this.clock.now(), this.clock.shortLabel());
    return this.commit(order, "order.created", actor);
  }
}
```

Liste **complète** des imports de ce fichier : le domaine, les ports, et
`@nestjs/common` (annotations du conteneur, pas une dépendance métier). Ce
service ignore jusqu'à l'existence d'une base de données.

Un choix explicite dans `commit()` : on **persiste d'abord, on annonce ensuite**,
et un échec de diffusion ne remet pas en cause l'écriture. La règle « on ne
publie que ce qui est écrit » appartient au cas d'usage ; la robustesse de la
diffusion appartient à l'adaptateur.

### Étape 7 — Écrire les adaptateurs en dernier

Deux implémentations du même port, écrites **après** que le contrat soit figé :

- `InMemoryOrderRepository` — `Map` + instantané dev ; c'est **lui** qui importe
  `common/dev-store`, plus le service ;
- `DrizzleOrderRepository` — table `work_orders` ajoutée à `db/schema.ts`.

Plus les adaptateurs techniques : `SystemClock`, `SequentialOrderIdGenerator`,
`LoggingOrderEventPublisher`.

> Le diffuseur d'événements par défaut se contente de **journaliser**. Choix
> délibéré au regard de la contrainte de non-régression : brancher le module ne
> devait modifier aucun comportement observable, donc pas le fil d'événements du
> poste de commandement. Le brancher réellement = un nouvel adaptateur et une
> ligne dans la racine de composition.

### Étape 8 — Concentrer tout le câblage dans UNE racine de composition

`orders.module.ts` est le **seul** fichier du module qui connaisse à la fois les
abstractions et les implémentations :

```ts
{
  provide: ORDER_REPOSITORY,
  inject: [ConfigService, DRIZZLE],
  useFactory: (config, db) =>
    config.get("dbDriver") === "postgres" && db
      ? new DrizzleOrderRepository(db)
      : new InMemoryOrderRepository(),
}
```

Tout le reste du module ne manipule que des ports. **Changer de base de données
est une modification d'une ligne, dans un fichier, sans risque métier.**

### Étape 9 — Prouver le découplage plutôt que l'affirmer

Trois niveaux de preuve, tous automatisés :

**a. Tests unitaires sans infrastructure** — le service est instancié à la main
avec quatre doublures. Aucune base, aucun Docker, aucun conteneur NestJS :

```ts
service = new OrderService(
  new FakeOrderRepository(),   // une Map
  new FrozenClock(),           // temps figé → déterminisme
  new FixedIdGenerator(),
  new RecordingPublisher(),
);
```

Si un jour il fallait démarrer Postgres pour exécuter ce fichier, c'est que le
découplage aurait été rompu. **Le test est le canari.**

**b. Tests de contrat par adaptateur** (Liskov) — écrits une fois contre le
*port*, rejoués contre chaque implémentation :

```ts
const ADAPTERS: [string, () => OrderRepository][] = [
  ["InMemoryOrderRepository", () => new InMemoryOrderRepository()],
  // ajouter ici un adaptateur ⇒ il doit passer les mêmes assertions
];
describe.each(ADAPTERS)("Contrat OrderRepository — %s", (_name, make) => { /* … */ });
```

Ils vérifient les cas limites que les implémentations ont tendance à traiter
différemment : `findById` renvoie `null` et ne lève pas, `save` est idempotent,
le tri est décroissant sur `updatedAt`.

**c. Test d'architecture** — la règle de dépendance est *vérifiée*, pas
seulement documentée. `architecture.spec.ts` lit le code source et échoue si un
import interdit apparaît :

```ts
it("APPLICATION n'importe QUE le domaine, les ports et @nestjs/common", () => {
  for (const file of inLayer("application"))
    for (const spec of importsOf(file))
      expect(spec === "@nestjs/common" || /^@\/modules\/orders\/(domain|ports|application)\//.test(spec)).toBe(true);
});
```

Sans ce test, la règle se dégrade au premier « juste pour dépanner ».

### Étape 10 — Vérifier la non-régression

La contrainte était : *ne pas affecter les fonctionnalités existantes*. Vérifié
point par point, pas supposé :

| Contrôle | Attendu | Constaté |
| --- | --- | --- |
| Suite de tests | 19 verts avant | **50 verts** (19 inchangés + 31 nouveaux) |
| `npm run typecheck` (web + API) | propre | propre |
| Endpoints existants | inchangés | 113 hôpitaux, 6 incidents, 6 unités, catalogue, stats — identiques |
| Permissions de `resp_unit` | 3 permissions | identiques au caractère près |
| Écran `/bons-de-travail` | 7 ouverts / 3 en cours / 1 en retard | identique |

Détail utile : `GET /api/orders/summary` renvoie exactement **7 / 3 / 1** — les
mêmes chiffres que la page calcule aujourd'hui à partir du catalogue statique.
La preuve que le service reproduit fidèlement la sémantique existante avant
même d'être branché.

---

## 3. Correspondance SOLID → décision → fichier

| Principe | Décision concrète | Fichier |
| --- | --- | --- |
| **S** — responsabilité unique | agrégat = invariants · service = orchestration · dépôt = persistance · contrôleur = traduction HTTP. Aucune responsabilité partagée. | `domain/order.ts`, `application/order.service.ts`, `infrastructure/*.repository.ts`, `http/orders.controller.ts` |
| **O** — ouvert/fermé | cycle de vie en **table de données** ; nouveau canal de diffusion = nouvel adaptateur ; nouveau stockage = nouvel adaptateur | `ALLOWED_TRANSITIONS` dans `domain/order.ts` |
| **L** — substitution de Liskov | suite de **tests de contrat** commune, rejouée par adaptateur ; signatures asynchrones partout | `infrastructure/order-repository.contract.spec.ts` |
| **I** — ségrégation des interfaces | `OrderReader` / `OrderWriter` séparés ; le générateur d'ID ne reçoit que `OrderReader` | `ports/order-repository.port.ts`, `infrastructure/sequential-order-id.generator.ts` |
| **D** — inversion des dépendances | le service ne dépend que d'interfaces **définies par le métier**, injectées par jeton ; câblage isolé dans la racine de composition | `application/order.service.ts`, `orders.module.ts` |

### Ce que « strictement » veut dire ici

L'inversion des dépendances est souvent réduite à « injecter une interface ».
Trois exigences supplémentaires ont été tenues :

1. **L'interface appartient au métier.** `OrderRepository` est déclaré dans
   `ports/`, à côté du domaine — pas dans `infrastructure/`. Le module de haut
   niveau *possède* le contrat ; les modules de bas niveau s'y plient.
2. **Aucune fuite de vocabulaire technique.** Le port parle de `OrderSnapshot`
   et de `OrderQuery`, jamais de lignes, de colonnes, de transactions ou de
   `QueryBuilder`.
3. **La règle est exécutable.** Vérifiée par `architecture.spec.ts` à chaque
   exécution de `npm test`.

---

## 4. Playbook pour le prochain module

Checklist condensée, dans l'ordre.

- [ ] **Nommer le domaine** à partir du produit, pas d'un patron générique.
- [ ] **Lire les conventions** existantes (`FlagsModule`, gardes, DTO) avant d'écrire.
- [ ] **Recenser les dépendances à inverser** — stockage, temps, aléa, identifiants, réseau, événements. Test : *« si je change ça, dois-je rouvrir le fichier métier ? »*
- [ ] **Écrire `domain/` en premier**, avec zéro import. Exprimer les règles en tables de données quand c'est possible.
- [ ] **Lever des erreurs métier**, jamais des `HttpException`.
- [ ] **Déclarer les ports dans `ports/`**, depuis le besoin ; séparer lecture et écriture ; signatures asynchrones ; jetons `Symbol`.
- [ ] **Écrire le service** en n'important que domaine + ports + `@nestjs/common`.
- [ ] **Écrire les adaptateurs en dernier** ; un adaptateur par technologie.
- [ ] **Câbler dans un seul `*.module.ts`** ; sélection par `DB_DRIVER`.
- [ ] **Exposer en HTTP** dans `http/` ; traduire les erreurs de domaine en 400 / 404 / 409 en un point unique.
- [ ] **Déclarer les permissions** dans `shared/permissions.ts` et poser `@RequirePermission` sur chaque route (default-deny).
- [ ] **Écrire les trois niveaux de tests** : unitaires avec doublures, contrat par adaptateur, architecture.
- [ ] **Vérifier la non-régression** : suite complète, typechecks, endpoints existants, permissions des rôles non concernés.
- [ ] **Régénérer le contrat** : `npm run openapi` → copier dans `packages/api-client` → `npm run generate` → copier `openapi.d.ts` dans `apps/web`.
- [ ] **Écrire l'ADR** si la décision dévie du `MASTER_PLAN.md`.

### Erreurs à éviter (rencontrées ou évitées de justesse)

| Piège | Conséquence | Parade |
| --- | --- | --- |
| N'inverser que la base | `new Date()` reste en dur, tests non déterministes | recenser **toutes** les dépendances (étape 3) |
| Modeler le port sur l'ORM | le vocabulaire technique remonte dans le métier | écrire le port **avant** l'adaptateur |
| Un seul port « fourre-tout » | les consommateurs héritent de méthodes inutiles | scinder (`Reader` / `Writer`) |
| Dépôt mémoire synchrone | l'adaptateur réseau devient non substituable | `Promise` partout dès le départ |
| Documenter la règle sans la tester | dégradation au premier contournement | `architecture.spec.ts` |
| Refondre l'existant « tant qu'on y est » | régressions hors périmètre | module neuf, existant intact, ADR qui l'assume |

---

## 5. Limites assumées

- **Deux styles coexistent** dans `apps/api` : les modules historiques
  (`domain`, `iam`) et `orders`. Aucune migration rétroactive n'a été engagée —
  la contrainte de non-régression primait. `orders` sert de modèle pour la suite.
- **Le coût en nombre de fichiers est réel** (quatre couches au lieu d'une). Il
  se justifie pour un module appelé à grossir ; il ne se justifierait pas pour
  un simple CRUD de référentiel. Ne pas appliquer ce playbook mécaniquement.
- **`DrizzleOrderRepository` n'est pas couvert par les tests de contrat** : il
  exige un PostgreSQL réel. L'ajouter à la campagne d'intégration se fait par une
  entrée dans le tableau `ADAPTERS`, sans modifier les tests.
- **L'écran `/bons-de-travail` n'est pas branché** sur l'API : il lit toujours le
  catalogue statique. Le brancher est une étape séparée, décidée hors de ce
  travail.
