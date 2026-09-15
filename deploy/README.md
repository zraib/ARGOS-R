# Déployer IRIS sur une station Windows (Docker Desktop)

Ce dossier contient tout ce qu'il faut pour faire tourner la plateforme
complète — poste de commandement web, API, base de données, tuiles de carte
hors ligne, moteur d'itinéraire — sur **une seule machine** sous Windows, avec
Docker Desktop. Les postes du réseau local s'y connectent avec un navigateur.

```
navigateur ──http://<station>──▶ proxy (Traefik, :80)
                                   ├─ /          → web      (Next.js)
                                   ├─ /api       → api      (NestJS)  ──▶ db (PostgreSQL + PostGIS)
                                   │                                    ──▶ volume /data (instantané JSON, pièces jointes)
                                   ├─ /tiles     → tiles    (tileserver-gl : sat, plan, lbl, dem)
                                   ├─ /routing   → routing  (Valhalla)
                                   └─ /llm       → Ollama sur la station (hors Docker, GPU)
```

> Première installation, sans expérience de Docker ? Suivez le
> [guide pas à pas pour débutant](GUIDE-DEBUTANT-WINDOWS.md) — il reprend
> chaque étape de ce README avec ce qu'il faut voir avant de continuer.

Une seule origine HTTP : le navigateur ne connaît que l'adresse de la station,
les images Docker ne contiennent aucune adresse, et la politique de sécurité de
contenu du poste web reste fermée (`'self'`).

## 1. Prérequis sur la station

| Quoi | Pourquoi |
| --- | --- |
| Windows 10/11 64 bits, **WSL 2** activé | Docker Desktop tourne sur WSL 2 |
| **Docker Desktop** (moteur Linux, pas les conteneurs Windows) | la pile |
| 16 Go de RAM (32 conseillés), 60 Go de disque libres (+ les tuiles) | Valhalla et planetiler construisent en mémoire |
| **Ollama pour Windows** + un modèle (`ollama pull qwen2.5:14b`) | copilote et brouillon d'incident — facultatif mais attendu |
| Git pour Windows | récupérer le dépôt |

Régler la mémoire de WSL 2 (fichier `%UserProfile%\.wslconfig`, puis
`wsl --shutdown`) :

```ini
[wsl2]
memory=12GB
processors=6
```

Ollama doit écouter sur toutes les interfaces pour être joint depuis les
conteneurs (variable d'environnement système, puis redémarrer Ollama) :

```
OLLAMA_HOST=0.0.0.0
```

## 2. Secrets

```powershell
cd deploy
copy .env.example .env
```

Puis remplacer les deux `CHANGER-MOI…` par des valeurs **générées**, jamais
choisies :

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})
```

(une fois pour `POSTGRES_PASSWORD`, une fois pour `AUTH_DEV_SECRET`). Le
fichier `.env` n'est pas versionné.

## 3. Premier démarrage

```powershell
cd deploy
docker compose up -d --build
```

Le premier `--build` compile l'API et le poste web dans les images (aucun Node
à installer sur la station) : comptez 5 à 10 minutes. Puis :

- **http://localhost** — le poste de commandement (depuis un autre poste :
  `http://<nom-ou-IP-de-la-station>`).
- Compte fondateur : `m.zraib`, code temporaire `ARGOS-2026`, à changer à la
  première connexion. Les autres comptes se créent dans *Gestion des
  utilisateurs*.
- `.\scripts\status.ps1` — état des services, santé de l'API, tuiles.

Valhalla (routage) construit ses tuiles de routage au premier démarrage : la
mesure d'itinéraire par la route n'est disponible qu'après (quelques minutes ;
en attendant la mesure retombe sur la distance à vol d'oiseau, et le dit).

## 4. Tuiles de carte hors ligne

La carte n'appelle **aucun fournisseur externe** : tout ce qu'elle affiche
vient du volume `iris_argos_tiles`. Le remplir est une opération à faire **une
fois**, depuis une machine qui a Internet (la station, ou une autre — le volume
se copie). Marche à suivre détaillée et licences : [`../infra/geo/README.md`](../infra/geo/README.md).

```powershell
cd deploy
docker compose run --rm tiles-fetch pbf          # extrait OSM du Maroc (~250 Mo) — sert aussi à Valhalla
docker compose run --rm tiles-osm                # tuiles vectorielles du Maroc, tous zooms (~10 min)
docker compose run --rm tiles-fetch assets       # polices (latin + arabe) + styles « plan » et « toponymes »
docker compose run --rm tiles-fetch fetch dem    # relief 3D, tout le pays (~200 000 tuiles, ~6 Go)
docker compose run --rm tiles-fetch estimate sat # combien d'imagerie le profil demande
docker compose run --rm tiles-fetch fetch sat    # imagerie, selon infra/geo/zones.json — voir la licence !
docker compose run --rm tiles-fetch status
docker compose restart tiles
```

Sans imagerie (`SAT_TILE_URL` vide dans `.env`), lancer quand même
`tiles-fetch placeholder` pour que le serveur de tuiles démarre : la carte a
alors le fond **plan** et les toponymes, pas la vue satellite.

