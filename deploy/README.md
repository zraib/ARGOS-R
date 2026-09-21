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

Deux voies, même résultat. **Depuis le paquet d'installation** (images
préconstruites, aucun Internet ni compilation sur la station — voir § 9) :

```powershell
cd deploy
.\scripts\install.ps1
```

**Depuis le code** (la station a Internet et construit elle-même les images) :

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

## 4. Fond de carte : externe (défaut) ou hors ligne

Le fond de carte est **figé dans l'image web** à la construction
(`MAP_TILES` dans `.env`, [ADR 0014](../docs/adr/0014-fond-de-carte-externe-station.md)) :

| `MAP_TILES` | Ce que la carte montre | Ce qu'il faut |
| --- | --- | --- |
| `external` (défaut) | imagerie **Esri/Maxar**, plan et toponymes **vectoriels OpenFreeMap** (données OpenStreetMap) stylés par l'application — **aucune frontière contestée n'est tracée : le Royaume est entier**, latin et arabe —, relief AWS pour la 3D et les simulateurs | Internet sur chaque poste ; rien à préparer ; `COMPOSE_PROFILES=` vide (pas de serveur de tuiles) |
| `sovereign` | des tuiles servies par la station elle-même, sans aucun appel externe | remplir le volume `iris_argos_tiles` une fois (ci-dessous) ; `COMPOSE_PROFILES=sovereign` |

Changer de mode : modifier les deux lignes dans `.env`, puis
`docker compose up -d --build web` (la station a Internet) ou charger un
paquet construit dans ce mode (`package.sh --map sovereign`). En mode externe,
la politique de sécurité du poste web n'ouvre que trois hôtes
(`server.arcgisonline.com`, `tiles.openfreemap.org`, `s3.amazonaws.com`) ;
tout le reste reste `'self'`. Dans les deux modes, le plan ne trace aucune
frontière contestée (ADR 0014) : la frontière du Maroc court sans rupture
jusqu'à la Mauritanie et à l'Algérie.

### Tuiles hors ligne (mode `sovereign`) — la version RIF

La carte n'appelle alors **aucun fournisseur externe** : tout ce qu'elle
affiche vient du volume `iris_argos_tiles` — et c'est **la même carte qu'en
ligne** ([ADR 0023](../docs/adr/0023-version-rif-carte-complete-sans-internet.md)) :
imagerie par zones (le pays, les agglomérations, 3 km autour de chaque
commune), relief 3D, plan et toponymes **vectoriels** du Maroc entier (latin et
arabe, sans frontière contestée), rendus par le navigateur comme en ligne. Là
où l'imagerie fine n'a pas été provisionnée, la tuile parente est agrandie :
la carte ne se vide jamais.

Deux façons de remplir le volume :

- **le paquet l'embarque** (`deploy\tiles-data\iris-tiles-….tar`, fabriqué avec
  `package.sh --map sovereign --with-tiles …`) : `install.ps1` l'importe seul,
  rien à télécharger, jamais ; une archive reçue à part s'importe par
  `.\scripts\tiles-import.ps1 -Archive D:\iris-tiles-….tar` ;
