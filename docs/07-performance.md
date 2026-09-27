# 7 · Performance — la campagne d'optimisation et sa méthode

Ce document consigne les campagnes d'optimisation menées sur ARGOS : ce qui a
été mesuré, ce qui a été changé, ce que chaque changement a rapporté, et — tout
aussi important — les constats qui se sont **effondrés** une fois mesurés. Le
journal brut de la première campagne, constat par constat, est dans
[`PERF_AUDIT.md`](../PERF_AUDIT.md) à la racine ; la seconde (27 septembre 2026)
est décrite plus bas et dans l'[ADR 0038](adr/0038-performances-chargement-carte-rechargements.md).

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

## Deuxième campagne — 27 septembre 2026 (ADR 0038)

Même règle — mesurer avant de toucher —, mais on ne mesure plus seulement ce
qui se télécharge : on mesure ce que le poste **fait**. Une page de commandement
reste ouverte toute la journée ; ce qu'elle consomme au repos, à chaque
événement temps réel et à chaque clic compte autant que son chargement.

### Les bancs (`scripts/perf/`)

Ils mesurent le **build de production** (sortie autonome, `node server.js`),
branché sur l'API en mode développement (jeton sans mot de passe, données de
démonstration), dans un Chrome réel piloté par `playwright-core`, processeur
bridé ×4 (un poste modeste), contexte neuf à chaque passage, médiane des
passages. Réglages et prérequis en tête de `scripts/perf/commun.mjs`.

```bash
# build de production servi à part (ex. port 3015), API de dev sur 3005
PLAYWRIGHT_CORE=…/playwright-core/index.mjs node scripts/perf/bench-web.mjs   http://127.0.0.1:3015 web.json
PLAYWRIGHT_CORE=…/playwright-core/index.mjs node scripts/perf/bench-carte.mjs http://127.0.0.1:3015 carte.json
python3 scripts/perf/bench-api.py api.json                                      # API directe
ARGOS_API=http://localhost ARGOS_TOKEN=… python3 scripts/perf/bench-api.py api-proxy.json   # derrière Traefik
ARGOS_SOURCEMAPS=1 npm run build --prefix apps/web && python3 scripts/perf/attribution.py apps/web/.next dashboard
```

- `bench-web.mjs` : chargement à froid de six écrans (FCP, LCP, données
  affichées, TBT, JavaScript transféré, requêtes, tas, DOM), rechargement temps
  réel carte ouverte, clics sur des marqueurs (INP) ;
- `bench-carte.mjs` : tas retenu après ramasse-miettes, coût processeur d'un
  rechargement temps réel, et la carte **au repos** — processeur occupé et
  **images dessinées** en 10 s, avec et sans séismes ;
- `bench-api.py` : les vingt lectures du domaine, brutes et compressées ;
- `attribution.py` : chaque octet du code initial d'une route attribué à son
  module (cartes des sources décodées).

### Résultats

Mesuré le 27 septembre 2026 : build de production d'avant la campagne (`91e6a25`)
contre build d'après, sur le même poste, dans la même fenêtre de temps (un
premier passage perturbé par une charge passagère de la machine — TTFB ×3 — a
été écarté et rejoué).

**Chargement à froid** (médiane de 5, processeur bridé ×4, cache vide) — JavaScript transféré, requêtes, temps de blocage (TBT), données affichées :

| Écran | JS transféré | Requêtes | TBT | Données affichées | LCP | Tas JS |
|---|---:|---:|---:|---:|---:|---:|
| `/dashboard` | 766 → **365 Ko** (-52 %) | 157 → **61** | 129 → **107 ms** | 655 → **562 ms** | 524 → **500 ms** | 13.9 → **9.4 Mo** |
| `/map` | 793 → **617 Ko** (-22 %) | 163 → **68** | 159 → **143 ms** | 787 → **756 ms** | 472 → **460 ms** | 24.9 → **21.5 Mo** |
| `/incidents` | 766 → **377 Ko** (-51 %) | 156 → **60** | 35 → **15 ms** | 523 → **497 ms** | 536 → **508 ms** | 13.2 → **10.7 Mo** |
| `/hospinet` | 766 → **394 Ko** (-49 %) | 156 → **61** | 65 → **40 ms** | 534 → **501 ms** | 560 → **528 ms** | 12.5 → **10.8 Mo** |
| `/opsnet` | 766 → **374 Ko** (-51 %) | 156 → **62** | 52 → **31 ms** | 500 → **476 ms** | 432 → **420 ms** | 12.5 → **10.3 Mo** |
| `/morgue` | 766 → **373 Ko** (-51 %) | 158 → **64** | 23 → **0 ms** | 460 → **475 ms** | 400 → **392 ms** | 12.5 → **10.4 Mo** |

**Carte** (processeur bridé ×4) :

| Mesure | Avant | Après |
|---|---:|---:|
| Images dessinées en 10 s au repos, sans séisme | 600 | **1** |
| Processeur occupé en 10 s au repos, sans séisme | 2161 ms | **741 ms** (-66 %) |
| Images dessinées en 10 s au repos, séismes affichés | 600 | **150** |
| Processeur occupé en 10 s au repos, séismes affichés | 2201 ms | **1332 ms** (-39 %) |
| Processeur en 3 s de fond (sondages, animations) | 812 ms | **482 ms** (-41 %) |
| Coût net d'un rechargement temps réel | 73 ms | **44 ms** |
| Clic sur un marqueur : INP (tâches longues) | 88 ms (56 ms) | **72 ms (0 ms)** |
| Tas JS retenu après ramasse-miettes | 14.4 Mo | **12.5 Mo** (-13 %) |

