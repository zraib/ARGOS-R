# ADR 0039 — Itinéraire sûr : obstacles et zones NRBC contournés, sortie de zone, planifié par l'API

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-27
- **Révise :** ADR 0001 (moteur de routage) — le navigateur ne joint plus le moteur.
- **Complète :** ADR 0005 (panache NRBC), ADR 0024 (croquis), ADR 0014 (proxy de la station).
- **Portée :**
  - API — nouveau module `routing` (`POST /api/routing/plan`) ; `Drawing.obstacle`
    (`domain.types.ts`, `dto.ts`, `domain.service.ts`) ;
  - web — `lib/map/routing.ts`, `lib/store/slices/routing.ts`, `components/map/RoutePanel.tsx`,
    `components/map/layers/{measure,drawings,markers}.ts`, `components/map/{MapCanvas,DrawToolbox}.tsx`,
    `app/map/page.tsx`, dictionnaires FR/EN/AR ;
  - station — `deploy/docker-compose.yml` (limites de Valhalla, `ROUTING_URL`),
    `deploy/traefik/dynamic.yml` (route `/routing` retirée), `apps/web/Dockerfile` ;
  - développement — `infra/compose/docker-compose.yml`.

## Contexte

Demande du 27 septembre 2026 : calculer de **vrais itinéraires routiers** plutôt que des distances
à vol d'oiseau ; pouvoir **dessiner des obstacles** (points d'impasse, obstacles, ponts détruits) et
calculer la route qui les **contourne** ; lors d'un incident **NRBC**, calculer la route **sûre**,
sans exposition au danger chimique ; et depuis un point **dans** la zone, en **sortir au plus vite**.

État des lieux :

- l'outil « Mesure » calculait déjà un itinéraire routier, mais le navigateur appelait Valhalla
  directement (`NEXT_PUBLIC_ROUTING_URL`) ; au poste de développement l'adresse par défaut ne
  répondait pas, et tout retombait sur la ligne droite ;
- rien n'était contourné ;
- l'API sait déjà calculer le panache de chaque incident chimique, heure par heure (ADR 0005), et
  les croquis sont déjà persistés, partagés en temps réel et audités (ADR 0024).

Mesures sur le Valhalla de la station (3.5.1, tuiles du Maroc) :

- `exclude_polygons` et `exclude_locations` fonctionnent, y compris dans la matrice
  (`sources_to_targets`) ;
- une limite de service plafonne à **10 km** le périmètre CUMULÉ des surfaces exclues d'une requête ;
  les quatre zones du panache de démonstration (fuite de chlore, port de Casablanca) en font
  **92 km** ;
- un départ dans une surface exclue n'a aucun chemin (erreur 442) ;
- exclure une surface coûte **~0,7 s** par requête (0,97 s pour huit zones), **même à 200 km** du
  trajet — contre ~10 ms pour un itinéraire sans exclusion.

## Décision

1. **L'API planifie** (`POST /api/routing/plan`, `map:view`, hors journal d'audit — un calcul
   n'engage rien). Le navigateur ne parle plus au moteur : il demande un plan par le client généré.
   Raisons : l'API connaît les obstacles et sait calculer tous les panaches ; la sécurité d'un trajet
   ne doit dépendre ni de l'écran (panache affiché ou non) ni des droits d'affichage du compte ;
   contrat d'abord. Valhalla n'est plus exposé par le proxy (`/routing` retiré) : l'API le joint sur
   le réseau interne (`ROUTING_URL=http://routing:8002`).
2. **Les obstacles sont des croquis** (`Drawing.obstacle` : impasse, obstacle, pont détruit, zone
   inondée, zone interdite). Un point retire la route où il est posé (`exclude_locations`), un cercle
   ou un polygone toute route qui le traverse (`exclude_polygons`). Ils héritent de tout ce que les
   croquis ont déjà : persistance, temps réel, audit, droits (auteur ou Super Administrateur).
3. **Les zones NRBC évitées** sont celles de tous les incidents chimiques actifs, niveaux danger et
   protection (vigilance sur demande), **sur la durée du trajet** : H+0 et H+1, puis chaque heure
   couverte (H+6 au plus), avec repli sur H+1 puis H+0 si l'horizon long ferme tout. Un panache
   incalculable (vent inconnu, délai de 6 s) se replie sur le cercle de danger ATP-45.
4. **Départ dans une zone** : la sortie la plus rapide — points pris 250 m au-delà du bord des zones,
   hors des zones de l'heure et de la suivante, calés sur la route, classés par une matrice de durées
   qui traverse la zone mais contourne les obstacles. **Étape ou arrivée dans une zone** : le point
   d'approche sûr le plus proche (à 1,5 km près), le plus vite atteint en contournant tout — du côté
   du vent par construction. **Un seul point** : sortir d'ici.
