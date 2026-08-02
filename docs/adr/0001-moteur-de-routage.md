# ADR 0001 — Moteur de calcul d'itinéraire de la carte opérationnelle

- **Statut :** accepté
- **Date :** 2026-07-22
- **Portée :** `apps/web/src/lib/map/routing.ts`, `infra/compose/docker-compose.yml`

## Contexte

La carte opérationnelle doit mesurer des distances **par le réseau routier**
(« comme Google Maps ») entre plusieurs points, avec durée estimée, pour évaluer
les délais d'acheminement des unités et des évacuations sanitaires.

Le `MASTER_PLAN.md` §4.2 prévoit Valhalla comme moteur de routage et le §4.3
impose la souveraineté : **aucune ressource externe au runtime**. Or, en
développement, la pile Docker n'est pas toujours démarrée (Valhalla exige de
plus la construction initiale des tuiles OSM du Maroc, plusieurs minutes).

## Décision

`routing.ts` expose un adaptateur à **deux moteurs**, choisi par variables
d'environnement :

| Variable | Valeurs | Défaut |
| --- | --- | --- |
| `NEXT_PUBLIC_ROUTING_ENGINE` | `valhalla` \| `osrm` | `osrm` |
| `NEXT_PUBLIC_ROUTING_URL` | URL du moteur | démo OSRM publique / `http://localhost:8002` |

- **Production (cible) :** `valhalla` + `http://localhost:8002`, servi par le
  service `valhalla` ajouté à `infra/compose/docker-compose.yml` (extrait OSM du
  Maroc, tuiles construites dans le volume `valhalla_data`). Aucun appel sortant.
- **Développement sans Docker :** OSRM (démo publique) pour que l'outil de mesure
  fonctionne immédiatement.
- **Repli :** si le moteur est injoignable (air-gap, service arrêté), le calcul
  retombe sur la **distance orthodromique** et l'interface l'indique
  explicitement (`Vol d'oiseau` au lieu de `Itinéraire routier`).

## Conséquences

- **Déviation assumée** du §4.3 en développement uniquement : la démo OSRM
  publique reçoit les coordonnées mesurées. Elle est **interdite en
  production** — le déploiement doit poser `NEXT_PUBLIC_ROUTING_ENGINE=valhalla`.
- La même remarque vaut pour les fonds de carte (Esri/OSM) et le MNT terrarium
  utilisés par `lib/map/style.ts` : à remplacer par `martin` + tuiles internes
  avant mise en service. À traiter dans un ADR dédié.
- Le contrat de `routeThrough()` est stable (`RouteResult`) : changer de moteur
  n'impacte pas les composants de carte.
