# ADR 0007 — Missions : la boucle fermée des gestes opérationnels

- **Statut :** accepté — **lot S1 livré** (module, machine d'états, tests) ;
  branchements P1 à venir
- **Date :** 2026-08-30
- **Portée :** `apps/api/src/modules/missions`, permission `missions:*`

## Contexte

L'évaluation du workflow de gestion de catastrophe (document de doctrine « La
Boucle Fermée », 30/08/2026) a constaté six ruptures de chaîne dans la
plateforme. Toutes ont la même racine : **des gestes à sens unique**.

Le répartiteur engage une unité — l'unité n'a aucun écran pour l'accuser. Un
hôpital saturé ne peut pas demander un moyen. Le triage compte des évacuations
qui ne réservent rien à l'hôpital. Le décès hospitalier ne crée pas
d'admission en morgue. Chaque module fonctionne ; c'est **entre** les modules
que la catastrophe tombe dans un vide.

Le constat structurant : engager une unité, demander un moyen et transférer une
victime sont, du point de vue du commandement, **le même geste** — une demande
qui doit être acceptée, suivie de jalons, et tracée.

## Décision

### 1. Un objet unique : la mission

Un module hexagonal `missions` porte les trois natures (`order`,
`resource_request`, `transfer`) derrière **une seule machine d'états** :

```
issued → accepted → in_progress → completed
   ↓         ↓            ↓
declined  cancelled   cancelled     (motif OBLIGATOIRE)
```

Les modéliser séparément aurait triplé la machine d'états, les tests et les
écrans. `kind` distingue le contexte, `payload` (union discriminée) porte ce
qui lui est propre — le cycle de vie, lui, est unique.

### 2. La règle d'acteur est du DOMAINE, pas du RBAC

Deux gardes distinctes, et c'est délibéré :

- le **RBAC** dit si ce *rôle* peut toucher aux missions (default-deny) ;
- le **domaine** dit si cet *acteur* peut faire *ce* geste sur *cette* mission :
  seul le destinataire accepte, refuse et jalonne ; seul l'émetteur annule.

Sans la seconde, la poignée de main ne prouverait rien : n'importe quel
titulaire de `missions:update` pourrait accuser réception à la place du
destinataire, et l'état affiché à l'état-major deviendrait une fiction. Un
OPCOM parfaitement habilité prend un 403 s'il tente d'accepter pour l'unité.

Le destinataire est résolu depuis la **session** (rôle + entité affectée par
la portée ABAC), jamais depuis le corps de la requête : un client ne peut pas
revendiquer être destinataire d'une boucle.

### 3. Le motif est obligatoire aux refus et aux annulations

Un refus sans motif n'est pas exploitable par le commandement : il ne dit pas
s'il faut réengager ailleurs, escalader ou attendre. Le domaine le refuse.

### 4. Module autonome à ce stade

`missions` n'importe aucun autre module métier et n'est importé par aucun ;
l'adaptateur d'événements est **passif** (journalisation). Brancher le module
ne change donc aucun comportement existant. La phase P1 remplacera cette seule
ligne de la racine de composition par un adaptateur qui écrit dans le fil
d'événements et dans le canal de l'incident.

### 5. Permission `missions` en table LEGACY

Suivant le patron `aviation` et `nrbc` : la conduite (opcom, tacom, cellule
bleue) émet ; les responsables d'entité peuvent accepter, refuser et jalonner
(`VM`, sans `create` tant que les demandes montantes du lot P2-a ne sont pas
ouvertes). La lecture est ouverte à tous les rôles dotés — un responsable doit
pouvoir constater ce qui le concerne. **Aucun rôle ne détient `missions:delete`**
(`expand()` n'émet jamais `delete`).

## Conséquences

**Positives**

- Un seul mécanisme à construire, tester, auditer et apprendre pour les trois
  gestes ; les écrans suivants ne font que le brancher.
- L'audit est gratuit : l'intercepteur global journalise déjà les mutations.
- Les tests d'architecture interdisent structurellement au domaine de dépendre
  d'un détail technique — la règle est vérifiée, pas espérée.

**Négatives — assumées**

- **Une union discriminée pour trois natures** rend le payload moins lisible
  qu'un type par geste ; le compilateur compense, pas la lecture humaine.
- **Deux gardes à comprendre** (RBAC + règle d'acteur) : un 403 peut venir de
  l'une ou de l'autre. Les messages d'erreur les distinguent explicitement.
- **Une ligne de plus en table LEGACY** — trois modules (`aviation`, `nrbc`,
  `missions`) attendent désormais le même arbitrage de matrice.
- Le dépôt in-memory ne connaît pas les transactions : la cascade de
  suppression d'incident (lot G2) n'est pas atomique tant que Postgres n'est
  pas branché.

## Alternatives écartées

**Un module par geste (ordres / demandes / transferts).** Plus lisible pris
isolément, mais il aurait triplé la machine d'états et les tests, et surtout
dispersé la règle « aucune action sans réponse » en trois endroits où elle
aurait divergé. Écarté.

**La règle d'acteur dans le contrôleur.** Techniquement plus simple, mais elle
aurait fait dépendre une règle métier de l'adaptateur HTTP : elle disparaîtrait
au premier pilotage par CLI ou par file de messages. Écarté — elle appartient à
l'agrégat.

**Étendre le module `orders` existant.** Les bons de travail ont leur propre
cycle de vie (approbation, vérification) et leur propre écran. Les fusionner
aurait mélangé deux doctrines pour économiser un dossier. Écarté.
