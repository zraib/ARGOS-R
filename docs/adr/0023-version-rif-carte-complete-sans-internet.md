# ADR 0023 — Version RIF : la carte complète du Maroc (imagerie, relief 3D, plan et toponymes) sans Internet

- **Statut :** accepté — livré sur la branche `fusion-RIF`
- **Date :** 2026-09-19
- **Branche :** `fusion-RIF` (ouverte depuis `fusion-V2` — tout ce que V2 livre en fait partie)
- **Portée :** `apps/web/src/lib/map/{plan,satFallback,style,tiles}.ts`, `components/map/{MapCanvas,layers/base}.tsx`,
  `components/incidents/LocationPreviewMap.tsx` ; `infra/geo/{tools/tiles.py,zones.json,communes.json}` ;
  `deploy/{docker-compose.yml,.env.example,scripts/{package.sh,install.ps1,tiles-export.sh,tiles-import.ps1,tiles-import.sh}}` ;
  `apps/api/scripts/communes.mjs`, `modules/domain/{weather,seismic}.service.ts`.
- **S'appuie sur :** ADR 0006 (deux origines de tuiles, souverain qui échoue en fermé), ADR 0014 (mode
  externe figé à la construction, aucune frontière contestée), le pipeline `infra/geo` validé le
  14 septembre 2026 (extrait OSM → planetiler → tileserver-gl, Valhalla hors ligne).

## Contexte

La station de commandement doit fonctionner **en réseau isolé** avec « la même expérience » que le
mode en ligne : imagerie Esri/Maxar, relief 3D, plan et toponymes du Maroc entier, latin et arabe,
et les référentiels géographiques (12 régions, 75 provinces, les ~1 500 communes de l'ADR 0022
lot 7). Le mode souverain existant (ADR 0006) servait déjà, depuis la station, des tuiles
vectorielles du Maroc **rendues en raster** (PNG 256 px, sur-zoom flou au-delà de z14), sans
imagerie ni relief provisionnés : une carte utilisable, mais pas celle du mode en ligne — labels
crus, pas d'imagerie, pas de 3D.

Deux contraintes techniques dominent :

1. **L'imagerie ne peut pas couvrir tout le pays à tous les zooms** (Maroc à z19 : 803 millions de
   tuiles, 17,7 To). Un fournisseur en ligne répond partout à tous les zooms ; hors ligne, la
   couverture est forcément **par zones** — et une carte qui se vide dès qu'on zoome sur un village
   n'est pas « la même expérience ».
2. **Le style du plan doit être le même** que celui du mode en ligne : mêmes tuiles vectorielles
   (schéma OpenMapTiles), même style (dérivé d'OSM Bright), mêmes polices (arabe compris), même
   correction des frontières (ADR 0014) — rendues par MapLibre dans le navigateur, pas par le serveur.

## Décision

### 1. Le plan et les toponymes souverains sont les mêmes tuiles vectorielles qu'en ligne

`lib/map/plan.ts` sait d'où vient le style dans chaque mode (`planStyleUrl()`) : OpenFreeMap en
externe, **le style « plan » de tileserver-gl de la station** (`/tiles/styles/plan/style.json`) en
souverain. Le style servi est **rebasé** (`rebasePlanStyle`, pure, testée) : la source vectorielle
est adressée tuile par tuile (`/tiles/data/plan-vector/{z}/{x}/{y}.pbf`) plutôt que par le TileJSON
— dont les URL absolues dépendent du `PUBLIC_URL` déclaré au serveur, pas de l'adresse par laquelle
le poste joint la station (nom, IP, tunnel) — et les polices suivent la même base. Puis la même
correction qu'en ligne (`patchPlanStyle` : frontières contestées non tracées, groupes `plan` /
`labels`), la même insertion sous les couches de la carte, le même greffon RTL pour l'arabe. La
carte opérationnelle et la carte de choix de position (`LocationPreviewMap`) le font toutes deux.

Les couches raster `plan` / `lbl` rendues par la station restent déclarées : elles ne s'allument
que si le style vectoriel n'a pas pu être installé (station sans polices ni style) — repli, pas
doublon (`applyBase`).

### 2. L'imagerie hors ligne ne laisse pas de trou : une tuile absente se fabrique depuis son parent

