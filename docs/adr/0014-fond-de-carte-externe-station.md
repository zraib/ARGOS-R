# ADR 0014 — Fond de carte de la station : fournisseurs externes par défaut, mode hors ligne conservé

- **Statut :** accepté
- **Date :** 2026-09-15
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
   (`server.arcgisonline.com`, `tile.openstreetmap.org`, `s3.amazonaws.com`).
   Rien d'autre ne s'ouvre ; le reste de la souveraineté (polices, scripts,
   flux par le courtier) est inchangé.
3. **Le mode hors ligne reste entier** : `MAP_TILES=sovereign` plus
   `COMPOSE_PROFILES=sovereign` lancent le serveur de tuiles, et le
   provisionnement `infra/geo` s'applique tel quel. Le service `tiles` passe
   sous ce profil pour ne pas redémarrer en boucle sur un volume vide quand
   il n'a rien à servir.
4. **Une image par mode** : le paquet construit en mode souverain porte le
   suffixe `-souv` dans sa version ; on ne confond pas deux images qui n'ont
   pas la même politique de sécurité.

## Conséquences

- **Positives** : la carte est complète dès l'installation, identique à celle
  que l'équipe connaît ; aucune préparation, aucune licence d'imagerie à
  obtenir avant une démonstration ; le passage au hors ligne est une
  reconstruction de l'image web, pas une autre application.
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
