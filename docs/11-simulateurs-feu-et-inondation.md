# Simulateurs de feu de forêt et d'inondation

Ce que calculent les deux simulateurs de la carte opérationnelle, sur quels
modèles du domaine, avec quels réglages, quelles limites — et où est le code.
Pour l'état-major qui les emploie, pour l'ingénieur qui les fait évoluer, pour
l'auditeur qui veut confronter les chiffres aux outils de référence
(BehavePlus, FARSITE, HEC-RAS).

Décisions d'origine : [ADR 0010](adr/0010-crues-flood-hub-et-simulateur.md)
(inondation), [ADR 0011](adr/0011-feux-de-foret-simulateur.md) (feu),
[ADR 0018](adr/0018-mode-edition-par-role-terrain-simulations.md) (qui simule),
[ADR 0025](adr/0025-simulateurs-aux-normes-rothermel-froehlich.md) (les
modèles physiques actuels).

## 1. Ce que c'est — et ce que ce n'est pas

Les deux simulateurs répondent à la même question d'état-major : **à partir de
ce point, où va le phénomène, en combien de temps, avec quelle intensité, et
qu'est-ce qu'il atteint** — hôpitaux, unités, abris, villes. Ils servent à
dimensionner une évacuation, des coupures de route, un pré-positionnement, un
exercice.

Ils reposent sur les modèles mathématiques en usage dans chaque domaine
(Rothermel pour le feu ; onde inertielle, hydrogramme du SCS et Froehlich
pour l'eau), calculés **sur le relief réel** (tuiles d'altitude de la carte),
**entièrement dans le navigateur du poste** : aucune donnée opérationnelle ne
part vers un service, et le mode souverain (ADR 0023) les fait tourner sans
aucun accès Internet.

Ce ne sont **pas** des études réglementaires : ni carte de combustible, ni
bathymétrie, ni ouvrages fins (digues, ponts), ni action des secours. Les
panneaux le disent en tête (`fire_sim_hint`, `flood_sim_hint`) et les
chiffres affichés portent le nom de leur modèle pour rester confrontables.

## 2. Ce que les deux partagent

| Élément | Comment |
| --- | --- |
| **Relief** | grille de **3 × 3 tuiles** d'altitude « terrarium » (256 px, `alt = R·256 + G + B/256 − 32768`) centrée sur le point de départ, servies par la station en mode souverain (`/tiles/dem/{z}/{x}/{y}`) ou par la source externe en développement — `lib/flood/dem.ts`, `lib/flood/grid.ts`. Une tuile absente laisse ses cellules inconnues (`NaN`) : l'eau ne les traverse pas, le feu ne les brûle pas, le panneau signale l'emprise incomplète (`sim_partial`). |
| **Étendue et résolution** | l'étendue choisie fixe le zoom des tuiles, donc la taille des cellules (à la latitude du Maroc) : 25 km → z12 ≈ 30 m · 50 km → z11 ≈ 60 m · 100 km → z10 ≈ 120 m · 200 km → z9 ≈ 240 m (`cellSizeMeters`). Le feu offre 25 et 50 km, l'inondation les quatre. |
| **Point de départ** | « Cliquer sur la carte » arme le prochain clic (point d'allumage, point de rupture ou d'injection) ; le barrage du référentiel pose lui-même son point. Un point sans altitude connue est refusé (`sim_err_elevation`). |
| **Calcul** | dans le navigateur, **par tranches de 12 ms** rendues à l'écran entre deux (`driveFireRun`, `driveFloodRun`) : la carte respire pendant le calcul, la lecture démarre dès les premières images. Une course lancée peut être remplacée ou effacée ; celle qui se termine ne touche plus au magasin si elle n'est plus la course en cours. |
| **Images** | **120 instantanés** régulièrement espacés sur l'horizon (1 à 24 h), chacun réduit à la boîte des cellules touchées (un octet par cellule) ; entre deux instantanés l'écran **interpole** pour une lecture sans à-coups (`lib/sim/spread.ts`, `components/map/layers/spread.ts`). |
| **Lecture** | un canevas MapLibre posé entre les quatre coins du relief, sous les points ; lecture / pause / rejouer, curseur d'avancement, horloge `t + h m` ; tout l'horizon défile en **30 s** ; la caméra vient sur le point de départ puis encadre l'emprise. |
| **Points atteints** | hôpitaux, unités, abris (à la position de leur commune) et communes du référentiel, avec l'heure simulée d'atteinte — feu : arrivée du front ; eau : lame ≥ 0,10 m (`REACH_DEPTH`), la lame alors est notée. |
| **Qui simule** | les modules `simFire` et `simFlood` de la matrice (ADR 0018) suivent le trait `simulate` des rôles (`apps/api/src/shared/profiles.ts`) : mode classique — Super Administrateur, Administrateur, Stratégique, OPCOM et ses représentants, TACOM, PCO, PCT ; mode Direx — Chef, Eval, Anim et RLS / DIREX, Chef, OPS et Planif-Rens des PC FAR et PCF, Chef / PCT et Chef / PCO. Couper le module retire l'outil de la carte. |

