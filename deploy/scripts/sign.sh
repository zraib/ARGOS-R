#!/usr/bin/env bash
# ============================================================================
# ARGOS / IRIS — signature Authenticode des scripts PowerShell de la station
# (ADR 0031)
#
# Windows refuse un script extrait d'un zip téléchargé s'il n'est pas signé par
# un éditeur approuvé (« n'est pas signé numériquement »). Ce script signe les
# .ps1 / .psm1 / .psd1 d'un paquet avec osslsigncode (image iris-signer,
# deploy/signing/Dockerfile), vérifie chaque signature et dépose le certificat
# public dans le paquet (deploy/certs/iris-signature.cer) : la station
# l'approuve une fois (deploy/scripts/trust.ps1, appelé par install.cmd et
# upgrade.cmd), puis exécute les scripts sans contournement.
#
# Usage :
#   deploy/scripts/sign.sh init              crée la clé et le certificat (une seule fois)
#   deploy/scripts/sign.sh sign <dossier>    signe, vérifie, dépose le certificat public
#   deploy/scripts/sign.sh verify <dossier>  vérifie les signatures d'un paquet
#   deploy/scripts/sign.sh info              certificat, empreintes, validité
#   deploy/scripts/sign.sh check             clé présente, outil prêt (préalable de package.sh)
#
# Clé privée et certificat : $IRIS_SIGNING_DIR (défaut ~/.iris-signing), HORS du
# dépôt — la clé ne doit être ni commitée ni copiée dans un paquet ; la perdre
# oblige les stations à approuver un nouvel éditeur.
#   iris-signing.key   clé RSA 3072 bits (droits 600)
#   iris-signing.crt   certificat auto-signé « signature de code », 10 ans
# Un certificat délivré par une autorité reconnue se substitue sans rien changer
# d'autre (PEM) : IRIS_SIGNING_KEY=… IRIS_SIGNING_CERT=… [IRIS_SIGNING_CHAIN=…]
# Horodatage RFC 3161, facultatif — il contacte un tiers, donc désactivé par
# défaut (souveraineté) : IRIS_SIGNING_TIMESTAMP=http://…
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
SIGNING_DIR="${IRIS_SIGNING_DIR:-$HOME/.iris-signing}"
KEY="${IRIS_SIGNING_KEY:-$SIGNING_DIR/iris-signing.key}"
CERT="${IRIS_SIGNING_CERT:-$SIGNING_DIR/iris-signing.crt}"
CHAIN="${IRIS_SIGNING_CHAIN:-}"
TSA="${IRIS_SIGNING_TIMESTAMP:-}"
IMAGE="iris-signer:1"
DESCRIPTION="IRIS - scripts de station"
# L'outil tourne sur la machine qui fabrique le paquet, dans son architecture :
# package.sh exporte linux/amd64 pour les images de la station, pas pour celle-ci.
unset DOCKER_DEFAULT_PLATFORM

