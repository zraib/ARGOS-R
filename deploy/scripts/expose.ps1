# ARGOS / IRIS — accès public par tunnel sortant (ADR 0028)
#
# Rend la station joignable depuis Internet SANS ouvrir de port ni toucher au
# routeur : la station ouvre elle-même une connexion vers le réseau Cloudflare,
# qui lui attribue une adresse https et lui renvoie le trafic. Le tunnel est un
# conteneur de la pile (docker-compose.yml, profils `public-quick` / `public`) :
# il redémarre avec Docker Desktop — une fois lancé, l'accès reste.
#
# Usage :
#   .\scripts\expose.ps1                  tunnel RAPIDE : adresse aléatoire
#                                         https://<mots>.trycloudflare.com, sans compte,
#                                         nouvelle adresse à chaque (re)démarrage
#   .\scripts\expose.ps1 -Token <jeton>   tunnel NOMMÉ : votre adresse fixe
#                                         (compte Cloudflare gratuit + nom de domaine ;
#                                         tableau de bord Zero Trust › Networks › Tunnels,
#                                         service à cibler : http://proxy:80)
#   .\scripts\expose.ps1 -Status          l'adresse publique en service, s'il y en a une
#   .\scripts\expose.ps1 -Off             ferme l'accès public (le tunnel est retiré)
#
# Ce que cela implique (README § 10) : le relais termine le TLS public et voit le
# trafic en clair entre son bord et la station ; tout Internet atteint l'écran
# de connexion — mots de passe forts, comptes de démonstration désactivés, et
# l'API borne les échecs de connexion (429). Rien ne change dans l'application :
# une seule origine, des chemins relatifs, une CSP en 'self'.
[CmdletBinding()]
param(
  [string]$Token = "",
  [switch]$Status,
  [switch]$Off
)
$ErrorActionPreference = "Stop"
$deploy = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $deploy ".env"
if (-not (Test-Path $envFile)) { throw "deploy\.env introuvable : installer la station d'abord (scripts\install.ps1)." }

