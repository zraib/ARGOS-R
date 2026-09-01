# ADR 0005 — Capacité NRBC : déclaration outillée et panache chimique sur carte

- **Statut : ACCEPTÉ — phases 1 à 3 implémentées et vérifiées (2026-08-21) ;
  phase 4 (Gauss) non engagée, derrière le même port**
- **Date :** 2026-08-21
- **Portée :** `apps/api` (module `nrbc`), assistant de déclaration d'incident,
  fiche incident, carte opérationnelle, `/parametres`

## Le besoin exprimé

1. Déclarer un incident NRBC en y **intégrant la substance chimique** en cause.
2. S'appuyer sur les **bonnes pratiques du domaine** (recherche faite, ci-dessous).
3. Trancher : **faut-il une page dédiée ?**
4. Sur la carte : une couche **intelligente** qui utilise le **vent réel** pour
   prédire l'évolution d'une fuite chimique, en **zones colorées** évolutives.

## Ce que la recherche métier impose

Trois référentiels se dégagent, et ils se complètent au lieu de se concurrencer :

- **ATP-45 (OTAN)** — LA doctrine militaire d'alerte et de prédiction de zone
  de danger NRBC, conçue pour être calculée **en poste de commandement, sans
  modèle lourd** : gabarits simples — un **cercle** autour du point de rejet
  quand le vent est ≤ 10 km/h, **cercle + triangle sous le vent** au-delà, pour
  un gabarit couvrant 2 heures. C'est exactement le cadre d'emploi d'ARGOS
  (état-major), et il existe des implémentations ouvertes qui prouvent sa
  calculabilité directe.
- **ERG 2024 (PHMSA/DOT)** — le guide des premiers intervenants : pour chaque
  substance, **distance d'isolement initial** et **distance d'actions de
  protection**, déclinées jour/nuit et petit/grand déversement. Données
  publiques, transcriptibles en catalogue. À noter : ammoniac et chlore
  représentent ~96 % des toxiques par inhalation transportés — un catalogue de
  15-20 substances couvre l'essentiel du risque industriel réel.
- **Panache gaussien (Pasquill-Gifford / ALOHA)** — le modèle fin de référence,
  mais avec des hypothèses fortes assumées par ALOHA lui-même : vent constant,
  validité ≤ 1 h et ≤ 10 km. Pertinent en **V2**, pas comme fondation.

