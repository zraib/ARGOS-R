#!/usr/bin/env bash
# ============================================================================
# ARGOS / IRIS — fabrication du paquet d'installation d'une station Windows
#
# À lancer sur le poste de développement (macOS ou Linux, Docker Desktop avec
# buildx). La station cible est un PC x86-64 : les images sont construites et
# tirées pour linux/amd64, quelle que soit la machine qui fabrique le paquet
# (sur un Mac Apple Silicon, la compilation passe par l'émulation : quelques
# minutes avec Rosetta, nettement plus avec QEMU).
#
# Produit dans deploy/dist/ :
#   iris-station-<version>/                          l'arbre du dépôt (git archive)
#     deploy/images/iris-images-<version>.tar.gz     toutes les images linux/amd64
#     deploy/tools/tunnelto-windows.exe (+ .sha256)  le client tunnel, épinglé et vérifié
#     deploy/certs/iris-signature.cer                le certificat public des scripts signés
#     deploy/VERSION · MANIFEST.txt · LISEZMOI.txt
#   iris-station-<version>.zip (+ .sha256)           la même chose, en un seul fichier
#
# Les scripts PowerShell du paquet sont SIGNÉS (Authenticode, ADR 0031) par la
# clé de $IRIS_SIGNING_DIR (défaut ~/.iris-signing, créée une fois par
# deploy/scripts/sign.sh init) ; le paquet ne se fait pas sans elle, sauf
# --no-sign.
#
# Sur la station : décompresser, puis deploy\install.cmd (approuve l'éditeur des
# scripts, charge les images, écrit .env, démarre la pile). Aucun accès
# Internet, aucun Node, aucune compilation n'y sont nécessaires.
#
# Usage : deploy/scripts/package.sh [options]
#   --no-base            n'embarque que les images de l'application (proxy, base,
#                        tuiles et routage seront téléchargés par la station)
#   --with-tiles-build   ajoute planetiler (profil tiles-build : fabrication du
#                        fond de carte vectoriel sur la station)
#   --map <mode>         fond de carte figé dans l'image web (ADR 0014) :
#                        external (défaut : Esri/Maxar, OpenStreetMap, relief
#                        AWS — Internet requis sur les postes) ou sovereign
#                        (tuiles hors ligne de la station ; version suffixée -souv)
#   --with-tiles <tar>   embarque l'archive des tuiles hors ligne (fabriquée par
#                        scripts/tiles-export.sh) dans deploy/tiles-data/ :
#                        install.ps1 l'importe dans le volume — la station n'a
#                        alors plus rien à télécharger (version RIF, sans Internet)
#   --skip-build         réutilise les images iris-*:<version> déjà construites
#   --no-zip             laisse le dossier tel quel, sans l'archiver
#   --no-sign            ne signe pas les scripts PowerShell (essai local seulement)
#   --presigned <lot|auto>  scripts signés AILLEURS (ADR 0035) : le lot
#                        deploy/signed/scripts-<empreinte>.tar.gz fabriqué par
#                        `sign.sh presign` sur le poste qui détient la clé ;
#                        `auto` le choisit d'après l'empreinte des scripts du
#                        commit. Sert au paquet fabriqué dans le cloud.
#   --out <dossier>      destination (défaut : deploy/dist)
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"
COMPOSE="$DEPLOY/docker-compose.yml"

# Client tunnel (deploy/scripts/tunnel.ps1) : version et empreinte épinglées —
# la station ne télécharge rien, et ce qu'elle exécute est ce qui a été vérifié.
TUNNELTO_VERSION="0.1.18"
TUNNELTO_URL="https://github.com/agrinman/tunnelto/releases/download/${TUNNELTO_VERSION}/tunnelto-windows.exe"
TUNNELTO_SHA256="cb70ca2937afdb647a8716f0b0d122f71f91dd7ce777250d0d2573f0ec47c5fc"

