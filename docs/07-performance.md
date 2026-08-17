# 7 · Performance — la campagne d'optimisation et sa méthode

Ce document consigne la campagne d'optimisation menée sur ARGOS : ce qui a été
mesuré, ce qui a été changé, ce que chaque changement a rapporté, et — tout
aussi important — les constats qui se sont **effondrés** une fois mesurés. Le
journal brut de l'audit, constat par constat, est dans
[`PERF_AUDIT.md`](../PERF_AUDIT.md) à la racine.

## Le résultat en une ligne

**JavaScript initial de chaque route : ~1 348 Ko → 820 Ko (−39 %)**, latence
API < 2 ms, transferts répétés ramenés à 0 octet (rejeu ETag 304), sans
changer un seul comportement visible.

| Étape | Graphe initial `/dashboard` | Levier |
|---|---:|---|
| Départ | ~1 348 Ko *(déduit du graphe d'imports)* | — |
| F-01 | **1 035 Ko** *(mesuré)* | rendu Markdown différé |
| F-11 + F-12 + F-05 | **831 Ko** *(mesuré)* | i18n par langue · corps du Copilot différé · cache HTTP |
| F-04 *(branche `fusion`)* | **820 Ko** *(mesuré)* | moteur de risques côté serveur |

## La méthode — mesurer avant de toucher

La règle de la campagne : **aucune correction sans mesure préalable**, parce que
les intuitions se sont trompées une fois sur deux (voir « Ce qui est tombé »).

L'instrument principal ne demande aucun serveur : le HTML prérendu du build de
production liste les chunks du graphe initial de chaque route.

```bash
npm run build --prefix apps/web
# puis, dans apps/web/.next :
python3 - <<'PY'
import re, os
html = open("server/app/dashboard.html", encoding="utf8", errors="ignore").read()
refs = sorted(set(re.findall(r'static/chunks/[A-Za-z0-9_\-\.]+\.js', html)))
total = sum(os.path.getsize(r) for r in refs if os.path.exists(r))
print(len(refs), "chunks ·", total // 1024, "Ko")
PY
```

Pour savoir si une bibliothèque est dans le graphe d'une route, on sonde une
chaîne qui lui est propre (`micromark`, « Taux d'occupation global »…) dans les
chunks référencés. C'est ainsi que chaque gain ci-dessous a été prouvé.

## Les leviers appliqués

### F-01 — Le rendu Markdown quitte le graphe initial (−313 Ko)

`react-markdown` et sa filière (micromark, hast, mdast) étaient importés
statiquement par le Copilot, lui-même monté par la coquille sur chaque écran :
313 Ko payés sur toutes les routes pour une modale fermée par défaut. Le rendu
vit désormais dans [`CopilotMarkdown.tsx`](../apps/web/src/components/shell/CopilotMarkdown.tsx)
derrière `React.lazy`, avec le texte brut en repli — il ne se charge qu'au
premier message de l'assistant.

### F-12 — Le corps du Copilot se charge au premier ⌘K

Dans la même logique, poussée plus loin : `Copilot.tsx` ne garde que le bouton
flottant ; le tiroir complet ([`CopilotBody.tsx`](../apps/web/src/components/shell/CopilotBody.tsx),
avec `lib/ai/assistant.ts` — ~3 800 lignes cumulées) se charge à la première
ouverture **et reste monté ensuite**, pour que l'historique de conversation
survive à la fermeture. Les moteurs IA asynchrones (`modelPredictor`,
`situational`) passent en import-au-premier-usage dans le store.

### F-11 — Une seule langue chargée, pas trois (−~95 Ko)

Les dictionnaires portaient français, anglais et arabe dans un même chunk du
graphe initial : un opérateur francophone téléchargeait deux langues qu'il
n'ouvrirait jamais. Ils sont découpés en un fichier par langue
(`translations.{fr,en,ar}.ts`, `modules.{fr,en,ar}.ts`) plus un chargeur ;
seul le français, langue par défaut, reste lié statiquement.

Le point délicat était le RTL : `setLang` **charge d'abord** la langue demandée,
**puis** commit le dictionnaire et `lang` dans un seul `set()`. Ainsi
`dir="rtl"` ne peut jamais s'appliquer avant que les libellés arabes n'existent
— la bascule est atomique, vérifiée à l'écran dans les deux sens.

### F-05 — Cache HTTP explicite : revalider, jamais périmer

Sur un poste de commandement, un cache TTL serait un risque opérationnel (une
situation périmée affichée comme fraîche). Le choix est donc **ETag +
`no-cache`** ([`apps/api/src/main.ts`](../apps/api/src/main.ts)) : le client
revalide à **chaque** requête, le serveur répond `304` corps vide quand rien
n'a changé. Fenêtre de péremption : **nulle**. Mesuré : `/hospitals` passe de
31 Ko par navigation à 0 octet tant que la donnée ne bouge pas.

### F-03 — Une sérialisation de moins par question au Copilot

Le constructeur de prompt re-sérialisait ~12 000 caractères déjà sérialisés par
la boucle de troncature, sur le thread principal, juste avant l'appel réseau.
Substitution stricte : même chaîne, même prompt.

### F-04 — Le moteur de risques calcule côté serveur *(branche `fusion`)*

Le moteur déterministe de prédiction (branche IA) tournait dans **chaque**
navigateur, à chaque affichage du tableau de bord — N calculs identiques pour
N opérateurs. Porté à l'identique dans l'API
([`risk.engine.ts`](../apps/api/src/modules/domain/risk.engine.ts), endpoint
`GET /api/dashboard/risk`), il tourne une fois sur les données faisant foi :
**1,5 ms** de calcul, mémo 5 s, enveloppe exposant `computeMs`/`cached`, trois
tests de fidélité (déterminisme compris), chemin LLM intact côté client.

> **Statut : en validation.** Ce levier vit sur la branche `fusion`, en attente
> de la revue d'Oumaima Taheri, auteure du moteur — comparaison propre en un
> commit sur `main...fusion`. Ne pas fusionner sans son accord.

## Ce qui est tombé une fois mesuré — à relire avant tout futur audit

La moitié des constats initiaux n'a pas survécu à la mesure. Les garder ici
vaut avertissement de méthode :

- **« MapLibre fuit sur toutes les routes » (F-06) — faux.** Les 768 Ko de
  MapLibre n'apparaissent dans le graphe initial d'aucune route, pas même
  `/map` : l'import dynamique en place faisait déjà son travail.
- **« Découper `assistant.ts` allégerait le bundle » (F-02) — faux.** Le module
  n'avait que deux consommateurs, tous deux nécessaires à l'exécution ; le
  découpage ne retirait pas un octet. (Le gain est venu autrement : F-12 l'a
  sorti du graphe initial *entier*, sans le découper.)
- **La première solution proposée pour F-01 n'aurait rien gagné** — rendre
  `<Copilot>` dynamique dans la coquille charge quand même au rendu. C'est le
  rendu Markdown qu'il fallait différer.
- **Déjà bien fait avant la campagne** : streaming des réponses LLM, budget de
  tokens borné par troncature progressive, délai de garde `AbortController`.

## Ce qui reste au carnet

| Constat | Rang | Note |
|---|---|---|
| 82 % de composants clients (F-07) | MEDIUM | arbitrage d'architecture (session JWT côté client) — projet, pas correction |
| N+1 latent au passage Drizzle (F-08) | MEDIUM | préventif : prévoir des méthodes groupées au contrat des ports |
| `<img>` non optimisée, code mort (F-09/F-10) | LOW | nettoyage opportuniste |

## Vérifier qu'on n'a pas régressé

```bash
npm run typecheck && npm test        # 96/96 attendus (main : 93/93)
npm run build                        # puis la sonde ci-dessus sur .next
```

Toute nouvelle bibliothèque lourde doit être interrogée avec la même sonde
**avant** fusion : si elle apparaît dans le graphe initial d'une route qui ne
l'utilise pas à l'ouverture, elle doit passer derrière un import différé.