Pour lancer une simulation : carte opérationnelle → onglet **Feux de forêt** ou
**Crues** → « Cliquer sur la carte » puis un clic au point voulu → réglages →
**Lancer la simulation**. Les réglages se modifient sans relancer ; le panneau
recalcule à la volée les grandeurs dérivées (comportement du feu, débit de
pointe, brèche).

## 3. Simulateur de feu de forêt

Code : `lib/fire/rothermel.ts` (le modèle, pur), `lib/fire/spread.ts` (la
végétation, le vent effectif, la grille), `lib/fire/run.ts` (la course et ses
images), tranche `lib/store/slices/fire.ts`, panneau
`app/map/_parts/FirePanel.tsx`, couche `components/map/layers/fire.ts`.

### 3.1 Le modèle de Rothermel (1972)

La vitesse de propagation d'un feu de surface, telle que formalisée par
Andrews (2018, USDA RMRS-GTR-371) avec les corrections d'Albini (1976) :

```
R = I_R · ξ · (1 + φw + φs) / (ρb · ε · Q_ig)
```

- `I_R` intensité de réaction : vitesse de réaction optimale Γ' (Albini),
  charge nette par catégorie (mort / vif) groupée par classe de taille,
  amortissement d'humidité η_M (avec l'humidité d'extinction du vif calculée
  depuis le rapport mort/vif) et minéral η_s ;
- `ξ` flux propagé, `ρb ε Q_ig` puits de chaleur (avec `Q_ig = 250 + 1116 M`) ;
- `φw = C · U^B · (β/β_op)^−E` facteur de vent, `U` borné à `0,9 I_R`
  (Rothermel 1972) ; `φs = 5,275 · β^−0,3 · tan²φ` facteur de pente, à la
  **montée seulement**.

Le calcul se fait dans les unités du modèle (pieds, livres, Btu) et convertit
aux bornes : c'est ainsi que les valeurs publiées se retrouvent. Sortent aussi
l'intensité du front `I_B = I_R · t_r · R` (Byram 1959, kW/m), la longueur de
flamme `L = 0,45 · I_B^0,46` ft (Byram) et le temps de résidence
`t_r = 384/σ` min (Anderson 1969) — la durée des flammes dans l'animation.

### 3.2 Combustible : les 13 modèles d'Anderson (1982), rapportés à la végétation marocaine

L'opérateur choisit la **végétation dominante** ; chaque choix est un modèle
de combustible standard (charges par classe, rapport surface/volume,
épaisseur, humidité d'extinction, facteur d'ajustement du vent) :

