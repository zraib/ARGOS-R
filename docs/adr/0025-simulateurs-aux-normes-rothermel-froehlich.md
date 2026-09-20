# ADR 0025 — Les simulateurs aux normes du domaine : Rothermel pour le feu, Froehlich et l'hydrogramme du SCS pour l'inondation, sur les capacités réelles des barrages du Royaume

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-20
- **Révise :** ADR 0010 (simulateur d'inondation) et ADR 0011 (simulateur de feu) — le schéma
  numérique de l'inondation (onde inertielle) et la méthode du temps minimal de parcours du feu
  restent ; ce qui change, c'est la PHYSIQUE qui les alimente.
- **Portée :** `apps/web/src/lib/fire/{rothermel,spread}.ts`, `lib/flood/{hydro,dams}.ts`,
  `app/map/_parts/{FirePanel,FloodPanel}.tsx`, tranches `fire` et `flood`, tests.

## Contexte

Les deux simulateurs de la carte donnaient un ordre de grandeur sur des règles empiriques : une
vitesse de base par végétation et des facteurs ad hoc pour le vent, l'humidité et la pente
(« ×2 tous les 10° ») ; une pointe de rupture de barrage selon Froehlich 1995 sur un triangle, un
curseur de retenue plafonné à 3 000 hm³ — sous le plus grand barrage du Royaume (Al Wahda,
3 522 hm³) — et aucune référence aux ouvrages réels. L'état-major veut des simulations fondées
sur les modèles physiques et mathématiques en usage dans le domaine, et sur les capacités réelles
des barrages, des lacs et des oueds du Maroc.

## Décision

### Feu de forêt

1. **Rothermel (1972)** — le modèle de propagation d'un feu de surface, tel que formalisé par
   Andrews (2018, USDA RMRS-GTR-371) avec les corrections d'Albini (1976) : intensité de réaction
   pondérée par classes de combustible (1 h, 10 h, 100 h, vif herbacé, vif ligneux), amortissements
   d'humidité et minéral, flux propagé, puits de chaleur, facteurs de vent φw = C U^B (β/βop)^−E et
   de pente φs = 5,275 β^−0,3 tan²φ, borne de vent (U ≤ 0,9 I_R). Implémenté dans les unités du
   modèle (pieds, livres, Btu) et converti aux bornes ; **vérifié contre le tableau d'Anderson
   (1982)** — vitesse à 5 mi/h de vent à mi-flamme et 8 % d'humidité — à quelques pour cent près
   sur les 13 modèles (test).
2. **Les 13 modèles de combustible d'Anderson (1982)**, rapportés à la végétation marocaine :
   herbe rase et steppe (FM1), herbe haute et céréales (FM3), matorral bas (FM5), maquis dense et
   arganeraie embroussaillée (FM4), broussaille sèche (FM6), pinède et cédraie avec sous-bois
   (FM10), chênaie et subéraie (FM9), litière fermée de résineux (FM8), rémanents de coupe (FM11),
   sol clairsemé (FM1 à charge réduite). Le numéro du modèle est affiché.
3. **L'humidité du combustible** : le 1 h mort à l'humidité d'équilibre de Simard (1968) —
   température et humidité de l'air, l'équation du NFDRS et des tables de Rothermel (1983) —, le
   10 h et le 100 h à +2 % et +4 %, le vif réglé par l'opérateur (60 % en été sec, 120 % au
   printemps). Le vent à 10 m est ramené à 20 ft (×0,87) puis à mi-flamme par le facteur
   d'ajustement du modèle (Andrews 2012).
4. **Vent et pente combinés en vent effectif** (Finney 1998, Andrews 2018) en chaque cellule : la
   pente lue sur le relief (gradient) devient un vent équivalent dirigé vers la montée, additionné
   vectoriellement au vent ; le vent effectif donne la vitesse de tête et l'allongement de
   l'ellipse d'Anderson (1983) ; l'ellipse (Richards 1990) donne la vitesse dans chaque direction
   pour le temps minimal de parcours (Finney 2002, FlamMap).
5. **Flammes et intensité** : intensité du front I_B = I_R t_r R (Byram 1959), longueur de flamme
   L = 0,45 I_B^0,46 ft, temps de résidence t_r = 384/σ (Anderson 1969) — qui règle la durée
   des flammes dans l'animation ; la lecture tactique de la « hauling chart » (Andrews &
   Rothermel 1982) est affichée : attaque directe (< 1,2 m), engins (< 2,4 m), indirecte
   (< 3,4 m), feu de cime probable au-delà.

### Inondation

