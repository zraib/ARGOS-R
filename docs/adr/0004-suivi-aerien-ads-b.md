# ADR 0004 — Suivi aérien : flux ADS-B filtré sur liste de suivi

- **Statut :** accepté
- **Date :** 2026-08-14
- **Portée :** `apps/api` (module `aviation`), carte opérationnelle (`/map`)

## Contexte

Lors d'un feu de forêt, le commandement doit **localiser les moyens aériens
engagés** : bombardiers d'eau, hélicoptères, appareils d'observation. Le besoin
exprimé est précis et restrictif :

> « je ne veux pas tout le trafic aérien du monde mais les avions que
> j'introduis ou saisir le code ou l'identifiant. »

Deux contraintes structurent la décision :

1. **Le `MASTER_PLAN.md` §4.3 impose la souveraineté** — aucune ressource
   externe au runtime sans arbitrage, aucune fuite de données.
2. **Le `CLAUDE.md` impose le contrat-first** — le frontend ne consomme que le
   client généré depuis l'OpenAPI.

## Décision

### 1. Le fournisseur : OpenSky Network, derrière un port

**Flightradar24 est écarté.** Il n'expose aucune API publique gratuite : l'accès
programmatique relève d'une licence commerciale et les conditions d'utilisation
interdisent le moissonnage. **OpenSky Network** sert les mêmes données ADS-B,
est documenté, libre d'accès et utilisable sans clé.

Ce choix est **encapsulé derrière le port `FlightFeed`**. Brancher plus tard une
licence Flightradar24, un flux radar national ou un récepteur ADS-B souverain
consiste à écrire un adaptateur et à changer une ligne dans `aviation.module.ts`.
Ni le service applicatif, ni les écrans ne bougent. Même discipline d'inversion
de dépendance que le module `orders` (voir [ADR 0003](0003-module-orders-architecture-hexagonale.md)).

Un second adaptateur, `ExerciseFeed`, simule une noria sans réseau
(`AVIATION_FEED=exercise`) pour l'instruction et la démonstration. L'API expose
**toujours le nom du flux en service** (champ `feed`), affiché à l'opérateur :
personne ne doit prendre un vol d'exercice pour un vol réel.

### 2. Le filtrage : par emprise, jamais par liste de codes

OpenSky permet d'interroger **par identifiant d'appareil**. Ce serait la voie
simple, et elle est **écartée délibérément** : transmettre les codes suivis
révélerait au fournisseur **quels aéronefs le commandement surveille** — soit
l'ordre de bataille aérien d'une opération en cours.

La requête porte donc sur une **emprise géographique** couvrant le territoire
national et ses approches. Le croisement avec la liste de suivi se fait **dans
l'API**. Conséquences :

- OpenSky n'apprend que « quelqu'un observe le Maroc », information sans valeur.
- Le trafic non inscrit **n'atteint jamais le navigateur** : il est écarté côté
  serveur, conformément au besoin exprimé.

### 3. L'identifiant : déduit de sa forme, pas imposé par un menu

L'opérateur saisit **ce qu'il a sous la main** — immatriculation lue sur le
fuselage, indicatif entendu à la radio, code IFF transmis par la tour, adresse
OACI issue de la documentation. `detectCodeKind()` tranche sur la seule forme du
code. Une contrainte physique le justifie : **la trame ADS-B ne transporte pas
l'immatriculation**. En aviation d'État et générale, l'équipage émet toutefois
très souvent son immatriculation comme indicatif, ce qui rend l'appariement
possible en pratique.

Le squawk n'est apparié **qu'à défaut d'adresse OACI connue** : un code Mode 3A
est réattribué d'un vol à l'autre et n'est unique que localement. Afficher le
mauvais appareil sous le libellé « Canadair 01 » est plus grave que de n'afficher
aucun appareil ; la règle est isolée dans un fichier pur et couverte par des
tests.

### 4. Cadence : navigation à l'estime entre deux contacts