WITH_BASE=1
WITH_TILES_BUILD=0
SKIP_BUILD=0
DO_ZIP=1
DO_SIGN=1
PRESIGNED=""
MAP_MODE="external"
TILES_TAR=""
DIST="$DEPLOY/dist"
while [ $# -gt 0 ]; do
  case "$1" in
    --no-base) WITH_BASE=0 ;;
    --with-tiles-build) WITH_TILES_BUILD=1 ;;
    --map) shift; MAP_MODE="$1"; [ "$MAP_MODE" = external ] || [ "$MAP_MODE" = sovereign ] || { echo "--map attend external ou sovereign" >&2; exit 1; } ;;
    --skip-build) SKIP_BUILD=1 ;;
    --with-tiles) shift; TILES_TAR="$1"; [ -f "$TILES_TAR" ] || { echo "--with-tiles : archive introuvable : $TILES_TAR" >&2; exit 1; } ;;
    --no-zip) DO_ZIP=0 ;;
    --no-sign) DO_SIGN=0 ;;
    --presigned) shift; PRESIGNED="$1" ;;
    --out) shift; DIST="$(mkdir -p "$1" && cd "$1" && pwd)" ;;
    -h|--help) sed -n '2,46p' "$0"; exit 0 ;;
    *) echo "option inconnue : $1 (voir --help)" >&2; exit 1 ;;
  esac
  shift
done

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mERREUR : %s\033[0m\n' "$*" >&2; exit 1; }

# --- 0. préalables ------------------------------------------------------------
for tool in docker git tar gzip curl shasum; do
  command -v "$tool" >/dev/null 2>&1 || die "outil manquant : $tool"
done
[ "$DO_ZIP" = 1 ] && { command -v zip >/dev/null 2>&1 || die "outil manquant : zip (ou passer --no-zip)"; }
docker info >/dev/null 2>&1 || die "Docker ne répond pas (Docker Desktop démarré ?)"
# (sortie capturée avant le grep : avec pipefail, `grep -q` qui ferme le tube
# ferait passer docker pour un échec)
BUILDX_INFO="$(docker buildx inspect --bootstrap 2>/dev/null || true)"
grep -q "linux/amd64" <<<"$BUILDX_INFO" || die "le constructeur buildx ne sait pas produire linux/amd64"
git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "pas un dépôt git : $ROOT"
# La clé de signature est vérifiée AVANT les longues constructions d'images.
if [ -n "$PRESIGNED" ]; then
  # Scripts signés ailleurs (ADR 0035) : pas de clé ici, le lot doit exister.
  [ "$DO_SIGN" = 1 ] || die "--presigned et --no-sign s'excluent"
  if [ "$PRESIGNED" = auto ]; then
    PRESIGNED="$DEPLOY/signed/scripts-$("$HERE/sign.sh" fingerprint HEAD).tar.gz"
  fi
  [ -f "$PRESIGNED" ] || die "lot pré-signé introuvable : $PRESIGNED — sur le poste qui détient la clé : deploy/scripts/sign.sh presign <commit>, puis committer deploy/signed/"
  echo "    scripts pré-signés : ${PRESIGNED#"$ROOT"/}"
elif [ "$DO_SIGN" = 1 ]; then
  echo "    certificat de signature des scripts :"
  "$HERE/sign.sh" check || die "signature des scripts impossible — créer la clé une fois (deploy/scripts/sign.sh init) ou passer --no-sign"
else
  warn "--no-sign : scripts PowerShell NON signés — Windows les refusera s'ils sont lancés sans les lanceurs .cmd"
fi

COMMIT="$(git -C "$ROOT" rev-parse --short HEAD)"
VERSION="$(date +%Y%m%d)-${COMMIT}"
# Le mode du fond de carte est cuit dans l'image web : une version par mode.
[ "$MAP_MODE" = sovereign ] && VERSION="${VERSION}-souv"
if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]; then
  VERSION="${VERSION}-dirty"
  warn "modifications non commises : le paquet embarque l'arbre du DERNIER COMMIT (${COMMIT}), pas votre copie de travail — version ${VERSION}"