**API** — les vingt lectures du domaine (au démarrage et à chaque événement « domain ») : **270 Ko → 58 Ko** sur le réseau à travers Traefik (-79 %) ; `/api/reference` seule : 161 Ko → 27 Ko. Le flux temps réel n'est pas compressé (vérifié : l'événement arrive au fil de l'eau).

**Graphe initial de chaque route** (le code que le HTML prérendu fait charger ;
sonde de la première campagne) :

| Route | Code initial (brut) | Compressé (gzip) |
|---|---:|---:|
| `/dashboard` | 1206 → **1049 Ko** | 367 → **317 Ko** (-13.8 %) |
| `/map` | 2008 → **1869 Ko** | 582 → **539 Ko** (-7.5 %) |
| `/incidents` | 1238 → **1085 Ko** | 379 → **329 Ko** (-13.1 %) |
| `/hospinet` | 1294 → **1145 Ko** | 394 → **345 Ko** (-12.3 %) |
| `/opsnet` | 1243 → **1087 Ko** | 376 → **325 Ko** (-13.5 %) |
| `/morgue` | 1239 → **1080 Ko** | 376 → **324 Ko** (-13.8 %) |

Le JavaScript *transféré* baisse bien plus que le graphe initial : l'essentiel
de l'écart venait du préchargement de toutes les routes du menu (72 requêtes,
MapLibre compris, sur chaque page).

**Fenêtres, première ouverture** — chronométrée dans la page, du clic à la
fenêtre présente, médiane de 5 :

| Fenêtre | Avant | Après |
|---|---:|---:|
| Briefing | 303 ms | **3 ms** |
| Copilot | 323 ms | **20 ms** |
| Assistant de déclaration | 3 ms | **40 ms** — monté à la première ouverture au lieu de l'être sur chaque page ; ouvertures suivantes : comme avant |

**Parcours fonctionnel** sur le build de production : aucune route préchargée à
l'affichage (avant : 72) ; survol → route préchargée, navigation au clic en
~240 ms (inchangée) ; 18 scripts au premier écran (avant : 42) ; aucun marqueur
recréé par un rechargement, neutre ou réel (avant : 64 à chaque fois) ;
changement réel à l'écran en ~30 ms ; croquis conservés après un aller-retour
sur la carte ; simulations feu et crue lancées ; aucune erreur JavaScript.

### Ce que la mesure a appris — à relire avant tout futur chantier

- **`React.lazy` coûte 300 ms à la première ouverture**, même code déjà
  téléchargé : React 19 retient la révélation d'un contenu suspendu. Pour une
  fenêtre qu'on ouvre d'un clic, `lib/differe.ts` (code chargé à part, rendu
  sans Suspense).
- **Une carte MapLibre au repos doit dessiner zéro image.** Trois pièges
  mesurés : une source `canvas` animée force une image à chaque rafraîchissement
  de l'écran, couche masquée comprise ; réécrire une propriété qui dépend des
  données (`["get", …]`) **redécoupe toute la source** — animer par
  `feature-state` ; et toute image dessinée moins de `fadeDuration` après le
  dernier placement des étiquettes en relance une autre.
- **Le préchargement des liens se paie sur chaque page** : 72 requêtes pour un
  menu de trente entrées. À l'intention (survol, focus, toucher), la navigation
  reste aussi rapide (~240 ms mesurés dans les deux cas).
- **Remplacer une liste par une copie identique redessine tout ce qui
  l'écoute** : garder l'objet quand l'ETag n'a pas bougé.
- **Un marqueur DOM se met à jour, il ne se recrée pas** — et on ne réécrit pas
  `className` d'un élément que MapLibre a décoré (l'étiquette de croquis quittait
  la carte).

## Ce qui reste au carnet

| Constat | Rang | Note |
|---|---|---|
| 82 % de composants clients (F-07) | MEDIUM | arbitrage d'architecture (session JWT côté client) — projet, pas correction |
| N+1 latent au passage Drizzle (F-08) | MEDIUM | préventif : prévoir des méthodes groupées au contrat des ports |
| `<img>` non optimisée (F-09) | LOW | nettoyage opportuniste |
| Pulsation sismique en animation CSS | LOW | plus aucune image de carte au repos avec séismes ; +100 marqueurs DOM à déplacer à chaque mouvement de carte — à mesurer avant |
| ~280 exports utilisés dans leur seul fichier (`knip`) | LOW | vivants, simplement trop exportés — à retirer au fil des passages |

## Vérifier qu'on n'a pas régressé

```bash
npm run typecheck && npm test        # 590 tests API + 251 tests web (27 septembre 2026)
npm run build                        # puis la sonde ci-dessus sur .next
```

Puis les bancs de `scripts/perf/` (section « Deuxième campagne ») sur le build
de production, comparés à ceux du dernier build livré.

Toute nouvelle bibliothèque lourde doit être interrogée avec la même sonde
**avant** fusion : si elle apparaît dans le graphe initial d'une route qui ne
l'utilise pas à l'ouverture, elle doit passer derrière un chargement différé —
`lib/differe.ts`, pas `React.lazy` (voir « Deuxième campagne »). Et toute
animation sur la carte doit passer le banc de la carte : au repos, la carte ne
dessine rien.
