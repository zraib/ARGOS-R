# 12 · Itinéraire sûr — obstacles, zones NRBC, sortie de zone

Ce document décrit ce que calcule l'outil **Itinéraire** de la carte
opérationnelle : un trajet par le réseau routier qui **contourne** les obstacles
posés sur la carte et les zones des panaches NRBC en cours, la **sortie la plus
rapide** d'une zone NRBC, et le **point d'approche sûr** d'une destination prise
dans une zone. Décision : [ADR 0039](adr/0039-itineraire-sur-obstacles-nrbc.md).

## 1. Ce que voit l'opérateur

- **Ouvrir l'outil** : panneau « Itinéraire » de la barre de gauche (onglet de
  la feuille du bas sur mobile), bouton « Itinéraire » en bas de la carte, ou
  `Maj + clic droit` → **« Itinéraire depuis ici »** (puis « Itinéraire jusqu'ici »).
- **Poser les étapes** : un clic sur la carte ajoute une étape ; un clic sur un
  marqueur (hôpital, unité, abri…) ajoute l'étape **à sa position**. Départ,
  étapes, arrivée : 10 au plus, réordonnables.
- **Régler** : en **véhicule** ou **à pied** ; contourner les **obstacles** ;
  éviter les **zones NRBC** (danger et protection), **vigilance comprise** sur
  demande.
- **Lire le résultat** :

  | Tracé | Signification |
  | --- | --- |
  | bleu, plein | trajet qui contourne tout — **Itinéraire sûr** |
  | orange, plein | **sortie de zone NRBC** : elle traverse la zone, au plus court |
  | rouge, tirets | **NON SÛR** : aucun trajet ne contourne tout, voici le plus court |
  | bleu, tirets | moteur injoignable : ligne droite, rien n'est contourné |
  | gris, tirets | le plus court **sans rien contourner** — il mesure le détour imposé |
  | point vert | point de sortie, ou point d'approche sûr |
  | point rouge | étape demandée qui se trouve dans une zone |

  Le panneau détaille la sortie (« 4,5 km · 5 min, dont 4,2 km (4 min) dans la
  zone »), les étapes remplacées, le détour imposé, les heures de panache
  évitées et chaque alerte en clair.

## 2. Les obstacles

Un **croquis** (panneau Dessin) peut être marqué **obstacle** : choisir sa
nature avant de tracer, ou la changer dans sa fiche.

| Nature | Forme conseillée | Effet sur les itinéraires |
| --- | --- | --- |
| Impasse / route coupée | point, sur la route | la route où il est posé est retirée |
| Obstacle sur la voie | point | idem |
| Pont détruit | point, sur le pont | le pont est retiré |
| Zone inondée | cercle ou polygone | toute route qui la traverse est retirée |
| Zone interdite | cercle ou polygone | idem |

Un obstacle naît rouge, avec un contour en tirets blancs et une étiquette
rouge. Il est partagé en temps réel : posé sur un poste, il est contourné par
les itinéraires de **tous** les postes, et un itinéraire affiché se recalcule
de lui-même quand un obstacle apparaît, bouge ou disparaît. Qui dessine un
obstacle : comme tout croquis, qui voit la carte ; qui le modifie ou le retire :
son auteur ou le Super Administrateur (ADR 0024).

Une étape posée **dans** un obstacle de surface ne peut pas le contourner :
cet obstacle-là est laissé de côté pour ce calcul, et le panneau le dit.

## 3. Les zones NRBC

Les zones évitées sont celles des panaches de **tous les incidents chimiques
actifs** (famille C, non clos, non archivés) — affichés ou non, et quel que soit
le droit du compte à afficher le panache : la sécurité d'un trajet ne dépend pas
de l'écran. Ce sont les gabarits ATP-45 et ERG 2024 calculés par l'API
(ADR 0005), niveaux **danger** et **protection** (la nappe « vent faible » est
de niveau protection) ; la **vigilance** sur demande.

**Le panache dérive.** Un trajet de 40 minutes traverse des lieux que le
panache couvrira peut-être dans une heure : les zones évitées sont celles de
l'heure en cours **et de la suivante**, puis — si le trajet dure plus d'une
heure — celles de chaque heure qu'il couvre (H+6 au plus). Si cet horizon
ferme tous les chemins, on retombe sur H+0 et H+1, puis sur H+0 seul ; le
panneau affiche les heures réellement évitées.

**Vent inconnu** (prévision injoignable, station hors ligne) : l'ATP-45 ne rend
que son cercle de danger, sans direction. Un calcul de panache qui dépasse
6 secondes retombe sur ce même cercle. Le panneau signale « vent inconnu ».

## 4. Sortie de zone, point d'approche

**Départ dans une zone** — on en sort au plus vite :

1. des points sont pris le long du bord de chaque zone (tous les 400 m,
   36 par zone au plus), puis poussés **250 m au-delà** du bord ;
2. on ne garde que ceux hors des zones de l'heure en cours **et de la
   suivante** (à défaut : de l'heure en cours) ;
3. chacun est calé sur la route la plus proche (Valhalla `locate`) ; un point
   calé qui retombe dans une zone est écarté ;
4. une matrice de durées (Valhalla `sources_to_targets`) donne le temps pour
   atteindre chacun **en traversant la zone** mais en contournant les
   obstacles ; le plus rapide est retenu ;
5. le trajet de sortie est tracé en orange ; le reste du trajet repart de ce
   point en contournant tout.

Par construction, la sortie la plus rapide mène rarement sous le vent : le
panache s'y étire, son bord est loin.

**Étape ou arrivée dans une zone** — elle devient le **point d'approche sûr** :
parmi les points hors zone les plus proches d'elle (à 1,5 km près du plus
proche), celui qu'on atteint le plus tôt en contournant tout. Le bord le plus
proche de la source étant du côté du vent, l'approche se fait **au vent** —
la doctrine d'approche d'un rejet chimique.

**Un seul point** : « sortir d'ici ». S'il n'est dans aucune zone, le panneau
le dit.

## 5. Replis — jamais un trajet dangereux présenté comme sûr

| Situation | Ce qui s'affiche |
| --- | --- |
| aucun chemin ne contourne tout (destination enclavée, obstacles) | le plus court, en **rouge tirets**, « NON SÛR » |
| moteur d'itinéraire injoignable | la ligne droite, « À vol d'oiseau », « rien n'est contourné » |
| zones trop vastes pour le moteur | le plus court « NON SÛR », « limite de service » |
| départ dans une zone, aucune sortie par la route | « aucune sortie trouvée », trajet NON SÛR |

## 6. Architecture

```
navigateur ── POST /api/routing/plan ──▶ API (RoutingService)
                                          ├─ obstacles : croquis marqués « obstacle » (DomainService)
                                          ├─ zones : panaches NRBC H+0…H+6 (NrbcService)
                                          └─ moteur : Valhalla, réseau interne ──▶ routing:8002
```

- **Le navigateur ne joint plus le moteur** : il demande un plan à l'API, qui
  seule parle à Valhalla (`ROUTING_URL`, `http://routing:8002` dans la
  station). La route `/routing` du proxy a été retirée.
- **Coût du moteur.** Exclure une surface coûte ~0,7 s par requête (zones d'un
  panache sur Casablanca), même loin du trajet. Le planificateur calcule donc
  d'abord le trajet qui n'évite que les points (quelques ms) ; s'il ne touche
  aucune surface ni aucune zone sur sa durée, il est rendu tel quel. Sinon il
  exclut les surfaces du couloir du trajet (emprise des étapes + 20 km), vérifie
  le résultat contre **toutes**, et recommence avec toutes s'il en touche une.
  Mesuré : 30 à 130 ms sans zone sur le chemin, 1 à 2 s quand il faut
  contourner un panache.
- **Limites de service** relevées au démarrage du conteneur `routing`
  (`deploy/docker-compose.yml`, `infra/compose/docker-compose.yml`) :
  `max_exclude_polygons_length` 2 000 km (10 km par défaut, pour toutes les
  zones d'une requête), `max_exclude_locations` 500 (50 par défaut).

### Où est le code

| Fichier | Rôle |
| --- | --- |
| `apps/api/src/modules/routing/routing.service.ts` | le planificateur (sortie, approche, horizon, replis) |
| `apps/api/src/modules/routing/geo.ts` | géométrie pure : point dans une zone, bord échantillonné, tracé qui entre dans une zone |
| `apps/api/src/modules/routing/infrastructure/valhalla.engine.ts` | adaptateur Valhalla (route, matrice, calage) derrière le port `RoutingEngine` |
| `apps/api/src/modules/routing/http/` | `POST /api/routing/plan` (`map:view`, hors journal d'audit) |
| `apps/web/src/lib/map/routing.ts` | appel de l'API, repli en ligne droite |
| `apps/web/src/lib/store/slices/routing.ts` | étapes, options, plan courant |
| `apps/web/src/components/map/RoutePanel.tsx` | panneau de l'outil et barre du bas |
| `apps/web/src/components/map/layers/measure.ts` | le tracé (rôles, couleurs, au-dessus du panache) |
| `apps/web/src/components/map/DrawToolbox.tsx` | nature des croquis (obstacle) |

Tests : `routing.service.spec.ts` (planificateur contre un faux moteur),
`geo.spec.ts`, `drawings-obstacle.spec.ts` côté API ; `lib/map/__tests__/routing.test.ts`
côté web.

## 7. Limites

- **Estimation, pas mesure** : les zones sont des gabarits de planification
  (ADR 0005) ; un trajet « sûr » l'est au regard de ces gabarits.
- **Le réseau routier est celui d'OpenStreetMap** au moment de la construction
  des tuiles de la station ; une route fermée sur le terrain doit être posée
  comme obstacle.
- **À pied**, la sortie suit les chemins praticables connus d'OSM : en terrain
  ouvert, elle peut sous-estimer les raccourcis.
- **Pas de consignes de navigation** (virages) : le tracé et sa durée.