| Végétation (panneau) | FM | Modèle d'Anderson |
| --- | --- | --- |
| Herbe, chaumes, céréales, steppe | FM1 | Short grass |
| Herbe haute, céréales sur pied | FM3 | Tall grass |
| Maquis, garrigue, broussailles (matorral bas) | FM5 | Brush |
| Maquis dense, arganeraie embroussaillée | FM4 | Chaparral |
| Broussaille sèche, rémanents feuillus | FM6 | Dormant brush |
| Résineux — pin, thuya, cèdre — avec sous-bois | FM10 | Timber (litter and understory) |
| Feuillus — chênaie, subéraie | FM9 | Hardwood litter |
| Litière fermée de résineux, sans sous-bois | FM8 | Closed timber litter |
| Rémanents de coupe | FM11 | Light logging slash |
| Sol nu, très clairsemé | FM1/4 | Short grass à un quart de sa charge |

Le numéro du modèle est affiché à côté du choix (`· FM5`). Les treize modèles
sont dans `FUEL_MODELS` (`rothermel.ts`), tels que publiés, avec le facteur
d'ajustement du vent d'Andrews (2012) pour un lit non abrité.

### 3.3 Humidité du combustible

- **Mort 1 h** : humidité d'équilibre de **Simard (1968)** — l'équation du
  NFDRS, des tables de Rothermel (1983) — depuis la température et l'humidité
  relative de l'air (nominale, plein soleil) : 30 °C / 30 % → 5,8 % ;
  20 °C / 60 % → 10,7 % ; 40 °C / 10 % → 2,3 %.
- **Mort 10 h et 100 h** : +2 % et +4 % (règle des tables de Rothermel 1983).
- **Vif** : réglé par l'opérateur — « Humidité du combustible vif », 30 à
  200 %, défaut 80 % (≈ 60 % en été sec, 120 % au printemps) ; le ligneux vaut
  1,3 × l'herbacé.
