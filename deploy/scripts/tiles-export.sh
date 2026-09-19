#!/usr/bin/env bash
# ============================================================================
# ARGOS / IRIS — export des tuiles hors ligne (version RIF, sans Internet)
#
# À lancer sur la machine qui a rempli le volume `iris_argos_tiles` (extrait
# OSM → tuiles vectorielles, polices, styles, imagerie et relief — voir
# ../../infra/geo/README.md). Produit une archive tar (sans compression : les
# tuiles JPEG/PNG sont déjà compressées) que la station importe telle quelle
# avec scripts/tiles-import.ps1 — ou que package.sh --with-tiles embarque.
#
# Usage : deploy/scripts/tiles-export.sh [--out <dossier>] [--name <nom>]
#   défaut : deploy/dist/iris-tiles-<AAAAMMJJ>-<commit>.tar (+ .sha256, + .txt)
# ============================================================================
set -euo pipefail
DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"
VOLUME="${IRIS_TILES_VOLUME:-iris_argos_tiles}"
DIST="$DEPLOY/dist"
NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out) shift; DIST="$(mkdir -p "$1" && cd "$1" && pwd)" ;;
    --name) shift; NAME="$1" ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "option inconnue : $1" >&2; exit 1 ;;
  esac
  shift
done
command -v docker >/dev/null || { echo "docker introuvable" >&2; exit 1; }
docker volume inspect "$VOLUME" >/dev/null 2>&1 || { echo "volume $VOLUME introuvable — remplir d'abord les tuiles (infra/geo/README.md)" >&2; exit 1; }
[ -n "$NAME" ] || NAME="iris-tiles-$(date +%Y%m%d)-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
mkdir -p "$DIST"
TAR="$DIST/$NAME.tar"
echo "==> État du volume $VOLUME"
docker run --rm -v "$VOLUME:/data:ro" alpine:3.20 sh -c 'cd /data && ls -la *.mbtiles 2>/dev/null; du -sh fonts styles sprites 2>/dev/null; du -sh . | cut -f1' | sed 's/^/    /'
echo "==> Archive $TAR"
# Les fichiers de travail (tmp, sources planetiler, poids de tuiles) ne partent pas.
docker run --rm -v "$VOLUME:/data:ro" -v "$DIST:/out" alpine:3.20 \
  sh -c "cd /data && tar -cf /out/$NAME.tar --exclude=./tmp --exclude=./sources --exclude='./tile_weights*' ."
(cd "$DIST" && shasum -a 256 "$NAME.tar" > "$NAME.tar.sha256")
{
  echo "ARGOS / IRIS — tuiles hors ligne (volume $VOLUME)"
  echo "archive  : $NAME.tar"
  echo "fabriqué : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "contenu  :"
  docker run --rm -v "$VOLUME:/data:ro" alpine:3.20 sh -c 'cd /data && for f in *.mbtiles; do printf "  %-22s %s\n" "$f" "$(du -h "$f" | cut -f1)"; done; printf "  %-22s %s\n" fonts/ "$(ls fonts 2>/dev/null | wc -l | tr -d " ") polices"; printf "  %-22s %s\n" styles/ "$(ls styles 2>/dev/null | tr "\n" " ")"'
  echo "station  : deploy\\scripts\\tiles-import.ps1 -Archive <chemin>\\$NAME.tar  (ou déposer dans deploy\\tiles-data\\ avant install.ps1)"
} > "$DIST/$NAME.txt"
ls -lh "$TAR" | awk '{print "    " $5 "  " $9}'
echo "    empreinte : $DIST/$NAME.tar.sha256"
