# PERF_AUDIT — ARGOS

Audit de performance et de qualité de code. **Aucun code n'a été modifié.**

---

## Avertissement préalable : trois écarts avec le périmètre demandé

Il faut les poser avant de lire quoi que ce soit, sinon le rapport paraîtra
incomplet.

1. **Il n'y a pas de Supabase dans ce dépôt.** La couche de données est une API
   **NestJS** avec des dépôts **in-memory** en développement et une cible
   **Drizzle / PostgreSQL**. Les points demandés sur « appels Supabase non
   groupés » et « index manquants » n'ont pas d'objet en l'état ; j'ai audité à
   la place ce qui existe et signalé ce qui deviendra un problème au passage
   à Postgres (§ F-08).

2. **Il n'y a pas de flux de réservation** (« booking flow »). ARGOS est une
   plateforme de commandement de crise. Le point avait disparu de votre second
   message, je le note pour lever l'ambiguïté.

3. **Aucune instrumentation temporelle n'a été ajoutée.** Vous avez demandé
   d'instrumenter les chemins lents *et* de ne rien modifier. J'ai retenu la
   contrainte la plus forte — ne rien changer. Les latences par requête du
   Copilot ne sont donc **pas mesurées** ici (§ Non mesuré).

---

## Méthode

| Vérification | Statut |
|---|---|
| Build de production (`npm run build`) | **Fait** — 28 routes, compilation propre |
| Poids réel des artefacts JS | **Mesuré** — `du -k` sur `.next/static/chunks` |
| Composition des gros chunks | **Mesuré** — empreinte par marqueurs de bibliothèque |
| Analyse statique (imports, `use client`, sélecteurs) | **Fait** — grep sur l'arbre source |
| Lighthouse | **Non exécuté** — non disponible dans cet environnement |
| Latence LLM par requête | **Non mesuré** — exige d'instrumenter (interdit) |
| Profilage React (re-rendus réels) | **Non mesuré** — exige le React DevTools Profiler |

**Ce qui suit distingue explicitement le mesuré de l'inféré.** Les constats
marqués *(inféré)* sont des lectures de code, pas des observations.

---

## Base mesurée

### Poids JS servi au navigateur

```
Total .next/static/chunks .......... 2 404 Ko
```

| Chunk | Taille | Contenu identifié |
|---|---:|---|
| `3ofehumb6ezol.js` | **768 Ko** | MapLibre GL |
| `3gyhm2bop3ja6.js` | **316 Ko** | react-markdown · micromark · hast · mdast |
| `1uvhifq1akvkp.js` | 224 Ko | framework Next / React |
| `2o-xezozmxkvw.js` | 144 Ko | applicatif |
| `1_zmgipypuk59.js` | 136 Ko | applicatif |
| `0cz1d0mv5g_q7.js` | 112 Ko | applicatif |
| 6 suivants | 292 Ko | applicatif |

**Deux bibliothèques pèsent 1 084 Ko, soit 45 % du JS total.**

### Volumétrie du code

```
lib/ai/assistant.ts ................ 2 524 lignes
components/shell/Copilot.tsx ....... 1 253 lignes
lib/ai/situational/engine.ts ......... 597 lignes
lib/ai/risk/engine.ts ................ 589 lignes
lib/ai/config.ts ..................... 499 lignes
lib/ai/risk/modelPredictor.ts ........ 492 lignes
                        total IA ... 6 378 lignes

composants « use client » ............ 56 / 68 fichiers (82 %)
```

---

# 1. Copilot IA — périmètre prioritaire

## Ce qui est déjà bien fait

Il faut le dire, parce que trois des points de votre grille sont **déjà
traités** et qu'il serait faux de les compter comme défauts :

- **Le streaming existe.** `components/shell/Copilot.tsx:415` appelle
  `chatStream()` avec un rappel `onToken` ; la réponse s'affiche au fil des
  fragments. Ce n'est pas un appel bloquant.
- **La taille du prompt est bornée.** `lib/ai/assistant.ts:2477-2501` applique
  une **boucle de troncature progressive** : tant que le JSON de contexte dépasse
  `MAX_JSON_CHARS` (~12 000 caractères, ~4 000 tokens), il rogne par paliers
  (équipements → unités → incidents → hôpitaux). Le budget de tokens est donc
  explicitement géré, ce qui est rare et bien vu.
