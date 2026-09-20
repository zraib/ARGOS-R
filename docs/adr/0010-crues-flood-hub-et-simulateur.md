# ADR 0010 — Crues : prévisions GloFAS/Flood Hub par le courtier, simulateur d'inondation local animé

- **Statut :** accepté
- **Date :** 2026-09-14
- **Portée :** `apps/api/src/modules/domain/flood.service.ts`,
  `flood.openmeteo.ts` et routes `floods/*` ; `apps/web` : `lib/flood/`,
  tranche `flood`, couche `components/map/layers/floods.ts`, panneau « Crues »
  de la carte ; `FLOOD_API_KEY` (`.env`, `deploy/`)
- **Révisé le 2026-09-14 :** fournisseur par défaut sans clé (GloFAS via
  Open-Meteo), Google Flood Hub sur clé ; lecture animée de la simulation.
- **Révisé le 2026-09-15 :** le simulateur passe du modèle « baignoire » à une
  propagation hydraulique pas à pas (onde inertielle), pilotée par débit et
  volume, animée en temps simulé ; la carte se cadre d'elle-même.

- **Révisé le 2026-09-20 (ADR 0025) :** rupture de barrage selon Froehlich 2008, crue selon l'hydrogramme du SCS, rugosité de Manning réglable, référentiel des grands barrages et des grands oueds, étendues 100 et 200 km.

## Contexte

L'état-major veut deux choses que la carte ne donnait pas : des **prévisions
de crue** sur les cours d'eau du pays, et un **simulateur** pour cadrer une
inondation de rivière, de lac ou de barrage — « si l'eau monte de trois
mètres ici, qu'est-ce qu'elle atteint ? ».

Deux fournisseurs ouverts couvrent le Maroc :

- **GloFAS** (Global Flood Awareness System, Copernicus / Commission
  européenne, v4) — débit journalier de chaque cellule de ~5 km d'un modèle
  hydrologique mondial, dix ans d'historique et trente jours de prévision,
  servi par l'API Flood d'**Open-Meteo** (déjà courtier météo de l'ADR 0002),
  **sans clé**, licence CC BY 4.0. Pas de jauge, pas de seuil, pas de carte
  d'inondation : un débit, à nous d'en tirer le reste.
- **Google Flood Forecasting API** (le moteur de Flood Hub) — jauges, statuts
  (gravité, tendance), prévisions avec seuils de vigilance et de danger,
  cartes d'inondation. CC BY 4.0, gratuite, mais **sur clé de projet Google
  Cloud** (compte, projet, activation, restriction de la clé) — en pratique
  hors de portée d'une station isolée, et un compte Google de plus.

Les deux sont des **fournisseurs externes étrangers**, exactement ce que l'ADR
0006 encadre : le navigateur d'un poste de commandement ne leur parle pas, et
le profil d'activité (quelles rivières on regarde, quand) ne sort pas.

Aucune source nationale équivalente n'est intégrée à ce jour ; l'ABH (agences
de bassin) et la DGM n'exposent pas d'API ouverte. La prévision servie est
donc la meilleure disponible, et une **information**, pas une vérité : le
contrat de l'API la nomme comme telle (fournisseur, source, attribution,
qualité vérifiée ou non).

Le simulateur, lui, ne doit dépendre de personne : une hypothèse d'état-major
se calcule sur le poste, sur le relief que la station a déjà (tuiles
d'altitude terrarium, souveraines en production — `infra/geo`).

## Décision

1. **Courtier serveur, comme EMSC et Open-Meteo — un contrat, deux
   fournisseurs.** `FloodService` normalise en un contrat stable
   (`FloodGauge`, `FloodForecast`, `FloodPolygon`, `FloodFeedStatus` avec son
   `provider`), met en cache, se dégrade sur le dernier cache connu **et le
   dit** (`degraded`, `error`). Routes gardées par `seismic:view`, comme la
   météo ; l'attribution CC BY est portée à l'écran.
   - **Sans clé (défaut) : GloFAS par Open-Meteo**, immédiatement intégrable.
     Vingt points nommés par nous sur les grands oueds, aux villes qu'ils
     menacent (`RIVER_POINTS`). Le point posé à la ville tombe souvent sur une
     cellule de plaine qui ne dit rien : on lit les **3 × 3 cellules** autour
     et on retient celle au débit moyen le plus fort — le lit de l'oued. Les
     **seuils** sont dérivés de l'historique de cette cellule (maxima annuels :
     vigilance = médiane, danger = 80ᵉ centile, extrême = maximum ; un lit sec
     — pic décennal sous 1 m³/s — n'a pas de seuil, donc jamais « sévère » par
     artefact), la gravité et la tendance de la prévision à sept jours ; le
     **pic prévu** est servi tel quel, lisible même sans seuil. Le quota
     gratuit se respecte : UNE requête « voisinage + prévision » toutes les
     6 h, l'historique point par point en arrière-plan (espacé, gardé un mois
     sur disque, `dev-store`), et un « 429 » impose un quart d'heure de recul
     au lieu de marteler. `qualityVerified: false`, pas de carte d'inondation.
   - **Avec `FLOOD_API_KEY` : Google Flood Hub** — jauges, statuts, seuils et
     cartes d'inondation du fournisseur ; la clé ne quitte jamais le serveur.
   La bascule est automatique et dite (`provider`) ; l'écran ne change pas.
