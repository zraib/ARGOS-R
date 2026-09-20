# ADR 0011 — Feux de forêt : simulateur de propagation local sur la carte

- **Statut :** accepté
- **Date :** 2026-09-15
- **Portée :** `apps/web` : `lib/fire/` (modèle, course), `lib/sim/spread.ts`
  (socle commun aux propagations), `components/map/layers/{spread,fire}.ts`,
  tranche `fire`, panneau « Feux de forêt » de la carte ; aucune route API
  nouvelle (la météo du point passe par `GET weather/forecast`, ADR 0002).

- **Révisé le 2026-09-20 (ADR 0025) :** la vitesse vient du modèle de Rothermel (1972) sur les modèles de combustible d'Anderson (1982), l'humidité de Simard, le vent effectif (pente + vent) de FARSITE, les flammes de Byram.

## Contexte

Après les crues (ADR 0010), l'état-major veut la même chose pour les feux de
forêt : poser un point d'allumage sur la carte et voir, en temps simulé, où le
front va, en combien de temps, et ce qu'il atteint — hôpitaux, unités, abris,
villes — pour cadrer une évacuation et des coupures. Le Maroc n'expose pas de
service de prévision de propagation ; les modèles de référence (FARSITE,
Prometheus) demandent des cartes de combustible et des heures de calcul
qu'un poste de commandement isolé n'a pas. Il faut un modèle **local, sobre,
immédiat**, honnête sur ses limites, qui tourne sur le relief que la station
possède déjà.

## Décision

1. **Temps minimal de parcours sur la grille d'altitude** (`lib/fire/spread.ts`,
   pur et testé). Depuis le point d'allumage, le front gagne ses huit voisines
   à une vitesse qui dépend de la direction — un Dijkstra dont le coût est
   l'heure d'arrivée (méthode de Huygens / *minimum travel time*, celle des
   simulateurs opérationnels). La vitesse de tête vient du **combustible
   dominant** choisi par l'opérateur (herbe, maquis, résineux, feuillus,
   clairsemé — ordres de grandeur des abaques de Rothermel 1972 / Alexander
   1985), poussée par le **vent** (facteur croissant plus vite que le vent),
   modulée par l'**humidité de l'air** et la **température** ; l'ellipse de
   propagation s'allonge avec le vent (Alexander 1985, vue depuis son foyer
   arrière — Richards 1990) ; la **pente** double la vitesse tous les 10° de
   montée et la divise par deux en descente (règle de McArthur, bornée à
   ±30°). Une tuile absente ne brûle pas ; un front qui touche le bord du
   relief chargé le dit (emprise tronquée).
2. **La météo du point, par le courtier.** « Météo au point » lit le vent, sa
   direction, l'humidité et la température actuels à l'allumage par
   `GET weather/forecast` (Open-Meteo via l'API, jamais depuis le navigateur,
   ADR 0002), puis chaque réglage se corrige à la main — et se dit alors
   « à la main », pas « relevé ».
3. **Le socle commun des propagations** (`lib/sim/spread.ts`,
   `layers/spread.ts`) : crues et feux partagent la forme d'une course
   (images espacées sur l'horizon, boîte des cellules touchées, points
   atteints avec l'heure), la lecture en temps simulé sur une source `canvas`
   MapLibre (jamais au-delà de ce que le calcul a produit, lecture / pause /
   curseur / horloge), la caméra (vient sur le point de départ, encadre
   l'emprise à la fin) et les pièces du panneau (`_parts/simui.tsx`). Chaque
   aléa apporte son modèle, sa palette (flammes vives au front, rouge sombre
   quand elles durent, braises derrière — selon le temps de résidence du
   combustible) et ses chiffres (surface parcourue, surface en flammes,
   vitesse de tête, allongement).
4. **Une simulation est une hypothèse** : le panneau écrit ses limites — ni
   sautes de feu, ni couronnement, ni combustible réel, ni action des secours.

## Conséquences

- **Positives :** un front de feu lisible sur la carte en quelques secondes,
  hors ligne, avec les heures d'arrivée sur ce qui compte ; un seul style de
  panneau et de lecture pour deux aléas (l'œil ne réapprend rien) ; un modèle
  pur, testé sans réseau (vitesses, ellipse, pente, Dijkstra, tuile absente,
  horizon, images, course, arrêt) ; le socle accueillera un troisième aléa
  (rupture de canalisation, nuage) sans nouvelle mécanique d'écran.
- **Négatives :** sans carte d'occupation du sol, le combustible est uniforme
  sur l'emprise — un lac ou une ville « brûlent » comme la forêt autour (à
  lire avec la vue satellite) ; les vitesses sont des ordres de grandeur, pas
  une calibration marocaine ; le vent est celui du point d'allumage à
  l'instant du relevé, uniforme et constant sur l'horizon ; huit directions
  discrétisent l'ellipse (front légèrement facetté).