Le palier public d'OpenSky ne publie un point que **toutes les 10 s environ**.
Trois latences s'additionnent naturellement — la source, le cache de l'API, le
sondage du navigateur — et une première version empilait 10 + 15 + 15 s, soit
jusqu'à 40 s de retard. Deux corrections :

1. **Réduction des paliers** : cache API à 5 s (`AVIATION_FEED_TTL_MS`), sondage
   du navigateur à 6 s. Sonder plus vite ne rapporterait rien — la source ne
   publie pas plus souvent — et consommerait du quota.
2. **Estime entre deux points** (`lib/map/deadReckoning.ts`) : la position
   affichée est avancée à 4 images par seconde à partir du dernier cap et de la
   dernière vitesse connus. Sans cela, le marqueur reste figé une dizaine de
   secondes puis saute — la carte paraît morte alors que l'appareil vole à
   250 m/s.

**L'estime est une estimation, pas une mesure, et l'interface le dit** : le
panneau affiche l'âge du dernier contact réel, qui passe en ambre au-delà de
45 s, et le marqueur s'estompe. L'extrapolation cesse au-delà de 120 s
(`MAX_ESTIME_MS`) : passé ce délai l'appareil a pu virer ou se poser, et
prolonger la trajectoire en ligne droite reviendrait à inventer.

Les marqueurs d'aéronefs tiennent un **registre persistant** et sont déplacés par
`setLngLat`. Ils sont délibérément exclus de `syncMarkers()`, qui détruit et
recrée l'intégralité des marqueurs de la carte : les reconstruire à chaque
rafraîchissement ferait clignoter unités, hôpitaux et incidents.

Sur refus de la source (quota, panne), repli de 120 s pendant lesquelles le
dernier état connu est servi — l'estime maintient l'affichage vivant entre-temps.
En cas d'échec total : tableau vide. **Une carte sans avions reste exploitable ;
une carte en erreur ne l'est pas.** Le minuteur du navigateur s'arrête dès que la
couche est masquée.

### 5. Droits

Nouvelle fonctionnalité `aviation` dans le catalogue de permissions, **placée
dans la table `LEGACY`** : elle ne figure pas dans `MATRICE ROLES.xlsx` et sa
dotation reste provisoire (conduite par OPCOM/TACOM, observation par l'état-major
et les cellules), **à confirmer lors de l'arbitrage de la matrice**. Le retrait
d'un appareil est un **archivage** ; la suppression définitive exige
`aviation:delete`, que la matrice n'accorde à personne — donc au seul superadmin.

## Conséquences

**Acceptées :**

- Une dépendance réseau externe supplémentaire, du même ordre que EMSC et
  Open-Meteo ([ADR 0002](0002-flux-externes-sismologie-meteo.md)), et isolée
  derrière un port là où les précédentes ne le sont pas.
- Le quota anonyme d'OpenSky limite le nombre d'interrogations. Des identifiants
  peuvent être fournis par l'environnement (`OPENSKY_USERNAME`,
  `OPENSKY_PASSWORD`) — **jamais versionnés**.

**Limite à connaître, et elle est structurelle :**

> Les aéronefs d'État — dont une partie des moyens de lutte anti-incendie — **ne
> sont pas nécessairement visibles sur un réseau ADS-B public** : certains
> n'émettent pas en clair, d'autres sont filtrés par les agrégateurs. Un appareil
> inscrit sans écho reste listé avec le statut « sans signal » plutôt que d'être
> masqué : **son silence est lui-même une information** pour le commandement.

Lever cette limite suppose une source non publique — flux radar militaire, plan
de vol national, ou récepteur ADS-B propre. C'est exactement ce que le port
`FlightFeed` rend possible sans réécriture.

## Alternatives écartées

- **Saisie manuelle des positions** — aucune dépendance externe, mais la position
  n'est fraîche que si un opérateur la met à jour. Écartée sur demande explicite
  d'un flux automatique.
- **Interrogation par liste de codes** — plus économe en quota, mais divulgue
  l'ordre de bataille aérien (voir §2).
- **Flightradar24** — meilleure couverture, mais licence commerciale et CGU
  prohibitives. Reste branchable via un adaptateur si une licence est acquise.