fi
NAME="iris-station-${VERSION}"
OUT="$DIST/$NAME"

# Interpolation du compose : ces variables y sont déclarées obligatoires
# (`:?`) pour la pile en marche ; ici on ne fait que construire et tirer.
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-inutile-a-la-construction}"
export AUTH_DEV_SECRET="${AUTH_DEV_SECRET:-inutile-a-la-construction}"
export IRIS_TAG="$VERSION"
export MAP_TILES="$MAP_MODE"
export DOCKER_DEFAULT_PLATFORM="linux/amd64"
# Tous les profils : le paquet embarque aussi le serveur de tuiles (profil
# `sovereign`), pour qu'une station puisse passer au fond hors ligne sans Internet.
compose() { docker compose --project-directory "$DEPLOY" -f "$COMPOSE" --profile tiles-build --profile sovereign --profile public --profile public-quick "$@"; }

say "Paquet ${NAME} → ${OUT}"
echo "    plateforme cible : linux/amd64 · fond de carte : ${MAP_MODE} · images de base : $([ "$WITH_BASE" = 1 ] && echo oui || echo non) · planetiler : $([ "$WITH_TILES_BUILD" = 1 ] && echo oui || echo non)"

# --- 1. images de l'application (linux/amd64) ---------------------------------
APP_IMAGES=("iris-web:${VERSION}" "iris-api:${VERSION}" "iris-tiles-tools:${VERSION}")
if [ "$SKIP_BUILD" = 1 ]; then
  say "Images de l'application : réutilisées (--skip-build)"
  for img in "${APP_IMAGES[@]}"; do docker image inspect "$img" >/dev/null 2>&1 || die "image absente : $img (retirer --skip-build)"; done
else
  say "Construction des images de l'application pour linux/amd64 (web, api, outils tuiles)"
  compose build web api tiles-fetch
fi

# --- 2. images de base (les mêmes que le compose, tirées pour linux/amd64) ----
BASE_IMAGES=()
if [ "$WITH_BASE" = 1 ]; then
  say "Images de base : traefik, base de données, tuiles, routage$([ "$WITH_TILES_BUILD" = 1 ] && echo ', planetiler')"
  while IFS= read -r img; do
    case "$img" in
      iris-*) ;;                                   # les nôtres, déjà là
      *planetiler*) [ "$WITH_TILES_BUILD" = 1 ] && BASE_IMAGES+=("$img") ;;
      *) BASE_IMAGES+=("$img") ;;
    esac
  done < <(compose config --images | sort -u)
  # Utilisée par scripts/backup.ps1 et restore.ps1 (compression, archives).
  BASE_IMAGES+=("alpine:3.20")
  for img in "${BASE_IMAGES[@]}"; do
    echo "    tirage $img"
    docker pull --quiet --platform linux/amd64 "$img" >/dev/null
  done
  # Le client du tunnel (ADR 0028) est épinglé par son empreinte : l'image tirée
  # doit être exactement celle-là, sinon le paquet ne se fait pas.
  CLOUDFLARED_DIGEST="sha256:b269e8abd07a5bf6f3f4be65d5050b2174eca89c56a0241a8ff32a16aec454e4"
  for img in "${BASE_IMAGES[@]}"; do
    case "$img" in
      cloudflare/cloudflared:*)
        digests=$(docker image inspect --format '{{join .RepoDigests " "}}' "$img")
        case " $digests " in
          *"@${CLOUDFLARED_DIGEST} "*) echo "    empreinte vérifiée : $img" ;;
          *) die "empreinte inattendue pour $img ($digests) — attendu $CLOUDFLARED_DIGEST" ;;
        esac ;;
    esac
  done
