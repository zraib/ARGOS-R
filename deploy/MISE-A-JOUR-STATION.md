# Mettre à jour la station Windows en gardant les utilisateurs

Ce guide s'adresse à la personne qui tient la station : une machine Windows
avec Docker Desktop, installée depuis un paquet `iris-station-<version>.zip`
(README § 9), qui tourne aujourd'hui. Il explique comment passer au paquet
suivant **sans perdre** :

- les **comptes utilisateurs** (identifiants, mots de passe, rôles,
  affectations, photos, bascules de modules par compte) ;
- le **domaine** : incidents, unités, hôpitaux de campagne, abris, morgues,
  ressources, postes posés sur la carte, ordres, comptes rendus ;
- les **messages**, les **pièces jointes**, les **alertes** et leurs
  acquittements ;
- le **journal d'audit**, les **drapeaux** et la **matrice rôle → modules** ;
- les **réglages** de la station (`.env` : secrets, port, HTTPS, fond de
  carte, mode).

> **Pourquoi rien ne se perd.** Le paquet contient le *code* (les images
> Docker). Les *données* vivent dans deux volumes Docker que le code ne
> contient pas : `iris_api_data` (les instantanés JSON — dont `iam.json`, les
> comptes — et les pièces jointes) et `iris_db_data` (PostgreSQL : audit,
> drapeaux, bons de travail). Une mise à jour remplace les images et redémarre
> la pile **sur les mêmes volumes**. Le seul geste qui effacerait les données
> est `docker compose down -v` — il n'apparaît nulle part dans ce guide.

Durée : 15 minutes, dont 5 de chargement des images. La station est
indisponible pendant le redémarrage (1 à 2 minutes) : prévoir la mise à jour
**hors conduite d'opération**.

---

## En un coup d'œil