- **le remplir une fois** depuis une machine qui a Internet (la station, ou
  une autre — `scripts/tiles-export.sh` en fait l'archive). Marche à suivre
  détaillée et licences : [`../infra/geo/README.md`](../infra/geo/README.md).

```powershell
cd deploy
docker compose run --rm tiles-fetch pbf          # extrait OSM du Maroc (~250 Mo) — sert aussi à Valhalla
docker compose run --rm tiles-osm                # tuiles vectorielles du Maroc, tous zooms (~10 min)
docker compose run --rm tiles-fetch assets       # polices (latin + arabe) + styles « plan » et « toponymes »
docker compose run --rm tiles-fetch fetch dem    # relief 3D, tout le pays (~200 000 tuiles, ~6 Go)
docker compose run --rm tiles-fetch estimate sat # combien d'imagerie le profil demande (≈ 424 000 tuiles, 9,3 Go)
docker compose run --rm tiles-fetch fetch sat    # imagerie : pays z13, agglomérations z17, chaque commune z15 — voir la licence !
docker compose run --rm tiles-fetch status
docker compose restart tiles
```

Un téléchargement s'interrompt et **reprend** (relancer la même commande) ;
`--zones maroc`, `--zones communes`, `--max-zoom 11` découpent le travail.
Une fois le volume plein, `bash scripts/tiles-export.sh` (macOS/Linux) en fait
l'archive à livrer aux autres stations.

Sans imagerie (`SAT_TILE_URL` vide dans `.env`), lancer quand même
`tiles-fetch placeholder` pour que le serveur de tuiles démarre : la carte a
alors le fond **plan** et les toponymes, pas la vue satellite.

Vérification : ouvrir la carte, l'onglet Réseau du navigateur ne doit montrer
que des requêtes vers la station (`/tiles/...`), aucune vers `arcgisonline`,
`openfreemap` ou `amazonaws`. (En mode `external`, c'est l'inverse : ces
trois hôtes, et eux seuls.)

## 5. Sans Internet du tout

La pile fonctionne en réseau isolé en mode `sovereign`, une fois les tuiles
provisionnées (§ 4). Réglages dans `.env` :

- `MAP_TILES=sovereign` et `COMPOSE_PROFILES=sovereign` — le fond de carte
  vient de la station ;
- `VALHALLA_TILE_URLS=` (vide) — Valhalla lit l'extrait OSM déjà déposé par
  `tiles-fetch pbf` au lieu de le télécharger ;
- `AVIATION_FEED=exercise` — le suivi aérien passe en noria simulée.
- `INCIDENTS_VISIBILITY` — `all` (défaut : tout incident se voit de tous les rôles) ou `scoped`
  (cantonnement par région, opération de déploiement, entité — doctrine V-1).
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
| Mettre à jour depuis un nouveau paquet **en gardant les comptes** | [MISE-A-JOUR-STATION.md](MISE-A-JOUR-STATION.md) — `scripts\upgrade.ps1 -Current C:\iris\deploy` (sauvegarde, `.env` repris, volumes intacts, contrôle, retour en arrière) |
| Changer le mode de la station (opérationnel, exercice, démonstration) | *Paramètres › Profil de données* (l'API redémarre seule) ou `.env` : `APP_MODE=…` puis `docker compose up -d api` (§ 6 bis, ADR 0016) |
| Rendre la station accessible depuis Internet, sans toucher au routeur | `.\scripts\expose.ps1` (§ 10, ADR 0028) |
| Joindre la station depuis le réseau ou Internet, en HTTPS | `.env` : `COMPOSE_FILE=…compose.https.yml` ou `…compose.letsencrypt.yml`, puis `docker compose up -d` (§ 11) |
| Journaux | `docker compose logs -f api` (ou `web`, `tiles`, `routing`, `proxy`) |
| Sauvegarder (base + instantané + pièces jointes) | `.\scripts\backup.ps1 -Dest D:\sauvegardes\iris` |
| Restaurer | `.\scripts\restore.ps1 -Stamp 20260914-103000 -Source D:\sauvegardes\iris` |
| Arrêter / redémarrer (les données restent) | `docker compose down` / `docker compose up -d` |
| **Tout effacer**, données comprises | `docker compose down -v` |

## 6 bis. Mode de la station : opérationnel, exercice, démonstration

Trois modes (ADR 0016), réglés par `APP_MODE` dans `.env` **ou** par le Super
Administrateur dans *Paramètres › Profil de données* (le réglage persisté
prime, et l'API redémarre d'elle-même pour l'appliquer — une trentaine de
secondes) :

| Mode | Données | Qui crée quoi |
| --- | --- | --- |
| `operational` (défaut) | rien de simulé | unités : Super Administrateur ; ressources : chefs d'unité, directeurs d'hôpital, chefs d'abri ; l'OPCOM affecte, le TACOM exploite, les cellules déploient |
| `exercise` | rien de simulé | l'OPCOM et les cellules créent, modifient et retirent unités, personnes, équipes, équipements, véhicules ; la cellule verte tient la logistique |
| `demo` | jeu de démonstration | toutes les fonctionnalités, données simulées sur la carte |

La station démarre **vide** (`APP_MODE=operational`, défaut du `.env.example`) :
aucun incident, aucune unité, aucun abri, aucune morgue ni dossier, aucun
convoi animé ni aéronef fictif, un seul canal « général ». Seuls restent les
référentiels — le réseau hospitalier (113 établissements, à compléter ou à
élaguer depuis Hospinet), la géographie, les types d'incident, les substances
— et **ce que les opérateurs créent** : une unité, un abri ou une morgue
déployés apparaissent sur la carte à la position saisie ; un boîtier GPS qui
émet ou un compte qui partage sa position depuis l'application y apparaissent
aussi (couche « Traceurs et positions partagées »).

- `APP_MODE=demo` reconstruit le jeu de démonstration au démarrage (poste de
  formation). Repasser en `exercise` ou `operational` élague les graines et
  **garde** ce que les opérateurs ont créé, les comptes et la base. (`DATA_PROFILE`,
  réglage de l'ADR 0015, reste honoré si `APP_MODE` est absent.)
- *Paramètres › Profil de données* montre le profil servi, le volume du domaine,
  et offre au Super Administrateur la **remise à zéro** signée par son mot de
  passe : tout le domaine opérationnel part, le réseau hospitalier, les comptes
  et la base restent.
- Les suppressions d'unité, d'abri, de morgue et d'hôpital sont réservées au
  Super Administrateur (bouton sur la fiche) ; l'API refuse tant que l'entité
  est engagée, occupée, tenue par un compte ou porte des corps au registre, et
  dit pourquoi — l'opérateur passe outre en connaissance de cause.
- Les bascules d'administration sont **effectives côté API** : un module coupé
  dans *Paramètres › Modules* l'est pour tous ; un module coupé pour un rôle
  dans *Utilisateurs › Rôles* lui est refusé, pas seulement masqué (ADR 0015) ;
  de même pour les **43 fonctionnalités de l'API** coupées par rôle (ADR 0022).
- **Mode de l'application** (ADR 0022) — *Paramètres › Profil de données › Mode
  de l'application* : *classique* (l'organisation d'origine) ou *Direx*
  (direction d'exercice et PC par fonctions). Super Administrateur seul, mot de
  passe exigé, sans redémarrage ; sous un mode, les comptes de l'autre profil
  ne se connectent pas (message à l'écran), leurs sessions tombent, et ils
  n'apparaissent ni dans la gestion des utilisateurs ni dans le centre de
  communication ; annoncé sur l'écran de connexion et dans l'en-tête ;
  persisté dans `settings.json`.

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

## 9. Paquet d'installation (images préconstruites)

La station n'a ni à compiler ni à télécharger : le poste de développement
fabrique un **paquet** qui contient l'arbre du dépôt, toutes les images Docker
pour `linux/amd64` (les nôtres et celles de base : proxy, base de données,
tuiles, routage) et le client tunnel du § 10.

Sur le poste de développement (macOS ou Linux, Docker Desktop) :

```bash
deploy/scripts/package.sh                 # → deploy/dist/iris-station-<version>.zip
deploy/scripts/package.sh --with-tiles-build   # + planetiler, pour bâtir le fond de carte sur la station
deploy/scripts/package.sh --no-base       # images de l'application seules (station avec Internet)
```

La version est `AAAAMMJJ-<commit>` ; sur un Mac Apple Silicon les images sont
construites en émulation `linux/amd64` (Rosetta), ce qui prend une à deux
minutes de plus qu'une construction native. Le zip pèse environ 2 Go, images
comprises ; `MANIFEST.txt` en donne les empreintes SHA-256 et les digests des
images, `LISEZMOI.txt` les trois gestes de la station.

Sur la station : décompresser (par exemple dans `C:\iris`), puis

```powershell
cd C:\iris\deploy
.\scripts\install.ps1            # -HttpPort 8080 si le port 80 est pris ; -NoStart pour ne pas démarrer
```

Le script charge les images (`deploy\images`), les étiquette `latest` (celle
que `docker-compose.yml` attend, variable `IRIS_TAG`), écrit `.env` depuis
`.env.example` avec deux secrets générés s'il n'existe pas, démarre la pile et
attend l'API. Relançable : un `.env` existant n'est jamais touché. Le fond de
carte (§ 4) se prépare ensuite, comme après une construction locale.

## 10. Rendre la station accessible depuis Internet — sans toucher au routeur

Un tunnel **sortant** fait partie de la pile ([ADR 0028](../docs/adr/0028-acces-public-par-tunnel-integre-a-la-pile.md)) :
la station ouvre elle-même une connexion vers le réseau Cloudflare, qui lui
attribue une adresse `https://` et lui renvoie le trafic. Aucun port à ouvrir,
rien à régler sur le routeur ni le pare-feu, aucun certificat à gérer. Le tunnel
est un conteneur (`restart: unless-stopped`) : une fois ouvert, il redémarre
avec Docker Desktop et survit aux mises à jour.

```powershell
cd C:\iris\deploy
.\scripts\expose.ps1            # tunnel RAPIDE : affiche https://<quatre-mots>.trycloudflare.com — sans compte
.\scripts\expose.ps1 -Status    # l'adresse publique en service
.\scripts\expose.ps1 -Off       # ferme l'accès public
```

**Adresse fixe** (recommandé dès que l'accès sert plus d'une fois) : un compte
Cloudflare gratuit et un nom de domaine chez eux → *Zero Trust › Networks ›
Tunnels › Create a tunnel* (type Cloudflared), un **Public Hostname**
(`iris.votre-domaine`) dont le service est `http://proxy:80`, puis :

```powershell
.\scripts\expose.ps1 -Token <jeton du tunnel>    # tunnel NOMMÉ : votre adresse, la même après chaque redémarrage
```

Le jeton s'écrit dans `deploy\.env` (`CLOUDFLARE_TUNNEL_TOKEN`) — ne le partagez
pas. Le même tableau de bord permet ensuite de poser une porte d'identité
(*Cloudflare Access*, gratuit jusqu'à 50 utilisateurs) devant l'adresse, sans
rien changer à la station.

**Ce que cela implique :**

- le trafic passe par un **relais tiers** (Cloudflare) qui termine le TLS
  public : il voit les échanges en clair entre son bord et la station ;
- **tout Internet** atteint l'écran de connexion. Seule la connexion protège :
  mots de passe forts, comptes de démonstration désactivés (*Gestion des
  utilisateurs*), et l'API borne les échecs de connexion (dix par compte et par
  quart d'heure, réponse 429) ; `/api/docs` est lisible, sans donnée ;
- l'adresse d'un tunnel rapide **change** à chaque redémarrage du tunnel et
  Cloudflare ne garantit rien sur ces tunnels — pour un accès durable, le
  tunnel nommé ;
- fermez l'accès (`-Off`) quand il ne sert plus, et changez ensuite les mots de
  passe utilisés pendant l'exposition.

Rien ne change dans l'application : une seule origine, des chemins relatifs,
une CSP en `'self'` ; le fond de carte souverain se sert aussi par le tunnel.
L'ancien chemin (`scripts\tunnel.ps1`, client tunnelto.dev avec compte,
[ADR 0013](../docs/adr/0013-exposition-temporaire-tunnel.md)) reste utilisable.
En service sur le réseau de l'organisme, l'accès distant passe par son VPN
(§ 11 pour une exposition sans relais tiers).

## 11. Exposer la station sans relais tiers : réseau local, Internet, HTTPS

La station est faite pour être jointe **directement** : par les postes du
réseau, et si l'organisme le décide, depuis Internet par sa propre passerelle
— sans le tunnel du § 10. Trois étapes, la troisième seulement pour Internet.

### 11.1 Le réseau local

La pile écoute déjà sur toutes les interfaces de la station. Il faut :

1. l'adresse de la station (`ipconfig`, ligne « Adresse IPv4 », par exemple
   `192.168.1.20` — demander une adresse fixe ou une réservation DHCP) ;
2. ouvrir le port dans le pare-feu Windows (une fois, PowerShell administrateur) :

   ```powershell
   New-NetFirewallRule -DisplayName "IRIS HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
   New-NetFirewallRule -DisplayName "IRIS HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
   ```

3. `PUBLIC_URL` dans `.env` = l'adresse que les postes taperont, puis
   `docker compose up -d`.

Les postes ouvrent alors `http://192.168.1.20` (ou `https://…`, § 11.2).

### 11.2 HTTPS

Deux empilements de compose, activés par **une ligne dans `.env`** — les
scripts (`install.ps1`, `status.ps1`, `backup.ps1`, `restore.ps1`) la lisent :

| Ligne dans `.env` | Certificat | Quand |
| --- | --- | --- |
| `COMPOSE_FILE=docker-compose.yml:compose.https.yml` | auto-signé, engendré par le proxy | réseau local ; **indispensable au partage de position des téléphones** (les navigateurs mobiles n'accordent la géolocalisation qu'en HTTPS). Chaque poste et téléphone accepte l'avertissement une fois. |
| `COMPOSE_FILE=docker-compose.yml:compose.letsencrypt.yml` | public (Let's Encrypt), renouvelé seul | Internet avec un **nom de domaine** (`DOMAIN`) qui pointe vers la passerelle de l'organisme et les ports 443 et 80 redirigés vers la station ; `ACME_EMAIL` requis. Aucun avertissement. |

Puis `docker compose up -d` : le port `HTTPS_PORT` (443) est publié, le HTTP
est renvoyé vers le HTTPS, `PUBLIC_URL` passe en `https://…`. Un `.env` neuf
peut être écrit directement dans ce mode : `.\scripts\install.ps1 -Https`, ou
`.\scripts\install.ps1 -Domain iris.exemple.ma -AcmeEmail admin@exemple.ma`.

Rien ne change dans les images : une origine, des chemins relatifs, la CSP
suit l'origine de la page. Le tunnel du § 10 ne s'emploie pas avec ces
empilements (il parle au port HTTP, qui renvoie vers le HTTPS).

### 11.3 Internet, par la passerelle de l'organisme

Sur le routeur / pare-feu d'entrée du réseau (par l'administrateur réseau) :

1. une **redirection de port** (NAT) de l'extérieur vers la station :
   externe 443 → `192.168.1.20:443` (et 80 → 80 pour le renvoi HTTP → HTTPS) ;
2. un **nom de domaine** dont l'enregistrement A pointe vers l'adresse
   publique de la passerelle (ou un service de DNS dynamique si elle change) ;
3. l'empilement `compose.letsencrypt.yml` (§ 11.2) avec ce nom.

L'écran de connexion est alors ouvert à tout Internet : mots de passe forts,
borne des échecs de connexion côté API (10 par compte / 15 min), journal
d'audit. Sans nom de domaine, `compose.https.yml` fonctionne aussi depuis
Internet (par l'adresse publique), avec l'avertissement de certificat.
Un VPN de l'organisme reste la voie la plus sobre pour l'exploitation :
la station n'est alors jointe que par des postes déjà authentifiés au réseau.