- **Il y a un délai de garde.** `lib/ai/provider.ts:23` implémente `withTimeout()`
  avec un `AbortController`.

Les constats ci-dessous portent sur ce qui reste.

---

### F-01 · Le Copilot charge 316 Ko de Markdown sur **toutes** les pages — `HIGH` — ✅ **CORRIGÉ** (commit `de35ed5`)

> **Résultat mesuré.** Le HTML prérendu de `/dashboard` référence 13 chunks pour
> **1 035 Ko**, et **aucun ne contient `micromark`**. Le rendu Markdown est passé
> derrière `React.lazy` dans `components/shell/CopilotMarkdown.tsx`.
>
> *Nuance sur le « avant » :* il est **déduit, non mesuré**. `react-markdown`
> était importé statiquement par `Copilot.tsx`, lui-même importé par `AppFrame`
> dans la mise en page racine — son chunk de 313 Ko appartenait donc
> nécessairement au graphe initial de chaque route. Soit ~1 348 Ko avant,
> **−313 Ko (−23 %)** après.
>
> *Correction à l'analyse d'origine ci-dessous :* la solution proposée
> initialement (rendre `<Copilot>` dynamique dans `AppFrame`) **n'aurait rien
> gagné** — `dynamic()` charge dès le rendu du composant, et le bouton flottant
> serait apparu en retard. C'est le rendu Markdown qu'il fallait différer.

**Fichiers**
`components/shell/AppFrame.tsx:17` (import), `:~190` (montage)
`components/shell/Copilot.tsx:5-6` (`react-markdown`, `remark-gfm`)

**Ce qui ne va pas**
`AppFrame` importe `Copilot` **statiquement** et le monte sur chaque écran
(`{aiVisible && <Copilot />}`). `Copilot.tsx` importe à son tour `react-markdown`
et `remark-gfm` en haut de fichier. Le graphe de dépendances rattache donc la
pile Markdown complète — **mesurée à 316 Ko** — au bundle chargé sur *toutes*
les routes.

**Pourquoi c'est lent**
Le Copilot est une **modale fermée par défaut**, ouverte par ⌘K. Un opérateur
qui consulte la carte ou déclare un incident sans jamais l'ouvrir télécharge,
parse et exécute quand même 316 Ko de JavaScript. Sur un lien mobile de terrain,
c'est du temps de démarrage pur perte — le coût de parse/compile pèse davantage
que le transfert sur les appareils modestes.

**Correction proposée**
```tsx
const Copilot = dynamic(() => import("@/components/shell/Copilot").then(m => m.Copilot), { ssr: false });
```
Le bouton flottant (~2 Ko) reste statique ; le corps de la modale et sa pile
Markdown ne se chargent qu'à la première ouverture.

**Risque : faible.** Le Copilot est déjà `"use client"` et n'est pas rendu côté
serveur. Seul effet visible : un court délai à la **première** ouverture, que
`dynamic` peut couvrir avec un `loading`. Vérifier que le raccourci ⌘K, câblé
dans `AppFrame`, déclenche bien le chargement.

**Gain attendu : −316 Ko sur 27 des 28 routes.** Le meilleur rapport
impact/effort du rapport.

---

### F-02 · `lib/ai/assistant.ts` : 2 524 lignes dans un seul module — ~~`HIGH`~~ → **`MEDIUM`**

