# ADR 0031 — Scripts de station signés (Authenticode) et éditeur IRIS approuvé une fois

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-23
- **Complète :** le paquet d'installation de station (`deploy/README.md` § 9), les lanceurs
  `.cmd` du paquet 6d4b99f (« n'est pas signé numériquement »), ADR 0028 (accès public,
  `expose.ps1`).
- **Portée :** `deploy/scripts/sign.sh`, `deploy/signing/Dockerfile`, `deploy/scripts/package.sh`,
  `deploy/scripts/trust.ps1`, `deploy/{install,upgrade,trust}.cmd`, `deploy/scripts/expose.ps1`
  (encodage), `.gitattributes`.

## Contexte

Un paquet de station arrive par un zip **téléchargé** : Windows marque chaque fichier
« vient d'Internet », et la politique `RemoteSigned` refuse alors tout script PowerShell qui
n'est pas signé par un éditeur approuvé (« n'est pas signé numériquement »). Les lanceurs `.cmd`
contournent la politique pour une commande (`-ExecutionPolicy Bypass`) : ça marche, mais un
script lancé directement reste refusé, et rien ne permet à la station de s'assurer que les
scripts qu'elle exécute sont bien ceux qui ont été fabriqués. L'utilisateur demande un paquet
**signé**.

En préparant la signature, une anomalie est apparue : `expose.ps1` (ADR 0028) était enregistré
en UTF-8 **sans BOM**. Windows PowerShell 5.1 lit un tel fichier dans la page de code ANSI
(1252) : le tiret cadratin « — » (E2 80 94) y devient « â€” » — et l'octet 0x94 est un
guillemet typographique, que PowerShell prend pour la fin de la chaîne. Le script ne s'analysait
pas (« Missing closing '}' », ligne 81, vérifié avec l'analyseur de PowerShell sur le texte lu en
1252) : `expose.cmd` échouait sur la station.

## Décision

1. **Chaque script PowerShell du paquet est signé en Authenticode** (SHA-256), au moment de la
   fabrication, par `osslsigncode` 2.9 (Debian 13, image `iris-signer` construite depuis
   `deploy/signing/Dockerfile` et lancée par `deploy/scripts/sign.sh`), puis **vérifié** fichier
   par fichier ; `package.sh` refuse de fabriquer un paquet sans la clé (`--no-sign` pour un
   essai local seulement). La signature intervient après l'extraction de l'arbre (fins de ligne
   CRLF déjà appliquées) et avant l'archive : plus rien ne touche aux scripts ensuite.
   `MANIFEST.txt` liste les scripts signés et leur empreinte SHA-256.
2. **La clé reste sur le poste de fabrication**, hors du dépôt : `~/.iris-signing`
   (`IRIS_SIGNING_DIR`), clé RSA 3072 bits en droits 600 et certificat auto-signé
   « IRIS Station - Signature des scripts » (usage : signature de code, 10 ans), créés une fois
   par `sign.sh init`. Seul le **certificat public** part dans le paquet
   (`deploy/certs/iris-signature.cer` et son empreinte en clair). Pas d'horodatage par défaut :
   il contacte un tiers (souveraineté) ; la validité de 10 ans en tient lieu
   (`IRIS_SIGNING_TIMESTAMP` pour l'activer). Un certificat délivré par une autorité reconnue se
   substitue sans rien changer (`IRIS_SIGNING_KEY`, `IRIS_SIGNING_CERT`, `IRIS_SIGNING_CHAIN`).
3. **La station approuve l'éditeur une fois** : `install.cmd` et `upgrade.cmd` appellent
   `scripts\trust.ps1`, qui ajoute le certificat aux *Autorités de certification racines de
   confiance* et aux *Éditeurs approuvés* — pour toute la machine en administrateur (sans
   question), sinon pour l'utilisateur courant (Windows demande de confirmer). Ensuite un
   `.ps1` s'exécute directement, même extrait d'un zip téléchargé. `trust.cmd` le refait à la
   demande. Le certificat n'a que l'usage « signature de code » (`CA:FALSE`) : il ne peut rien
   certifier d'autre.
4. **Premier éditeur approuvé = éditeur retenu.** Si un autre certificat IRIS est déjà approuvé,
   `trust.ps1` n'ajoute rien et le signale (paquet signé par une autre clé : vérifier son
   origine) ; `-Replace` assume un changement de clé et retire l'ancien. Il vérifie enfin la
   signature de chaque script (`Get-AuthenticodeSignature`) et nomme ce qui ne va pas :
   non signé, modifié depuis la signature, éditeur pas encore approuvé. **Il ne bloque rien**
   pour cette première livraison : les lanceurs exécutent les scripts dans tous les cas.
5. **Un script non ASCII doit porter le BOM UTF-8** : `sign.sh` refuse de signer sinon (le texte
   lu par Windows PowerShell 5.1 ne serait pas celui qui a été signé). `expose.ps1` le reçoit ;
   les lanceurs `.cmd` passent en CRLF (`.gitattributes`), comme les `.ps1`.

## Validation (sans poste Windows)

- `osslsigncode` signe et revérifie les 8 scripts ; `trust.ps1` et les 7 autres s'analysent sans
  erreur avec l'analyseur de PowerShell 7, sur le texte décodé comme Windows PowerShell 5.1 le
  décode.
- **Même calcul d'empreinte que Windows** : sur 6 fichiers signés par Microsoft (PowerShell
  Gallery — PSReadLine 2.3.6, PowerShellGet 2.2.5, PackageManagement 1.4.8.1 ; ASCII sans BOM
  et UTF-8 avec BOM), l'empreinte qu'osslsigncode recalcule est identique à celle que Microsoft a
  signée. Les caractères accentués de nos scripts passent par la même conversion UTF-8 → UTF-16,
  sans ambiguïté une fois le BOM posé.
- À confirmer sur la station : `Get-AuthenticodeSignature .\scripts\upgrade.ps1` doit répondre
  `Valid` après `trust.cmd` (c'est ce que `trust.ps1` affiche). Une fois confirmé, la
  vérification pourra devenir **bloquante** dans les lanceurs.

## Conséquences

- Les fichiers `.cmd` ne se signent pas (Windows ne connaît pas de signature pour les scripts
  batch) : ils restent de simples lanceurs, courts et lisibles.
- Perdre la clé oblige chaque station à approuver un nouvel éditeur (`trust.cmd -Replace`) : la
  sauvegarder hors du poste (coffre, support chiffré). La compromettre permettrait de signer des
  scripts que les stations exécuteraient : elle ne quitte pas `~/.iris-signing`.
- Empreinte de l'éditeur actuel (SHA-1, celle qu'affiche Windows) :
  `C0CCDB5394262B52334FD7D2E89D0F9FAF9A0080`, valable jusqu'au 20 septembre 2036.
