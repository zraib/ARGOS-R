# Mettre à jour la station Windows sans perdre les comptes — pas à pas

Ce guide s'applique à une station déjà installée depuis un paquet
(`iris-station-<version>.zip`, README § 9) et qui tourne. Il installe le
nouveau paquet en **conservant** les comptes utilisateurs, les entités créées,
les messages, les pièces jointes, le journal d'audit et les réglages (`.env`).

Ce qui est conservé, et pourquoi : les comptes et le domaine vivent dans le
volume Docker `iris_api_data` (instantanés JSON, dont `iam.json` pour les
comptes), le journal d'audit et les drapeaux dans `iris_db_data` (PostgreSQL).
Une mise à jour **remplace les images** (le code) et **ne touche pas aux
volumes** : `docker compose up -d` réutilise les volumes existants tels
quels. Le `.env` n'est pas dans le paquet : il reste le vôtre.

> Durée : 10 à 15 minutes, dont 3 à 5 de chargement des images. Prévoir la
> mise à jour hors conduite d'opération : la station est indisponible pendant
> le redémarrage (une à deux minutes).

---

## 0. Sur le poste de développement : fabriquer le paquet

```bash
deploy/scripts/package.sh            # → deploy/dist/iris-station-<version>.zip (+ .sha256)
```

Copier sur la station **le zip et son `.sha256`** (clé USB ou partage
réseau). La version se lit dans le nom : `AAAAMMJJ-<commit>`.

## 1. Sur la station : vérifier le paquet