2. **Simulateur hydraulique local** (`lib/flood/hydro.ts`, pur et testé) :
   une **propagation pas à pas dans le temps** sur la grille d'altitude, par
   l'équation de l'onde inertielle de Bates, Horritt & Fewtrell (2010) — celle
   des modèles de plaine d'inondation de type LISFLOOD-FP. Chaque cellule
   porte une lame d'eau ; chaque face entre deux cellules porte un débit
   unitaire qui suit la pente de la surface de l'eau, que la rugosité de
   Manning freine (n = 0,05, plaine avec cultures et bâti épars) et que le
   régime critique borne ; le pas de temps s'adapte à la lame la plus forte
   (condition de Courant) ; le volume se conserve — ce qui entre est au sol
   ou sorti du domaine par ses bords, ouverts ; une tuile absente est un mur.
   L'eau entre par un **hydrogramme** : crue de rivière (débit de pointe et
   durée, triangle), déversement de lac (volume et durée, plateau), rupture de
   barrage (volume de la retenue et hauteur d'eau → débit de pointe de
   Froehlich 1995, vidange en triangle raide). Seules les cellules mouillées
   et leurs voisines sont visitées : le coût suit l'emprise. Le modèle
   précédent — une « baignoire » à surface plate — donnait des lames absurdes
   dès que la vallée descendait (43 m à Kénitra pour 3 m de montée) et ne
   connaissait ni volume, ni débit, ni temps.
   Relief chargé depuis la source d'altitude **du mode courant** (`demTileUrl`,
   3 × 3 tuiles : ≈ 25 km à z12, ≈ 50 km à z11) : la station en souverain, la
   source externe en développement — jamais un tiers en production. Le calcul
   **court en arrière-plan par tranches** (`lib/flood/run.ts`, la main rendue
   toutes les 12 ms), dépose 120 **instantanés** sur l'horizon (lame au
   décimètre sur la boîte mouillée, `lib/flood/frames.ts`) et note **quand
   l'eau atteint** chaque hôpital, unité, abri et ville. La carte lit ces
   images en temps simulé (six heures en trente secondes, interpolation entre
   deux instantanés, jamais au-delà de ce que le calcul a produit) sur une
   source `canvas` MapLibre ; lecture, pause, curseur, horloge « t + 2 h 35 »,
   surface, lame maximale, volumes au sol, entré et sorti. Une course qui
   démarre amène la carte sur son point de départ (à l'échelle du pays, une
   emprise de vingt kilomètres tient en quelques pixels — c'est ainsi que
   « rien ne se voyait ») ; finie, elle l'encadre. Sous « réduire les
   animations », pas de défilé. Aucune donnée ne part du poste.
3. **Deux blocs distincts à l'écran** — prévisions d'un côté, simulation de
   l'autre — parce qu'une prévision est une information et une simulation une
   hypothèse ; les mélanger ferait lire l'une pour l'autre. Le simulateur dit
   ses limites en toutes lettres : ordre de grandeur, sans hydraulique ni
   durée, pas une prévision.

## Conséquences

- **Positives :** des prévisions de crue sur la carte **dès l'installation,
  sans clé ni compte**, et sans nouvelle dépendance côté navigateur ; un
  simulateur utilisable hors ligne, dont les entrées et le calcul restent sur
  le poste, et dont la lecture animée se lit d'un coup d'œil en salle ; un
  contrat stable que l'on peut rebrancher demain sur une source nationale
  sans toucher à l'écran ; tests unitaires sans réseau (normalisation, choix
  de cellule, seuils, quota, KML → GeoJSON, propagation et révélation sur
  relief de synthèse).
- **Négatives :** une dépendance à un fournisseur étranger pour les
  prévisions, encadrée par le courtier — à arbitrer par l'état-major comme
  les autres flux de l'ADR 0009 ; GloFAS est un modèle à ~5 km, sans jauge
  réelle : ses seuils sont **les nôtres**, statistiques, et une cellule de
  lit peut rester à côté d'un petit oued — `qualityVerified: false` le dit ;
  la première mise en route n'a pas de seuils pendant quelques minutes (les
  jauges disent « inconnu », le pic reste lisible) ; le simulateur reste un
  ordre de grandeur : relief à 30-60 m, une seule rugosité, ni ouvrages fins,
  ni infiltration, ni pluie — il cadre une évacuation et ses délais, il ne
  remplace pas une étude hydraulique ; le calcul d'une grande crue sur six
  heures prend quelques secondes à quelques dizaines de secondes sur le poste
  (la lecture attend les images plutôt que de sauter) ; les cartes
  d'inondation Flood Hub sont des KML convertis, jamais persistés.