- Au-delà de l'humidité d'extinction du modèle (mort à 12–40 % selon le
  modèle, vif selon le rapport mort/vif d'Albini), le combustible ne propage
  plus (`η_M = 0`, `R → 0`).

La météo du point (vent, direction, humidité, température) se relève par
« Météo au point » — courtier météo de l'API, jamais un tiers depuis le
navigateur — et se corrige à la main.

### 3.4 Vent, pente, vent effectif

- Le **vent à 10 m** (km/h, direction d'où il vient) est ramené à 20 ft
  (× 0,87) puis à **mi-flamme** par le facteur d'ajustement du modèle
  (`midflameWind`).
- En **chaque cellule**, la pente vient du gradient du relief (différences
  centrées, bornée à 60°). Son facteur `φs` est converti en **vent équivalent**
  dirigé vers la montée (`equivalentWind` : le vent qui produirait à lui seul
  ce facteur), **additionné vectoriellement** au vent à mi-flamme (Finney 1998,
  Andrews 2018) — face au vent, la montée peut donc se retrouver freinée,
  comme dans FARSITE. Le vent effectif donne la vitesse de tête de la cellule
  et l'allongement de son ellipse.
- **Ellipse** : rapport longueur/largeur d'Anderson (1983) selon le vent
  effectif (`LB = 0,936 e^{0,2566 U} + 0,461 e^{−0,1548 U} − 0,397`, borné à 8),
  vitesse dans une direction faisant l'angle θ avec le vent vue depuis le
  foyer arrière (Richards 1990) : `R(θ) = R_tête (1 − e) / (1 − e cos θ)`,
  `e = √(1 − 1/LB²)`.

### 3.5 Propagation : temps minimal de parcours

`FireSpread` calcule l'**heure d'arrivée** du front en chaque cellule
(Finney 2002, la méthode de FlamMap) : un Dijkstra sur la grille, de chaque
cellule atteinte vers ses huit voisines, au coût `distance / R(θ)` avec le
vent effectif de la cellule de départ. Une altitude inconnue ne brûle pas ;
un front qui touche le bord de la grille se signale (`fire_truncated` :
élargir l'étendue). Le calcul s'arrête à l'horizon.

Les images en dérivent : l'état d'une cellule à l'instant `t` est intacte
(`arrivée > t`), en flammes (`t − arrivée < t_r`, de 1 « vient de s'allumer »
à 200 « fin de résidence ») ou braises (255). Palette : flammes jaune vif au
front (`255,214,64`) virant au rouge sombre (`196,32,18`) avec l'âge, braises
gris-brun (`72,52,44`).

### 3.6 Vérification contre le tableau d'Anderson

`lib/__tests__/fire.test.ts` recalcule les 13 modèles dans les conditions du
tableau d'Anderson (1982) — vent 5 mi/h à mi-flamme, 8 % d'humidité du mort,
100 % du vif — et compare la vitesse (chaînes/h) :

| FM | ARGOS | Anderson | écart |
| --- | --- | --- | --- |
| 1 | 81 | 78 | +4 % |
| 2 | 33 | 35 | −7 % |
| 3 | 102 | 104 | −2 % |
| 4 | 71 | 75 | −5 % |
| 5 | 14,5 | 18 | −20 % |
| 6 | 30 | 32 | −8 % |
| 7 | 26 | 20 | +31 % |
| 8 | 1,8 | 1,6 | +10 % |
| 9 | 7,6 | 7,5 | +1 % |
| 10 | 7,9 | 7,9 | 0 % |
| 11 | 5,6 | 6 | −7 % |
| 12 | 11,9 | 13 | −8 % |
| 13 | 14,1 | 13,5 | +5 % |

Douze modèles à ≤ 20 % (tolérance du test : 35 %, 12 % sur les modèles sans
combustible vif) ; l'écart sur FM7 tient à la variante de l'humidité
d'extinction du vif d'Albini. Le test vérifie aussi que le vent et la pente
accélèrent, que l'humidité freine, que l'extinction éteint, et les classes
tactiques.

### 3.7 Le panneau

| Réglage | Plage | Défaut |
| --- | --- | --- |
| Combustible dominant | 10 végétations (§ 3.2) | maquis (FM5) |
| Vent à 10 m | 0–120 km/h | 20 |
| Direction d'où vient le vent | 0–359° (point cardinal affiché) | 270 (ouest) |
| Humidité de l'air | 5–100 % | 30 |
| Température | 0–50 °C | 30 |
| Humidité du combustible vif | 30–200 % | 80 |
| Horizon simulé | 1–24 h | 6 |
| Étendue du relief | 25 km (30 m) · 50 km (60 m) | 25 km |

Lectures, recalculées à chaque réglage **avant** même de lancer : la ligne
Rothermel — `Rothermel FM5 · combustible fin mort à 6 % · flammes 1,6 m ·
front 681 kW/m` — et la **lecture tactique** de la « hauling chart »
(Andrews & Rothermel 1982) : attaque directe possible (< 1,2 m), engins et
retardant (1,2–2,4 m), attaque indirecte seulement (2,4–3,4 m), feu de cime
probable, aucune attaque du front (> 3,4 m). Puis, pendant et après la course :
vitesse de tête (m/min), allongement, surface parcourue et surface en flammes
(km²), résolution, points atteints avec leur heure.

Avec les réglages par défaut (maquis, 20 km/h, 30 %, 30 °C, vif 80 %) :

| Végétation | FM | R tête | flammes | I_B | tactique |
| --- | --- | --- | --- | --- | --- |
| herbe rase | 1 | 19,6 m/min | 1,1 m | 337 kW/m | directe |
| herbe haute | 3 | 37,9 | 4,0 | 5 392 | hors |
| maquis | 5 | 6,2 | 1,6 | 681 | engins |
| maquis dense | 4 | 31,3 | 6,6 | 15 528 | hors |
| broussaille sèche | 6 | 10,8 | 1,8 | 963 | engins |
| résineux | 10 | 2,0 | 1,3 | 491 | engins |
| feuillus | 9 | 1,4 | 0,6 | 102 | directe |
| litière fermée | 8 | 0,4 | 0,3 | 13 | directe |
| rémanents | 11 | 1,6 | 0,9 | 229 | directe |
| clairsemé | 1/4 | 4,1 | 0,3 | 14 | directe |

### 3.8 Limites

Ni sautes de feu (brandons), ni feu de cime (Van Wagner 1977 — la longueur de
flamme dit seulement quand il devient probable), ni carte de combustible (une
végétation pour toute l'emprise), ni humidité mesurée sur le terrain, ni
ombrage ni heure du jour dans l'humidité d'équilibre, ni action des secours.
Le relief est celui des tuiles (30 ou 60 m).

## 4. Simulateur d'inondation

Code : `lib/flood/hydro.ts` (schéma, hydrogrammes, scénarios), `lib/flood/dams.ts`
(référentiel des barrages et des oueds), `lib/flood/frames.ts` (instantanés,
palette), `lib/flood/run.ts` (la course), tranche `lib/store/slices/flood.ts`,
panneau `app/map/_parts/FloodPanel.tsx`, couche `components/map/layers/floods.ts`.
Les **prévisions** de crue (jauges GloFAS / Flood Hub servies par l'API) sont
un autre bloc du même panneau ; elles ne participent pas au calcul.

### 4.1 Le schéma : onde inertielle (Bates, Horritt & Fewtrell 2010)

L'écoulement d'un volume d'eau injecté en un point selon un hydrogramme, pas à
pas sur la grille — l'équation des modèles de plaine d'inondation de type
LISFLOOD-FP. Chaque cellule porte une lame `h` ; chaque face entre deux
cellules porte un débit unitaire `q` (m²/s) :

```
q(t+Δt) = [ q − g · h_f · Δt · ∂(z + h)/∂x ] / [ 1 + g · Δt · n² · |q| / h_f^{7/3} ]
```

- `h_f` : la lame qui coule à la face — la surface la plus haute au-dessus du
  sol le plus haut ; en dessous de `hmin` = 1 cm, la face ne coule pas ;
- `n` : rugosité de Manning ;
- **limiteur de Froude** : `|q| ≤ h_f √(g h_f)` (jamais plus vite que l'onde) ;
- une cellule ne donne pas plus qu'elle n'a : ses sorties se réduisent au prorata ;
- pas de temps **adaptatif** `Δt = min(10 s, 0,7 · Δx / √(g h_max))` (Courant) ;
- le **volume se conserve** : ce qui entre (l'hydrogramme, réparti sur les
  3 × 3 cellules du point de départ) est au sol, ou sorti du domaine par ses
  bords, qui sont **ouverts** ; le panneau affiche les trois volumes ;
- une altitude inconnue est un mur ; seules les cellules mouillées et leurs
  voisines sont visitées (le coût suit l'emprise, pas la grille).

Rugosité (Chow 1959), au choix : lit naturel dégagé 0,035 · plaine cultivée,
bâti épars 0,05 (défaut) · végétation dense, vergers 0,08 · tissu urbain 0,12.

### 4.2 Les trois sources

**Rivière — l'hydrogramme unitaire adimensionnel du SCS** (NRCS, National
Engineering Handbook, part. 630 ch. 16), approché par une loi gamma :

```
q(t) = Qp · (t/tp)^m · e^{m(1 − t/tp)},   m = 3,7,   tp = 0,375 × durée
```

Volume écoulé `V = Qp · tp · K(m)` avec `K(m) = Γ(m+1) e^m / m^{m+1}` (K(3,7)
= 1,333). Pour 1 500 m³/s sur 6 h : pointe à 2 h 15, ≈ 16 hm³.

**Lac — déversement** : un débit constant `V / durée` pendant la durée.

**Barrage — rupture selon Froehlich (2008)**, la référence des études de
rupture (HEC-RAS, FERC), avec `V` le volume de la retenue et `H` la hauteur
d'eau au-dessus du fond de brèche :

```
Qp = 0,0443 · √g · V^0,367 · H^1,25          (débit de pointe, m³/s)
tf = 63,2 · √( V / (g · H²) )                (temps de formation de la brèche, s)
B  = 0,27 · ko · V^0,32 · H^0,04             (largeur moyenne, m ; ko = 1,3 surverse, 1,0 renard)
```

L'hydrogramme de rupture monte pendant la formation de la brèche (pointe à
`tf`) puis décroît selon une loi gamma dont le paramètre `m` est **résolu par
dichotomie pour que le volume écoulé soit exactement celui de la retenue**
(`∫ q dt = V`, test : ± 3 %). La durée utile court jusqu'à 1 % de la pointe.

| Barrage | Retenue | H | Qp | tf | B | vidange |
| --- | --- | --- | --- | --- | --- | --- |
| Al Wahda | 3 522 hm³ | 88 m | ≈ 119 000 m³/s | 3,8 h | ≈ 480 m | ≈ 22 h |
| Al Massira | 2 760 | 80 | ≈ 97 000 | 3,7 h | ≈ 440 m | ≈ 21 h |
| Bin El Ouidane | 1 384 | 133 | ≈ 142 000 | 1,6 h | ≈ 360 m | ≈ 7 h |
| Lalla Takerkoust | 68 | 71 | ≈ 21 000 | 0,7 h | ≈ 130 m | ≈ 2 h |

(`froehlichPeak`, Froehlich 1995, reste dans le code pour comparaison.)

### 4.3 Le référentiel des grands barrages et des grands oueds

`lib/flood/dams.ts` — **33 barrages** avec retenue normale (hm³), hauteur (m),
oued, province, position : Al Wahda 3 522 (le plus grand du Royaume, retenue
maximale ≈ 3 800), Al Massira 2 760, Bin El Ouidane 1 384, Idriss Ier 1 186,
Sidi Mohamed Ben Abdellah 1 024, Oued El Makhazine 773, Ahmed El Hansali 740,
Mohammed V 730, M'dez 700, Tiddas 640 (en construction), Mansour Eddahbi 560,
Dar Khrofa 480, Hassan II 400, Hassan Addakhil 380, Asfalou 317, 9 Avril 1947
300, Youssef Ben Tachfine 298, El Kansera 267, Kaddoussa 220, Abdelmoumen 216,
Moulay Youssef 197, Sidi Chahed 170, Martil 120, Sakia El Hamra 110, Aoulouz
108, Allal El Fassi 82, Fask 78, Zerrar 70, Lalla Takerkoust 68, Smir 43,
Ibn Battouta 43, Abdelkrim El Khattabi 35, Bab Louta 35. Choisir un barrage
**préremplit le volume, la hauteur et pose le point de rupture** ; les notes
signalent l'envasement (Mohammed V, Mansour Eddahbi, Hassan Addakhil) ou la
surélévation.

**14 oueds** (`RIVERS_MA`) donnent l'ordre de grandeur d'une crue marquante
et sa durée typique, pour préremplir une crue de rivière : Sebou 1963
≈ 7 000 m³/s, Moulouya 1963 ≈ 7 000, Oum Er-Rbia 4 000, Loukkos 3 000, Ziz
1965 3 000, Guir 2008 2 500, Souss 2014 2 500, Tensift 2 000, Drâa 2014 1 800,
Bouregreg 2010 1 500, El Maleh 2002 1 200, Ourika 1995 ≈ 1 030 (6 h), Martil
2000 700, Issen 600.

**Valeurs indicatives** — retenue normale telle que publiée par le ministère
de l'Équipement et de l'Eau (DGH) et les agences de bassin, positions
approchées à quelques kilomètres : à confirmer auprès de l'ABH / DGH avant
tout usage autre qu'un cadrage.

### 4.4 Le panneau

| Réglage | Plage | Défaut |
| --- | --- | --- |
| Source d'eau | rivière · lac · barrage | rivière |
| Rivière : oued de référence, débit de pointe, durée | 50–50 000 m³/s · 1–96 h | 1 500 m³/s · 6 h |
| Lac : volume déversé, durée | 1–1 000 hm³ · 1–48 h | 50 hm³ · 6 h |
| Barrage : barrage du référentiel, volume de la retenue, hauteur d'eau, mode de rupture | 1–5 000 hm³ · 5–200 m · surverse / renard | 50 hm³ · 40 m · surverse |
| Rugosité du terrain (Manning) | 4 préréglages (§ 4.1) | plaine cultivée 0,05 |
| Horizon simulé | 1–24 h | 6 |
| Étendue du relief | 25 km (30 m) · 50 (60 m) · 100 (120 m) · 200 km (240 m) | 25 km |

Lectures : volume total / débit dérivé, pour un barrage « Pointe ≈ … m³/s
(Froehlich 2008) · vidange ≈ … h » et « Brèche formée en … min, largeur
moyenne ≈ … m ; l'hydrogramme vide toute la retenue » ; pendant et après la
course : volume au sol, entré, sorti de l'emprise (m³), surface inondée (km²),
lame maximale (m), altitude au départ, résolution, points atteints (avec la
lame alors). Palette : bleu clair (`96,165,250`, lame faible) à bleu profond
(`30,78,184`, ≥ 5 m), d'autant plus opaque ; une cellule est mouillée dès
5 cm, quantifiée au décimètre dans les images (les chiffres restent exacts).

Exemple vérifié à l'écran (lot 9) : rupture d'Al Wahda sur 100 km — l'onde
descend l'Ouergha, Jorf El Melha atteint à t + 3 h 06, Khnichet à t + 4 h 54,
213 km² sous l'eau à t + 5 h ; calcul ≈ 30 s.

### 4.5 Limites

Ni turbulence, ni ouvrages que le relief ne résout pas (ponts, digues fines),
ni infiltration, ni pluie distribuée, ni bathymétrie de retenue, ni rugosité
distribuée (une valeur pour toute l'emprise). Le relief est celui des tuiles
(30 à 240 m) : un oued encaissé de 20 m de large n'y existe pas à 240 m. Les
chiffres de Froehlich sont des régressions sur des ruptures historiques de
barrages en remblai — un cadrage d'état-major, pas une étude de danger.

## 5. Où est le code, comment le faire évoluer

| Fichier | Rôle | Test |
| --- | --- | --- |
| `apps/web/src/lib/fire/rothermel.ts` | modèles d'Anderson, Simard, Rothermel, Byram, vent équivalent, LB, classes tactiques — pur | `fire.test.ts` |
| `apps/web/src/lib/fire/spread.ts` | végétation → FM, `fireBehaviour`, vent effectif par cellule, ellipse, `FireSpread` (Dijkstra) | `fire.test.ts` |
| `apps/web/src/lib/fire/run.ts` | `FireRun`, états des cellules, `driveFireRun` | — |
| `apps/web/src/lib/flood/hydro.ts` | hydrogrammes (SCS, plateau, Froehlich 2008 + gamma), `MANNING_PRESETS`, `scenarioOf`, `FloodSimulation` (onde inertielle) | `hydro.test.ts` |
| `apps/web/src/lib/flood/dams.ts` | `DAMS_MA`, `RIVERS_MA`, `damById` | `hydro.test.ts` |
| `apps/web/src/lib/flood/{grid,dem,frames,run}.ts` | grille et tuiles d'altitude, instantanés et palette, `FloodRun` | — |
| `apps/web/src/lib/sim/spread.ts` | socle commun : images, interpolation, points d'intérêt, lecture | — |
| `apps/web/src/lib/store/slices/{fire,flood}.ts` | réglages, course en cours, lecture, erreurs | — |
| `apps/web/src/app/map/_parts/{FirePanel,FloodPanel}.tsx` | les panneaux | — |
| `apps/web/src/components/map/layers/{spread,fire,floods}.ts` | canevas, palettes, caméra, lecture | — |

- **Ajouter une végétation** : une entrée dans `FuelKind`, `FUEL_KINDS` et
  `FUEL_KIND_MODEL` (`spread.ts`), son libellé `fire_fuel_<kind>` dans les
  trois fichiers i18n, la ligne du tableau § 3.2. Un nouveau **modèle de
  combustible** (les 40 de Scott & Burgan 2005, par exemple) s'ajoute dans
  `FUEL_MODELS` avec ses charges, σ, épaisseur, humidité d'extinction et facteur
  de vent — puis dans le test du tableau.
- **Ajouter un barrage ou un oued** : une ligne dans `DAMS_MA` / `RIVERS_MA`
  (retenue normale en hm³, hauteur sur fondations, position `[lng, lat]`) ;
  le test `hydro.test.ts` vérifie l'unicité des identifiants et la présence
  d'Al Wahda en tête.
- **Changer un préréglage numérique** : `HYDRO_DEFAULTS` (`hmin`, `dtMax`,
  `alpha`), `MANNING_PRESETS`, `FLOOD_ZOOM` / `FIRE_ZOOM` (étendue → zoom),
  `FLOOD_FRAMES` / `FIRE_FRAMES` (120), `SPREAD_PLAY_SECONDS` (30).
- Toute chaîne affichée passe par `lib/i18n/translations.{fr,en,ar}.ts`
  (clés `fire_*`, `flood_*`, `sim_*`) ; `i18n.test` impose la parité des trois
  langues.
- Une déviation de modèle (autre schéma, autre régression de rupture) mérite
  un ADR qui révise l'ADR 0025.

## 6. Références

Rothermel R.C. (1972) *A mathematical model for predicting fire spread in
wildland fuels*, USDA INT-115 · Albini F.A. (1976) *Estimating wildfire
behavior and effects*, INT-30 · Anderson H.E. (1982) *Aids to determining fuel
models for estimating fire behavior*, INT-122 · Anderson H.E. (1983)
*Predicting wind-driven wild land fire size and shape*, INT-305 · Andrews P.L.
(2012) *Modeling wind adjustment factor and midflame wind speed for Rothermel's
surface fire spread model*, RMRS-GTR-266 · Andrews P.L. (2018) *The Rothermel
surface fire spread model and associated developments*, RMRS-GTR-371 · Andrews
P.L., Rothermel R.C. (1982) *Charts for interpreting wildland fire behavior
characteristics*, INT-131 · Byram G.M. (1959) *Combustion of forest fuels* ·
Finney M.A. (1998) *FARSITE: Fire Area Simulator*, RMRS-RP-4 · Finney M.A.
(2002) *Fire growth using minimum travel time methods*, Can. J. For. Res. 32 ·
Richards G.D. (1990) *An elliptical growth model of forest fire fronts*, Int. J.
Numer. Meth. Eng. 30 · Simard A.J. (1968) *The moisture content of forest fuels*,
FF-X-14 · Rothermel R.C. (1983) *How to predict the spread and intensity of
forest and range fires*, INT-143 · Bates P.D., Horritt M.S., Fewtrell T.J.
(2010) *A simple inertial formulation of the shallow water equations for
efficient two-dimensional flood inundation modelling*, J. Hydrol. 387 ·
Froehlich D.C. (2008) *Embankment dam breach parameters and their
uncertainties*, J. Hydraul. Eng. 134(12) · Froehlich D.C. (1995) *Peak outflow
from breached embankment dam*, J. Water Resour. Plann. Manage. 121(1) · NRCS
*National Engineering Handbook*, Part 630, ch. 16 *Hydrographs* · Chow V.T.
(1959) *Open-channel hydraulics* · Ministère de l'Équipement et de l'Eau,
Direction générale de l'hydraulique — bulletins de situation des barrages.