5. **Replis honnêtes** : aucun chemin sûr → le plus court, `safe: false`, tracé rouge « NON SÛR » ;
   moteur injoignable → ligne droite, `road: false`. Jamais un trajet dangereux présenté comme sûr.
6. **Vérifier d'abord, exclure ensuite** : le trajet qui n'évite que les points (quelques ms) est
   vérifié contre toutes les surfaces sur sa durée ; seulement s'il en touche une, on exclut —
   d'abord les surfaces du couloir du trajet (emprise des étapes + 20 km), résultat revérifié contre
   toutes, et recalcul avec toutes s'il le faut. La vérification est exacte (segment contre bord),
   pas un échantillonnage.
7. **Limites de Valhalla relevées** au démarrage du conteneur (station et développement) :
   `max_exclude_polygons_length` 2 000 km, `max_exclude_locations` 500 — l'image génère sa
   configuration à chaque démarrage et n'offre aucun réglage de ces limites : le compose enveloppe
   son démarrage (préparation, `jq`, puis lancement).
8. **Interface** : l'outil « Mesure » devient « Itinéraire », un panneau de la barre de gauche
   (onglet de la feuille du bas sur mobile) — panneau ouvert ⟺ outil armé, comme le dessin ; un clic
   sur un marqueur pose l'étape à sa position ; `Maj + clic droit` → « Itinéraire depuis ici /
   jusqu'ici ». Le tracé passe au-dessus du panache.

## Résultats (mesurés le 27 septembre)

| Cas (données de démonstration) | Plan | Temps de l'API |
| --- | --- | --- |
| Marrakech → Asni, sans obstacle | 51,8 km · 48 min, sûr | 34 ms |
| … pont détruit posé sur le trajet | 75,7 km · 79 min, sûr ; référence 51,8 km · 48 min | 37 ms |
| départ dans la zone du port (Casablanca) | sortie 4,5 km · 5 min (4,2 km dans la zone), vers le sud-ouest — au vent | 118 ms |
| … puis une destination à l'ouest | sortie + trajet : 11,7 km · 13 min | 126 ms |
| arrivée sur l'incident | point d'approche au vent : 7,2 km · 8 min ; direct 10,6 km · 12 min | 1,0 s |
| traversée ouest → est (arrivée sous le vent) | contournement du panache : 52,3 km · 36 min ; direct 14,2 km · 15 min | 1,9 s |
| arrivée enclavée par le panache | aucun chemin sûr : le plus court, NON SÛR | 1,5 s |
| sortie à pied | 2,8 km · 34 min | 97 ms |

Avant l'optimisation « vérifier d'abord » (décision 6), les mêmes cas simples prenaient 0,9 à 2,2 s.

Vérifié dans le navigateur (build de développement, moteur local) : trajet contournant le panache,
sortie de zone depuis « Itinéraire depuis ici », obstacle « pont détruit » posé au clic et détour
recalculé, aucune erreur JavaScript. Tests : 22 tests du module `routing` (planificateur contre un
faux moteur, géométrie), 2 tests des croquis-obstacles côté API ; 5 tests côté web.

## Conséquences

- **Mise à jour d'une station** : le conteneur `routing` redémarre avec son démarrage enveloppé
  (quelques secondes de plus, les tuiles sont conservées) ; l'API reçoit `ROUTING_URL`. Rien à
  télécharger. Un navigateur resté ouvert sur l'ancienne version retombe sur la ligne droite
  jusqu'à son rechargement.
- **Variables retirées** : `NEXT_PUBLIC_ROUTING_ENGINE`, `NEXT_PUBLIC_ROUTING_URL` (web, Dockerfile,
  compose) ; le mode OSRM de développement disparaît avec elles.
- **Poste de développement** : l'API attend Valhalla sur `http://localhost:8002`
  (`infra/compose`, service `valhalla`, même démarrage enveloppé). Sans lui : ligne droite.
- **Un contournement de panache coûte 1 à 2 s** (coût propre au moteur) ; le panneau affiche
  « Calcul de l'itinéraire… » pendant ce temps.
- Les zones sont des gabarits de planification (ADR 0005) : « sûr » l'est au regard de ces gabarits.

## Alternatives écartées

- **Garder le calcul dans le navigateur** : il ne connaît que le panache affiché, et seulement si le
  compte a le droit de l'afficher — la sécurité d'un trajet dépendrait de l'écran.
- **Un module « obstacles » distinct des croquis** : il aurait refait persistance, temps réel, audit
  et droits pour le même objet — une forme nommée posée sur la carte.
- **Approcher les zones par des points exclus** (`exclude_locations` semés dans la zone) : seules les
  routes les plus proches de chaque point disparaissent, le reste de la zone reste traversable.
- **Choisir la sortie à vol d'oiseau** (point du bord le plus proche) : ignore le réseau — le bord le
  plus proche peut être de l'autre côté d'un bassin portuaire.
- **Monter une image Valhalla maison** pour régler ses limites : une image de plus à construire et à
  livrer, pour deux nombres de configuration.