En souverain, la source `sat` passe par un **protocole MapLibre** (`iris-sat://{z}/{x}/{y}`,
`lib/map/satFallback.ts`) : la tuile est demandée à la station ; absente (404), on remonte à son
parent, puis au parent du parent (7 niveaux au plus), et le quart utile est découpé et agrandi
(OffscreenCanvas, JPEG). Là où l'imagerie fine n'a pas été provisionnée, l'opérateur voit
l'imagerie disponible, floue à mesure qu'il zoome — comme MapLibre le fait lui-même pour une
source dont le `maxzoom` est uniforme, ce que la couverture par zones n'est pas. Rien ne part
jamais ailleurs que vers la station.

### 3. La couverture : le pays, les agglomérations, et **chaque commune**

`infra/geo/zones.json` : le pays à z0–13 (~200 000 tuiles), vingt-deux agglomérations à z14–17,
et un profil **`communes`** — 3 km autour du chef-lieu de **chacune** des ~1 500 communes du
référentiel (`infra/geo/communes.json`, écrit par `apps/api/scripts/communes.mjs` : le même
référentiel que l'application) à z14–15 (~70 000 tuiles) : un village sinistré se lit de près.
Total ≈ 424 000 tuiles ≈ 9,3 Go d'imagerie ; le relief (AWS Terrain Tiles, ouvertes) à z0–13
≈ 200 000 tuiles ≈ 6 Go ; le plan vectoriel du Maroc entier 286 Mo. `tiles-fetch` gagne
`--max-zoom` (passe de validation ou de dégrossissage) et `--zones communes`.

### 4. Livraison : le volume des tuiles voyage avec le paquet

`scripts/tiles-export.sh` (machine avec Internet) archive le volume `iris_argos_tiles` en un tar
(non compressé : les tuiles le sont déjà) avec son empreinte ; `scripts/tiles-import.ps1`
(station) l'importe dans le volume et redémarre le serveur de tuiles — et **`install.ps1` le fait
de lui-même** quand le paquet embarque l'archive (`package.sh --map sovereign --with-tiles <tar>`
la dépose dans `deploy/tiles-data/`). La station n'a alors rien à télécharger, jamais.
`.env.example` de la branche : `MAP_TILES=sovereign`, `COMPOSE_PROFILES=sovereign`,
`VALHALLA_TILE_URLS=` (vide : Valhalla lit l'extrait OSM du volume), `AVIATION_FEED=exercise`.

### 5. Ce qui a besoin d'Internet le dit vite

Les flux météo (Open-Meteo), sismique (EMSC), crues et suivi aérien réel restent des services en
ligne : sans réseau, leurs appels tombent en **8 s** (délais posés sur les deux qui n'en avaient
pas) et les modules affichent « flux indisponible » ; le simulateur d'inondation, lui, calcule sur
le relief de la station. Le moteur de langage (Ollama) tourne sur la station.

## Licence de l'imagerie — à lire

Le gabarit posé dans `.env.example` est celui de l'imagerie affichée en mode en ligne (Esri World
Imagery, Maxar). **Aspirer en masse ce service relève de ses conditions d'utilisation** : le droit
d'en détenir une copie hors ligne s'obtient par une licence ArcGIS (export de paquets de tuiles) ou
se remplace par une source dont l'organisme dispose (mosaïque institutionnelle, Sentinel-2). L'outil
est source-agnostique ; la décision et la licence sont à la charge de l'organisme
(`infra/geo/README.md` § 2). Le dépôt n'embarque aucune tuile.

## Conséquences

- Le mode souverain n'est plus « une carte dégradée » : c'est la carte du mode en ligne, servie
  par la station. Le bandeau « aucun fond de carte souverain » ne reste que pour une station
  sans serveur de tuiles.
- Le paquet RIF pèse le poids des tuiles (≈ 15 Go avec le profil complet) : il se livre sur
  support physique. Les mises à jour de l'application (`upgrade.ps1`) ne touchent pas au volume des
  tuiles ; une nouvelle archive de tuiles s'importe seule (`tiles-import.ps1`).
- `PUBLIC_URL` n'a plus d'effet sur la carte : le style est rebasé sur l'adresse réellement
  utilisée par le poste.
- Les tests : `lib/map/__tests__/{plan,satFallback}.test.ts` (rebasage, géométrie du repli).

## Questions restantes

- Imagerie à z16–17 pour toutes les communes (et non les seules agglomérations) : ~+30 Go ;
  à décider zone par zone dans `zones.json` (`enabled`).
- Un cache « au passage » (tuiles demandées en ligne, gardées pour le hors ligne) pour une station
  qui a Internet par intermittence : non fait.