die()  { printf '\033[31mERREUR : %s\033[0m\n' "$*" >&2; exit 1; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*" >&2; }

signer_image() {
  docker image inspect "$IMAGE" >/dev/null 2>&1 && return 0
  echo "    construction de l'outil de signature ($IMAGE)"
  docker build -q -t "$IMAGE" "$DEPLOY/signing" >/dev/null
}

need_keys() {
  [ -f "$KEY" ] && [ -f "$CERT" ] || die "clé ou certificat de signature introuvable ($KEY, $CERT) — lancer une fois : deploy/scripts/sign.sh init"
}

# Montages en lecture seule de la clé, du certificat et de la chaîne éventuelle.
KEY_MOUNTS=(-v "$KEY:/keys/key.pem:ro" -v "$CERT:/keys/cert.pem:ro")
[ -n "$CHAIN" ] && KEY_MOUNTS+=(-v "$CHAIN:/keys/chain.pem:ro")

# Les scripts d'un dossier, séparés par des NUL.
scripts_of() { find "$1" -type f \( -name '*.ps1' -o -name '*.psm1' -o -name '*.psd1' \) -print0; }

# Un script qui contient des caractères non ASCII doit commencer par le BOM
# UTF-8 : sans lui, Windows PowerShell 5.1 le lit en ANSI — texte altéré, un
# tiret cadratin y devient même un guillemet qui ferme les chaînes — et
# l'empreinte que Windows recalcule ne serait plus celle qui a été signée.
check_encoding() {
  local f bad=0
  while IFS= read -r -d '' f; do
    if [ "$(LC_ALL=C tr -d '\000-\177' < "$f" | head -c 1 | wc -c | tr -d ' ')" != 0 ] && [ "$(head -c 3 "$f" | od -An -tx1 | tr -d ' \n')" != "efbbbf" ]; then
      warn "${f#"$1"/} : caractères non ASCII sans BOM UTF-8 — enregistrer le fichier en « UTF-8 avec BOM »"
      bad=1
    fi
  done < <(scripts_of "$1")
  [ "$bad" = 0 ] || die "encodage à corriger avant de signer"
}

# Vérifie chaque script du dossier monté en /work (dans le conteneur).
VERIFY_SH='
  ca=/keys/cert.pem; [ -f /keys/chain.pem ] && ca=/keys/chain.pem
  n=0
  for f in $(find /work -type f \( -name "*.ps1" -o -name "*.psm1" -o -name "*.psd1" \) | sort); do
    out=$(osslsigncode verify -in "$f" -CAfile "$ca" 2>&1) || { echo "$out"; echo "SIGNATURE INVALIDE : ${f#/work/}"; exit 1; }
    echo "$out" | grep -q "Signature verification: ok" || { echo "$out"; echo "SIGNATURE INVALIDE : ${f#/work/}"; exit 1; }
    n=$((n+1))
  done
  [ "$n" -gt 0 ] || { echo "aucun script PowerShell dans le dossier"; exit 1; }
  echo "    $n script(s) vérifié(s) : signature valide, empreinte conforme"
'

cmd_init() {
  [ -e "$KEY" ] && die "une clé existe déjà : $KEY — la remplacer changerait l'éditeur approuvé sur chaque station"
  mkdir -p "$SIGNING_DIR"
  chmod 700 "$SIGNING_DIR"
  signer_image
  docker run --rm -v "$SIGNING_DIR:/out" "$IMAGE" sh -c '
    set -e
    cat > /tmp/cs.cnf <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = IRIS Station - Signature des scripts
O = ARGOS RDIA
C = MA
[ext]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
EOF
    openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes -config /tmp/cs.cnf \
      -keyout /out/iris-signing.key -out /out/iris-signing.crt 2>/dev/null
    chmod 600 /out/iris-signing.key'
  echo "Clé et certificat créés dans $SIGNING_DIR — à sauvegarder hors de ce poste (coffre, support chiffré)."
  cmd_info
}

cmd_info() {
  need_keys
  signer_image
  docker run --rm "${KEY_MOUNTS[@]}" "$IMAGE" sh -c '
    openssl x509 -in /keys/cert.pem -noout -subject -issuer -startdate -enddate -ext extendedKeyUsage 2>/dev/null | sed "s/^/    /"
    printf "    empreinte Windows (SHA-1) : %s\n" "$(openssl x509 -in /keys/cert.pem -noout -fingerprint -sha1 | cut -d= -f2 | tr -d :)"
    printf "    empreinte SHA-256         : %s\n" "$(openssl x509 -in /keys/cert.pem -noout -fingerprint -sha256 | cut -d= -f2 | tr -d :)"'
}

cmd_sign() {
  local dir
  [ -n "${1:-}" ] && [ -d "$1" ] || die "usage : sign.sh sign <dossier du paquet>"
  dir="$(cd "$1" && pwd)"
  need_keys
  check_encoding "$dir"
  signer_image
  mkdir -p "$dir/deploy/certs"
  docker run --rm -v "$dir:/work" "${KEY_MOUNTS[@]}" -e DESC="$DESCRIPTION" -e TSA="$TSA" "$IMAGE" sh -c '
    set -e
    certs=/keys/cert.pem
    if [ -f /keys/chain.pem ]; then cat /keys/cert.pem /keys/chain.pem > /tmp/certs.pem; certs=/tmp/certs.pem; fi
    for f in $(find /work -type f \( -name "*.ps1" -o -name "*.psm1" -o -name "*.psd1" \) | sort); do
      # Une signature déjà présente (paquet re-signé) est retirée avant la nouvelle.
      if grep -q "# SIG # Begin signature block" "$f"; then
        osslsigncode remove-signature -in "$f" -out "$f.nosig" >/dev/null && mv "$f.nosig" "$f"
      fi
      if [ -n "$TSA" ]; then
        osslsigncode sign -certs "$certs" -key /keys/key.pem -h sha256 -n "$DESC" -ts "$TSA" -in "$f" -out "$f.signed" >/dev/null
      else
        osslsigncode sign -certs "$certs" -key /keys/key.pem -h sha256 -n "$DESC" -in "$f" -out "$f.signed" >/dev/null
      fi
      mv "$f.signed" "$f"
      echo "    signé : ${f#/work/}"
    done
    # Le certificat public, que la station approuve (deploy\scripts\trust.ps1).
    openssl x509 -in /keys/cert.pem -outform DER -out /work/deploy/certs/iris-signature.cer
    {
      echo "Certificat de signature des scripts PowerShell de la station (ADR 0031)"
      openssl x509 -in /keys/cert.pem -noout -subject -startdate -enddate
      echo "empreinte Windows (SHA-1) : $(openssl x509 -in /keys/cert.pem -noout -fingerprint -sha1 | cut -d= -f2 | tr -d :)"
      echo "empreinte SHA-256 : $(openssl x509 -in /keys/cert.pem -noout -fingerprint -sha256 | cut -d= -f2 | tr -d :)"
    } > /work/deploy/certs/iris-signature.txt
  '"$VERIFY_SH"
}

cmd_verify() {
  local dir
  [ -n "${1:-}" ] && [ -d "$1" ] || die "usage : sign.sh verify <dossier du paquet>"
  dir="$(cd "$1" && pwd)"
  need_keys
  signer_image
  docker run --rm -v "$dir:/work:ro" "${KEY_MOUNTS[@]}" "$IMAGE" sh -c "$VERIFY_SH"
}

cmd_check() {
  need_keys
  signer_image
  docker run --rm "${KEY_MOUNTS[@]}" "$IMAGE" sh -c '
    printf "    %s · empreinte Windows %s · jusqu au %s\n" \
      "$(openssl x509 -in /keys/cert.pem -noout -subject | sed "s/^subject=//")" \
      "$(openssl x509 -in /keys/cert.pem -noout -fingerprint -sha1 | cut -d= -f2 | tr -d :)" \
      "$(openssl x509 -in /keys/cert.pem -noout -enddate | cut -d= -f2)"
    openssl x509 -in /keys/cert.pem -noout -checkend 2592000 >/dev/null || echo "    ! le certificat expire dans moins de 30 jours"'
}

case "${1:-}" in
  init) cmd_init ;;
  check) cmd_check ;;
  info) cmd_info ;;
  sign) cmd_sign "${2:-}" ;;
  verify) cmd_verify "${2:-}" ;;
  -h|--help|"") sed -n '2,30p' "$0" ;;
  *) die "commande inconnue : $1 (init, sign, verify, info, check)" ;;
esac