**Décision de conception (à la demande de l'utilisateur) : les TROIS
référentiels sont offerts au choix de l'opérateur, et combinables.**

La clé qui rend cela propre : ils ne se concurrencent pas, ils répondent à
trois questions différentes —

| Vue | Question | Forme |
|---|---|---|
| **ATP-45** (doctrine) | Quelle zone d'alerte selon la procédure OTAN ? | Cercle / cercle + triangle sous le vent, gabarit 2 h |
| **ERG 2024** (réglementaire) | Quelles distances d'isolement et de protection pour cette substance ? | Cercle d'isolement + zone d'action sous le vent, jour/nuit |
| **Gauss / Pasquill** (physique) | Où la concentration sera-t-elle réellement dangereuse ? | Panache continu en gradient |

### Choix et combinaison — règles retenues

- **Port unique `PlumeModel`, trois moteurs purs** (`atp45.engine`,
  `erg.engine`, `gauss.engine`) : même entrée (point, substance, vent,
  heure), même sortie (zones GeoJSON étiquetées `model`). Le sélecteur
  d'interface ne coûte presque rien parce que l'architecture hexagonale du
  dépôt est déjà faite pour ça — ajouter Gauss plus tard n'ouvrira AUCUN
  chantier d'interface : il apparaîtra comme troisième option du même port.
- **Sélection par l'opérateur** dans le panneau panache de la carte
  (par incident, mémorisée en session) ; **vue par défaut réglable** dans
  `/parametres` (défaut proposé : ATP-45, la doctrine du poste).
- **Combinaison lisible** : UNE vue primaire **remplie** (couleurs pleines
  semi-transparentes), les vues secondaires en **contours seuls** — jamais
  deux remplissages superposés, sinon la carte devient une soupe. La légende
  attribue chaque tracé à son référentiel.
- **« Enveloppe prudente »** (option de combinaison recommandée pour la
  décision de protection) : l'**union** des zones des vues actives — la
  lecture la plus conservatrice. Le désaccord entre modèles n'est pas masqué :
  c'est une **information d'incertitude**, affichée comme telle.
- **Honnêteté par vue** : chaque tracé porte son étiquette (« Gabarit ATP-45 »,
  « Distances ERG 2024 », « Modèle gaussien — estimation ») et l'heure du vent
  utilisé. Même doctrine que l'estime aérienne : une estimation se présente
  comme une estimation.

### Coût de ce choix (honnête)

- ATP-45 et ERG : bon marché — géométrie + données seedées.
- **Gauss est le seul morceau lourd** : il exige la classe de stabilité
  Pasquill (jour/nuit + couverture nuageuse). Open-Meteo fournit la couverture
  nuageuse mais le `WeatherService` ne la récupère pas encore — extension
  mineure du proxy (un champ horaire de plus, dans le cadre ADR-0002).
- Le sélecteur et la combinaison se construisent **dès la phase 2** avec deux
  moteurs (ATP-45 + ERG) ; Gauss arrive en phase 4 derrière le même port.

## Ce qu'ARGOS possède déjà (vérifié dans le code)

| Brique | État |
|---|---|
| **Direction du vent** | `wind_direction_10m` + `wind_speed_10m` horaires déjà récupérés par `WeatherService` (Open-Meteo, ADR-0002) — champ `windDir` présent jusqu'au web. **L'entrée critique du panache existe.** |
| Types d'incident | Paramétrables (`IncidentTypesService.register`, libellés fr/ar/en + icône) — un type NRBC se seede sans chirurgie |
| Couches GeoJSON carte | Précédents `routes`, `measure`, `quakes` dans `MapCanvas` — le panache suit le même patron |
| Ligne de temps météo | Existe sur la carte — support naturel de l'évolution horaire du panache |
| Moteur pur + port API | Patron éprouvé (risk.engine F-04, aviation ADR-0004) : calcul côté serveur, testé, ETag |
| Sous-incidents, fiche incident, wizard | Points d'accroche du déclaratif |

## Proposition d'architecture

### 1. Déclaration (le « C » outillé dès la V1, les 4 familles déclarables)

- Champs optionnels sur l'incident : `nrbc { famille: N|R|B|C, substanceId?,
  quantite?: petit|grand, rejet?: instantane|continu }`.
- **Wizard** : le choix d'un type NRBC révèle une étape « Substance » —
  recherche dans le catalogue (nom, n° ONU, état physique), quantité estimée,
  mode de rejet. Progressive disclosure : rien ne change pour les autres types.
- **Fiche incident** : bloc NRBC — substance, distances ERG (isolement /
  protection, jour/nuit), conduite à tenir, lien « voir le panache ».

### 2. Module API `nrbc` (hexagonal, comme `aviation`)

- Port `SubstanceCatalog` + adaptateur in-memory seedé **ERG 2024** (~15-20
  substances industrielles : chlore, ammoniac, GPL, H₂S, SO₂, phosgène… chaque
  entrée citant sa source). CRUD superadmin plus tard.
- **Moteur de panache PUR** `plume.engine.ts` (patron risk.engine) : entrées =
  point de rejet, substance (rayons ERG), vent local horaire (vitesse +
  direction, du `WeatherService` existant) → sortie = **GeoJSON** des zones
  ATP-45 (cercle ≤ 10 km/h ; cercle + triangle sous le vent au-delà), pour
  H, H+1… H+6 en s'appuyant sur le vent **prévu** de chaque heure.
- Endpoint `GET /api/nrbc/plume/:incidentId?h=` → FeatureCollection + métadonnées
  (hypothèses, heure météo utilisée, `computeMs`). ETag déjà global.
- Permission `nrbc` en table LEGACY (comme `aviation`), à arbitrer en matrice.

### 3. Carte — la demande centrale

- Source GeoJSON `nrbc-plume` + couches de remplissage : **rouge** (danger
  immédiat / isolement), **orange** (actions de protection), **jaune**
  (vigilance) — opacités faibles, contours nets, sous les marqueurs.
- **Flèche de vent** au point de rejet (direction + vitesse affichées).
- **Évolution temporelle** : la ligne de temps météo existante pilote le
  panache — glisser sur H+3 recalcule les zones avec le vent prévu à H+3.
- **Croisement dispositif** (l'« intelligence » utile) : hôpitaux, unités,
  abris situés DANS une zone sont listés dans la fiche incident avec leur zone
  — et remontent au Copilot (« quels moyens sont dans le panache ? »).
- **Honnêteté doctrinale** (même règle que l'estime aérienne) : bandeau
  permanent « Estimation ATP-45 — gabarit réglementaire, pas une mesure », avec
  l'heure de la donnée vent utilisée.

### 4. Page dédiée : NON pour l'opérationnel — et voici pourquoi

L'objet central d'ARGOS est **l'incident** ; le panache est un attribut de
l'incident, la carte est déjà le lieu où on le regarde. Une page « NRBC »
dupliquerait la carte et créerait un silo de navigation. Proposition :

- **Déclaration** → wizard (existant, enrichi).
- **Consultation** → fiche incident (bloc NRBC) + carte (couche panache).
- **Catalogue de substances** → une **section dans `/parametres`** (superadmin),
  comme les types d'incident aujourd'hui.
- Une page d'**analyse** multi-scénarios ne se justifierait qu'en V3, si le
  besoin émerge (couplage naturel avec le What-If d'Oumaima).

## Phasage proposé

| Phase | Contenu | Complexité |
|---|---|---|
| **1 — Déclaratif** | Catalogue substances API + champs incident + étape wizard + bloc fiche + distances ERG affichées | MEDIUM |
| **2 — Panache & sélecteur** | Port `PlumeModel` + moteurs ATP-45 et ERG + endpoint GeoJSON multi-modèles + couche carte (primaire remplie / secondaires en contours) + enveloppe prudente + flèche vent + étiquettes par vue | MEDIUM |
| **3 — Évolution & intelligence** | Timeline H+1…H+6 sur vent prévu + croisement dispositif (impactés listés, par vue et par enveloppe) + intent Copilot + accroche What-If | MEDIUM |
| **4 — Gauss** | Troisième moteur derrière le même port : couverture nuageuse ajoutée au proxy météo, classes de stabilité Pasquill, gradient de concentration | HIGH |

Chaque phase est livrable et vérifiable seule (typecheck, tests du moteur pur —
déterminisme et bornes, comme risk.engine — et vérification navigateur).

## Risques et parades

| Risque | Niveau | Parade |
|---|---|---|
| Gabarit simplifié ≠ réalité (relief, bâti, inversions) | HIGH | Doctrine ATP-45 assumée + bandeau « estimation » + hypothèses journalisées dans la réponse API |
| Transcription manuelle des distances ERG | MEDIUM | Fichier seed avec source citée par entrée, relu avant merge ; couverture limitée mais honnête (15-20 substances ≈ l'essentiel du transporté) |
| Vent = prévision Open-Meteo à 10 m, pas mesure locale | MEDIUM | Afficher l'heure et la source du vent utilisé ; V2 : saisie manuelle d'un vent observé terrain qui prime |
| Familles R/N (gabarits ATP-45 différents du chimique) | — | V1 : déclaratif pour les 4 familles, panache pour le « C » seulement ; R/N en phase dédiée |
| Souveraineté | — | Aucune dépendance nouvelle : calcul interne, météo déjà couverte par l'ADR-0002 |

## Références

- ATP-45, OTAN — Warning and Reporting and Hazard Prediction of CBRN Incidents
- ERG 2024, PHMSA/DOT — tables des distances d'isolement et de protection
- ALOHA (NOAA/EPA) — documentation technique du modèle gaussien

## Provenance des données (relevé au 2026-09-01)

Cette section porte le récapitulatif chiffré de la bibliothèque. Il était
affiché en tête de la page « Substances dangereuses » depuis le lot N-3 ; il en
a été retiré au lot N-5, sur demande, et vit désormais ici.

**Ce qui reste à l'écran, et pourquoi c'est l'essentiel.** Les marqueurs par
substance n'ont pas bougé : chaque carte de résultat et chaque fiche indique si
SES distances sont relevées sur l'ERG 2024 (`ergVerified`) ou restent à
confirmer, et si SA fiche a été confrontée à CAMEO Chemicals (`sheetVerified`).
Une substance sans distances le dit explicitement plutôt que de laisser croire
à une absence de danger. L'honnêteté demeure donc là où l'on lit une matière —
au moment d'agir. Seul l'agrégat, qui relevait de l'audit et non de
l'intervention, a quitté l'interface.

**Ce qui reste dans le contrat.** `GET /api/nrbc/library` continue de renvoyer
l'objet `provenance` : il est testé (`nrbc-library.spec.ts` — la provenance
décrit TOUTE la bibliothèque, jamais la page filtrée) et reste interrogeable
pour régénérer les chiffres ci-dessous.

### Chiffres

| Grandeur | Valeur |
| --- | --- |
| Substances au total | 5 336 |
| Fiches opérationnelles | 5 094 / 5 336 — dont **5 094 confrontées à CAMEO Chemicals (NOAA)** |
| Jeux de distances | 272 / 5 336 — dont **272 relevés sur la table 1 de l'ERG 2024** |
| Jeux versés sous licence | 2 |

Régénérable à tout moment :

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/nrbc/library?limit=1 | python3 -m json.tool
```