Vérification : ouvrir la carte, l'onglet Réseau du navigateur ne doit montrer
que des requêtes vers la station (`/tiles/...`), aucune vers `arcgisonline`,
`openstreetmap` ou `amazonaws`.

## 5. Sans Internet du tout

La pile fonctionne en réseau isolé une fois les tuiles provisionnées. Deux
réglages dans `.env` :

- `VALHALLA_TILE_URLS=` (vide) — Valhalla lit l'extrait OSM déjà déposé par
  `tiles-fetch pbf` au lieu de le télécharger ;
- `AVIATION_FEED=exercise` — le suivi aérien passe en noria simulée.
- `FLOOD_API_KEY` vide (défaut) — les prévisions de crue (ADR 0010) viennent
  de GloFAS via Open-Meteo, sans clé ; posée, la clé bascule le courtier sur
  Google Flood Hub (jauges, seuils et cartes d'inondation du fournisseur).

Les flux sismique (EMSC), météo et crues (Open-Meteo) ont besoin d'Internet ;
sans lui, leurs modules affichent « flux indisponible » et le reste de la
plateforme n'en dépend pas — le simulateur d'inondation de la carte, lui,
calcule sur les tuiles d'altitude de la station et reste disponible.

## 6. Exploitation

| Geste | Commande |
| --- | --- |
| Mettre à jour après un `git pull` | `docker compose up -d --build` |
| Journaux | `docker compose logs -f api` (ou `web`, `tiles`, `routing`, `proxy`) |
| Sauvegarder (base + instantané + pièces jointes) | `.\scripts\backup.ps1 -Dest D:\sauvegardes\iris` |
| Restaurer | `.\scripts\restore.ps1 -Stamp 20260914-103000 -Source D:\sauvegardes\iris` |
| Arrêter / redémarrer (les données restent) | `docker compose down` / `docker compose up -d` |
| **Tout effacer**, données comprises | `docker compose down -v` |

## 7. Ce qui est persisté, et où

| Donnée | Où | Sauvegardé par |
| --- | --- | --- |
| Journal d'audit, drapeaux de fonctionnalité, bons de travail | PostgreSQL (`iris_db_data`) | `backup.ps1` (pg_dump) |
| Incidents, unités, hôpitaux, abris, morgues, **comptes**, missions, comptes rendus, canaux et messages | instantané JSON du volume `iris_api_data` (`STATE_SNAPSHOT=on`) | `backup.ps1` (archive) |
| Pièces jointes des messages | `iris_api_data/attachments` | `backup.ps1` (archive) |
| Tuiles, polices, styles | `iris_argos_tiles` | à recopier une fois (`docker run --rm -v iris_argos_tiles:/data -v D:\tuiles:/out alpine tar czf /out/tiles.tgz -C /data .`) |
| Tuiles de routage, extrait OSM | `iris_valhalla_data` | se reconstruit (~3 min depuis l'extrait) |
| Jeux annexes de planetiler (Natural Earth, lacs, polygones d'eau) | `iris_planetiler_cache` | se retélécharge ; inutile une fois `plan-vector.mbtiles` produit |

Honnêteté sur l'état : en Phase 1, le domaine et les comptes vivent dans
l'instantané JSON, pas dans PostgreSQL. C'est durable (volume Docker,
sauvegardé), mais ce n'est pas une base relationnelle : pas de requêtes SQL
sur les incidents, pas d'accès concurrent depuis un second serveur. Le passage
du domaine en base est un lot distinct ; la pile de déploiement n'aura pas à
changer pour l'accueillir (la base est déjà là).

## 8. Dépannage

- **« API injoignable » à la connexion** — `docker compose ps` : `api` doit
  être `healthy`. Sinon `docker compose logs api` ; la cause la plus fréquente
  est un `.env` incomplet (`POSTGRES_PASSWORD`, `AUTH_DEV_SECRET`).
- **Carte sans fond** — les tuiles ne sont pas provisionnées (`tiles-fetch
  status`) ou le service `tiles` a refusé de démarrer faute de fichiers
  (`docker compose logs tiles`) : lancer `tiles-fetch placeholder` puis
  `docker compose restart tiles`.
- **`tiles-osm` ou `tiles-fetch assets` échouent sur `github.com`** — l'hôte
  est filtré sur certains réseaux ; l'outil a des replis (voir
  `infra/geo/README.md`, « Réseaux où github.com est filtré »). Relancer
  `tiles-fetch pbf` d'abord : il dépose ce que planetiler ne pourra pas
  télécharger.
- **Copilote muet** — Ollama n'est pas joignable depuis Docker : vérifier
  `OLLAMA_HOST=0.0.0.0`, puis `http://localhost/llm/api/tags` doit lister les
  modèles. Dans *Paramètres* de l'application, le point d'accès est `/llm`.
- **Port 80 déjà pris** (IIS, Skype…) — `HTTP_PORT=8080` dans `.env`, puis
  `http://localhost:8080` ; régler `PUBLIC_URL` en conséquence.
- **Scripts qui échouent avec `\r`** — le dépôt impose LF (`.gitattributes`) ;
  si Git a été configuré en `core.autocrlf=true` avant le clone, refaire
  `git config core.autocrlf false` puis `git checkout -- .`.
