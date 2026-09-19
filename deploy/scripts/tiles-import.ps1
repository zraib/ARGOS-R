# ============================================================================
# ARGOS / IRIS — import des tuiles hors ligne dans le volume de la station
# (version RIF, sans Internet). PowerShell, Docker Desktop.
#
# L'archive (iris-tiles-<version>.tar, fabriquée par scripts/tiles-export.sh
# sur une machine qui a Internet) contient tout ce que la carte affiche :
# imagerie, relief 3D, plan et toponymes vectoriels du Maroc, polices.
#
# Usage :  .\scripts\tiles-import.ps1 [-Archive D:\iris-tiles-20260919-abc1234.tar]
#   Sans -Archive : la première archive .tar trouvée dans deploy\tiles-data\.
# Relançable : les fichiers du volume sont remplacés ; le serveur de tuiles
# est redémarré s'il tourne. install.ps1 appelle ce script de lui-même quand
# deploy\tiles-data\ contient une archive.
# ============================================================================
param([string]$Archive = "")
$ErrorActionPreference = "Stop"
$deploy = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$volume = "iris_argos_tiles"
if (-not $Archive) {
  $dir = Join-Path $deploy "tiles-data"
  if (Test-Path $dir) { $Archive = (Get-ChildItem -Path $dir -File -Filter "*.tar" | Sort-Object Name | Select-Object -First 1).FullName }
}
if (-not $Archive -or -not (Test-Path $Archive)) { throw "Aucune archive de tuiles : passer -Archive <fichier .tar> ou déposer l'archive dans deploy\tiles-data\." }
$Archive = (Resolve-Path $Archive).Path
$shaFile = "$Archive.sha256"
if (Test-Path $shaFile) {
  $expected = ((Get-Content $shaFile | Select-Object -First 1) -split "\s+")[0].ToLower()
  $got = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLower()
  if ($expected -ne $got) { throw "Empreinte SHA-256 incorrecte pour $Archive : archive altérée ou copie incomplète." }
  Write-Host "    OK  empreinte vérifiée" -ForegroundColor Green
}
& docker volume create $volume | Out-Null
$srcDir = Split-Path $Archive -Parent
$file = Split-Path $Archive -Leaf
Write-Host "[tuiles] import de $file dans le volume $volume (plusieurs Go : quelques minutes)…" -ForegroundColor Cyan
& docker run --rm -v "${volume}:/data" -v "${srcDir}:/src:ro" alpine:3.20 sh -c "tar -xf /src/$file -C /data && ls -la /data/*.mbtiles"
if ($LASTEXITCODE -ne 0) { throw "L'import a échoué (docker run)." }
$running = & docker compose --project-directory $deploy ps --status running --services 2>$null
if ($running -contains "tiles") {
  & docker compose --project-directory $deploy restart tiles | Out-Null
  Write-Host "    OK  serveur de tuiles redémarré" -ForegroundColor Green
}
Write-Host "    OK  tuiles importées — carte hors ligne prête (MAP_TILES=sovereign, COMPOSE_PROFILES=sovereign dans .env)" -ForegroundColor Green