### Jeux versés — origine et titre de détention

**1. Fiches CAMEO Chemicals 3.1.0 (NOAA)** — relevé le 2026-08-31 · 5 094 fiches
· contenu NOAA / NTP / USCG / EPA / NIOSH / ICSC.

> Contenu rédactionnel d'agences publiques. ÉCARTÉS, leurs propriétaires étant
> nommés dans les conditions d'utilisation : numéros et synonymes CAS (Chemical
> Abstracts Service), tenues DuPont, seuils AEGL (NACA), seuils ERPG (AIHA),
> cotations et propriétés de source NFPA.

**2. ERG 2024, tables 1 et 3** — PHMSA / Transports Canada / SCT, extraites de
CAMEO Chemicals 3.1.0 — relevé le 2026-08-31 · 272 jeux de distances.

> Emergency Response Guidebook — publication gouvernementale conjointe,
> diffusion libre aux services de secours. AUCUNE donnée sous licence tierce
> n'est extraite : ni fiches CAMEO, ni numéros CAS, ni données DuPont, ni seuils
> AEGL/ERPG.

### Pourquoi ces exclusions

Les conditions d'utilisation de CAMEO Chemicals sont explicites :

> « Data from the above organizations shall not be duplicated by the recipient,
> without written permission from those organizations. »

