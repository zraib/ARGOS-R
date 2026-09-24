# ADR 0035 — Paquet de station fabriqué dans le cloud, scripts signés sur le poste

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-24
- **Complète :** ADR 0031 (scripts signés, clé hors dépôt), ADR 0033 (mise à jour qui ne touche à
  rien), le paquet d'installation (`deploy/README.md` § 9).
- **Portée :** `.github/workflows/station-package.yml`, `deploy/scripts/{package.sh,sign.sh}`,
  `deploy/signed/`.

## Contexte

Le poste de développement a une connexion faible ; la station, une bonne. Téléverser d'ici un
paquet de 1,8 Go (14 Go avec les tuiles) n'est pas praticable. L'utilisateur demande que le
paquet hors ligne, signé, soit **fabriqué dans le cloud** et téléchargé par la station.

## Décision

1. **GitHub Actions fabrique le paquet** quand on pousse une étiquette `station-*` sur un commit :
   serveur x86-64 (comme la station — pas d'émulation), images construites, images de base tirées,
   paquet assemblé par le même `package.sh`, zip et empreinte SHA-256 publiés en pièces jointes
   d'une **Release du dépôt** (au-delà de 2 Gio, le zip part en morceaux à recoller par
   `copy /b`). `station-rif-*` donne la version hors ligne (`--map sovereign`), toute autre
   étiquette la version en ligne.
2. **La clé privée ne quitte pas le poste.** Les scripts PowerShell d'un commit y sont signés
   d'avance (`sign.sh presign <commit>`) ; le lot — scripts signés et certificat public, quelques
   dizaines de Ko — est committé dans `deploy/signed/scripts-<empreinte>.tar.gz`. L'empreinte ne
   dépend que des scripts : un même lot sert tant qu'aucun script ne change. Dans le cloud,
   `package.sh --presigned auto` dépose le lot après avoir vérifié que chaque script signé est,
   signature mise à part, **exactement** celui du commit, puis vérifie chaque signature avec le
   seul certificat public (`sign.sh verify-with`). Un lot absent ou périmé arrête la fabrication :
   jamais de paquet non signé publié.
3. **Pas de tuiles dans le paquet fabriqué dans le cloud.** Une station hors ligne déjà installée
   garde les siennes : `install.ps1` n'importe que ce que le paquet apporte. Le paquet complet
   (tuiles comprises) reste fabriqué sur le poste qui détient l'archive des tuiles.
4. **L'état de chaque fabrication** (réussite ou échec, fichier, taille, empreinte, liens) est
   déposé dans la branche `ci-status` : le poste le lit par `git fetch`, sans accès à l'API.
5. **Le dépôt est privé : la Release aussi.** On la télécharge sur la station connecté au compte
   GitHub (navigateur). Un lien véritablement public exposerait l'application à quiconque le
   trouve : ce choix reste à l'utilisateur, et demanderait un hébergement dédié.

## Conséquences

- Fabriquer un paquet depuis le poste : `sign.sh presign <commit>` si un script a changé (et
  committer le lot), puis `git tag station-rif-<date> <commit> && git push origin <étiquette>`.
- Les minutes de GitHub Actions du compte sont consommées (une fabrication ≈ 20 à 40 min).
- Testé sur le poste : lot pré-signé des 9 scripts de `fusion-RIF` (29 Ko, aucune clé privée
  dedans), dépôt dans un arbre `git archive`, comparaison au commit (un script modifié est
  détecté), vérification avec le seul certificat : 9 signatures valides.
