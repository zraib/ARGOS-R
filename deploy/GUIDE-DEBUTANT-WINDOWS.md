# Déployer IRIS sur une station Windows — guide pas à pas pour débutant

Ce guide s'adresse à quelqu'un qui n'a **jamais** déployé d'application. Il
reprend, dans l'ordre et sans rien supposer, tout ce qu'il faut faire pour
que la plateforme IRIS tourne sur une seule machine Windows et soit
accessible aux autres postes du réseau local. Comptez **une demi-journée**
la première fois (dont une bonne heure de téléchargements).

La référence technique complète reste [`README.md`](README.md) ; ce guide
en est la version « je vous tiens la main ». À chaque étape, un encadré
**Vérifiez** dit ce que vous devez voir avant de continuer.

---

## 0. Ce dont vous avez besoin

| Quoi | Détail |
| --- | --- |
| Une machine Windows 10 ou 11 **64 bits**, à jour | avec les droits administrateur |
| 16 Go de mémoire vive au minimum (32 Go conseillés) | Docker et les tuiles de carte en consomment beaucoup |
| 60 Go d'espace disque libre, **plus** la place des tuiles de carte (quelques Go à plusieurs dizaines selon la couverture voulue) | |
| Une connexion Internet **pendant l'installation** | pour télécharger Docker, le code et les tuiles ; ensuite la station peut vivre en réseau isolé |
| Le mot de passe de compte de la session Windows | plusieurs installations le demandent |

Vocabulaire minimal :

- **Docker Desktop** : le logiciel qui fait tourner IRIS « dans des boîtes »
  (des conteneurs) sans rien installer d'autre sur Windows.
- **PowerShell** : la fenêtre de commande de Windows. On y tape des commandes
  et on valide avec Entrée. Pour l'ouvrir : menu Démarrer → taper
  `PowerShell` → clic droit → **Exécuter en tant qu'administrateur**.
- **Le dossier `deploy`** : dans le code d'IRIS, le dossier qui contient tout
  ce dont Docker a besoin. C'est là que se tapent presque toutes les commandes.

---

## 1. Activer WSL 2 (une fois)

Docker Desktop s'appuie sur un petit Linux intégré à Windows, appelé WSL 2.

1. Ouvrez PowerShell **en administrateur**.
2. Tapez, puis Entrée :

   ```powershell
   wsl --install
   ```

3. Redémarrez la machine quand Windows le demande.
4. Après le redémarrage, une fenêtre Ubuntu peut s'ouvrir et demander un nom
   d'utilisateur : fermez-la, elle n'est pas nécessaire.

> **Vérifiez** — dans PowerShell, `wsl --status` affiche « Version par
> défaut : 2 ».

5. Réglez la mémoire que WSL 2 peut prendre. Créez le fichier
   `C:\Users\<votre nom>\.wslconfig` (avec le Bloc-notes : Fichier →
   Enregistrer sous → nom `.wslconfig`, type « Tous les fichiers ») et
   collez :

   ```ini
   [wsl2]
   memory=12GB
   processors=6
   ```

   Puis dans PowerShell : `wsl --shutdown`.

---

## 2. Installer Docker Desktop

1. Téléchargez Docker Desktop pour Windows sur le site de Docker et lancez
   l'installateur. Gardez les choix par défaut (« Use WSL 2 »).
2. Redémarrez si demandé, puis lancez **Docker Desktop** depuis le menu
   Démarrer. Acceptez les conditions d'utilisation ; vous pouvez ignorer la
   création de compte Docker (« Continue without signing in »).
3. Attendez que l'icône de la baleine, en bas à droite, cesse de bouger.

> **Vérifiez** — dans PowerShell (une fenêtre normale suffit désormais) :
>
> ```powershell
> docker --version
> docker compose version
> ```
>
> Les deux commandes affichent un numéro de version. Sinon, Docker Desktop
> n'est pas démarré : ouvrez-le et attendez.

---

## 3. Installer Git et récupérer le code

