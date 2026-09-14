# Fond de carte souverain — provisionnement des tuiles

La carte opérationnelle n'a que deux origines possibles pour ses tuiles
(`apps/web/src/lib/map/tiles.ts`, ADR 0006) : **externe** (développement
seulement, bandeau affiché) ou **souveraine** — imposée en production. Le mode
souverain **échoue en fermé** : sans serveur de tuiles configuré, la carte reste
sans fond et le dit, plutôt que de laisser fuir vers un tiers le profil
d'activité de l'état-major (quelle région est regardée, quand, avec quelle
intensité).

Ce dossier contient les **outils** qui remplissent le serveur de tuiles de la
station (`deploy/docker-compose.yml`, service `tiles`). Rien de lourd n'y est
versionné : les tuiles pèsent des gigaoctets et, pour l'imagerie, relèvent
d'une licence propre à l'organisme.

## 1. Ce que le frontend attend

Quatre sources, sous `/tiles/{source}/{z}/{x}/{y}` — le motif câblé dans
`sovereignSources()` du style :

| Source | Contenu | D'où elle vient | Zoom |
| --- | --- | --- | --- |
| `plan` | fond planimétrique (raster) | **rendu à la demande** par tileserver-gl depuis les tuiles vectorielles OSM du Maroc (`plan-vector.mbtiles`) | 0–19, tout le pays |
| `lbl` | toponymes et limites, fond transparent | idem, style « étiquettes seules » | 0–19, tout le pays |
| `sat` | imagerie (raster JPEG) | `sat.mbtiles`, téléchargé **par zones** (`zones.json`) | 0–13 pays, 14–17 villes, plus au besoin |
| `dem` | altitude terrarium (relief 3D) | `dem.mbtiles`, tuiles ouvertes AWS Terrain Tiles | 0–13, tout le pays |

Le plan et les toponymes sont **rendus**, pas stockés tuile par tuile : les
données vectorielles du Maroc entier tiennent en quelques centaines de
mégaoctets et couvrent tous les niveaux de zoom. C'est ce qui rend « tout le
pays, tous les zooms » possible pour le plan — et impossible pour l'imagerie :

| Imagerie jusqu'au zoom | Maroc entier | Casablanca |
| --- | --- | --- |
| 13 | 197 725 tuiles ≈ 4 Go | — |
| 15 | 3,1 M ≈ 69 Go | 1 428 |
| 17 | 50 M ≈ 1,1 To | 21 503 ≈ 0,5 Go |
| 19 | **803 M ≈ 17,7 To** | 340 805 ≈ 7,5 Go |

D'où le profil de `zones.json` : le pays à z13, vingt-deux agglomérations à
z17, et des zones d'intérêt opérationnel à z18–19 à activer au cas par cas
(`enabled`). `tiles-fetch estimate sat` chiffre le profil avant de lancer.

## 2. Remplir le volume (une fois, avec Internet)

Tout s'exécute dans des conteneurs (profil `tiles-build` du compose de
déploiement) : la station n'a besoin ni de Python ni de Java.

```powershell
cd deploy
docker compose run --rm tiles-fetch pbf          # 1. extrait OSM du Maroc (Geofabrik) → partagé avec Valhalla
docker compose run --rm tiles-osm                # 2. planetiler : plan-vector.mbtiles (schéma OpenMapTiles)
docker compose run --rm tiles-fetch assets       # 3. polices, styles plan/lbl (dérivés d'OSM Bright)
docker compose run --rm tiles-fetch fetch dem    # 4. relief : ~200 000 tuiles, ~6 Go
docker compose run --rm tiles-fetch fetch sat    # 5. imagerie selon zones.json (SAT_TILE_URL dans .env)
docker compose run --rm tiles-fetch status
docker compose restart tiles
```

Un téléchargement interrompu **reprend** : relancer la même commande ne
redemande que les tuiles absentes. `--zones casablanca,rabat-sale` limite un
passage à quelques zones ; `--workers 4` ménage une source lente.

Sans imagerie, `tiles-fetch placeholder` crée des fichiers `sat`/`dem` vides
mais valides : le serveur démarre, la carte a le plan et les toponymes.

### Licence de l'imagerie — lire avant de renseigner `SAT_TILE_URL`

L'outil télécharge n'importe quel gabarit XYZ (`{z}`, `{x}`, `{y}`, dans
l'ordre propre à la source). Il ne vérifie pas le droit de le faire : c'est à
l'organisme de le détenir. **Aspirer en masse un service public** — Esri World
Imagery, tuiles OpenStreetMap — **viole leurs conditions d'utilisation** ;
l'imagerie Esri/Maxar hors ligne s'obtient par une licence ArcGIS (export de
paquets de tuiles) ou par une mosaïque institutionnelle. Sources compatibles
avec un usage hors ligne :

- une **mosaïque de l'organisme** découpée en tuiles (`gdal2tiles.py --xyz`)
  et servie depuis un serveur interne ;
- **Sentinel-2** (ESA, 10 m, licence ouverte) via un service de tuiles
  institutionnel ou une mosaïque locale ;
- un service ArcGIS **sous licence** de l'organisme.

Le relief (`dem`) vient des AWS Terrain Tiles (Mapzen), ouvertes ; le plan et
les toponymes d'OpenStreetMap (ODbL), rendus localement — attribution à
conserver dans l'interface (déjà présente).

## 3. Où va quoi

Le volume `iris_argos_tiles` (monté sur `/data` du service `tiles`) contient :

```
plan-vector.mbtiles     tuiles vectorielles OSM du Maroc (planetiler)
sat.mbtiles             imagerie raster (jpg)
dem.mbtiles             altitude terrarium (png)
fonts/                  glyphes des polices (Open Sans)
styles/plan/style.json  OSM Bright sans pictogrammes, sur plan-vector
styles/lbl/style.json   les seuls calques d'étiquettes, fond transparent
```

`tileserver/config.json` est la configuration du serveur (versionnée) ;
`zones.json` le profil de téléchargement ; `tools/tiles.py` l'outil.

Le compose de **développement** (`../compose`) garde martin pour servir des
couches PostGIS ; le déploiement, lui, utilise tileserver-gl parce qu'il rend
le plan et les toponymes depuis le vectoriel.

## 4. Vérifier

- `http://<station>/tiles/` — catalogue de tileserver-gl : `plan`, `lbl`,
  `sat`, `dem` listés ;
- `http://<station>/tiles/plan/6/31/25` — une tuile du plan (Maroc central) ;
- `/map` : fond visible, aucun bandeau « non souverain », onglet Réseau du
  navigateur : toutes les requêtes de tuiles vers la station, aucune vers
  `arcgisonline`, `openstreetmap` ou `amazonaws` ;
- `npm run test:web` : `lib/map/__tests__/tiles.test.ts` vérifie la règle
  (production ⇒ souverain, souverain sans URL ⇒ carte sans fond).
