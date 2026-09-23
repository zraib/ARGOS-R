# ============================================================================
# ARGOS / IRIS — outil de signature des scripts PowerShell de la station
# (ADR 0031)
#
# osslsigncode signe en Authenticode — le format que Windows vérifie — les
# .ps1 / .psm1 / .psd1 (prise en charge de PowerShell depuis la version 2.8 ;
# Debian 13 fournit la 2.9). OpenSSL fabrique la clé et le certificat.
# Construite et lancée par deploy/scripts/sign.sh, sur le poste qui fabrique
# le paquet : cette image ne part jamais sur une station.
# ============================================================================
FROM debian:trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends osslsigncode openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /work