> **Vous avez reçu un paquet d'installation** (`iris-station-<version>.zip`,
> environ 2 Go) ? Sautez cette étape et la suivante : décompressez-le dans
> `C:\iris` (clic droit → *Extraire tout…*), puis passez directement au
> **§ 5 bis**. Ni Git, ni Internet, ni compilation ne sont nécessaires.


1. Téléchargez **Git pour Windows** et installez-le avec les choix par défaut,
   **sauf** l'écran « Configuring the line ending conversions » : choisissez
   **« Checkout as-is, commit as-is »**. (Si vous l'avez manqué, tapez après
   l'installation `git config --global core.autocrlf false`.)
2. Choisissez où mettre le code — par exemple `C:\iris`. Dans PowerShell :

   ```powershell
   mkdir C:\iris
   cd C:\iris
   git clone <adresse du dépôt> .
   git checkout fusion
   ```

   L'adresse du dépôt vous est donnée par l'équipe projet. Si la station n'a
   pas accès au dépôt, copiez le dossier du code depuis une clé USB ; le
   résultat est le même.

> **Vérifiez** — `dir C:\iris` montre les dossiers `apps`, `deploy`,
> `infra`, `docs`.

---

## 4. Préparer les réglages et les secrets

1. Allez dans le dossier de déploiement et copiez le fichier modèle :

   ```powershell
   cd C:\iris\deploy
   copy .env.example .env
   ```

2. Fabriquez **deux** secrets aléatoires (relancez la commande deux fois,
   notez chaque résultat) :

   ```powershell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})
   ```

3. Ouvrez `.env` avec le Bloc-notes (`notepad .env`) et remplacez :
   - `POSTGRES_PASSWORD=CHANGER-MOI-secret-long-aleatoire` → le premier secret ;
   - `AUTH_DEV_SECRET=CHANGER-MOI-secret-long-aleatoire` → le second.

   Ne touchez à rien d'autre pour l'instant. Enregistrez et fermez.

> **Vérifiez** — `type .env` n'affiche plus « CHANGER-MOI ». Ce fichier
> contient des secrets : ne le copiez jamais dans un message ni dans le dépôt.

Quelques réglages utiles à connaître (à laisser tels quels au premier essai) :

| Variable | Valeur par défaut | Quand la changer |
| --- | --- | --- |
| `HTTP_PORT` | `80` | si un autre logiciel occupe déjà le port 80 (voir dépannage) |
| `PUBLIC_URL` | `http://localhost` | mettez l'adresse que les autres postes taperont, ex. `http://192.168.1.20` |
| `MAP_TILES` | `external` | `sovereign` pour un fond de carte hors ligne servi par la station (§ 6) — avec `COMPOSE_PROFILES=sovereign` |
| `AVIATION_FEED` | `exercise` | `opensky` si la station a Internet et que vous voulez le trafic aérien réel |
| `FLOOD_API_KEY` | vide | une clé Google Flood Hub, si l'organisme en a une — sans clé, les crues viennent de GloFAS/Open-Meteo |
| `SAT_TILE_URL` | vide | l'adresse d'une source d'imagerie sous licence (voir § 6) |

---

## 5. Premier démarrage

1. Toujours dans `C:\iris\deploy` :

   ```powershell
   docker compose up -d --build
   ```

   La première fois, Docker construit les images (il compile l'application) :
   **5 à 15 minutes** selon la machine. Les lignes qui défilent sont
   normales. La commande rend la main quand tout est lancé.

2. Contrôlez l'état :

   ```powershell
   docker compose ps
   ```

> **Vérifiez** — les services `proxy`, `web`, `api`, `db`, `tiles` et
> `routing` sont `running` ; `api` indique `(healthy)` après une minute ou
> deux. Le script `.\scripts\status.ps1` donne le même résumé, en clair.

3. Ouvrez un navigateur sur **http://localhost**. L'écran de connexion IRIS
   apparaît.
4. Connectez-vous avec le compte fondateur : identifiant `m.zraib`, code
   temporaire `ARGOS-2026`. L'application vous demande de choisir un
   **nouveau mot de passe** : c'est obligatoire, faites-le tout de suite.

> **Vérifiez** — le tableau de bord s'affiche. La carte, elle, est encore
> vide de fond : c'est normal, les tuiles viennent à l'étape suivante.

Depuis un autre poste du réseau, tapez l'adresse de la station
(`http://<nom ou IP de la station>`). Pour connaître l'IP : `ipconfig`
dans PowerShell, ligne « Adresse IPv4 ». Si rien ne s'affiche, le pare-feu
Windows bloque le port 80 : autorisez « Docker Desktop » pour les réseaux
privés dans les réglages du pare-feu.

---

## 5 bis. Premier démarrage depuis le paquet d'installation

Le paquet contient le code, toutes les images Docker déjà construites et les
outils. Un seul script fait le travail des § 4 et § 5.

1. Ouvrez PowerShell et allez dans le dossier de déploiement du paquet :

   ```powershell
   cd C:\iris\deploy
   .\scripts\install.ps1
   ```

   Si PowerShell refuse (« l'exécution de scripts est désactivée »), tapez
   une fois `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, répondez
   `O`, puis relancez le script. Si le port 80 est déjà pris sur la machine,
   lancez plutôt `.\scripts\install.ps1 -HttpPort 8080`.

2. Le script affiche cinq étapes : Docker, chargement des images (quelques
   minutes : l'archive fait plus d'un gigaoctet), réglages, démarrage, attente
   de l'API. Il fabrique lui-même les deux secrets du § 4 dans `.env`.

> **Vérifiez** — la dernière ligne indique « API en ligne » et l'adresse à
> ouvrir (`http://localhost`, ou `http://localhost:8080`). Connectez-vous
> comme au § 5, point 4, et changez le mot de passe du compte fondateur. La
> carte s'affiche directement (fond externe, § 6).

Ce que le script ne fait pas : les comptes (§ 8) et, en mode hors ligne
seulement, les tuiles (§ 6). Pour une mise à jour, décompressez le nouveau
paquet par-dessus l'ancien dossier (ou remplacez `deploy\images` et
`deploy\VERSION`) et relancez le script : votre `.env` et vos données sont
conservés.

---

## 6. Le fond de carte

Par défaut (`MAP_TILES=external` dans `.env`), la carte est celle que vous
connaissez du mode développement : imagerie satellite Esri/Maxar, plan et
noms de lieux (en latin et en arabe), relief pour la 3D. Le plan respecte
l'intégrité territoriale du Royaume : aucune ligne de séparation n'est
tracée au sud, la frontière court jusqu'à la Mauritanie et à l'Algérie. Tout
vient d'Internet, donc **chaque poste qui ouvre IRIS doit avoir Internet** —
et il n'y a **rien à préparer** : ouvrez la carte, elle s'affiche.

> **Vérifiez** — la carte montre le Maroc en satellite ; le bouton « Plan »
> passe au fond plan, sans ligne de séparation au sud de Tarfaya ; le bouton
> 3D fait apparaître le relief.

Le reste de cette étape ne concerne que le mode **hors ligne**
(`MAP_TILES=sovereign` et `COMPOSE_PROFILES=sovereign` dans `.env`, puis
`docker compose up -d --build web`) : la station sert alors elle-même ses
tuiles, sans aucun appel externe, et il faut les préparer une fois, depuis la
station connectée à Internet. Toujours dans `C:\iris\deploy`, tapez les
commandes **une par une**, en attendant la fin de chacune :

```powershell
docker compose run --rm tiles-fetch pbf
docker compose run --rm tiles-osm
docker compose run --rm tiles-fetch assets
docker compose run --rm tiles-fetch fetch dem
docker compose restart tiles
```

Ce que chacune fait, et combien de temps compter :

| Commande | Ce qu'elle prépare | Durée |
| --- | --- | --- |
| `tiles-fetch pbf` | l'extrait cartographique du Maroc (routes, villes) — sert aussi au calcul d'itinéraires | quelques minutes |
| `tiles-osm` | le fond de carte « plan » du pays, à tous les niveaux de zoom | ~10 min |
| `tiles-fetch assets` | les polices (latin + arabe) et les styles de carte | 1 min |
| `tiles-fetch fetch dem` | le relief (vue 3D, simulateurs d'inondation et de feu) | 1 à 2 h, ~6 Go |
| `restart tiles` | le serveur de tuiles relit ce qui vient d'arriver | secondes |

L'imagerie satellite est **facultative** et demande une licence d'usage
hors ligne. Si l'organisme en a une, renseignez `SAT_TILE_URL` dans `.env`
puis lancez `docker compose run --rm tiles-fetch estimate sat` (combien de
tuiles) et `docker compose run --rm tiles-fetch fetch sat`. Sans imagerie,
la carte a le fond « plan » et les noms de lieux, ce qui suffit à opérer.

> **Vérifiez** — `docker compose run --rm tiles-fetch status` liste les
> jeux présents ; dans l'application, la carte montre le Maroc en mode
> « Plan », et le bouton 3D fait apparaître le relief.

Si une commande se plaint de `github.com` (certains réseaux le filtrent) :
relancez d'abord `tiles-fetch pbf`, puis la commande en échec — l'outil a
des replis prévus pour ce cas (détails dans `../infra/geo/README.md`).

---

## 7. Le copilote (facultatif)

Le copilote IRIS et le brouillon d'incident s'appuient sur un modèle de
langage qui tourne **sur la station**, hors Docker :

1. Installez **Ollama pour Windows**, puis dans PowerShell :
   `ollama pull qwen2.5:14b` (plusieurs Go à télécharger).
2. Ajoutez la variable d'environnement système `OLLAMA_HOST` avec la valeur
   `0.0.0.0` (Panneau de configuration → Système → Paramètres système
   avancés → Variables d'environnement), puis redémarrez Ollama.
3. Dans IRIS, *Paramètres* : le point d'accès du modèle est `/llm`.

> **Vérifiez** — `http://localhost/llm/api/tags` dans le navigateur liste
> le modèle téléchargé.

Sans Ollama, tout le reste de la plateforme fonctionne ; seuls le copilote
et le brouillon automatique restent muets.

---

## 8. Créer les comptes et vérifier les modules

La station démarre **vide** : pas d'incident, pas d'unité, pas d'abri ni de
morgue, rien qui bouge sur la carte — seuls le réseau hospitalier et la
géographie sont là. Tout ce que vous y mettez est réel et reste après un
redémarrage ou une mise à jour.

1. *Gestion des utilisateurs* : créez les comptes de l'équipe (un rôle, une
   région ou une entité selon le cas). Chaque compte reçoit un code
   temporaire à changer à la première connexion.
2. *OPSnet* : ouvrez une unité et un abri (posez leur position sur la petite
   carte) ; *Service morgue* : créez un site. Chacun apparaît aussitôt sur la
   *Carte opérationnelle*, dans les couches « Forces », « Hébergement » et
   « Santé ».
3. *Traceurs GPS* : partagez la position de votre téléphone depuis
   l'application (ou déclarez un boîtier) — elle apparaît sur la carte de tous
   ceux qui la regardent, couche « Traceurs et positions partagées ».
4. *Utilisateurs › Rôles* : cochez ou décochez les modules d'un rôle ;
   *Paramètres › Modules* : coupez un module pour tout le monde. Dans les deux
   cas c'est **effectif** : l'écran disparaît du menu et le serveur refuse ses
   données, jusqu'à ce que vous rouvriez.
5. Faites le tour : *Carte opérationnelle* (couches, crues, feux de forêt),
   *Hospinet*, *OPSnet*, *Service morgue*, *Centre de communication*.

> **Pour une formation ou un exercice** : *Paramètres › Profil de données ›
> Mode de la station* — choisissez *Démonstration* (jeu d'exemple) ou
> *Exercice* (station vide où l'OPCOM et les cellules créent unités et
> ressources), signez avec votre mot de passe : l'API redémarre seule, la page
> se recharge. Revenez à *Opérationnel* pour la mise en service : les exemples
> partent, ce que vous avez créé reste. Le Super Administrateur peut aussi tout
> remettre à zéro depuis la même page (le réseau hospitalier et les comptes
> restent).

> **Vérifiez** — un second compte, connecté depuis un autre poste, voit les
> incidents de sa région et peut envoyer un message au premier.

---

## 9. Au quotidien

| Besoin | Ce qu'il faut faire (dans `C:\iris\deploy`) |
| --- | --- |
| Arrêter la plateforme (les données restent) | `docker compose down` |
| La redémarrer | `docker compose up -d` |
| Voir si tout va bien | `.\scripts\status.ps1` |
| Lire les journaux d'un service | `docker compose logs -f api` (ou `web`, `tiles`, `routing`, `proxy`) — Ctrl+C pour sortir |
| **Sauvegarder** (à faire régulièrement, sur un disque externe) | `.\scripts\backup.ps1 -Dest D:\sauvegardes\iris` |
| Restaurer une sauvegarde | `.\scripts\restore.ps1 -Stamp 20260915-103000 -Source D:\sauvegardes\iris` (le `Stamp` est le nom du dossier de sauvegarde) |
| Mettre à jour après réception d'une nouvelle version du code | `git pull` (ou recopier le dossier), puis `docker compose up -d --build` |

Les données vivent dans des volumes Docker (base de données, incidents,
comptes, messages, pièces jointes). `docker compose down` ne les efface pas ;
**seule** `docker compose down -v` les supprime : ne la tapez jamais sans
sauvegarde.

Docker Desktop doit être **lancé** pour que la plateforme tourne : réglez-le
pour démarrer avec Windows (Settings → General → « Start Docker Desktop when
you sign in »).

---

## 10. Sans Internet

Une fois les tuiles préparées, la station fonctionne en réseau isolé. Dans
`.env`, mettez `VALHALLA_TILE_URLS=` (vide) et gardez
`AVIATION_FEED=exercise`, puis `docker compose up -d`. Les flux qui
demandent Internet (séismes, météo, prévisions de crue) affichent « flux
indisponible » et rien d'autre n'en dépend ; les simulateurs d'inondation
et de feu, eux, calculent sur le relief de la station.

---

## 11. Dépannage — les cas les plus fréquents

| Ce que vous voyez | Cause probable | Que faire |
| --- | --- | --- |
| « API injoignable » à la connexion | `api` n'est pas `healthy` — souvent un `.env` incomplet | `docker compose logs api` ; vérifiez les deux secrets du § 4, puis `docker compose up -d` |
| La carte est vide, sans fond | en mode externe : le poste n'a pas Internet ; en mode hors ligne : tuiles non préparées, ou `tiles` refuse de démarrer | vérifier l'accès Internet du poste ; § 6 ; sans imagerie, `docker compose run --rm tiles-fetch placeholder` puis `docker compose restart tiles` |
| `docker compose up` échoue sur « port 80 already in use » | un autre logiciel (IIS, Skype…) occupe le port | `HTTP_PORT=8080` dans `.env`, `PUBLIC_URL=http://localhost:8080`, puis `docker compose up -d` et ouvrez `http://localhost:8080` |
| Un autre poste n'atteint pas la station | pare-feu Windows | autorisez Docker Desktop (réseaux privés) ou ouvrez le port 80 en entrée |
| Le copilote ne répond pas | Ollama non joignable depuis Docker | § 7 : `OLLAMA_HOST=0.0.0.0`, redémarrer Ollama |
| Les scripts `.ps1` refusent de s'exécuter | politique d'exécution PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (une fois), puis relancez |
| Erreurs « \r » ou « bad interpreter » dans les journaux | fins de ligne converties par Git | `git config core.autocrlf false` puis `git checkout -- .` et reconstruire |
| Tout est lent, la machine « rame » | mémoire insuffisante pour Docker + tuiles | augmentez `memory=` dans `.wslconfig` (§ 1) ou fermez d'autres logiciels |

En dernier recours, `docker compose down` puis `docker compose up -d --build`
remet tout d'aplomb sans toucher aux données.

---

## 12. Montrer la station à distance (démonstration uniquement)

Pour une démonstration à des personnes qui ne sont pas sur le réseau de la
station, un **tunnel** rend l'application joignable depuis Internet à une
adresse `https://….tunnelto.dev`, sans rien ouvrir sur le pare-feu.

> **Lisez d'abord** — le trafic passe par un service tiers (tunnelto.dev) qui
> peut le lire. C'est acceptable pour une démonstration sur des données
> fictives, jamais pour de vraies opérations. Pendant le tunnel, tout Internet
> voit l'écran de connexion : utilisez des mots de passe forts, fermez le
> tunnel dès la fin, changez ensuite les mots de passe utilisés.

1. Créez un compte sur [tunnelto.dev](https://tunnelto.dev) et copiez la clé
   API affichée dans son tableau de bord (une fois).
2. La station tournant (§ 5), dans PowerShell :

   ```powershell
   cd C:\iris\deploy
   .\scripts\tunnel.ps1 -Key <votre clé>
   ```

   La clé est mémorisée : les fois suivantes, `.\scripts\tunnel.ps1` suffit.
   Le script vérifie que la station répond, affiche l'avertissement ci-dessus,
   puis l'adresse publique (`https://xxxx.tunnelto.dev`) : donnez-la aux
   participants. Avec un compte payant, `-Subdomain iris-demo` fixe le nom.

3. À la fin, revenez dans la fenêtre PowerShell et appuyez sur **Ctrl+C** :
   le tunnel se ferme, la station n'est plus joignable depuis Internet.

> **Vérifiez** — depuis un téléphone en 4G, l'adresse publique affiche l'écran
> de connexion IRIS ; après Ctrl+C, elle ne répond plus.

---

## 13. Ouvrir la station aux autres postes, et en HTTPS

**Depuis les autres postes du réseau.** Notez l'adresse de la station
(`ipconfig`, « Adresse IPv4 »), autorisez le port dans le pare-feu (PowerShell
**en administrateur**, une fois) :

```powershell
New-NetFirewallRule -DisplayName "IRIS HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName "IRIS HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

puis, dans `.env`, `PUBLIC_URL=http://192.168.1.20` (votre adresse) et
`docker compose up -d`. Les autres postes tapent `http://192.168.1.20`.

**En HTTPS** — nécessaire pour que les téléphones puissent partager leur
position (§ « Traceurs GPS ») : dans `.env`, retirez le `#` devant

```
COMPOSE_FILE=docker-compose.yml:compose.https.yml
```

mettez `PUBLIC_URL=https://192.168.1.20`, puis `docker compose up -d`. La
station répond alors en `https://…` et renvoie automatiquement le `http://`
vers le `https://`. Le certificat est celui de la station : le navigateur
avertit une fois (« connexion non privée ») ; cliquez « Paramètres avancés »
puis « Continuer » — sur chaque poste et téléphone.

> **Vérifiez** — `.\scripts\status.ps1` affiche la santé de l'API sur
> `https://localhost` ; depuis un téléphone, `https://192.168.1.20` ouvre
> l'écran de connexion après l'avertissement.

**Depuis Internet, sans intermédiaire.** C'est l'administrateur du réseau qui
ouvre la porte, sur la passerelle de l'organisme : une redirection du port 443
(et 80) vers la station, et un nom de domaine qui pointe vers l'adresse
publique. Avec ce nom, un certificat reconnu s'obtient tout seul :

```
COMPOSE_FILE=docker-compose.yml:compose.letsencrypt.yml
DOMAIN=iris.exemple.ma
ACME_EMAIL=admin@exemple.ma
PUBLIC_URL=https://iris.exemple.ma
```

puis `docker compose up -d`. Plus d'avertissement. Tout Internet voit alors
l'écran de connexion : mots de passe forts pour tous les comptes.