fi

# --- 3. l'arbre du dépôt ------------------------------------------------------
say "Arbre du dépôt (git archive ${COMMIT})"
rm -rf "$OUT"
mkdir -p "$OUT/deploy/images" "$OUT/deploy/tools"
git -C "$ROOT" archive --format=tar HEAD | tar -x -C "$OUT"
printf '%s\n' "$VERSION" > "$OUT/deploy/VERSION"

# --- 3 bis. signature des scripts PowerShell (ADR 0031) -----------------------
# Après l'extraction (fins de ligne CRLF déjà appliquées par .gitattributes) et
# avant l'archive : plus rien ne touche aux scripts une fois signés.
if [ -n "$PRESIGNED" ]; then
  say "Scripts PowerShell pré-signés (Authenticode, ADR 0035)"
  # Chaque script signé doit être, signature mise à part, EXACTEMENT celui du
  # commit empaqueté : on garde les originaux, on dépose le lot, on compare.
  ORIGINAUX="$(mktemp -d)"
  cp -R "$OUT/deploy/scripts/." "$ORIGINAUX/"
  tar -xzf "$PRESIGNED" -C "$OUT"
  python3 - "$ORIGINAUX" "$OUT/deploy/scripts" <<'PY' || die "le lot pré-signé ne correspond pas aux scripts de ce commit — le refaire : sign.sh presign"
import pathlib, sys
orig, signed = (pathlib.Path(a) for a in sys.argv[1:3])
bad = []
for o in sorted(p for p in orig.iterdir() if p.suffix in (".ps1", ".psm1", ".psd1")):
    s = signed / o.name
    body = s.read_bytes().split(b"# SIG # Begin signature block")[0] if s.exists() else None
    if body is None:
        bad.append(f"{o.name} : absent du lot")
    elif body.rstrip(b"\r\n") != o.read_bytes().rstrip(b"\r\n"):
        bad.append(f"{o.name} : différent du commit")
    elif b"# SIG # Begin signature block" not in s.read_bytes():
        bad.append(f"{o.name} : non signé")
for line in bad:
    print("    ! " + line)
sys.exit(1 if bad else 0)
PY
  rm -rf "$ORIGINAUX"
  "$HERE/sign.sh" verify-with "$OUT" "$OUT/deploy/certs/iris-signature.crt"
elif [ "$DO_SIGN" = 1 ]; then
  say "Signature des scripts PowerShell (Authenticode)"
  "$HERE/sign.sh" sign "$OUT"
fi

# --- 4. export des images -----------------------------------------------------
IMAGES_TGZ="$OUT/deploy/images/iris-images-${VERSION}.tar.gz"
say "Export des images → $(basename "$IMAGES_TGZ") (plusieurs Go, quelques minutes)"
# (`${TAB[@]+"${TAB[@]}"}` : un tableau vide sous `set -u` et bash 3.2 — --no-base)
docker save --platform linux/amd64 "${APP_IMAGES[@]}" ${BASE_IMAGES[@]+"${BASE_IMAGES[@]}"} | gzip -1 > "$IMAGES_TGZ"
ls -lh "$IMAGES_TGZ" | awk '{print "    " $5 "  " $9}'

# --- 5. client tunnel (facultatif : la station peut aussi le télécharger) -----
say "Client tunnel tunnelto ${TUNNELTO_VERSION} (Windows)"
EXE="$OUT/deploy/tools/tunnelto-windows.exe"
if curl -fsSL --retry 3 --max-time 180 -o "$EXE" "$TUNNELTO_URL"; then
  GOT="$(shasum -a 256 "$EXE" | awk '{print $1}')"
  if [ "$GOT" = "$TUNNELTO_SHA256" ]; then
    printf '%s  tunnelto-windows.exe\n' "$TUNNELTO_SHA256" > "$EXE.sha256"
    echo "    empreinte vérifiée"
  else
    rm -f "$EXE"
    warn "empreinte inattendue pour tunnelto-windows.exe — client non embarqué (tunnel.ps1 le téléchargera et le vérifiera lui-même)"
  fi
