# ADR 0014 — Fond de carte de la station : fournisseurs externes par défaut, mode hors ligne conservé

- **Statut :** accepté
- **Date :** 2026-09-15
- **Révisé le 2026-09-15 :** intégrité territoriale — le plan et les repères
  du mode externe passent en tuiles VECTORIELLES stylées par l'application
  (OpenFreeMap, données OpenStreetMap) ; les images OpenStreetMap et les
  repères Esri sont abandonnés.
- **Portée :** `apps/web/src/lib/map/tiles.ts` et `next.config.mjs` (règle du
  mode et CSP), `deploy/docker-compose.yml` (`MAP_TILES`, profil `sovereign`
  du service `tiles`), `deploy/.env.example`, `deploy/scripts/package.sh`
  (`--map`), `deploy/README.md` § 4, guide débutant § 6.
- **Révise :** l'ADR 0006 sur un point — « en production, le mode souverain
  est imposé quoi que dise l'environnement ».

## Contexte

L'ADR 0006 et le `MASTER_PLAN` §4.3 ont fait du fond de carte hors ligne la
règle : la séquence des tuiles demandées révèle ce que l'état-major regarde,
et un poste ne devait donc jamais appeler un fournisseur étranger. Le code le
garantissait mécaniquement : en production, `NEXT_PUBLIC_MAP_TILES` était
ignoré et la CSP n'ouvrait que la station.

À la première mise en service sur la station Windows, cette règle a donné une
carte **vide** : le volume de tuiles ne se remplit qu'après un provisionnement
long (extrait OSM, planetiler, relief de 6 Go) et l'imagerie satellite hors
ligne suppose une licence que l'organisme n'a pas encore. Le propriétaire du
produit a tranché : la station a Internet, il veut **la carte du mode
développement** — imagerie Esri/Maxar, plan OpenStreetMap, toponymes, relief —
et ne veut pas d'un fond souverain à ce stade.

## Contexte (révision) — l'intégrité territoriale du Royaume

Les fonds raster du mode développement (images OpenStreetMap pour le plan,
repères Esri sur le satellite) tracent à l'intérieur du territoire du Maroc
une ligne de séparation au sud de Tarfaya et le mur de sécurité ; le
propriétaire du produit exige la même carte **en respectant l'intégrité
territoriale** : le Sahara est marocain, la frontière du Royaume court sans
rupture jusqu'à la Mauritanie et à l'Algérie. Une image ne se corrige pas ;
seul un rendu que l'application contrôle le permet.

## Décision

1. **Le mode du fond de carte devient un choix de déploiement explicite**,
   figé dans l'image web à la construction : `MAP_TILES=external` ou
   `sovereign` dans `deploy/.env` (`NEXT_PUBLIC_MAP_TILES` du build). La
   règle du code devient : seule la valeur explicite `external` ouvre les
   fournisseurs ; vide vaut externe en développement et souverain en
   production ; toute autre valeur ferme. Le défaut de la pile de
   déploiement (`.env.example`, `package.sh`) est **`external`**.
2. **La CSP suit le mode** : en externe, `img-src` et `connect-src` n'admettent,
   en plus de `'self'`, que les trois hôtes des fournisseurs
   (`server.arcgisonline.com` pour l'imagerie, `tiles.openfreemap.org` pour
   le plan, les repères, les polices et les sprites, `s3.amazonaws.com` pour
   le relief). Rien d'autre ne s'ouvre ; le reste de la souveraineté
   (polices de l'interface, scripts, flux par le courtier) est inchangé.
3. **Plan et repères en tuiles vectorielles, stylés par l'application**
   (`lib/map/plan.ts`) : le style OpenFreeMap « bright » (dérivé d'OSM Bright,
   comme les styles du mode souverain) est récupéré à l'ouverture de la
   carte, corrigé, puis inséré sous les couches de l'application. La
   correction est une règle, pas une retouche : **aucune frontière contestée
   n'est tracée** (la couche qui les dessine disparaît, toute couche de
   frontières exclut `disputed = 1`). Dans ces données, la frontière
   Maroc–Mauritanie est une frontière ordinaire et aucun toponyme de
   territoire distinct n'existe : le résultat est une carte du Royaume
   entier. Sur le satellite, les mêmes frontières et toponymes remplacent la
   couche de repères Esri. Le mode souverain applique la même règle dans les
   styles qu'il dérive (`infra/geo/tools/tiles.py`).