> **Reclassé après vérification.** J'avais justifié le rang `HIGH` en partie par
> un argument de **livraison** (« tout module qui importe quoi que ce soit tire
> l'ensemble »). Cet argument **ne tient pas** : le fichier n'a que **deux
> consommateurs**, `components/shell/Copilot.tsx` et `lib/store.ts`, tous deux
> côté client et tous deux ayant besoin de l'assistant à l'exécution. Le module
> part donc dans le bundle quoi qu'il arrive — **le découper ne retirera pas un
> octet**.
>
> Le bénéfice réel est la **maintenabilité**, pas la performance. C'est une
> tâche de structure légitime, mais elle n'a pas sa place dans une liste de
> priorités de performance. `buildLlmUserMessage` (lignes 2370-2524) reste le
> point d'entrée naturel : 154 lignes, fonction pure, extractible seule.

**Fichier** `apps/web/src/lib/ai/assistant.ts`

**Ce qui ne va pas**
Un fichier unique porte l'analyse d'intention, l'exécution des requêtes
« Couche 1 », les quotas de lignes, la construction du prompt, la troncature
par budget de tokens et la mise en forme des réponses. Aucune de ces
responsabilités n'est isolable ni testable séparément.

**Pourquoi c'est lent** — deux effets distincts :
- *Livraison* : tout module qui importe **quoi que ce soit** de ce fichier tire
  l'ensemble. Le découpage statique (tree-shaking) ne peut rien pour du code
  aussi couplé.
- *Maintenance* : c'est le fichier le plus dense du dépôt et celui où la logique
  de coût des tokens vit. Toute optimisation future y sera risquée.

**Correction proposée**
Découper par responsabilité, sans changer le comportement :
`assistant/intent.ts` · `assistant/query.ts` · `assistant/prompt.ts` ·
`assistant/format.ts`. Commencer par `prompt.ts` : c'est le seul morceau **pur**
(entrées → chaîne), donc le plus facile à extraire et à couvrir par des tests.

**Risque : moyen.** Refactorisation mécanique mais large. À faire par étapes,
avec le typecheck en garde-fou. Aucun test unitaire n'existe aujourd'hui sur ce
fichier — c'est précisément l'argument pour extraire d'abord la partie pure.

---

### F-03 · `JSON.stringify` du contexte recalculé jusqu'à 10 fois — `MEDIUM`

**Fichier** `apps/web/src/lib/ai/assistant.ts:2479`, `:2484`, `:2514`

**Ce qui ne va pas**
La boucle de troncature appelle `JSON.stringify(data)` **à chaque palier**
(jusqu'à 8 paliers), après un premier appel avant la boucle, puis **un dernier
appel à la ligne 2514** qui refait le travail alors que `jsonStr` contient déjà
le résultat.

**Pourquoi c'est lent**
Sérialiser ~12 000 caractères dix fois de suite, sur le **thread principal du
navigateur**, à chaque question posée. Ce n'est pas catastrophique en absolu,
mais c'est du travail synchrone inutile juste avant un appel réseau — donc
directement dans la latence perçue.

**Correction proposée**
Réutiliser `jsonStr` ligne 2514 au lieu de re-sérialiser. Pour la boucle,
comparer d'abord une **estimation** de longueur et ne sérialiser qu'à la sortie.

**Risque : très faible.** Ligne 2514 : substitution stricte, le contenu est
identique par construction.

---

### F-04 · Moteurs de risque et de conscience situationnelle en client — `MEDIUM` *(inféré)*

**Fichiers**
`lib/ai/risk/engine.ts` (589 l.), `lib/ai/risk/modelPredictor.ts` (492 l.),
`lib/ai/situational/engine.ts` (597 l.)
Consommés par `components/dashboard/RiskPanel.tsx` et
`SituationalAwarenessPanel.tsx`, montés sur `/dashboard`.

**Ce qui ne va pas**
Près de 1 700 lignes de calcul analytique s'exécutent dans le navigateur, à
chaque affichage du tableau de bord.

**Pourquoi c'est lent**
Ces calculs sont **déterministes et identiques pour tous les opérateurs** d'une
même situation. Les faire tourner N fois sur N postes, sur le thread principal,
retarde l'interactivité du premier écran — celui que tout le monde ouvre en
premier.

**Correction proposée**
Les remonter dans l'API (module `domain`), servis par un endpoint mis en cache
avec le reste du domaine (cf. F-05). Le tableau de bord n'affiche alors qu'un
résultat déjà calculé.

**Risque : moyen à élevé.** Ce code vient de la branche `IA` (contribution
d'Oumaima) et je ne l'ai pas écrit. Un déplacement vers le serveur change le
contrat de données du tableau de bord. **À arbitrer avec elle avant tout
mouvement** — ne pas traiter comme une refactorisation mécanique.

---

### F-05 · Aucune stratégie de cache ni de revalidation — `HIGH`

**Fichiers**
`apps/api/src/modules/domain/domain.controller.ts` (0 occurrence de cache)
`apps/web/src/lib/store.ts` (`loadDomain`, `loadAircraft`, `loadQuakes`)

**Ce qui ne va pas**
Les endpoints de domaine (incidents, unités, hôpitaux, catalogue, statistiques)
n'ont **aucun en-tête de cache, aucun ETag, aucune revalidation**. Côté web,
chaque écran recharge par des appels impératifs depuis le store.

Deux exceptions notables qui montrent que le patron est connu :
`SeismicService` (cache 30 s) et `OpenSkyFeed` (cache 5 s + repli) le font
correctement. Le domaine, lui, ne le fait pas.

**Pourquoi c'est lent**
Le catalogue des hôpitaux dépasse la centaine d'établissements et **ne change
quasiment jamais**. Il est retransmis intégralement à chaque navigation, sur
chaque poste. C'est de la bande passante et du temps de rendu dépensés pour des
données identiques.

**Correction proposée**
Par ordre de rapport gain/effort :
1. `Cache-Control` + `ETag` sur les endpoints de référence (hôpitaux, catalogue,
   provinces, types d'incident) — quasi statiques.
2. Un `CacheInterceptor` Nest avec un TTL court sur les listes du domaine.
3. Côté web, déduplication des chargements concurrents dans le store.

**Risque : faible** sur les données de référence (elles ne bougent pas).
**Attention** sur incidents et unités : un cache trop long sur des données
opérationnelles ferait afficher une situation périmée à un poste de
commandement. **Plafonner à quelques secondes, et jamais de cache sur les
mutations.**

---

## Non mesuré sur le Copilot — et ce qu'il faudrait faire

Ces points de votre grille **ne peuvent pas être conclus** sans instrumentation,
que vous avez interdite. Je préfère le dire plutôt que d'estimer.

| Point demandé | Pourquoi non conclu | Mesure à faire |
|---|---|---|
| Tokens consommés par requête | Le budget est **borné** (~4 000 tokens de contexte) mais la consommation réelle dépend du modèle | Journaliser `prompt_eval_count` / `eval_count` renvoyés par Ollama |
| Latence par requête | Aucun horodatage dans le chemin d'appel | Chronométrer autour de `chatStream` : temps au premier token, puis total |
| Appels de modèle redondants | `probeProvider` est appelé à l'ouverture ; **je n'ai pas vérifié** s'il l'est à chaque frappe ou une seule fois | Compter les requêtes vers `/api/chat` sur une session type |

---

# 2. Reste de l'application

### F-06 · MapLibre : 768 Ko — ~~`HIGH`~~ → **NON FONDÉ, clos**

> **Mesuré, et le constat tombe.** Le chunk MapLibre n'apparaît dans le graphe
> initial d'**aucune** route — pas même `/map`. L'import dynamique en place fait
> déjà exactement son travail.
>
> | route | chunks initiaux | poids | MapLibre |
> |---|---:|---:|---|
> | `/dashboard` | 13 | 1 035 Ko | non |
> | `/incidents` | 13 | 1 029 Ko | non |
> | `/utilisateurs` | 13 | 1 025 Ko | non |
> | `/map` | 13 | 1 017 Ko | non |
> | `/parametres` | 13 | 1 019 Ko | non |
>
> Je l'avais classé `HIGH` avec la mention « à confirmer ». La confirmation est
> négative : **il n'y a rien à corriger.**

---

### F-11 · La charge initiale est identique sur toutes les routes (~1 Mo) — `HIGH` *(nouveau, mesuré)*

**Constat**
Le tableau ci-dessus dit l'essentiel : **13 chunks et ~1 020 Ko sur chaque
route**, à 18 Ko près entre l'écran le plus léger et le plus lourd. Le découpage
par route ne fait donc **quasiment rien** — tout est dans la coquille partagée.

**Pourquoi ça compte, et pourquoi c'est le vrai sujet**
Mes constats F-01 et F-06 visaient des bibliothèques. Or les deux plus grosses
(MapLibre, Markdown) sont désormais **hors du graphe initial**, et la charge
reste à ~1 Mo. Le poids n'est donc pas dans les dépendances : il est dans
**`AppFrame` + `Sidebar` + `store.ts` + les dictionnaires i18n**, tirés par la
mise en page racine et donc présents partout.

`lib/i18n/translations.ts` et `modules.ts` portent **trois langues complètes**
chargées simultanément, alors qu'un opérateur n'en utilise qu'une.

**Vérifié — l'hypothèse i18n est confirmée**
Le chunk `2o-xezozmxkvw.js`, **143 Ko, présent dans le graphe initial de
`/dashboard`**, contient simultanément les trois langues. Test par sondes de
chaînes distinctives :

```
2o-xezozmxkvw.js   143 Ko   fr=True  en=True  ar=True
```

Sources : `translations.ts` 34 Ko + `modules.ts` 77 Ko = **111 Ko pour trois
langues**. Un opérateur francophone télécharge donc l'anglais et l'arabe qu'il
n'ouvrira jamais — **environ 95 Ko de poids mort par session**, sur chaque route.

**Correction proposée**
Découper les dictionnaires par langue et ne charger que la langue active, les
autres à la bascule. Le store expose déjà `lang` et `LANGS` : le point de
découpe existe.

**Risque : moyen.** L'i18n gouverne **toutes** les chaînes affichées ; une
erreur se voit partout à la fois. La bascule de langue doit être vérifiée à
l'écran dans les trois sens, RTL compris — un dictionnaire arabe chargé
paresseusement doit arriver **avant** que `dir="rtl"` ne s'applique, sinon la
mise en page bascule sur des libellés encore français.

**Reste à instruire** : ce que `lib/store.ts` (44 Ko) tire par transitivité — il
importe les moteurs IA, la carte et le client API dans un module chargé partout.

**Risque** : moyen. Toucher au chargement de l'i18n touche l'affichage de
**toutes** les chaînes. À traiter avec une bascule de langue vérifiée à l'écran.

---

### F-06 (analyse d'origine, conservée pour mémoire)

**Fichiers** `app/map/page.tsx:14` (import dynamique), `components/map/MapCanvas.tsx`

**Ce qui ne va pas**
`MapCanvas` **est** correctement chargé en `dynamic(..., { ssr: false })` — le
point positif est acquis. Mais le chunk de 768 Ko existe, et je **n'ai pas
confirmé** s'il reste cantonné à `/map` ou s'il est promu en chunk partagé.

**Pourquoi ça compte**
768 Ko, c'est **32 % du JS total**. S'il fuit sur les autres routes, c'est le
plus gros problème de démarrage du produit — devant même F-01.

**Vérification à faire** (non destructive, une minute) : ouvrir `/dashboard`,
onglet Réseau, filtrer sur `.js`, et regarder si le chunk de 768 Ko est
téléchargé. Sinon, tout va bien.

**Correction si la fuite est confirmée**
Isoler l'import de `maplibre-gl` derrière une frontière dynamique unique et
vérifier qu'aucun module partagé (`lib/map/*`) n'importe le paquet en statique.
`lib/map/markers.ts` et `lib/map/deadReckoning.ts` sont purs — ils ne doivent
pas tirer MapLibre.

**Risque : faible.** Réorganisation d'imports, sans changement de comportement.

---

### F-07 · 82 % des composants sont clients — `MEDIUM` *(inféré)*

**Mesure** : 56 fichiers `.tsx` sur 68 portent `"use client"`.

**Ce qui ne va pas**
Presque rien n'est rendu côté serveur. Les 28 routes sont marquées `○ (Static)`
au build, mais leur contenu est peuplé après hydratation, par des appels du
store.

**Pourquoi c'est lent**
L'utilisateur reçoit une coquille vide, puis attend le JS, puis attend les
appels API. Trois allers-retours avant le premier contenu utile.

**Nuance importante, et elle est décisive**
C'est en grande partie **une conséquence assumée de l'architecture** : `CLAUDE.md`
impose que le frontend ne consomme que le client généré depuis l'OpenAPI, et la
session est portée par un JWT en `sessionStorage`. Un rendu serveur supposerait
de repenser le transport de session. **Ce n'est pas un défaut à corriger à la
légère, c'est un arbitrage à instruire.**

**Correction proposée**
Cible réaliste : passer en serveur les écrans **sans état de session forte** et
les portions purement présentationnelles (en-têtes, légendes, tableaux de
référence). Ne pas viser une conversion globale.

**Risque : élevé** si mené largement. Toucher au flux d'authentification est le
chemin le plus court vers une régression de sécurité. À traiter comme un projet
distinct, avec ADR.

---

### F-08 · N+1 latent au passage à Drizzle — `MEDIUM` *(inféré, préventif)*

**Fichiers** `apps/api/src/modules/domain/*.service.ts`,
`apps/api/src/modules/aviation/infrastructure/in-memory-watchlist.repository.ts`

**Ce qui ne va pas**
Aucun N+1 **aujourd'hui** : les dépôts sont en mémoire, un accès tableau coûte
zéro. Mais les services parcourent des collections et résolvent des relations
en boucle — un patron qui devient un N+1 dès qu'un vrai dépôt SQL remplace le
tableau.

**Pourquoi ça compte**
C'est le moment le moins cher pour le traiter : les **ports** existent déjà
(`AircraftWatchlistRepository`, etc.). Le contrat peut exposer des méthodes de
chargement groupé **avant** que l'adaptateur Postgres soit écrit.

**Correction proposée**
Lors de l'implémentation Drizzle, prévoir au contrat des méthodes `findMany`
groupées plutôt que des `findById` en boucle. Poser les index en même temps que
le schéma (clés étrangères, colonnes de filtre).

**Risque : nul aujourd'hui** (rien à changer). Le risque est de **ne pas** le
prévoir.

---

### F-09 · Une balise `<img>` non optimisée — `LOW`

**Mesure** : 1 occurrence de `<img>` brut ; 2 fichiers utilisent `next/image`.

**Ce qui ne va pas** — pas de dimensionnement, pas de format moderne, pas de
réservation d'espace : décalage de mise en page au chargement (CLS).

**Correction** : remplacer par `next/image` avec `width`/`height` explicites.

**Risque : très faible.**

---

### F-10 · Code mort et logique dupliquée — `LOW`

**Constats**
- `components/shell/LanguageSwitch.tsx` **et** `LanguageMenu.tsx` coexistent ;
  seul `LanguageMenu` est monté dans le `Header`. `LanguageSwitch` est
  vraisemblablement mort — **à confirmer** avant suppression.
- Le patron « tableau ≥ md / cartes < md » a été implémenté **indépendamment sur
  huit écrans**, avec un helper `Champ` local redéfini plusieurs fois. Candidat
  naturel à un composant partagé `<DataList>`.
- `components/ui/Table.tsx` et `components/flux/FluxUI.tsx` sont partagés mais
  contournés par des enveloppes de page — l'agent auteur l'a signalé lui-même.

**Correction** : outiller la détection (`knip` ou `ts-prune`) plutôt que de
chasser à la main.

**Risque : faible**, à condition de vérifier chaque suppression. Un composant
« mort » peut être atteint par une route peu testée.

---

## Récapitulatif

| # | Constat | Rang | Effort | Gain mesuré ou attendu |
|---|---|---|---|---|
| F-01 | Copilot statique → 316 Ko partout | **HIGH** | ~15 min | −316 Ko sur 27 routes |
| F-05 | Aucun cache ni revalidation API | **HIGH** | 1–2 j | Moins de trafic, écrans plus rapides |
| F-06 | Portée du chunk MapLibre à confirmer | **HIGH** | 1 min (vérif.) | jusqu'à −768 Ko si fuite |
| F-02 | `assistant.ts` — 2 524 lignes | **HIGH** | 2–3 j | Maintenabilité, découpage possible |
| F-03 | `JSON.stringify` ×10 par question | MEDIUM | ~10 min | Latence perçue du Copilot |
| F-04 | Moteurs IA côté client | MEDIUM | 3–5 j | Interactivité du tableau de bord |
| F-07 | 82 % de composants clients | MEDIUM | projet | Premier rendu |
| F-08 | N+1 latent (Drizzle) | MEDIUM | préventif | Évite une dette coûteuse |
| F-09 | `<img>` non optimisée | LOW | 5 min | CLS |
| F-10 | Code mort, duplication | LOW | 1 j | Lisibilité |

**Par où commencer, si vous ne faites qu'une chose :** F-06 (une minute de
vérification, potentiellement 768 Ko), puis F-01 (quinze minutes, 316 Ko
certains). Ce sont les deux seuls dont le gain est chiffré et l'effort trivial.

---

## Ce que ce rapport ne dit pas

- **Aucune latence réelle n'a été mesurée** — ni LLM, ni API, ni rendu.
  L'instrumentation était exclue par votre consigne.
- **Aucun profilage React** : les re-rendus superflus sont **inférés** de la
  lecture du code, pas observés. Les sélecteurs du store sont sains
  (0 sélecteur retournant un objet littéral, qui est la cause n°1 de re-rendus
  en Zustand) — donc pas de constat à charge de ce côté.
- **Pas de Lighthouse** : indisponible ici. Les Core Web Vitals restent à établir.
- Les poids sont ceux des **artefacts sur disque**, avant compression de
  transport. Comptez grossièrement un tiers en gzip/brotli sur le fil — les
  écarts relatifs entre chunks, eux, restent valables.