Dans PowerShell (pas besoin d'administrateur pour cette étape) :

```powershell
cd D:\transfert                                  # là où le zip a été copié
Get-FileHash .\iris-station-<version>.zip -Algorithm SHA256
Get-Content .\iris-station-<version>.zip.sha256
```

Les deux empreintes doivent être identiques. Sinon, recopier le fichier.

## 2. Sauvegarder d'abord

Depuis l'installation **actuelle** (par exemple `C:\iris\deploy`) :

```powershell
cd C:\iris\deploy
.\scripts\backup.ps1 -Dest D:\sauvegardes\iris
```

Le script produit un `pg_dump` de la base et une archive du volume
`iris_api_data` (comptes, domaine, pièces jointes), horodatés. **Noter
l'horodatage affiché** (`Stamp`) : c'est lui qu'il faudrait à `restore.ps1`.

Vérifier que la sauvegarde est là :

```powershell
Get-ChildItem D:\sauvegardes\iris | Sort-Object LastWriteTime | Select-Object -Last 3
```

## 3. Décompresser le nouveau paquet dans un dossier à part

Ne pas écraser l'ancienne installation : on garde de quoi revenir en arrière.

```powershell
Expand-Archive -Path D:\transfert\iris-station-<version>.zip -DestinationPath C:\iris-<version>
Get-ChildItem C:\iris-<version>\iris-station-<version>\deploy
```

Le dossier `deploy\` du paquet contient `docker-compose.yml`, `images\`
(les images Docker), `scripts\`, `.env.example`, `VERSION` — mais **pas de
`.env`**.

## 4. Reprendre le `.env` de l'installation actuelle

C'est le geste qui préserve vos secrets et vos réglages (mot de passe de la
base, secret de session, port, HTTPS, fond de carte) :

```powershell
Copy-Item C:\iris\deploy\.env C:\iris-<version>\iris-station-<version>\deploy\.env
```

> **Important** : `AUTH_DEV_SECRET` et `POSTGRES_PASSWORD` doivent rester les
> mêmes. Changer le premier déconnecte tout le monde (les jetons de session
> ne sont plus reconnus) ; changer le second empêche l'API de joindre la base
> existante.

Rien à ajouter au `.env` pour ce paquet : les nouveaux réglages ont des
défauts (`APP_MODE=operational` — station en service). Si vous voulez les
voir, comparez avec `.env.example` :

```powershell
Compare-Object (Get-Content C:\iris-<version>\iris-station-<version>\deploy\.env.example) (Get-Content C:\iris-<version>\iris-station-<version>\deploy\.env) | Where-Object { $_.InputObject -notmatch "^#|^$" }
```

## 5. Arrêter l'ancienne pile (sans toucher aux volumes)

```powershell
cd C:\iris\deploy
docker compose --project-directory . down
```

`down` **sans `-v`** : les conteneurs s'arrêtent, les volumes restent. Ne
jamais utiliser `down -v` ici — il effacerait les comptes et la base.

Vérifier que les volumes sont toujours là :

```powershell
docker volume ls | Select-String iris_
```

On doit voir au moins `iris_api_data` et `iris_db_data`.

## 6. Installer le nouveau paquet

```powershell
cd C:\iris-<version>\iris-station-<version>\deploy
.\scripts\install.ps1
```

Le script : charge les images du dossier `images\` et les étiquette `latest`,
constate que `.env` existe et **le conserve**, démarre la pile
(`docker compose up -d --remove-orphans`) et attend l'API. Le nom du projet
compose est fixé dans `docker-compose.yml` (`name: iris`), quel que soit le
dossier : la pile retrouve ses volumes `iris_api_data` et `iris_db_data`.

Au premier démarrage de cette version, l'API :

- applique les migrations de base manquantes (par exemple la table des bons
  de travail, absente des versions précédentes) ;
- **élague le jeu de démonstration** s'il était présent et garde ce que les
  opérateurs ont créé (mode opérationnel, ADR 0015/0016) ;
- ajoute les nouveaux rôles et modules à la matrice persistée sans toucher
  aux comptes.

## 7. Vérifier

```powershell
.\scripts\status.ps1
Invoke-RestMethod http://localhost/api/health | Select-Object status, appMode, dataProfile
```

`status` doit être `ok` et `appMode` `operational`. Puis, dans le navigateur :

1. se connecter avec un compte **existant** (pas le compte fondateur) : la
   connexion prouve que `iam.json` a été repris ;
2. *Gestion des utilisateurs* : la liste des comptes est intacte ;
3. *Hospinet*, *OPSnet*, *Ressources* : les entités créées avant la mise à jour
   sont là ;
4. *Paramètres › Profil de données* : mode « Opérationnel », volume du domaine.

## 8. Ranger

Une fois la vérification faite, l'ancienne installation peut être archivée :

```powershell
Rename-Item C:\iris C:\iris-ancien-<date>      # à supprimer plus tard, quand tout est validé
```

Et, si vous voulez retrouver le chemin habituel `C:\iris\deploy` :

```powershell
Move-Item C:\iris-<version>\iris-station-<version> C:\iris
```

(le projet compose s'appelle `iris` par `docker-compose.yml`, pas d'après le
dossier : le renommage ne change rien aux volumes.)

## 9. Revenir en arrière (si quelque chose ne va pas)

```powershell
cd C:\iris-<version>\iris-station-<version>\deploy
docker compose --project-directory . down          # sans -v
cd C:\iris-ancien-<date>\deploy                    # ou C:\iris\deploy si non renommé
.\scripts\install.ps1                              # recharge les anciennes images
```

Les volumes n'ayant pas été touchés, les comptes sont intacts. Si la mise à
jour avait été poussée plus loin (données modifiées à tort), restaurer la
sauvegarde du § 2 :

```powershell
.\scripts\restore.ps1 -Stamp <horodatage> -Source D:\sauvegardes\iris
```

## 10. Après la mise à jour : ce qui a changé pour les utilisateurs

- **Cinq rôles** de plus (représentants de l'OPCOM : Gendarmerie Royale,
  État-Major des FAR, Intérieur ; chefs du PCO et du PCT) — à attribuer depuis
  *Gestion des utilisateurs*.
- **Corps des unités** : les unités existantes sont réputées FAR ; corriger
  celles qui sont de la Gendarmerie, de la DGSN, de la DGPC ou des Forces
  Auxiliaires (fiche de l'unité, *Modifier*) pour que l'OPCOM puisse les
  affecter selon la doctrine.
- **Modes** : la station est en mode *Opérationnel*. Pour une formation ou un
  exercice, *Paramètres › Profil de données › Mode de la station* — l'API
  redémarre seule (30 s).
- **Ressources** : l'écran *Ressources* remplace l'ancien *Personnel*.
- Une **alerte** reste signalée (cloche, rappel sonore) jusqu'à son
  acquittement.
