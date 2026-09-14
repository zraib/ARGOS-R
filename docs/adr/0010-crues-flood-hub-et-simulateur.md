# ADR 0010 — Crues : prévisions Google Flood Hub par le courtier, simulateur d'inondation local

- **Statut :** accepté
- **Date :** 2026-09-14
- **Portée :** `apps/api/src/modules/domain/flood.service.ts` et routes
  `floods/*` ; `apps/web` : `lib/flood/`, tranche `flood`, couche
  `components/map/layers/floods.ts`, panneau « Crues » de la carte ;
  `FLOOD_API_KEY` (`.env`, `deploy/`)

## Contexte

L'état-major veut deux choses que la carte ne donnait pas : des **prévisions
de crue** sur les cours d'eau du pays, et un **simulateur** pour cadrer une
inondation de rivière, de lac ou de barrage — « si l'eau monte de trois
mètres ici, qu'est-ce qu'elle atteint ? ».

Google publie une Flood Forecasting API (le moteur de Flood Hub) : jauges,
statuts de crue (gravité, tendance), prévisions de niveau ou de débit avec
seuils de vigilance et de danger, cartes d'inondation. Données sous licence
CC BY 4.0, API gratuite sur clé de projet Google Cloud, couverture du Maroc.
C'est un **fournisseur externe étranger**, exactement ce que l'ADR 0006
encadre : le navigateur d'un poste de commandement ne lui parle pas, et le
profil d'activité (quelles rivières on regarde, quand) ne sort pas.

Aucune source nationale équivalente n'est intégrée à ce jour ; l'ABH (agences
de bassin) et la DGM n'exposent pas d'API ouverte. La prévision Google est
donc la meilleure disponible, et une **information**, pas une vérité : le
contrat de l'API la nomme comme telle (source, attribution, qualité vérifiée
ou non).

Le simulateur, lui, ne doit dépendre de personne : une hypothèse d'état-major
se calcule sur le poste, sur le relief que la station a déjà (tuiles
d'altitude terrarium, souveraines en production — `infra/geo`).

## Décision

1. **Courtier serveur, comme EMSC et Open-Meteo.** `FloodService` interroge
   `floodforecasting.googleapis.com` avec la clé `FLOOD_API_KEY` (jamais servie
   au navigateur), normalise en un contrat stable (`FloodGauge`,
   `FloodForecast`, `FloodPolygon`, `FloodFeedStatus`), met en cache 15 min
   (polygones : 6 h), se dégrade sur le dernier cache connu **et le dit**
   (`degraded`, `error`). Sans clé : liste vide et `configured: false` —
   l'écran affiche « flux indisponible », rien ne casse. Routes gardées par
   `seismic:view`, comme la météo. L'attribution CC BY est portée à l'écran.
2. **Simulateur « baignoire » local** (`lib/flood/bathtub.ts`, pur et testé) :
   depuis un point de départ et une hauteur d'eau, l'eau descend, s'étale à
   plat et ne remonte une pente que de sa hauteur ; pour un barrage, la lame
   s'atténue linéairement avec la distance parcourue. Relief chargé depuis la
   source d'altitude **du mode courant** (`demTileUrl`) : la station en
   souverain, la source externe en développement — jamais un tiers en
   production. L'emprise est dessinée en image sur la carte, chiffrée
   (surface, lame maximale) et confrontée aux hôpitaux, unités, abris et
   villes. Aucune donnée ne part du poste.
3. **Deux blocs distincts à l'écran** — prévisions d'un côté, simulation de
   l'autre — parce qu'une prévision est une information et une simulation une
   hypothèse ; les mélanger ferait lire l'une pour l'autre. Le simulateur dit
   ses limites en toutes lettres : ordre de grandeur, sans hydraulique ni
   durée, pas une prévision.

## Conséquences

- **Positives :** des prévisions de crue sur la carte sans nouvelle
  dépendance côté navigateur ; un simulateur utilisable hors ligne, dont les
  entrées et le calcul restent sur le poste ; un contrat stable que l'on peut
  rebrancher demain sur une source nationale sans toucher à l'écran ; tests
  unitaires sans réseau (normalisation, KML → GeoJSON, propagation sur relief
  de synthèse).
- **Négatives :** une dépendance à un fournisseur étranger pour les
  prévisions, activée par une clé et encadrée par le courtier — à arbitrer par
  l'état-major comme les autres flux de l'ADR 0009 ; la qualité des jauges
  est celle de Google (`qualityVerified` porté, à lire) ; le simulateur est un
  modèle grossier : relief à 20-40 m, surface plate, pas de temps — il cadre
  une évacuation, il ne remplace pas une étude hydraulique ; les cartes
  d'inondation Flood Hub sont des KML convertis, jamais persistés.
