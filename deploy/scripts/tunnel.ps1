# ============================================================================
# ARGOS / IRIS — exposer la station sur Internet le temps d'une démonstration
#
# Ouvre un tunnel tunnelto.dev vers le port HTTP de la station : l'application
# devient joignable à https://<sous-domaine>.tunnelto.dev, sans ouvrir de port
# ni toucher au pare-feu, depuis n'importe quel navigateur. Une seule origine
# (le proxy), des chemins relatifs partout : rien à reconfigurer.
#
# C'est un RELAIS TIERS (ADR 0013) : le trafic passe par les serveurs de
# tunnelto.dev, qui le voient en clair entre leur bord TLS et cette station.
# Réservé aux démonstrations sur données fictives — jamais à l'exploitation.
# Ctrl+C ferme le tunnel ; il n'y a rien à défaire ensuite.
#
# Usage :  .\scripts\tunnel.ps1 [-Key <clé API>] [-Subdomain iris-demo] [-Port 80]
#   -Key        clé du compte tunnelto.dev (https://dashboard.tunnelto.dev),
#               mémorisée par le client dans %USERPROFILE%\.tunnelto\key.token
#               — à donner une fois, puis inutile.
#   -Subdomain  sous-domaine souhaité (compte payant, sinon un nom aléatoire est
#               attribué à chaque ouverture).
#   -Port       port HTTP de la station (défaut : HTTP_PORT de .env, sinon 80).
# Le client tunnelto est celui du paquet (deploy\tools, version et empreinte
# épinglées) ; absent, il est téléchargé puis vérifié avant toute exécution.
# ============================================================================
param(
  [string]$Key = "",
  [string]$Subdomain = "",
  [int]$Port = 0
)

$ErrorActionPreference = "Stop"
$deploy = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tools = Join-Path $deploy "tools"
$exe = Join-Path $tools "tunnelto-windows.exe"
$envFile = Join-Path $deploy ".env"

# Version et empreinte épinglées — les mêmes que dans scripts/package.sh.
$TunnelVersion = "0.1.18"
$TunnelUrl = "https://github.com/agrinman/tunnelto/releases/download/$TunnelVersion/tunnelto-windows.exe"
$TunnelSha256 = "CB70CA2937AFDB647A8716F0B0D122F71F91DD7CE777250D0D2573F0EC47C5FC"

# --- 1. Le client : embarqué par le paquet, sinon téléchargé — vérifié dans les deux cas.
if (-not (Test-Path $exe)) {
  New-Item -ItemType Directory -Force -Path $tools | Out-Null
  Write-Host "Téléchargement de tunnelto $TunnelVersion (9 Mo)…"
  Invoke-WebRequest -UseBasicParsing -Uri $TunnelUrl -OutFile $exe
}
$hash = (Get-FileHash -Algorithm SHA256 -Path $exe).Hash
if ($hash -ne $TunnelSha256) {
  Remove-Item -Force $exe
  throw "Empreinte inattendue pour tunnelto-windows.exe ($hash) : fichier supprimé. Refaites le paquet (scripts/package.sh) ou vérifiez la source."
}

# --- 2. La station doit répondre sur son port, en HTTP : le tunnel parle au
#        port HTTP et l'empilement HTTPS (README § 11) le renverrait vers https://localhost.
if (Test-Path $envFile) {
  $cf = (Get-Content $envFile | Where-Object { $_ -match "^\s*COMPOSE_FILE=(.*)$" } | Select-Object -Last 1)
  if ($cf -and $cf -match "https|letsencrypt") { throw "HTTPS est activé dans .env (COMPOSE_FILE) : le tunnel ne s'y prête pas — la station est faite pour être jointe directement (README § 11)." }
}
if ($Port -le 0) {
  $Port = 80
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match "^\s*HTTP_PORT=(\d+)" } | Select-Object -Last 1
    if ($line -and $line -match "^\s*HTTP_PORT=(\d+)") { $Port = [int]$Matches[1] }
  }
}
try {
  $null = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/api/health" -TimeoutSec 5
} catch {
  throw "La station ne répond pas sur http://localhost:$Port — démarrez-la d'abord (docker compose up -d) ; état : .\scripts\status.ps1"
}

# --- 3. La clé du compte tunnelto.dev.
$keyFile = Join-Path $env:USERPROFILE ".tunnelto\key.token"
if ($Key) {
  & $exe set-auth --key $Key
  if ($LASTEXITCODE -ne 0) { throw "tunnelto set-auth a échoué" }
} elseif (-not (Test-Path $keyFile)) {
  Write-Host "Aucune clé tunnelto mémorisée. Créez-en une sur https://dashboard.tunnelto.dev puis relancez :  .\scripts\tunnel.ps1 -Key <clé>" -ForegroundColor Yellow
}

# --- 4. L'avertissement, puis le tunnel (au premier plan ; Ctrl+C pour fermer).
Write-Host @"

==========================================================================
  EXPOSITION SUR INTERNET — démonstration uniquement (ADR 0013)
  · Le trafic transite par un relais tiers (tunnelto.dev) qui le voit en
    clair : aucune donnée réelle, aucun compte réel pendant la démonstration.
  · Tout Internet atteint l'écran de connexion : mots de passe forts, borne
    de dix échecs par compte et par quart d'heure côté API.
  · Fermez le tunnel dès la fin (Ctrl+C) ; changez ensuite les mots de passe
    utilisés pendant la démonstration.
  Station : http://localhost:$Port  →  l'adresse publique s'affiche ci-dessous.
==========================================================================

"@ -ForegroundColor Yellow

$tunnelArgs = @("--port", "$Port", "--host", "localhost", "--scheme", "http")
if ($Subdomain) { $tunnelArgs += @("--subdomain", $Subdomain) }
& $exe @tunnelArgs
Write-Host "`nTunnel fermé — la station n'est plus joignable depuis Internet." -ForegroundColor Green
