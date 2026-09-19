#!/usr/bin/env bash
# ============================================================================
# ARGOS / IRIS — import des tuiles hors ligne dans le volume de la station
# (Linux / macOS ; la station Windows utilise tiles-import.ps1).
#
# Usage : deploy/scripts/tiles-import.sh <archive.tar>
# Le volume est créé s'il n'existe pas ; le serveur de tuiles (service `tiles`)
# est redémarré s'il tourne. Relançable : les fichiers sont remplacés.
# ============================================================================
set -euo pipefail
DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
VOLUME="${IRIS_TILES_VOLUME:-iris_argos_tiles}"
ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "usage : $0 <archive.tar>" >&2; exit 1; }
if [ -f "$ARCHIVE.sha256" ]; then
  (cd "$(dirname "$ARCHIVE")" && shasum -a 256 -c "$(basename "$ARCHIVE").sha256" >/dev/null) && echo "==> Empreinte vérifiée" || { echo "empreinte SHA-256 incorrecte : archive altérée ou incomplète" >&2; exit 1; }
fi
docker volume create "$VOLUME" >/dev/null
DIR="$(cd "$(dirname "$ARCHIVE")" && pwd)"; FILE="$(basename "$ARCHIVE")"
echo "==> Import de $FILE dans le volume $VOLUME"
docker run --rm -v "$VOLUME:/data" -v "$DIR:/src:ro" alpine:3.20 sh -c "tar -xf /src/$FILE -C /data && ls -la /data/*.mbtiles"
if docker compose --project-directory "$DEPLOY" ps --status running --services 2>/dev/null | grep -qx tiles; then
  docker compose --project-directory "$DEPLOY" restart tiles >/dev/null && echo "==> Serveur de tuiles redémarré"
fi
echo "==> Terminé"
