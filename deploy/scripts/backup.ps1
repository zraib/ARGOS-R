# ============================================================================
# ARGOS / IRIS — sauvegarde de la station (PowerShell, Docker Desktop)
#
# Deux choses à garder, parce que deux persistances :
#   1. la base PostgreSQL (audit, drapeaux, bons de travail)   → pg_dump
#   2. le volume /data de l'API (instantané JSON du domaine et des comptes,
#      pièces jointes)                                         → archive tar
# Usage :  .\scripts\backup.ps1 [-Dest D:\sauvegardes\iris]
# ============================================================================
param([string]$Dest = (Join-Path $PSScriptRoot "..\backups"))

$ErrorActionPreference = "Stop"
$compose = Join-Path $PSScriptRoot "..\docker-compose.yml"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$env = Get-Content (Join-Path $PSScriptRoot "..\.env") | Where-Object { $_ -match "^\s*[A-Z_]+=" }
$dbUser = (($env | Where-Object { $_ -like "POSTGRES_USER=*" }) -split "=", 2)[1]; if (-not $dbUser) { $dbUser = "argos" }
$dbName = (($env | Where-Object { $_ -like "POSTGRES_DB=*" }) -split "=", 2)[1];   if (-not $dbName) { $dbName = "argos" }

Write-Host "1/2  PostgreSQL → $Dest\db-$stamp.sql.gz"
docker compose -f $compose exec -T db pg_dump -U $dbUser -d $dbName --no-owner | & docker run --rm -i alpine:3.20 gzip -9 > "$Dest\db-$stamp.sql.gz"
if ($LASTEXITCODE -ne 0) { throw "pg_dump a échoué" }

Write-Host "2/2  Volume de l'API (instantané JSON + pièces jointes) → $Dest\api-data-$stamp.tar.gz"
docker run --rm -v iris_api_data:/data:ro -v "${Dest}:/out" alpine:3.20 tar czf "/out/api-data-$stamp.tar.gz" -C /data .
if ($LASTEXITCODE -ne 0) { throw "archivage du volume api_data échoué" }

Get-ChildItem $Dest -Filter "*$stamp*" | Format-Table Name, @{n="Mo";e={[math]::Round($_.Length/1MB,1)}}
Write-Host "Sauvegarde terminée. Restauration : .\scripts\restore.ps1 -Stamp $stamp"