else
  rm -f "$EXE"
  warn "téléchargement impossible (github.com filtré ?) — client non embarqué (tunnel.ps1 le téléchargera et le vérifiera lui-même)"
fi

# --- 5 bis. tuiles hors ligne (version RIF) -----------------------------------
if [ -n "$TILES_TAR" ]; then
  [ "$MAP_MODE" = sovereign ] || warn "--with-tiles sans --map sovereign : l'image web appellera quand même les fournisseurs en ligne"
  say "Tuiles hors ligne → deploy/tiles-data/$(basename "$TILES_TAR")"
  mkdir -p "$OUT/deploy/tiles-data"
  cp "$TILES_TAR" "$OUT/deploy/tiles-data/"
  [ -f "$TILES_TAR.sha256" ] && cp "$TILES_TAR.sha256" "$OUT/deploy/tiles-data/"
  [ -f "${TILES_TAR%.tar}.txt" ] && cp "${TILES_TAR%.tar}.txt" "$OUT/deploy/tiles-data/"
  ls -lh "$OUT/deploy/tiles-data/$(basename "$TILES_TAR")" | awk '{print "    " $5 "  " $9}'
fi

# --- 6. manifeste et notice ---------------------------------------------------
say "Manifeste"
{
  echo "ARGOS / IRIS — paquet d'installation de station"
  echo "version   : $VERSION"
  echo "commit    : $(git -C "$ROOT" rev-parse HEAD)"
  echo "branche   : $(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  echo "fabriqué  : $(date -u +%Y-%m-%dT%H:%M:%SZ) sur $(uname -s)/$(uname -m)"
  echo "plateforme: linux/amd64"
  echo "fond de carte : ${MAP_MODE} (figé dans iris-web ; .env : MAP_TILES=${MAP_MODE}$([ "$MAP_MODE" = sovereign ] && echo ', COMPOSE_PROFILES=sovereign'))"
  [ -n "$TILES_TAR" ] && echo "tuiles hors ligne : deploy/tiles-data/$(basename "$TILES_TAR") (importées par install.ps1 ; à la main : scripts\\tiles-import.ps1)"
  echo
  echo "Images (identifiant · empreinte du registre) :"
  for img in "${APP_IMAGES[@]}" ${BASE_IMAGES[@]+"${BASE_IMAGES[@]}"}; do
    printf '  %-52s %s  %s\n' "$img" "$(docker image inspect --format '{{.Id}}' "$img" | cut -c8-19)" "$(docker image inspect --format '{{join .RepoDigests ","}}' "$img")"
  done
  echo
  echo "Fichiers :"
  (cd "$OUT" && find deploy/images deploy/tools deploy/tiles-data -type f ! -name '*.sha256' ! -name '*.txt' -exec shasum -a 256 {} \; 2>/dev/null)
  echo
  if [ "$DO_SIGN" = 1 ]; then
    echo "Scripts PowerShell signés (Authenticode, ADR 0031) :"
    sed 's/^/  /' "$OUT/deploy/certs/iris-signature.txt"
    (cd "$OUT" && find . -type f \( -name '*.ps1' -o -name '*.psm1' -o -name '*.psd1' \) | sort | sed 's|^\./||' | while read -r f; do printf '  %s  %s\n' "$(shasum -a 256 "$f" | cut -c1-64)" "$f"; done)
  else
    echo "Scripts PowerShell : NON signés (--no-sign)"
  fi
} > "$OUT/MANIFEST.txt"
if [ "$DO_SIGN" = 1 ]; then
  SIGN_THUMB="$(grep -m1 'SHA-1' "$OUT/deploy/certs/iris-signature.txt" | sed 's/.*: //')"
  SIGN_NOTE="   Les scripts sont SIGNÉS (éditeur « IRIS Station - Signature des scripts »,
   empreinte ${SIGN_THUMB}). Au premier lancement, install.cmd (ou upgrade.cmd)
   approuve cet éditeur sur la station — Windows demande de confirmer : répondre Oui
   (en administrateur : aucune question). Ensuite les .ps1 s'exécutent aussi lancés
   directement, sans « n'est pas signé numériquement » ; trust.cmd le refait à la demande."