6. **Rupture de barrage — Froehlich (2008)** : débit de pointe Qp = 0,0443 √g V^0,367 H^1,25,
   temps de formation de la brèche tf = 63,2 √(V/(gH²)), largeur moyenne B = 0,27 ko V^0,32
   H^0,04 (ko = 1,3 par surverse, 1,0 par renard). L'hydrogramme de rupture monte pendant la
   formation de la brèche et décroît selon une loi gamma dont le paramètre est résolu pour que
   **le volume écoulé soit exactement celui de la retenue** (test : ±3 %). Al Wahda : ≈ 119 000
   m³/s, brèche en ≈ 3,8 h, ≈ 480 m de large.
7. **Crue de rivière — l'hydrogramme unitaire adimensionnel du SCS** (NRCS, National Engineering
   Handbook) approché par une loi gamma (m = 3,7, pointe à 37,5 % de la durée) — la forme de
   référence en hydrologie de projet — à la place du triangle.
8. **Rugosité de Manning** réglable (Chow 1959) : lit naturel 0,035, plaine cultivée 0,05,
   végétation dense 0,08, tissu urbain 0,12 — dans le schéma de Bates et al. (2010).
9. **Le référentiel des grands barrages** (`lib/flood/dams.ts`) : 33 ouvrages avec retenue
   normale, hauteur et position — Al Wahda 3 522 hm³ (max ≈ 3 800), Al Massira 2 760, Bin El
   Ouidane 1 384, Idriss Ier 1 186, SMBA 1 024, Oued El Makhazine 773, Ahmed El Hansali 740,
   Mohammed V 730, M'dez 700, Tiddas 640 (en construction), Mansour Eddahbi 560… Choisir un
   barrage préremplit volume, hauteur et point de rupture ; les curseurs montent à 5 000 hm³ et
   200 m. **Les grands oueds** (`RIVERS_MA`) donnent l'ordre de grandeur de crues marquantes
   (Sebou 1963 ≈ 7 000 m³/s, Moulouya 1963, Ourika 1995 ≈ 1 030 m³/s, Souss 2014, Guir 2008…)
   pour préremplir une crue. **Valeurs indicatives** — retenue normale telle que publiée par le
   ministère de l'Équipement et de l'Eau (DGH) et les ABH, positions approchées à quelques km ;
   à confirmer auprès de l'ABH / DGH avant tout usage autre qu'un cadrage.
10. **Étendue** : 100 km (cellules ≈ 120 m) et 200 km (≈ 240 m) s'ajoutent à 25 et 50 km — une
    onde de rupture d'Al Wahda descend l'Ouergha jusqu'au Gharb.

## Ce que cela ne fait toujours pas

- Feu : ni sautes de feu, ni feu de cime (Van Wagner 1977), ni carte de combustible ; l'humidité
  est déduite de l'air, pas mesurée.
- Inondation : ni ouvrages fins (digues, ponts), ni infiltration, ni pluie distribuée, ni
  bathymétrie de retenue ; le relief est celui des tuiles d'altitude (30 à 240 m). Un cadrage
  d'état-major, pas une étude réglementaire.

## Conséquences

- Les chiffres affichés portent le nom de leur modèle (Rothermel FM, Froehlich 2008, SCS) : ce que
  l'état-major lit est reproductible et confrontable aux outils du domaine (BehavePlus, HEC-RAS).
- Tests : `lib/__tests__/fire.test.ts` (tableau d'Anderson, vent, pente, humidité, extinction,
  tactique), `lib/__tests__/hydro.test.ts` (Froehlich 2008, conservation du volume, SCS,
  référentiel).

## Références

Rothermel R.C. (1972) A mathematical model for predicting fire spread in wildland fuels, USDA
INT-115 · Albini F.A. (1976) Estimating wildfire behavior and effects, INT-30 · Anderson H.E.
(1982) Aids to determining fuel models, INT-122 · Anderson H.E. (1983) Predicting wind-driven wild
land fire size and shape, INT-305 · Andrews P.L. (2018) The Rothermel surface fire spread model and
associated developments, RMRS-GTR-371 · Andrews P.L. (2012) Modeling wind adjustment factor,
RMRS-GTR-266 · Finney M.A. (1998) FARSITE, RMRS-RP-4 · Finney M.A. (2002) Fire growth using
minimum travel time methods · Richards G.D. (1990) An elliptical growth model of forest fire
fronts · Byram G.M. (1959) Combustion of forest fuels · Simard A.J. (1968) The moisture content
of forest fuels · Froehlich D.C. (2008) Embankment dam breach parameters and their uncertainties,
J. Hydraul. Eng. 134(12) · NRCS National Engineering Handbook, Part 630, ch. 16 · Bates P.D.,
Horritt M.S., Fewtrell T.J. (2010) A simple inertial formulation of the shallow water equations,
J. Hydrol. 387 · Chow V.T. (1959) Open-channel hydraulics.