| Étape | Où | Commande |
| --- | --- | --- |
| 1. Vérifier le paquet | PowerShell, dossier de transfert | `Get-FileHash` = contenu du `.sha256` |
| 2. Décompresser **à part** | PowerShell | `Expand-Archive … -DestinationPath C:\iris-<version>` |
| 3. Mettre à jour | `deploy\` du **nouveau** paquet | `.\scripts\upgrade.ps1 -Current C:\iris\deploy -Backups D:\sauvegardes\iris` |
| 4. Vérifier | navigateur | connexion avec un compte existant, liste des comptes, entités |
| 5. Ranger | PowerShell | renommer l'ancien dossier, garder la sauvegarde |

`upgrade.ps1` enchaîne, dans l'ordre et en s'arrêtant à la première erreur :
sauvegarde, reprise du `.env`, arrêt de l'ancienne pile **sans** ses volumes,
contrôle des volumes, installation du nouveau paquet, contrôle de santé. Le
§ 7 décrit les mêmes gestes à la main, si vous préférez les faire un à un.

---

## 1. Sur le poste de développement : fabriquer le paquet

```bash
deploy/scripts/package.sh            # → deploy/dist/iris-station-<version>.zip et .zip.sha256
```

La version se lit dans le nom : `AAAAMMJJ-<commit>`. Copier sur la station **le
zip et son `.sha256`** (clé USB ou partage réseau), par exemple dans
`D:\transfert`.

## 2. Sur la station : vérifier le paquet

Dans PowerShell (pas besoin d'administrateur) :

```powershell
cd D:\transfert
Get-FileHash .\iris-station-<version>.zip -Algorithm SHA256
Get-Content .\iris-station-<version>.zip.sha256
```

Les deux empreintes doivent être **identiques** (majuscules/minuscules sans
importance). Sinon, la copie est abîmée : recopier le fichier avant d'aller
plus loin.

## 3. Décompresser le nouveau paquet dans un dossier à part

Ne jamais décompresser par-dessus l'installation qui tourne : l'ancien dossier
est votre retour en arrière. `upgrade.ps1` refuse d'ailleurs de s'exécuter si
les deux dossiers sont le même.

```powershell
Expand-Archive -Path D:\transfert\iris-station-<version>.zip -DestinationPath C:\iris-<version>
Get-ChildItem C:\iris-<version>\iris-station-<version>\deploy
```

On doit y voir `docker-compose.yml`, `VERSION`, `.env.example`, `images\`
(les images Docker, ~1,6 Go), `scripts\` — et **pas de `.env`** : ce fichier
reste le vôtre, il sera repris de l'installation actuelle.

> Si `Expand-Archive` se plaint d'un chemin trop long, décompressez plus près
> de la racine (`C:\i-<version>`) ou activez les chemins longs de Windows.

## 4. Mettre à jour en une commande

Depuis le dossier `deploy\` du **nouveau** paquet, en indiquant le dossier
`deploy\` de l'installation **actuelle** et un dossier de sauvegarde (de
préférence sur un autre disque) :

```powershell
cd C:\iris-<version>\iris-station-<version>\deploy
.\scripts\upgrade.ps1 -Current C:\iris\deploy -Backups D:\sauvegardes\iris
```

Le script affiche sept étapes :

1. **Préalables** — Docker répond ; le paquet est complet (`VERSION`, images) ;
   l'installation actuelle a bien un `.env` ; il affiche « version actuelle →
   nouvelle version ».
2. **Sauvegarde** — `backup.ps1` de l'installation actuelle : un `pg_dump` de
   la base et une archive du volume `iris_api_data`, horodatés. **Notez
   l'horodatage** (`Stamp`) affiché : c'est la clé du retour en arrière.
3. **Réglages** — le `.env` actuel est copié dans le nouveau dossier. Les
   secrets restent donc les mêmes — c'est ce qui garde la base joignable et
   les sessions valides. Les réglages apparus depuis votre version sont
   listés ; ils prennent leur défaut (`APP_MODE=operational`).
4. **Arrêt de l'ancienne pile** — `docker compose down` **sans `-v`** : les
   conteneurs s'arrêtent, les volumes restent.
5. **Volumes** — le script vérifie que `iris_api_data` et `iris_db_data`
   existent, et s'arrête sinon (on n'installe pas par-dessus des données
   disparues).
6. **Installation** — `install.ps1` du nouveau paquet : charge les images,
   constate que `.env` existe et le conserve, démarre la pile, attend l'API.
   Le nom du projet compose est fixé dans `docker-compose.yml` (`name:
   iris`), quel que soit le dossier : la pile retrouve ses volumes.
7. **Contrôle** — santé de l'API (`status: ok`, mode de la station) et
   rappel de la liste de vérification.

Au premier démarrage de la nouvelle version, l'API applique d'elle-même les
migrations de base manquantes, ajoute à la matrice persistée les rôles et
modules nouveaux **sans toucher aux comptes** (les nouveaux modules prennent
leur défaut : par exemple « Gestion de mon unité » est ouverte aux commandants
d'unité existants), et élague un éventuel jeu de démonstration en gardant ce
que les opérateurs ont créé.

Options : `-SkipBackup` saute la sauvegarde (à éviter : plus de retour en
arrière par `restore.ps1`). Sans `-Backups`, la sauvegarde va dans
`C:\iris\deploy\backups`.

## 5. Vérifier dans le navigateur

```powershell
.\scripts\status.ps1
Invoke-RestMethod http://localhost/api/health | Select-Object status, appMode, dataProfile
```

`status` doit être `ok` et `appMode` `operational`. Puis, à l'adresse
habituelle de la station :

1. **Se connecter avec un compte existant** — pas le compte fondateur. Une
   connexion réussie prouve que `iam.json` et le secret de session ont été
   repris.
2. **Gestion des utilisateurs** : la liste des comptes est intacte, leurs
   rôles et affectations aussi.
3. **Hospinet, OPSnet, Ressources, Carte** : les entités, ressources et postes
   créés avant la mise à jour sont là.
4. **Paramètres › Profil de données** : mode « Opérationnel ».
5. **Paramètres › Rôles & fonctionnalités** : la matrice porte les lignes
   nouvelles (tout le menu, mode édition, simulations) ; les réglages faits
   avant la mise à jour sont conservés.

## 6. Ranger

Une fois la vérification faite, archiver l'ancienne installation (elle ne
contient plus rien d'utile que ses images et son `.env`, déjà repris) :

```powershell
Rename-Item C:\iris C:\iris-ancien-<date>
Move-Item C:\iris-<version>\iris-station-<version> C:\iris
```

Le projet compose s'appelle `iris` par `docker-compose.yml`, pas d'après le
dossier : renommer ou déplacer ne change rien aux volumes ni à la pile qui
tourne. Conserver la sauvegarde du § 4 (étape 2) au moins jusqu'à la mise à
jour suivante ; supprimer `C:\iris-ancien-<date>` quand tout est validé.

## 7. Les mêmes gestes à la main

Si vous préférez ne pas passer par `upgrade.ps1`, voici exactement ce qu'il
fait. Chaque commande s'exécute dans PowerShell.

```powershell
# a. Sauvegarder l'installation actuelle (noter le Stamp affiché)
cd C:\iris\deploy
.\scripts\backup.ps1 -Dest D:\sauvegardes\iris