else
  SIGN_NOTE="   Paquet NON signé (--no-sign) : passer par les lanceurs .cmd, qui contournent la
   politique d'exécution PowerShell."
fi
cat > "$OUT/LISEZMOI.txt" <<EOF
ARGOS / IRIS — station Windows, paquet ${VERSION}

1. Installer Docker Desktop (WSL 2) : deploy\\GUIDE-DEBUTANT-WINDOWS.md, étapes 1 et 2.
2. Copier ce dossier sur la station (par exemple C:\\iris).
3. Dans PowerShell (ou l'invite de commandes) :   cd C:\\iris\\deploy   puis   .\\install.cmd
${SIGN_NOTE}
   Le script charge les images (deploy\\images), écrit .env avec des secrets
   générés, démarre la pile et attend que l'API réponde. Aucun accès Internet requis.
4. Ouvrir http://localhost — compte fondateur m.zraib, code ARGOS-2026 (à changer).
5. Fond de carte : ${MAP_MODE} — $([ "$MAP_MODE" = external ] && echo "Esri/Maxar, OpenStreetMap et relief en ligne, rien à préparer (Internet requis sur les postes)." || { [ -n "$TILES_TAR" ] && echo "tuiles hors ligne EMBARQUÉES (deploy\\tiles-data) : install.ps1 les importe, rien à télécharger." || echo "tuiles hors ligne à préparer une fois : deploy\\GUIDE-DEBUTANT-WINDOWS.md, étape 6."; })
   Comptes, exploitation : deploy\\GUIDE-DEBUTANT-WINDOWS.md (étapes 7 à 11).
   Accès depuis Internet sans toucher au routeur : deploy\\README.md § 10, .\\scripts\\expose.ps1.

STATION DÉJÀ INSTALLÉE (mise à jour, comptes conservés) : ne pas décompresser
par-dessus l'ancienne installation. Décompresser ce paquet dans un dossier à
part, puis, depuis son dossier deploy\\ :
   .\\upgrade.cmd -Current C:\\iris\\deploy -Backups D:\\sauvegardes\\iris
Le script sauvegarde, reprend votre .env, arrête l'ancienne pile sans toucher
aux volumes, installe et contrôle. Pas à pas : deploy\\MISE-A-JOUR-STATION.md.

Contenu vérifiable : MANIFEST.txt (empreintes SHA-256 des images et outils).
EOF

# --- 7. archive ---------------------------------------------------------------
if [ "$DO_ZIP" = 1 ]; then
  say "Archive ${NAME}.zip"
  # `-n .tar:.gz` : les archives déjà compressées (images, tuiles) sont stockées telles quelles.
  (cd "$DIST" && rm -f "$NAME.zip" && zip -q -r -1 -n .tar:.gz:.tgz "$NAME.zip" "$NAME" && shasum -a 256 "$NAME.zip" > "$NAME.zip.sha256")
  ls -lh "$DIST/$NAME.zip" | awk '{print "    " $5 "  " $9}'
fi

say "Terminé"
echo "    dossier : $OUT"
[ "$DO_ZIP" = 1 ] && echo "    archive : $DIST/$NAME.zip  (empreinte : $NAME.zip.sha256)"
echo "    station : décompresser, puis  cd deploy ; .\\install.cmd   (mise à jour : .\\upgrade.cmd -Current C:\\iris\\deploy)"