Posséder l'application de bureau ne confère pas ce droit. Les scripts
d'extraction (`apps/api/scripts/extract-erg-from-cameo.ts` et
`extract-cameo-sheets.ts`) ne SÉLECTIONNENT jamais les tables `chemical_cas`,
`dupont`, `aegls`, `erpgs`, ni les colonnes `nfpa_*` ou les propriétés dont la
source déclarée est la NFPA. Ce n'est pas une précaution de façade : c'est ce
qui rend l'extraction défendable.

Les 31 numéros CAS présents dans `substances.data.ts` sont antérieurs et
conservés comme identifiants isolés — garder trente et un numéros est une chose,
recopier un registre de cinq mille en est une autre.

### Limite connue

Le champ `state` (gaz / liquide) n'est PAS une donnée de provenance vérifiée :
`extract-cameo-sheets.ts` l'inscrit à `"liquid"` en dur pour les 5 336 entrées,
faute de colonne fiable dans `cameo.sqlite`, et la fusion fait primer l'import.
Le chlore, déclaré `gas` dans notre source, en ressort « liquide » alors qu'il
bout à −34 °C. Le champ n'est donc plus affiché ; voir la dette dans
`CONTEXT.md`.

## Note d'implémentation (2026-08-21, phases 1-3)

Réalisé conformément au plan, avec les précisions suivantes :

- **Module API** `apps/api/src/modules/nrbc/` sur le patron hexagonal de
  l'ADR-0004 : port `SubstanceCatalog` + adaptateur in-memory (11 substances,
  chlore et ammoniac relevés sur CAMEO/NOAA → `ergVerified: true`, les autres
  `false` et l'interface l'affiche), moteurs purs `plume/plume.engine.ts`
  (géométrie sphérique, gabarits ATP-45 et ERG), 10 tests (seuil 10 km/h,
  jour/nuit, orientation sous le vent, fermeture des anneaux, déterminisme).
- **Endpoints** : `GET /nrbc/substances` et `GET /nrbc/plume/:incidentId`
  (`models=atp45,erg`, `hour=0..6`) → FeatureCollection GeoJSON directement
  consommable par la source MapLibre, + méta (vent du pas horaire, jour/nuit,
  heure UTC). Permission `nrbc` (table LEGACY, dotation calquée sur l'aviation).
- **Vent** : `WeatherService.pointSeries(lat, lon)` — série horaire 7 j au
  point exact de l'incident (cache 10 min) ; sans prévision, les zones
  directionnelles sont **omises** plutôt qu'inventées.
- **Wizard** : section conditionnelle à l'étape 2 (famille N/R/B/C ; substance,
  ampleur, mode de rejet pour la famille C) — pas d'étape nouvelle.
- **Carte** : source `nrbc-plume` + 3 couches (remplissage du référentiel
  primaire, contours, contours tiretés des secondaires) ; panneau dans le trio
  natif (4e bouton n'existant que panache actif, auto-ouvert à l'arrivée) ;
  bandeau « Estimation — pas une mesure » permanent, y compris sous `lg`.
- **Écarts assumés** : ATP-45 vent faible rend le cercle 10 km en niveau
  `vigilance` (pas `protection`) — sémantiquement plus juste ; jour/nuit tranché
  par l'heure locale approchée UTC+1 (documenté dans `nrbc.service.ts`) ;
  l'enveloppe prudente est une directive de style (teinte unique), pas une
  union géométrique.
- **Vérifié** : 106/106 tests API, typecheck web+API, RBAC (403 hors dotation),
  et navigateur — panache chlore INC-2613 à Casablanca orienté sous le vent
  réel (11 km/h du 354° → extension plein sud), évolution H+3 (16 km/h du 347°),
  enveloppe, wizard et fiche.
