# ============================================================================
# ARGOS / IRIS — restauration d'une sauvegarde (PowerShell, Docker Desktop)
# Usage :  .\scripts\restore.ps1 -Stamp 20260914-103000 [-Source D:\sauvegardes\iris]
# ARRÊTE l'API le temps de remettre le volume, puis redémarre la pile.
# ============================================================================
param(
  [Parameter(Mandatory = $true)][string]$Stamp,
  [string]$Source = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"
$compose = Join-Path $PSScriptRoot "..\docker-compose.yml"
$dump = Join-Path $Source "db-$Stamp.sql.gz"
$tar  = Join-Path $Source "api-data-$Stamp.tar.gz"
if (-not (Test-Path $dump) -or -not (Test-Path $tar)) { throw "Sauvegarde $Stamp introuvable dans $Source" }

$env = Get-Content (Join-Path $PSScriptRoot "..\.env") | Where-Object { $_ -match "^\s*[A-Z_]+=" }
$dbUser = (($env | Where-Object { $_ -like "POSTGRES_USER=*" }) -split "=", 2)[1]; if (-not $dbUser) { $dbUser = "argos" }
$dbName = (($env | Where-Object { $_ -like "POSTGRES_DB=*" }) -split "=", 2)[1];   if (-not $dbName) { $dbName = "argos" }

Write-Host "Arrêt de l'API et du proxy"
docker compose -f $compose stop proxy api

Write-Host "1/2  Base PostgreSQL ← $dump"
Get-Content $dump -AsByteStream -Raw | docker run --rm -i alpine:3.20 gunzip -c | docker compose -f $compose exec -T db psql -U $dbUser -d $dbName -q
if ($LASTEXITCODE -ne 0) { throw "restauration PostgreSQL échouée" }

Write-Host "2/2  Volume de l'API ← $tar"
docker run --rm -v iris_api_data:/data -v "${Source}:/in:ro" alpine:3.20 sh -c "rm -rf /data/* && tar xzf /in/api-data-$Stamp.tar.gz -C /data"
if ($LASTEXITCODE -ne 0) { throw "restauration du volume api_data échouée" }

Write-Host "Redémarrage"
docker compose -f $compose up -d
Write-Host "Restauration $Stamp terminée."