# b. Reprendre le .env — les secrets doivent rester identiques
Copy-Item C:\iris\deploy\.env C:\iris-<version>\iris-station-<version>\deploy\.env

# c. Arrêter l'ancienne pile SANS toucher aux volumes (jamais `down -v`)
docker compose --project-directory C:\iris\deploy down --remove-orphans

# d. Vérifier que les volumes sont toujours là
docker volume ls | Select-String iris_          # iris_api_data et iris_db_data attendus

# e. Installer le nouveau paquet (images, .env conservé, démarrage)
cd C:\iris-<version>\iris-station-<version>\deploy
.\scripts\install.ps1

# f. Contrôler
.\scripts\status.ps1
Invoke-RestMethod http://localhost/api/health | Select-Object status, appMode
```

Puis le § 5.

## 8. Revenir en arrière

Deux niveaux, selon ce qui s'est passé.

**La nouvelle version ne démarre pas, ou ne convient pas** — les volumes n'ont
pas été touchés : il suffit de redémarrer l'ancienne :

```powershell
cd C:\iris-<version>\iris-station-<version>\deploy
docker compose --project-directory . down            # sans -v
cd C:\iris\deploy                                    # ou C:\iris-ancien-<date>\deploy si déjà renommé
.\scripts\install.ps1                                # recharge les anciennes images sur les mêmes volumes
```

**Des données ont été modifiées à tort après la mise à jour** — restaurer la
sauvegarde faite avant elle (le script arrête l'API, remet la base et le
volume, redémarre) :

```powershell
cd C:\iris\deploy
.\scripts\restore.ps1 -Stamp <horodatage> -Source D:\sauvegardes\iris
```

## 9. Erreurs fréquentes

| Symptôme | Cause | Remède |
| --- | --- | --- |
| `Docker ne répond pas` | Docker Desktop n'est pas lancé | Ouvrir Docker Desktop, attendre « Engine running », relancer |
| PowerShell refuse le script — « n'est pas signé numériquement » | le paquet vient d'un zip **téléchargé** : Windows marque ses fichiers « vient d'Internet » et la politique `RemoteSigned` exige alors une signature d'un éditeur **approuvé** | les scripts sont signés (§ 17) : lancer `.\upgrade.cmd …` une fois (il approuve l'éditeur IRIS, puis contourne de toute façon la politique) ou `.\trust.cmd` ; à défaut `Unblock-File .\scripts\*.ps1` puis relancer |
| Les empreintes du § 2 diffèrent | copie abîmée | recopier le zip depuis le poste de développement |
| `Un .env DIFFÉRENT de l'actuel existe déjà` | un `.env` a été créé dans le nouveau dossier (par exemple par un `install.ps1` lancé trop tôt) | le supprimer, relancer `upgrade.ps1` : il reprend celui de l'installation actuelle |
| Après la mise à jour, tout le monde est déconnecté | `AUTH_DEV_SECRET` a changé (nouveau `.env` généré au lieu d'être repris) | remettre le `.env` de l'ancienne installation, `docker compose up -d` |
| `Base PostgreSQL injoignable` dans les journaux de l'API | `POSTGRES_PASSWORD` a changé, même cause | idem ; au tout premier démarrage d'une base neuve, l'API peut aussi tomber une fois et Docker la relance seul |
| `Volume iris_api_data ABSENT` | pile installée sous un autre nom de projet, ou volumes supprimés | `docker volume ls` ; si les volumes ont un autre préfixe, ne pas continuer sans avis ; sinon `restore.ps1` |
| Le port 80 (ou celui du `.env`) est pris | un autre service écoute | `HTTP_PORT` et `PUBLIC_URL` dans `.env` (README § 11), puis `docker compose up -d` |
| L'API ne répond pas au bout de 3 minutes | démarrage lent, ou erreur | `.\scripts\status.ps1` puis `docker compose logs api --tail 50` |

## 10. Ce qui change pour les utilisateurs avec les paquets de septembre 2026

- **Rôles & fonctionnalités** porte désormais **tout le menu** et les
  **capacités de la carte** (mode édition, simulations crues, feux de forêt,
  NRBC) : chaque ligne s'ouvre ou se coupe par rôle, et par compte depuis la
  fiche de l'utilisateur. Le cœur (utilisateurs, supervision, paramètres)
  figure mais reste verrouillé.
- **Commandant d'unité** (ex-« Responsable Unité ») : « Gestion de mon
  unité » lui est ouverte d'office.
- **Mode édition de la carte par rôle** : le stratégique pose les OPCOM ;
  l'OPCOM les TACOM, PCO, PCT et cellules ; le TACOM et les cellules posent
  leurs équipes, équipements et véhicules sur le terrain (en mode
  opérationnel : ceux des unités affectées à leur opération).
- **Simulations** crues, feux de forêt et panache NRBC : réservées aux
  administrateurs, au stratégique, à l'OPCOM et au TACOM.
- **Cinq rôles** (représentants de l'OPCOM, chefs du PCO et du PCT), **corps
  des unités** (les unités existantes sont réputées FAR : corriger celles de
  la Gendarmerie, DGSN, DGPC ou des Forces Auxiliaires), **modes**
  démonstration / exercice / opérationnel (Paramètres), écran **Ressources**.
- **Notifications** : rappel sonore net toutes les 20 s jusqu'à lecture ou
  acquittement ; la cloche ouvre la conversation concernée ; les conversations
  qui ont reçu du nouveau se signalent dans le centre de communication.
- **Centre de communication** (ADR 0021) : le canal d'un incident porte son
  titre ; les conversations sont conservées au redémarrage ; un canal
  s'archive (lecture seule), s'exporte et s'importe en archive.

## 12. La version RIF : la carte complète sans Internet (paquets `fusion-RIF`, suffixe `-souv`)

- **Ce qui change** : la station sert elle-même tout ce que la carte affiche —
  imagerie, relief 3D, plan et toponymes vectoriels du Maroc (latin + arabe),
  polices — depuis le volume `iris_argos_tiles`. Le navigateur ne contacte que
  la station ; la carte est celle du mode en ligne (ADR 0023). Les référentiels
  (régions, provinces, ~1 500 communes) sont dans l'application.
- **Installer** : le paquet `-souv` embarque l'archive des tuiles dans
  `deploy\tiles-data\` (plusieurs Go : support physique) ; `install.ps1` la
  vérifie (SHA-256) et l'importe dans le volume avant de démarrer. Sans archive
  dans le paquet : `.\scripts\tiles-import.ps1 -Archive D:\iris-tiles-….tar`.
- **Mettre à jour** une station RIF : `upgrade.ps1` comme d'habitude — le volume
  des tuiles n'est pas touché ; une nouvelle archive de tuiles (imagerie plus
  fine, nouvelles zones) s'importe seule avec `tiles-import.ps1`, sans
  redémarrer l'application.
- **`.env`** : `MAP_TILES=sovereign`, `COMPOSE_PROFILES=sovereign`,
  `VALHALLA_TILE_URLS=` (vide), `AVIATION_FEED=exercise`. Les modules météo,
  sismique et crues affichent « flux indisponible » sans Internet ; le
  simulateur d'inondation calcule sur le relief de la station.
- **Là où l'imagerie fine manque** (hors des zones provisionnées), la carte
  agrandit la tuile parente : floue de près, jamais vide. Ajouter des zones :
  `infra/geo/zones.json`, puis `tiles-fetch fetch sat --zones <nom>` sur une
  machine qui a Internet, et une nouvelle archive.
## 13. Croquis sur la carte et fiches des établissements (paquets du 20 septembre 2026)

- **Mode dessin** : sur la carte, le bouton « Dessin » (pour tout le monde,
  dans les deux modes de l'application) ouvre quatre outils — sélection,
  point, cercle, polygone. Un clic pose
  un point ; un cercle se tire du centre vers le bord ; un polygone se ferme
  d'un double-clic ou sur son premier sommet ; Échap annule. Chaque croquis a un
  nom, une couleur et une note ; l'étiquette d'un cercle ou d'un polygone se
  glisse à la souris pour rester lisible dans la forme ; les poignées déplacent
  les sommets, le centre et le rayon. Tous les postes voient les croquis en
  temps réel ; seul l'auteur d'un croquis — ou le Super Administrateur — le
  modifie ou le retire, les autres le lisent.
- **Hospinet** : chaque établissement de la liste se modifie et se retire
  directement depuis sa carte (« Modifier », « Retirer »), comme les unités de
  l'OPSnet — à qui l'API l'accorde.

## 11. La V2 des rôles : deux modes de l'application (paquets `fusion-V2`)

- **Rien ne change au démarrage** : la station repart en **Mode classique**
  — les comptes, rôles et réglages actuels sont intacts ; le mode se lit sur
  l'écran de connexion (« Mode en service ») et dans l'en-tête.
- **Mode Direx** : le Super Administrateur le bascule dans *Paramètres ›
  Profil de données › Mode de l'application* (mot de passe exigé, sans
  redémarrage). Sous ce mode, les comptes classiques (stratégique, OPCOM,
  TACOM, cellules, autorités, responsable de parc) ne se connectent plus —
  message « Le Mode Direx est activé sur cette station — contactez
  l'administrateur » — et leurs sessions ouvertes tombent ; les comptes
  Direx (DIREX, PC FAR, PCF, PCT, PCO) entrent. L'administration et les chefs
  d'entité (unité, hôpital, abri, morgue) entrent dans les deux modes.
- **Comptes de démonstration Direx** livrés avec le paquet (codes provisoires,
  mot de passe à poser au premier login) : `a.direx` / `DIREX-2026` (Chef),
  `e.direx` / `EVAL-2026`, `n.direx` / `ANIM-2026`, `r.direx` / `RLS-2026`,
  `c.pcfar` / `PCFAR-2026`, `o.pcfar` / `OPSF-2026`, `c.pcf` / `PCF-2026`,
  `o.pcf` / `OPSP-2026`, `c.pct` / `PCT-2026`, `o.pct` / `OPST-2026`,
  `c.pco` / `PCO-2026`, `o.pco` / `OPSO-2026`.
- **Sous un mode, l'autre profil n'existe pas** : la gestion des utilisateurs
  ne montre que les comptes du mode (onglet *Utilisateurs classique* ou
  *Utilisateurs Direx* ; les comptes communs y sont), le centre de
  communication ne connaît que ces comptes (annuaire, correspondants, comptes
  déployables). *Rôles & fonctionnalités* : les rôles du mode, les modules du
  menu et les **43 fonctionnalités de l'API** commutables par rôle — dont
  « Sous-incidents (ajouter, modifier, supprimer) ». Pour préparer les comptes
  Direx, basculer en Mode Direx, les créer, puis revenir.
- **Les unités créées sous un mode ne se montrent que sous lui** (carte,
  répartition, affectation, mode édition, registre des ressources) ; les
  unités déjà en place avant la mise à jour restent visibles des deux côtés ;
  hôpitaux, abris et morgues sont communs. Rien n'est migré ni supprimé :
  comptes, unités et réglages existants sont intacts.
- **Créer un chef d'entité sans son entité** est désormais possible
  (commandant d'unité, directeur d'hôpital, chef d'abri, directeur de
  morgue) : l'entité s'affecte plus tard depuis la fiche du compte ; sans
  elle, le compte ne voit rien.
- **Tout incident déclaré se voit de tous** les rôles (liste, fiche, tableau
  de bord d'incident), plus seulement sur la carte ; `INCIDENTS_VISIBILITY=scoped`
  dans `.env` rétablit l'ancien cantonnement par portée.
- **La répartition engage vraiment** : un ordre émis depuis *Répartition*
  rend l'unité intervenante et affectée à l'opération ; son commandant voit
  l'opération et reçoit l'ordre dans *Ordres reçus* ; relever l'unité annule
  l'ordre. Les engagements viennent de l'API et survivent au rechargement.
- **Hôpital de campagne** : depuis la fiche d'un établissement (*Hôpitaux de
  campagne › Déployer*), le point se choisit sur la carte ; le détachement se
  dessine chez tous.
- **Incident rattaché** : sur toute ligne d'incident, l'action « Rattacher un
  incident » ouvre la déclaration complète (mêmes étapes) d'un incident présenté
  sous son parent ; elle suit la fonctionnalité « Sous-incidents » du rôle.
  Déclarer, modifier et rattacher suivent désormais la permission servie par
  l'API — qui peut déclarer en déclare autant qu'il veut.
- **Le mode édition de la carte suit le mode** : en Mode Direx, la boîte à
  outils ne propose que PC FAR, PCF, PCT, PCO (tenus par leurs chefs), abris
  et parcs ; en Mode classique, OPCOM, TACOM, PCO, PCT et cellules. Un poste
  de l'autre mode ne se pose pas et ne se liste pas.
- **LOG et OPS des PC (PCO, PCT, PC FAR, PCF) et Anim / DIREX** répartissent
  les unités (*Répartition*, ordres), créent, modifient et **suppriment** des
  unités (en tout mode de la station, opérationnel compris), des abris
  (*OPSnet*) et des sites mortuaires (*Service morgue*) ; les boutons
  apparaissent chez qui l'API l'accorde. Les rôles classiques gardent la
  règle d'avant (en opérationnel, les unités sont au Super Administrateur).
- **La position se choisit partout comme pour un incident** : créer **et
  modifier** une unité, un abri, un établissement de santé (bouton « Modifier »
  sur sa fiche Hospinet) ou un site mortuaire (« Modifier le site » dans le
  Service morgue) ouvre la cascade région → province → commune et une carte où
  un clic pose la position exacte, qui remplit région, province et commune. La
  carte de choix porte désormais les **noms des villes et communes**, comme la
  carte opérationnelle.
- **Toutes les communes du Royaume** (près de 1 500, urbaines et rurales,
  rattachées à leur province) sont proposées dans les listes déroulantes et
  reconnues quand on pose un point — plus seulement les 80 villes principales.
- Les bascules d'un rôle (fonctionnalités **et modules du menu**) sont
  persistées comme écarts aux défauts ; celles enregistrées par les paquets
  antérieurs au 19 septembre au soir sont reprises à leurs défauts à la mise à
  jour (un « non » hérité masquait la liste des incidents au responsable
  d'équipement). À refaire depuis *Utilisateurs › Rôles & fonctionnalités* si
  une coupure avait été décidée.
- Le mode et les bascules sont persistés dans le volume de l'API
  (`settings.json`, instantané IAM) : la sauvegarde d'`upgrade.ps1` les
  emporte, la remise en arrière (§ 8) les rend.
- **Carte** : l'arabe des étiquettes est de nouveau mis en forme (greffon RTL
  corrigé) ; chaque jour des prévisions météo se consulte.

## 14. Ce que la mise à jour ne touche plus, et la carte de tous (paquets du 20 septembre 2026, soir)

- **Aucun compte n'est réinjecté à la mise à jour** : le registre de la station
  fait autorité, et lui seul. Les comptes du jeu d'amorçage absents du registre
  (comptes de démonstration, comptes ajoutés au seed depuis l'installation) ne
  sont plus ajoutés au démarrage — seuls restent les comptes que la station
  connaît. Ceux que des paquets antérieurs avaient ajoutés restent en place :
  les retirer, si on le souhaite, se fait dans *Gestion des utilisateurs*. Seule
  exception : un registre sans aucun Super Administrateur actif retrouve le
  compte fondateur, pour rester administrable.
- **Le parc d'équipement est repris tel quel** : les articles saisis sur la
  plateforme (détenteur, équipe, numéro, position) ne sont ni écrasés ni
  retouchés par une mise à jour, quelle que soit la version du jeu de données.
- **Tout le monde voit ce qui se passe sur la carte** : les unités et ce qui est
  posé sur le terrain se voient de tous les rôles (dans le mode en service) ;
  les PC (chefs, OPS, LOG des PC FAR, PCF, PCT, PCO) et l'Anim / DIREX voient
  les unités au répartiteur et sur la carte, les engagent et les affectent à
  l'opération, tous corps confondus. Une unité créée en classique ne se montre
  qu'en classique, une unité Direx qu'en Direx — pour tous, Super
  Administrateur compris. Pour revenir au cantonnement par portée :
  `UNITS_VISIBILITY=scoped` dans `deploy\.env`, puis redémarrer l'API.
- **Un article du parc s'affecte à une équipe** de son détenteur, depuis le
  formulaire de l'article (écran Ressources ou fiche de l'unité dans OPSnet).
- **Le commandant d'une unité est le compte qui la tient** : dès qu'un
  « Commandant d'unité » est rattaché à l'unité (Gestion des utilisateurs), son
  nom — grade compris — s'affiche comme Commandant de l'unité partout : tuiles
  et fiche OPSnet, répartiteur, et sur la carte sous le nom de l'unité. Sans
  compte rattaché, le nom saisi à la création reste. Une équipe posée sur le
  terrain écrit son chef d'équipe sur son marqueur.

## 15. Accès depuis Internet sans toucher au routeur (paquets du 21 septembre 2026)

- `.\scripts\expose.ps1` ouvre un tunnel sortant vers Cloudflare et affiche
  l'adresse `https://<quatre-mots>.trycloudflare.com` de la station — sans
  compte, sans port à ouvrir. Le tunnel est un conteneur de la pile : il
  redémarre avec Docker Desktop. `-Status` donne l'adresse, `-Off` ferme.
- Pour une adresse fixe : un tunnel nommé Cloudflare (compte gratuit + nom de
  domaine), puis `.\scripts\expose.ps1 -Token <jeton>` (README § 10).
- À savoir : le relais voit le trafic en clair, tout Internet atteint l'écran
  de connexion — mots de passe forts, comptes de démonstration désactivés,
  fermer quand l'accès ne sert plus.

## 16. Passer d'une station en ligne à la version hors ligne (ou l'inverse) : le même geste

`upgrade.ps1` aligne désormais le fond de carte du `.env` repris sur celui du
paquet installé : avec un paquet `-souv`, il pose `MAP_TILES=sovereign`, ajoute
le profil `sovereign` et vide `VALHALLA_TILE_URLS`, puis `install.ps1` vérifie
et importe les tuiles embarquées (`deploy\tiles-data`, ~11 Go, quelques
minutes) ; avec un paquet en ligne, il repasse en `external`. Secrets, port,
HTTPS, comptes, données et autres profils (accès public) sont conservés — la
commande reste :

```powershell
cd C:\iris-nouveau\deploy
.\scripts\upgrade.ps1 -Current C:\iris\deploy -Backups D:\sauvegardes\iris
```

## 17. Scripts signés : l'éditeur IRIS s'approuve une fois (paquets du 23 septembre 2026)

Les scripts PowerShell du paquet sont désormais **signés** (ADR 0031). La
première mise à jour avec un tel paquet se lance comme d'habitude, par le
lanceur :

```powershell
cd C:\iris-nouveau\deploy
.\upgrade.cmd -Current C:\iris\deploy -Backups D:\sauvegardes\iris
```

Avant la mise à jour, il affiche « Signature des scripts (éditeur IRIS) » :

- il ajoute le certificat « IRIS Station - Signature des scripts » (empreinte
  `C0CCDB5394262B52334FD7D2E89D0F9FAF9A0080`) aux racines de confiance et aux
  éditeurs approuvés. Dans une console **administrateur**, c'est fait pour
  toute la machine sans question ; sinon Windows ouvre un **avertissement de
  sécurité** « Voulez-vous installer ce certificat ? » — vérifier l'empreinte,
  répondre **Oui** ;
- il vérifie chaque script : « 8 script(s) : signature valide, éditeur IRIS ».

Ensuite, les `.ps1` de ce paquet et des suivants s'exécutent **aussi lancés
directement** (`.\scripts\upgrade.ps1 …`), même extraits d'un zip
téléchargé. Contrôle : `Get-AuthenticodeSignature .\scripts\upgrade.ps1`
répond `Valid`. Si l'approbation a été refusée ou a échoué, rien n'est bloqué :
les lanceurs `.cmd` exécutent les scripts comme avant ; `.\trust.cmd` la
refait à la demande.

À noter aussi : `expose.ps1` (accès public, § 15) ne s'analysait pas sous
Windows PowerShell 5.1 (encodage) — corrigé dans ce paquet.

## 18. La mise à jour ne touche à rien, et le vérifie (paquets du 23 septembre 2026, soir)

Depuis l'ADR 0033, une mise à jour garde **tout** ce que la station contient —
messages échangés, incidents et leurs actions entreprises, zones et croquis,
unités, hôpitaux, abris, morgues et dossiers, comptes, ressources — même quand
le jeu de départ du code a changé. `upgrade.cmd` le **vérifie** désormais :

- étape **5 bis** : une fois l'ancienne pile arrêtée, il recense les données
  du volume (lecture seule) — « avant : incidents 16 · unités 14 · hôpitaux 114
  · messages 120 · comptes 22 … » — et garde ce recensement dans
  `census-avant.json` du nouveau dossier ;
- étape **8** : la nouvelle pile démarrée, il recense à nouveau et compare. Tout
  va bien : « données intactes ». Une collection en baisse s'affiche **en
  rouge** : ne travaillez pas sur la station, revenez en arrière (fin du
  compte rendu du script) et signalez-le.

Aucun geste nouveau : la commande reste `.\upgrade.cmd -Current C:\iris\deploy
-Backups D:\sauvegardes\iris`.

## 19. Télécharger le paquet directement sur la station (fabriqué dans le cloud)

Quand la connexion du poste de développement est faible, le paquet est fabriqué
sur un serveur GitHub (ADR 0035) et la station le télécharge elle-même :

1. ouvrir la page de la Release indiquée (dépôt `zraib/ARGOS-R`, onglet
   *Releases*) : ses notes donnent toutes les commandes PowerShell ci-dessous,
   noms de fichiers et empreinte compris. Le dépôt est public : aucun compte
   n'est requis (s'il redevient privé, télécharger depuis cette page, connecté
   au compte GitHub) ;
2. télécharger le `.zip` directement sur la station :
   `curl.exe -L -o <fichier>.zip <lien direct>` — un téléchargement interrompu
   reprend avec la même commande suivie de `-C -`. S'il est en plusieurs
   morceaux, télécharger tous les `.part..` puis les recoller (`copy /b`, dans
   les notes) ;
3. contrôler l'empreinte : `(Get-FileHash .\<fichier>.zip -Algorithm SHA256).Hash`
   doit valoir celle affichée ;
4. décompresser dans un dossier à part, puis `.\upgrade.cmd -Current
   C:\iris\deploy -Backups D:\sauvegardes\iris` comme d'habitude.

Ce paquet n'embarque pas les tuiles hors ligne : la station garde celles
qu'elle a déjà. Les scripts sont signés comme les autres (ADR 0031).

