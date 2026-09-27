# ADR 0038 — Performances : chargement allégé, carte sobre au repos, rechargements ciblés, API compressée, code mort retiré

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-27
- **Complète :** la première campagne de performance (`docs/07-performance.md`, F-01 à F-12), ADR 0029
  (marqueurs à glyphe), ADR 0032 (fenêtre du briefing), ADR 0036 (positions et écarts des marqueurs),
  ADR 0014 (proxy de la station).
- **Portée :**
  - web — `components/shell/{AppFrame,Sidebar,Copilot}.tsx`, `lib/differe.ts` (nouveau),
    `components/map/MapCanvas.tsx`, `components/map/layers/{markers,glyphs,morgues,shelters,weather,quakes,drawings}.ts`,
    `lib/map/{positions,markers}.ts`, `lib/store/slices/{domain,realtime,missions,aviation,fire,flood}.ts`,
    `next.config.mjs` ;
  - API — `main.ts` (CORS : `ETag` exposé) ;
  - station — `deploy/traefik/dynamic.yml` (compression de `/api`) ;
  - outillage — `scripts/perf/` (bancs de mesure versionnés) ;
  - nettoyage — 2 fichiers et 66 symboles morts retirés (41 web, 25 API).

## Contexte

Demande du 27 septembre 2026 : nettoyer le code de tout ce qui ne sert pas, optimiser l'application
pour qu'elle réponde plus vite, et rendre compte en détail, mesures à l'appui.

La règle de la première campagne tient toujours : **aucune correction sans mesure préalable**. Les
mesures portent sur le **build de production** (sortie autonome de Next, servie par `node server.js`),
branché sur l'API de développement et ses données de démonstration :

- navigateur : Chrome réel piloté par `playwright-core`, processeur bridé ×4 (un poste modeste de la
  station), contexte neuf à chaque passage (cache vide), médiane des passages ;
- carte : temps processeur du fil principal (profileur CDP) et **images dessinées** par MapLibre ;
- API : les vingt lectures du chargement du domaine, poids brut et compressé ;
- composition du code : graphe initial de chaque route (chunks cités par le HTML prérendu), cartes des
  sources décodées module par module (`ARGOS_SOURCEMAPS=1`) ;
- code mort : `knip` 5.88, trié à la main — un symbole n'est « mort » que s'il n'est cité nulle part,
  tests compris. Faux positifs gardés : scripts générateurs de l'API, greffon RTL copié par
  `scripts/vendor.mjs`, `public/fonts/fonts.css` (lien du layout), `pino-pretty` (transport de log).

Les bancs sont versionnés dans `scripts/perf/` : n'importe qui peut rejouer la campagne.

## Constats (mesurés avant correction)

1. **Le menu préchargeait toute l'application.** La trentaine de liens `<Link>` du menu préchargeait
   sa route dès l'affichage : 72 requêtes de préchargement et 42 fichiers JavaScript au premier écran
   — MapLibre compris, sur des pages sans carte.
2. **L'assistant de déclaration partait avec chaque page** (~115 Ko : étapes, saisie du lieu sur
   carte, brouillon par l'IA), monté fermé et abonné à une douzaine de collections.
3. **Le magasin tirait les simulateurs dans chaque page** : moteurs feu et crue, relief, grilles — et
   le HTML des marqueurs avec ses pictogrammes, à travers `fieldLL` rangé dans `lib/map/markers.ts`.
4. **La carte ne se reposait jamais : 600 images dessinées en 10 s, au repos, sans rien afficher
   d'animé.** Trois causes empilées :
   - les deux sources météo « canvas » étaient animées (`animate: true`) même couche masquée — chacune
     impose une image à chaque rafraîchissement de l'écran ;
   - la pulsation sismique réécrivait 15 fois par seconde un rayon qui dépend de la magnitude : pour
     MapLibre 4, une propriété « data-driven » modifiée **redécoupe toute la source** (travail du
     worker, fondu des tuiles) ;
   - toute image dessinée moins de 300 ms après le dernier placement des étiquettes en relance une
     autre : une animation plus rapide que 300 ms tient la carte en rendu continu.
5. **Chaque rechargement recréait les marqueurs.** Un rechargement du domaine — même provoqué par
   une écriture sans effet — détruisait et recréait 64 marqueurs DOM (unités, établissements,
   incidents…), avec leurs écouteurs.
