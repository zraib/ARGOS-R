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
#     deploy/VERSION · MANIFEST.txt · LISEZMOI.txt
#   iris-station-<version>.zip (+ .sha256)           la même chose, en un seul fichier
#
# Sur la station : décompresser, puis deploy\scripts\install.ps1 (charge les
# images, écrit .env, démarre la pile). Aucun accès Internet, aucun Node, aucune
# compilation n'y sont nécessaires.
#
# Usage : deploy/scripts/package.sh [options]
#   --no-base            n'embarque que les images de l'application (proxy, base,
#                        tuiles et routage seront téléchargés par la station)
#   --with-tiles-build   ajoute planetiler (profil tiles-build : fabrication du
#                        fond de carte vectoriel sur la station)
#   --skip-build         réutilise les images iris-*:<version> déjà construites
#   --no-zip             laisse le dossier tel quel, sans l'archiver
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
DIST="$DEPLOY/dist"
while [ $# -gt 0 ]; do
  case "$1" in
    --no-base) WITH_BASE=0 ;;
    --with-tiles-build) WITH_TILES_BUILD=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --no-zip) DO_ZIP=0 ;;
    --out) shift; DIST="$(mkdir -p "$1" && cd "$1" && pwd)" ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
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

COMMIT="$(git -C "$ROOT" rev-parse --short HEAD)"
VERSION="$(date +%Y%m%d)-${COMMIT}"
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
export DOCKER_DEFAULT_PLATFORM="linux/amd64"
compose() { docker compose --project-directory "$DEPLOY" -f "$COMPOSE" --profile tiles-build "$@"; }

say "Paquet ${NAME} → ${OUT}"
echo "    plateforme cible : linux/amd64 · images de base : $([ "$WITH_BASE" = 1 ] && echo oui || echo non) · planetiler : $([ "$WITH_TILES_BUILD" = 1 ] && echo oui || echo non)"

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
fi

# --- 3. l'arbre du dépôt ------------------------------------------------------
say "Arbre du dépôt (git archive ${COMMIT})"
rm -rf "$OUT"
mkdir -p "$OUT/deploy/images" "$OUT/deploy/tools"
git -C "$ROOT" archive --format=tar HEAD | tar -x -C "$OUT"
printf '%s\n' "$VERSION" > "$OUT/deploy/VERSION"

# --- 4. export des images -----------------------------------------------------
IMAGES_TGZ="$OUT/deploy/images/iris-images-${VERSION}.tar.gz"
say "Export des images → $(basename "$IMAGES_TGZ") (plusieurs Go, quelques minutes)"
docker save --platform linux/amd64 "${APP_IMAGES[@]}" "${BASE_IMAGES[@]}" | gzip -1 > "$IMAGES_TGZ"
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

# --- 6. manifeste et notice ---------------------------------------------------
say "Manifeste"
{
  echo "ARGOS / IRIS — paquet d'installation de station"
  echo "version   : $VERSION"
  echo "commit    : $(git -C "$ROOT" rev-parse HEAD)"
  echo "branche   : $(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  echo "fabriqué  : $(date -u +%Y-%m-%dT%H:%M:%SZ) sur $(uname -s)/$(uname -m)"
  echo "plateforme: linux/amd64"
  echo
  echo "Images (identifiant · empreinte du registre) :"
  for img in "${APP_IMAGES[@]}" "${BASE_IMAGES[@]}"; do
    printf '  %-52s %s  %s\n' "$img" "$(docker image inspect --format '{{.Id}}' "$img" | cut -c8-19)" "$(docker image inspect --format '{{join .RepoDigests ","}}' "$img")"
  done
  echo
  echo "Fichiers :"
  (cd "$OUT" && find deploy/images deploy/tools -type f ! -name '*.sha256' -exec shasum -a 256 {} \;)
} > "$OUT/MANIFEST.txt"
cat > "$OUT/LISEZMOI.txt" <<EOF
ARGOS / IRIS — station Windows, paquet ${VERSION}

1. Installer Docker Desktop (WSL 2) : deploy\\GUIDE-DEBUTANT-WINDOWS.md, étapes 1 et 2.
2. Copier ce dossier sur la station (par exemple C:\\iris).
3. Dans PowerShell :   cd C:\\iris\\deploy   puis   .\\scripts\\install.ps1
   Le script charge les images (deploy\\images), écrit .env avec des secrets
   générés, démarre la pile et attend que l'API réponde. Aucun accès Internet requis.
4. Ouvrir http://localhost — compte fondateur m.zraib, code ARGOS-2026 (à changer).
5. Fond de carte, comptes, exploitation : deploy\\GUIDE-DEBUTANT-WINDOWS.md (étapes 6 à 11).
   Démonstration à distance (tunnel) : deploy\\README.md § 10, .\\scripts\\tunnel.ps1.

Contenu vérifiable : MANIFEST.txt (empreintes SHA-256 des images et outils).
EOF

# --- 7. archive ---------------------------------------------------------------
if [ "$DO_ZIP" = 1 ]; then
  say "Archive ${NAME}.zip"
  (cd "$DIST" && rm -f "$NAME.zip" && zip -q -r -1 "$NAME.zip" "$NAME" && shasum -a 256 "$NAME.zip" > "$NAME.zip.sha256")
  ls -lh "$DIST/$NAME.zip" | awk '{print "    " $5 "  " $9}'
fi

say "Terminé"
echo "    dossier : $OUT"
[ "$DO_ZIP" = 1 ] && echo "    archive : $DIST/$NAME.zip  (empreinte : $NAME.zip.sha256)"
echo "    station : décompresser, puis  cd deploy ; .\\scripts\\install.ps1"
