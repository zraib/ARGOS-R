# ADR 0002 — Flux externes : sismologie (EMSC) et météo (Open-Meteo)

- **Statut :** accepté
- **Date :** 2026-08-03
- **Portée :** `apps/api` (modules `seismic`, `weather`), pages web `/seismologie`, `/meteo`

## Contexte

Le poste de commandement doit afficher une situation **sismique en temps réel**
(séismes récents, alerte sur nouvel événement) et une **situation météo**
(prévisions par ville). Ces données viennent de sources externes :

- **Sismologie :** Centre sismologique euro-méditerranéen (**CSEM / EMSC**),
  service FDSN `https://www.seismicportal.eu/fdsnws/event/1/query` (GeoJSON).
- **Météo :** **Open-Meteo** (`https://api.open-meteo.com`). Choisi car **libre,
  sans clé d'API** (aucun secret à stocker), CORS ouvert, **open-source et
  auto-hébergeable**.

Le `MASTER_PLAN.md` §4.3 impose la souveraineté : **aucune ressource externe au
runtime** et le `CLAUDE.md` impose le **contrat-first** (le frontend ne consomme
que le client généré depuis l'OpenAPI ; les données du domaine viennent de
`apps/api`).

## Décision

Les deux flux passent par un **proxy côté API** (`apps/api`), jamais par des
`fetch` directs du navigateur :

- `SeismicService` interroge EMSC, **normalise** la réponse (`SeismicEvent`) et
  **met en cache 30 s**. Endpoint `GET /seismic/events?minmag=&region=`.
- `WeatherService` interroge Open-Meteo, normalise (`WeatherForecast`) et met en
  cache 10 min. Endpoints `GET /weather/cities`, `GET /weather/forecast?lat=&lon=`.
- RBAC : lecture protégée par `incidents:read`.
- Dégradation : en cas d'indisponibilité de la source, on renvoie le dernier
  cache connu, sinon un tableau vide (l'app reste utilisable).

Cela satisfait le contrat-first (client généré depuis l'OpenAPI, aucun `fetch`
manuel côté écran), évite les problèmes CORS et ne place aucun secret dans le
frontend.

## Conséquences

- **Déviation assumée** du §4.3 : en développement, l'API ARGOS émet des requêtes
  sortantes vers EMSC et Open-Meteo. À remplacer en production par des **flux
  internes / souverains** (station sismologique nationale, service météo national,
  ou Open-Meteo **auto-hébergé** — c'est possible car open-source). Le contrat
  (`SeismicEvent`, `WeatherForecast`) reste stable : le changement de source
  n'impacte pas le frontend.
- Même logique que l'ADR 0001 (routage) : externe en dev, souverain en prod,
  piloté par la couche API.
- Aucune nouvelle dépendance npm : les deux services utilisent `fetch` natif
  (Node ≥ 18).