6. **Chaque événement temps réel remplaçait les vingt collections du domaine** — donc re-rendait
   tous les écrans abonnés — et une rafale d'événements lançait autant de rechargements en parallèle.
   Les sondages (missions toutes les 15 s, aéronefs toutes les 6 s, simulation de démonstration
   toutes les 2,5 s) remplaçaient eux aussi des listes identiques.
7. **L'API n'était pas compressée derrière Traefik** : 270 Ko de JSON à chaque chargement du
   domaine, 55 Ko une fois compressés.
8. **Trois fenêtres attendaient 300 ms pour rien à leur première ouverture.** `React.lazy` +
   `<Suspense>` retient la révélation d'un contenu suspendu (React 19) : le briefing paraissait
   303 ms après le clic pour 3 ms de téléchargement, le Copilot 323 ms (son bouton disparaissant
   entre-temps).
9. **Deux défauts au passage** : l'étiquette d'un croquis sortait de la carte à sa première mise à
   jour (sélection, retour sur la carte) — `el.className` réécrit effaçait les classes que MapLibre
   pose sur le marqueur ; les convois étaient recréés à chaque synchronisation.

## Décision

1. **Préchargement à l'intention, pas à l'affichage** (`Sidebar.tsx`) : `prefetch={false}` sur les
   liens du menu, et `router.prefetch` au survol, au focus clavier et au toucher — ils précèdent le clic
   de quelques centaines de millisecondes.
2. **Fenêtres chargées à part, sans Suspense** (`lib/differe.ts`) : le code d'une fenêtre vit dans son
   propre fichier et le composant se rend dès que son code est là — jamais de suspension, jamais de
   repli vide.
   - L'assistant de déclaration quitte chaque page : son code se télécharge au repos, il se monte à la
     première ouverture et reste monté.
   - Le briefing se télécharge au repos (41 Ko) : plus de délai à la première ouverture.
   - Le corps du Copilot se charge à la première ouverture, sans préchargement (il est lourd, beaucoup
     de sessions ne l'ouvrent pas) ; son bouton reste affiché pendant le chargement.
3. **Le magasin ne tire plus les simulateurs** : les moteurs feu et crue se chargent au lancement
   d'une simulation (`import()` dans les actions) ; `fieldLL` rejoint `lib/map/positions.ts`, qui
   n'importe rien de l'affichage des marqueurs. Les simulations placent les abris par
   `shelterLL` (sa position propre, sinon sa commune, la province départageant les homonymes) —
   la règle de la carte (ADR 0036) — au lieu d'un calcul du module d'affectation IA, qui partait
   avec elles dans chaque page.
4. **Une carte sobre au repos :**
   - une source « canvas » météo ne joue que si sa couche est visible (`play` / `pause`) ;
   - la pulsation sismique passe par l'**état** de chaque séisme (`feature-state`, identifiants générés
     par la source) : l'expression du style ne change plus, rien n'est redécoupé ;
   - fondu des étiquettes à 50 ms (`fadeDuration`) : la carte ne dessine plus qu'au rythme de la
     pulsation ;
   - pas de pulsation sans séisme ; les étiquettes de villes ne touchent au DOM que si la couche, le
     zoom ou les villes ont changé.
5. **Marqueurs réutilisés** : un registre par clé `kind:id` (convois compris) met à jour en place le
   contenu, la position et l'écart d'un marqueur ; seul ce qui disparaît est retiré. Les marqueurs à
   glyphe (sites mortuaires, abris) ont le même registre, attaché à l'instance de carte.
