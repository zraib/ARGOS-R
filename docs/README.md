# Documentation ARGOS

Index de la documentation technique. Point d'entrée du dépôt :
[`../README.md`](../README.md).

## Parcours de lecture

| # | Document | Pour qui / quand |
| --- | --- | --- |
| 1 | [Architecture](01-architecture.md) | comprendre les composants, les flux et les frontières |
| 2 | [SOLID et architecture hexagonale](02-solid-hexagonal.md) | **le processus appliqué** au module `orders` + playbook pour les modules suivants |
| 3 | [Référence API](03-api.md) | tous les endpoints et leurs permissions |
| 4 | [Sécurité](04-securite.md) | RBAC, 12 rôles, permissions, audit chaîné, souveraineté |
| 5 | [Application web](05-frontend.md) | écrans, store, i18n, carte, conventions front |
| 6 | [Guide de développement](06-developpement.md) | commandes, variables, tests, dépannage |
| 7 | [Performance](07-performance.md) | la campagne d'optimisation : méthode de mesure, leviers, avant/après |
| 8 | [Workflow opérationnel](08-workflow-operationnel.md) | **la boucle fermée** : comment le travail circule entre l'état-major et le terrain |

## Décisions d'architecture

[Index des ADR](adr/README.md) — une décision par fichier, avec contexte,
conséquences et alternatives écartées.

## Documents hors de ce dossier

| Document | Rôle | Fréquence de changement |
| --- | --- | --- |
| [`../MASTER_PLAN.md`](../MASTER_PLAN.md) | vision produit, architecture cible, rôles, modules, phases | rare — c'est la spécification |
| [`../CLAUDE.md`](../CLAUDE.md) | règles permanentes de travail dans le dépôt | rare |
| [`../CONTEXT.md`](../CONTEXT.md) | journal de session : ce qui a été fait, passe par passe | à chaque session |
| [`../apps/api/README.md`](../apps/api/README.md) | spécificités de l'API | à l'évolution de l'API |
| [`../apps/web/README.md`](../apps/web/README.md) | spécificités du frontend | à l'évolution du web |
| [`../apps/api/src/modules/orders/README.md`](../apps/api/src/modules/orders/README.md) | module `orders` en détail | à l'évolution du module |

## Ressources

- `matrice-roles-fonctionnalites.xlsx` — matrice 12 rôles × 22 fonctionnalités
  (cellules OUI/NON), **à remplir** puis à reporter dans `ROLE_PERMISSIONS` et
  dans l'onglet « Rôles & fonctionnalités » de l'application.
- `../design_handoff_argos/` — référence de design haute-fidélité, à lire comme
  une spécification (son runtime de prototype n'est pas réutilisé).

## Tenir cette documentation à jour

| Si vous modifiez… | Mettez à jour… |
| --- | --- |
| un endpoint, un DTO | [03-api.md](03-api.md) **et** le client généré |
| une permission, un rôle | [04-securite.md](04-securite.md) |
| mesurer/optimiser la performance | [07-performance.md](07-performance.md) |
| un écran, une route web | [05-frontend.md](05-frontend.md) |
| une commande, une variable d'environnement | [06-developpement.md](06-developpement.md) |
| une frontière ou un composant | [01-architecture.md](01-architecture.md) |
| une décision qui dévie du MASTER_PLAN | un nouvel [ADR](adr/README.md) |
| n'importe quoi, en fin de session | [`../CONTEXT.md`](../CONTEXT.md) |