4. **L'arabe des étiquettes** est mis en forme par le greffon RTL de MapLibre
   (`@mapbox/mapbox-gl-rtl-text`, BSD-2-Clause), **auto-hébergé**
   (`public/vendor`, copié par `scripts/vendor.mjs` avant `dev` et `build`) —
   aucun CDN. Il est en WebAssembly : la CSP de production ajoute
   `'wasm-unsafe-eval'` à `script-src` (compilation Wasm seulement, aucune
   évaluation de JS) ; sans lui MapLibre retient toutes les étiquettes des
   tuiles qui portent de l'arabe, et la carte du Maroc n'a plus un nom.
5. **Le mode hors ligne reste entier** : `MAP_TILES=sovereign` plus
   `COMPOSE_PROFILES=sovereign` lancent le serveur de tuiles, et le
   provisionnement `infra/geo` s'applique tel quel. Le service `tiles` passe
   sous ce profil pour ne pas redémarrer en boucle sur un volume vide quand
   il n'a rien à servir.
6. **Une image par mode** : le paquet construit en mode souverain porte le
   suffixe `-souv` dans sa version ; on ne confond pas deux images qui n'ont
   pas la même politique de sécurité.

## Conséquences

- **Positives** : la carte est complète dès l'installation, identique à celle
  que l'équipe connaît ; aucune préparation, aucune licence d'imagerie à
  obtenir avant une démonstration ; le passage au hors ligne est une
  reconstruction de l'image web, pas une autre application ; le plan
  respecte l'intégrité territoriale par construction, et les toponymes
  portent le latin et l'arabe.
- **Négatives (révision)** : le plan dépend d'un service tiers de plus
  (OpenFreeMap, gratuit, sans clé ni quota affiché mais sans engagement de
  service) ; sans lui, la carte n'a que l'imagerie. Le style distant peut
  évoluer — la correction est écrite en règles (identifiants et champs du
  schéma OpenMapTiles), pas en positions de couches, et un style
  méconnaissable donne une carte sans plan, jamais une frontière en trop.
- **Négatives** : chaque poste qui ouvre IRIS doit avoir Internet, et trois
  fournisseurs étrangers voient le **profil d'activité** de la carte (zones
  regardées, heures, intensité) — exactement le risque que l'ADR 0006 voulait
  fermer. C'est accepté pour la phase actuelle et pour les démonstrations ;
  une station en exploitation réelle sur réseau isolé devra être construite
  en mode `sovereign`. Les conditions d'utilisation des fournisseurs
  s'appliquent (usage en ligne, attribution affichée) ; aucune tuile n'est
  aspirée ni stockée.
- **Ce qui ne change pas** : aucun repli silencieux — un mode souverain sans
  tuiles donne toujours une carte vide et un bandeau, jamais un appel externe.

## Alternatives écartées

- **Relais des tuiles par le proxy de la station** (Traefik réécrit
  `/tiles/...` vers les fournisseurs) : la CSP resterait `'self'` et le
  navigateur ne verrait qu'un hôte, mais la station ferait les mêmes appels
  externes — le profil d'activité sort quand même, avec une latence et un
  point de panne de plus, sans le cache des fournisseurs. Retenu comme piste
  si un jour il faut masquer les postes derrière la station.
- **Provisionner les tuiles quand même** : c'est le mode `sovereign`, conservé
  ; il ne répond pas au besoin immédiat (temps, licence d'imagerie).
- **Ouvrir tous les hôtes en production** : non — trois hôtes nommés, et
  seulement dans ce mode.
- **Masquer la ligne sur les images raster** (un trait de la couleur du fond
  par-dessus le tracé, une seconde copie de l'imagerie limitée à une bande) :
  fragile (couleurs, zooms, tuiles entières), impossible sur le satellite, et
  cela ne retire ni le mur ni les toponymes — une retouche, pas une règle.