6. **Rechargements ciblés :**
   - chaque collection du domaine garde son objet quand son ETag n'a pas changé (et que le magasin
     n'y a pas touché depuis — le « témoin ») : seuls les écrans abonnés à ce qui a vraiment bougé se
     redessinent ;
   - un seul rechargement du domaine à la fois, et au plus un autre pour rattraper ce qui est arrivé
     pendant qu'il courait ;
   - les sondages de missions, d'aéronefs et la simulation de démonstration gardent leurs listes
     inchangées ;
   - l'API expose l'en-tête `ETag` en CORS (développement, API sur une autre origine ; derrière le
     proxy de la station, l'origine est la même).
7. **API compressée par le proxy de la station** (`compress-api`, Traefik) — jamais le flux temps réel
   (`text/event-stream` exclu : mis en tampon, il n'arriverait plus au fil de l'eau). Aucune dépendance
   nouvelle : Traefik est déjà dans la pile.
8. **Code mort retiré** (`knip` trié à la main) : `KeywordChips.tsx` et `CopilotSettings.tsx`, 41
   symboles web et 25 symboles API jamais cités, et ce qu'ils étaient seuls à utiliser.
9. **Défauts corrigés** : classes des étiquettes de croquis ajoutées une à une (`classList`) ; convois
   réutilisés par identifiant.
10. **Bancs versionnés** (`scripts/perf/`) et cartes des sources sur demande (`ARGOS_SOURCEMAPS=1`,
    jamais livrées).

## Résultats

Build de production d'avant (`91e6a25`) contre build d'après, même poste, processeur bridé ×4,
médianes. Tableaux complets, méthode et commandes : `docs/07-performance.md`, « Deuxième campagne ».

| Mesure | Avant | Après |
|---|---:|---:|
| JavaScript transféré au chargement de `/dashboard` | 766 Ko | **365 Ko** (−52 %) |
| Requêtes au chargement de `/dashboard` | 157 | **61** |
| Graphe initial de `/dashboard` (gzip) | 367 Ko | **317 Ko** (−14 %) |
| Temps de blocage (TBT) de `/incidents` · `/hospinet` | 35 · 65 ms | **15 · 40 ms** |
| Carte au repos, sans séisme : images dessinées en 10 s | 600 | **1** |
| Carte au repos, sans séisme : processeur en 10 s | 2 161 ms | **741 ms** (−66 %) |
| Carte au repos, séismes affichés : images · processeur en 10 s | 600 · 2 201 ms | **150 · 1 332 ms** (−39 %) |
| Marqueurs recréés par un rechargement du domaine | 64 | **0** |
| Clic sur un marqueur : INP (tâches longues) | 88 ms (56 ms) | **72 ms (0 ms)** |
| Première ouverture du briefing · du Copilot | 303 · 323 ms | **3 · 20 ms** |
| Tas JS de la carte après ramasse-miettes | 14,4 Mo | **12,5 Mo** |
| Lectures du domaine sur le réseau (derrière Traefik) | 270 Ko | **58 Ko** (−79 %) |

Contrôles : typecheck web et API ; 590 tests API, 251 tests web (dont 2 pour `lib/differe`) ;
parcours fonctionnel rejoué sur le build de production.

## Conséquences

- Une route jamais survolée se charge au clic : mesuré, la navigation reste à ~240 ms, comme avant.
- La première ouverture de l'assistant de déclaration monte le composant : 40 ms au lieu de 3 (les
  suivantes : comme avant). Imperceptible, et l'assistant ne pèse plus sur les autres pages.
- Le client compare des ETag faibles calculés par Express sur le corps : deux corps identiques ont le
  même ETag, un corps différent jamais. Une collection modifiée localement (mise à jour optimiste)
  change de témoin, donc elle est relue.
- Les étiquettes du fond de carte apparaissent sans fondu perceptible (50 ms au lieu de 300).
- La mise à jour d'une station applique le nouveau `dynamic.yml` de Traefik (même image `v3.7`) :
  rien à télécharger de plus.
- `knip` signale encore ~280 exports utilisés seulement dans leur propre fichier : exportés sans
  nécessité, mais vivants — gardés.

## Alternatives écartées

- **Pré-monter l'assistant au repos** (3 ms à la première ouverture au lieu de 40) : un composant
  abonné à une douzaine de collections sur chaque page, pour 37 ms imperceptibles.
- **Pulsation sismique en animation CSS** (marqueurs DOM, animation composée par le GPU) : plus aucune
  image de carte au repos, mais une centaine de marqueurs DOM de plus à déplacer à chaque mouvement de
  carte. Gardé au carnet.
- **`fadeDuration: 0`** : placement COMPLET des étiquettes à chaque image, plus coûteux pendant les
  déplacements ; 50 ms suffisent.
- **Compression dans NestJS** (`compression`) : une dépendance runtime nouvelle, et la compression dans
  la boucle d'événements de l'API.
- **Cache à durée de vie côté client** : refusé depuis F-05 — une situation périmée affichée comme
  fraîche est un risque opérationnel.
- **Marqueurs en couches GL** plutôt que DOM : refonte de l'ADR 0029 ; le registre à clé garde ce choix
  et en retire le coût.