# .env est en UTF-8 sans BOM (install.ps1) : on le lit et l'écrit tel quel, jamais en ANSI.
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Get-EnvValue([string]$key, [string]$default) {
  $line = [System.IO.File]::ReadAllLines($envFile, $utf8) | Where-Object { $_ -match "^\s*$key=(.*)$" } | Select-Object -Last 1
  if ($line -and $line -match "^\s*$key=(.*)$") { return $Matches[1].Trim() }
  return $default
}
function Set-EnvValue([string]$key, [string]$value) {
  $content = [System.IO.File]::ReadAllText($envFile, $utf8)
  if ($content -match "(?m)^\s*$key=.*$") { $content = $content -replace "(?m)^\s*$key=.*$", "$key=$value" }
  else { $content = $content.TrimEnd() + "`r`n$key=$value`r`n" }
  [System.IO.File]::WriteAllText($envFile, $content, $utf8)
}
# Les profils Compose actifs (COMPOSE_PROFILES, séparés par des virgules) — on y ajoute ou retire celui du tunnel.
function Get-Profiles { return @((Get-EnvValue "COMPOSE_PROFILES" "") -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
function Set-Profiles([string[]]$profiles) { Set-EnvValue "COMPOSE_PROFILES" (($profiles | Select-Object -Unique) -join ",") }
function Compose { & docker compose --project-directory $deploy @args }
# Sous Windows PowerShell 5.1, ce que docker écrit sur stderr devient une erreur
# bloquante quand on le redirige avec $ErrorActionPreference = "Stop" : les
# appels dont la sortie d'erreur ne compte pas passent par ici.
function Invoke-Quiet([scriptblock]$block) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try { return (& $block 2>$null) } catch { return $null } finally { $ErrorActionPreference = $previous }
}

# L'adresse d'un tunnel rapide se lit dans son journal (cloudflared l'y écrit au démarrage).
function Get-QuickUrl {
  $log = Invoke-Quiet { docker compose --project-directory $deploy logs --no-color --no-log-prefix tunnel-quick }
  if (-not $log) { return $null }
  $m = [regex]::Matches(($log -join "`n"), "https://[a-z0-9-]+\.trycloudflare\.com") | Select-Object -Last 1
  if ($m) { return $m.Value }
  return $null
}
function Running([string]$service) {
  $id = Invoke-Quiet { docker compose --project-directory $deploy ps -q $service }
  return [bool]$id
}
function Remove-Tunnel([string[]]$services) {
  foreach ($svc in $services) {
    Invoke-Quiet { docker compose --project-directory $deploy stop $svc } | Out-Null
    Invoke-Quiet { docker compose --project-directory $deploy rm -f $svc } | Out-Null
  }
}

if ($Status) {
  if (Running "tunnel-quick") {
    $url = Get-QuickUrl
    if ($url) { Write-Host "Accès public (tunnel rapide) : $url" } else { Write-Host "Tunnel rapide en cours de démarrage — relancez -Status dans quelques secondes." }
  } elseif (Running "tunnel") {
    Write-Host "Accès public (tunnel nommé) actif — l'adresse est celle configurée dans votre tableau de bord Cloudflare Zero Trust."
  } else {
    Write-Host "Aucun accès public : la station n'est joignable que sur son réseau."
  }
  exit 0
}

if ($Off) {
  Write-Host "Fermeture de l'accès public…"
  Remove-Tunnel @("tunnel", "tunnel-quick")
  Set-Profiles (Get-Profiles | Where-Object { $_ -ne "public" -and $_ -ne "public-quick" })
  Write-Host "Accès public fermé : la station n'est plus joignable que sur son réseau. (Changez les mots de passe utilisés pendant l'exposition.)"
  exit 0
}

# --- Ouvrir ---------------------------------------------------------------------
$named = [bool]$Token -or [bool](Get-EnvValue "CLOUDFLARE_TUNNEL_TOKEN" "")
if ($Token) { Set-EnvValue "CLOUDFLARE_TUNNEL_TOKEN" $Token }
$profile = if ($named) { "public" } else { "public-quick" }
$other = if ($named) { "public-quick" } else { "public" }
# Un seul tunnel à la fois : l'autre est retiré s'il tournait.
Remove-Tunnel @($(if ($named) { "tunnel-quick" } else { "tunnel" }))
Set-Profiles ((Get-Profiles | Where-Object { $_ -ne $other }) + $profile)

Write-Host @"

  ATTENTION — la station va être joignable depuis TOUT Internet.
  · Le trafic transite par un relais tiers (Cloudflare) qui le voit en clair
    entre son bord TLS et cette station.
  · Seule la connexion protège : mots de passe forts, comptes de démonstration
    désactivés (Gestion des utilisateurs). L'API borne les échecs de connexion.
  · Pour fermer :  .\scripts\expose.ps1 -Off   — puis changez les mots de passe
    utilisés pendant l'exposition.

"@ -ForegroundColor Yellow

$service = if ($named) { "tunnel" } else { "tunnel-quick" }
Write-Host "Démarrage du tunnel ($service)…"
Compose up -d $service
if ($LASTEXITCODE -ne 0) { throw "docker compose up $service a échoué" }

if ($named) {
  Write-Host @"

  Tunnel nommé actif. L'adresse publique est celle configurée dans votre tableau de
  bord Cloudflare Zero Trust (Networks › Tunnels › ce tunnel › Public Hostname),
  avec pour service :  http://proxy:80
  Elle reste la même après un redémarrage de la station.
  État : .\scripts\expose.ps1 -Status   ·   Fermer : .\scripts\expose.ps1 -Off

"@
  exit 0
}

# Tunnel rapide : attendre l'adresse (cloudflared l'écrit dans son journal en quelques secondes).
$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) { Start-Sleep -Seconds 2; $url = Get-QuickUrl }
if (-not $url) {
  Write-Host "Le tunnel n'a pas encore d'adresse. Journal :" -ForegroundColor Yellow
  Invoke-Quiet { docker compose --project-directory $deploy logs --no-log-prefix --tail 20 tunnel-quick } | ForEach-Object { Write-Host $_ }
  Write-Host "Relancez  .\scripts\expose.ps1 -Status  dans quelques secondes (la station doit avoir accès à Internet)."
  exit 1
}
Write-Host @"

  Accès public ouvert :  $url
  · Cette adresse change à chaque redémarrage du tunnel (adresse aléatoire, sans compte).
    Pour une adresse fixe : un tunnel nommé Cloudflare, puis  .\scripts\expose.ps1 -Token <jeton>
  · État : .\scripts\expose.ps1 -Status   ·   Fermer : .\scripts\expose.ps1 -Off

"@ -ForegroundColor Green
