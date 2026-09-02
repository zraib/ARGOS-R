# Fond de carte souverain — provisionnement des tuiles

La carte opérationnelle n'a que deux origines possibles pour ses tuiles
(`apps/web/src/lib/map/tiles.ts`, ADR 0006) : **externe** (développement
seulement, bandeau affiché) ou **souveraine** — imposée en production. Le mode
souverain **échoue en fermé** : sans serveur de tuiles configuré, la carte reste
sans fond et le dit, plutôt que de laisser fuir vers un tiers le profil
d'activité de l'état-major (quelle région est regardée, quand, avec quelle
intensité).

Ce dossier contient ce que le serveur de tuiles sert. **Rien n'y est versionné**
hormis ce guide : les fichiers de tuiles pèsent des gigaoctets et, pour
l'imagerie, relèvent d'une licence propre à l'organisme.

## 1. Ce que le frontend attend

| Source | Fichier attendu | Contenu | Zoom max |
| --- | --- | --- | --- |
| `sat` | `tiles/sat.mbtiles` | imagerie (raster, PNG/JPEG 256 px) | 19 |
| `plan` | `tiles/plan.mbtiles` | fond planimétrique (raster) | 19 |
| `lbl` | `tiles/lbl.mbtiles` | repères et toponymes (raster, fond transparent) | 19 |
| `dem` | `tiles/dem.mbtiles` | altitude encodée **terrarium** (raster-dem) | 13 |

Le serveur est [martin](https://github.com/maplibre/martin) (`infra/compose`,
service `martin`, port publié 3007). Il sert chaque fichier sous
`/{source}/{z}/{x}/{y}` — c'est le motif câblé dans `sovereignSources()` du
style. Un fichier absent donne des tuiles vides, pas un style cassé ; sans
`dem`, la vue 3D s'incline mais ne pose pas de relief.

## 2. Produire les fichiers

Les outils cités sont libres ; les procédures sont indiquées, **pas exécutées
dans ce dépôt** (ni Docker ni données sur le poste de développement).

### Plan (`plan.mbtiles`)

1. Extrait OpenStreetMap du Maroc (Geofabrik, `morocco-latest.osm.pbf`) — à
   télécharger une fois, hors ligne ensuite.
2. Tuiles vectorielles : `planetiler` (`java -jar planetiler.jar --osm-path=morocco-latest.osm.pbf --output=plan-vector.mbtiles`).
3. Rendu raster à partir du vectoriel : `tileserver-gl` (style OpenMapTiles,
   ex. *OSM Bright*) puis export raster des niveaux 0–19 sur l'emprise du Maroc
   (`tileserver-gl --mbtiles plan-vector.mbtiles` + `mb-util`), ou tout autre
   rendu (Mapnik) vers un MBTiles raster.

### Imagerie (`sat.mbtiles`)

Aucune source libre n'égale l'imagerie propriétaire : le fichier vient de
l'organisme (mosaïque institutionnelle) ou d'une mosaïque Sentinel-2 (ESA,
10 m). Découpage : `gdal2tiles.py --xyz -z 0-19 mosaique.tif tuiles/` puis
`mb-util --image_format=jpg tuiles/ sat.mbtiles`.

### Repères (`lbl.mbtiles`)

Rendu raster **transparent** des seuls toponymes et limites (même chaîne que le
plan, style ne contenant que les couches `place_*`, `boundary`), exporté en PNG.

### Altitude (`dem.mbtiles`)

Modèle numérique de terrain (Copernicus DEM 30 m ou SRTM 1"), encodé en
**terrarium** — `altitude = (R × 256 + G + B / 256) − 32768` — avec
`rio rgbify` (`rio rgbify -b -32768 -i 1 --format png dem.tif dem.mbtiles`) ou
équivalent, niveaux 0–13.

## 3. Brancher

```bash
# 1. déposer les quatre fichiers ici
ls infra/geo/tiles/          # sat.mbtiles plan.mbtiles lbl.mbtiles dem.mbtiles
# 2. démarrer la pile (martin monte ../geo/tiles en lecture seule)
docker compose -f infra/compose/docker-compose.yml up -d martin
curl -s http://localhost:3007/catalog | head       # les quatre sources listées
# 3. côté web
NEXT_PUBLIC_MAP_TILES=sovereign
NEXT_PUBLIC_TILES_URL=https://<hôte-argos>/tiles   # route Traefik vers martin
```

La CSP (`apps/web/next.config.mjs`) n'admet en `img-src`/`connect-src` que
l'origine de `NEXT_PUBLIC_TILES_URL` en mode souverain — et rien si elle est
absente.

## 4. Vérifier

- `/map` : fond visible, aucun bandeau « non souverain », onglet Réseau du
  navigateur : toutes les requêtes de tuiles vers l'hôte ARGOS, aucune vers
  `arcgisonline`, `openstreetmap` ou `amazonaws`.
- `npm run test:web` : `lib/map/__tests__/tiles.test.ts` vérifie la règle
  (production ⇒ souverain, souverain sans URL ⇒ carte sans fond).
