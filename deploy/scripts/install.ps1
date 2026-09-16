# ============================================================================
# ARGOS / IRIS — installation d'une station depuis le paquet (PowerShell)
#
# Le paquet (fabriqué par scripts/package.sh) contient l'arbre du dépôt, les
# images Docker linux/amd64 dans deploy\images et le client tunnel dans
# deploy\tools. Ce script, dans l'ordre :
#   1. vérifie que Docker Desktop répond ;
#   2. charge les images du paquet et les étiquette `latest`, l'étiquette que
#      docker-compose.yml attend (sans paquet : construction depuis le code) ;
#   3. écrit .env depuis .env.example avec deux secrets générés — s'il n'existe pas ;
#   4. démarre la pile, sans rien compiler ni télécharger ;
#   5. attend que l'API réponde et affiche l'adresse à ouvrir.
#
# Usage :  .\scripts\install.ps1 [-NoStart] [-HttpPort 8080] [-Https] [-Domain iris.exemple.ma -AcmeEmail admin@exemple.ma]
#   -NoStart    charge les images et écrit .env, sans démarrer.
#   -HttpPort   port HTTP de la station si le 80 est pris (inscrit dans .env).
#   -Https      HTTPS avec le certificat auto-signé de la station (réseau local,
#               téléphones qui partagent leur position) — README § 11.
#   -Domain     HTTPS avec un certificat public Let's Encrypt : nom de domaine
#               qui pointe vers la passerelle de l'organisme, ports 443 et 80
#               redirigés vers la station ; -AcmeEmail obligatoire avec lui.
# Ces trois options ne s'appliquent qu'à un .env créé par ce script ; un .env
# existant se modifie à la main (COMPOSE_FILE, DOMAIN, ACME_EMAIL, PUBLIC_URL).
# Relançable sans risque : ce qui est déjà fait est sauté (.env conservé).
# Si PowerShell refuse le script : Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# ============================================================================
param(
  [switch]$NoStart,
  [int]$HttpPort = 0,
  [switch]$Https,
  [string]$Domain = "",
  [string]$AcmeEmail = ""
)
if ($Domain -and -not $AcmeEmail) { throw "-Domain demande -AcmeEmail (adresse de contact du certificat Let's Encrypt)." }

$ErrorActionPreference = "Stop"
$deploy = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $deploy ".env"
$imagesDir = Join-Path $deploy "images"
$versionFile = Join-Path $deploy "VERSION"

function Step([int]$n, [string]$msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok([string]$msg) { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "    !   $msg" -ForegroundColor Yellow }

# Secret aléatoire : 48 caractères parmi [0-9A-Za-z], tirés du générateur
# cryptographique (pas Get-Random). Les octets >= 248 sont rejetés pour que
# chaque caractère soit équiprobable (248 = 4 x 62).
function New-Secret {
  $chars = [char[]]((48..57) + (65..90) + (97..122))
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $out = New-Object System.Text.StringBuilder
  $buf = New-Object byte[] 1
  while ($out.Length -lt 48) {
    $rng.GetBytes($buf)
    if ($buf[0] -lt 248) { [void]$out.Append($chars[$buf[0] % 62]) }
  }
  return $out.ToString()
}

# Adresse locale de la station : https si .env active un des empilements HTTPS
# (compose.https.yml / compose.letsencrypt.yml — README § 11), sinon http. Le
# certificat auto-signé est accepté pour les sondes de ce script seulement.
function Get-EnvValue([string]$file, [string]$key, [string]$default) {
  if (-not (Test-Path $file)) { return $default }
  $line = Get-Content $file | Where-Object { $_ -match "^\s*$key=(.*)$" } | Select-Object -Last 1
  if ($line -and $line -match "^\s*$key=(.*)$") { return $Matches[1].Trim() }
  return $default
}
function Get-StationUrl([string]$file) {
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  if ((Get-EnvValue $file "COMPOSE_FILE" "") -match "https|letsencrypt") {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    $p = [int](Get-EnvValue $file "HTTPS_PORT" "443")
    if ($p -eq 443) { return "https://localhost" } else { return "https://localhost:$p" }
  }
  $p = [int](Get-EnvValue $file "HTTP_PORT" "80")
  if ($p -eq 80) { return "http://localhost" } else { return "http://localhost:$p" }
}

# --- 1. Docker Desktop --------------------------------------------------------
Step 1 "Docker Desktop"
$engine = ""
try { $engine = (& docker version --format "{{.Server.Version}}" 2>$null) } catch { $engine = "" }
if (-not $engine -or $LASTEXITCODE -ne 0) {
  throw "Docker ne répond pas. Démarrez Docker Desktop (icône de baleine dans la barre des tâches), attendez « Engine running », puis relancez ce script."
}
Ok "moteur Docker $engine"

# --- 2. Images ----------------------------------------------------------------
Step 2 "Images de l'application"
$version = ""
if (Test-Path $versionFile) { $version = (Get-Content $versionFile -Raw).Trim() }
$archives = @()
if (Test-Path $imagesDir) { $archives = @(Get-ChildItem -Path $imagesDir -File | Where-Object { $_.Name -match "\.(tar|tar\.gz|tgz)$" }) }
$mustBuild = $false
if ($archives.Count -eq 0) {
  Warn "aucune archive dans deploy\images : les images seront construites depuis le code (Internet requis, 10 à 20 minutes)."
  $mustBuild = $true
} else {
  foreach ($a in $archives) {
    Write-Host ("    chargement de {0} ({1:N1} Go) — quelques minutes…" -f $a.Name, ($a.Length / 1GB))
    & docker load -i $a.FullName
    if ($LASTEXITCODE -ne 0) { throw "docker load a échoué sur $($a.Name)" }
  }
  if ($version) {
    foreach ($img in @("iris-web", "iris-api", "iris-tiles-tools")) {
      & docker tag "${img}:${version}" "${img}:latest"
      if ($LASTEXITCODE -ne 0) { throw "l'image ${img}:${version} n'est pas dans l'archive — paquet incomplet ?" }
    }
    Ok "images $version en place (étiquetées latest)"
  } else {
    Warn "deploy\VERSION absent : les images chargées gardent leur étiquette d'origine ; docker-compose.yml attend « latest »."
  }
}

# --- 3. Réglages --------------------------------------------------------------
Step 3 "Réglages (.env)"
if (Test-Path $envFile) {
  Ok ".env existe déjà — conservé tel quel"
  if ($HttpPort -gt 0) { Warn "-HttpPort ignoré : modifiez HTTP_PORT et PUBLIC_URL dans .env à la main" }
} else {
  $content = Get-Content (Join-Path $deploy ".env.example") -Raw
  $content = $content -replace "(?m)^POSTGRES_PASSWORD=.*$", ("POSTGRES_PASSWORD=" + (New-Secret))
  $content = $content -replace "(?m)^AUTH_DEV_SECRET=.*$", ("AUTH_DEV_SECRET=" + (New-Secret))
  if ($HttpPort -gt 0) {
    $content = $content -replace "(?m)^HTTP_PORT=.*$", "HTTP_PORT=$HttpPort"
    $content = $content -replace "(?m)^PUBLIC_URL=.*$", "PUBLIC_URL=http://localhost:$HttpPort"
  }
  # HTTPS : on décommente l'empilement voulu ; l'adresse publique suit.
  if ($Domain) {
    $content = $content -replace "(?m)^#COMPOSE_FILE=docker-compose.yml:compose.letsencrypt.yml$", "COMPOSE_FILE=docker-compose.yml:compose.letsencrypt.yml"
    $content = $content -replace "(?m)^DOMAIN=.*$", "DOMAIN=$Domain"
    $content = $content -replace "(?m)^ACME_EMAIL=.*$", "ACME_EMAIL=$AcmeEmail"
    $content = $content -replace "(?m)^PUBLIC_URL=.*$", "PUBLIC_URL=https://$Domain"
  } elseif ($Https) {
    $content = $content -replace "(?m)^#COMPOSE_FILE=docker-compose.yml:compose.https.yml$", "COMPOSE_FILE=docker-compose.yml:compose.https.yml"
    $content = $content -replace "(?m)^PUBLIC_URL=.*$", "PUBLIC_URL=https://localhost"
  }
  # UTF-8 sans BOM : docker compose lit le fichier tel quel.
  [System.IO.File]::WriteAllText($envFile, $content, (New-Object System.Text.UTF8Encoding($false)))
  Ok ".env écrit, secrets générés (ce fichier ne se partage pas)"
}
$url = Get-StationUrl $envFile
$port = if ($url -like "https:*") { [int](Get-EnvValue $envFile "HTTPS_PORT" "443") } else { [int](Get-EnvValue $envFile "HTTP_PORT" "80") }
# Fond de carte : figé dans l'image web ; .env le rappelle (MAP_TILES).
$mapMode = "external"
$mapLine = Get-Content $envFile | Where-Object { $_ -match "^\s*MAP_TILES=(\w+)" } | Select-Object -Last 1
if ($mapLine -and $mapLine -match "^\s*MAP_TILES=(\w+)") { $mapMode = $Matches[1] }
$mapHint = if ($mapMode -eq "sovereign") { "souverain (hors ligne) — préparer les tuiles : GUIDE-DEBUTANT-WINDOWS.md, étape 6" } else { "externe (Esri/Maxar, OpenStreetMap, relief en ligne — Internet requis sur les postes)" }
# Mode de la station (ADR 0016) : opérationnel en service, exercice ou démonstration pour former.
$appMode = Get-EnvValue $envFile "APP_MODE" (Get-EnvValue $envFile "DATA_PROFILE" "operational")
$profileHint = switch ($appMode) {
  "demo" { "démonstration (jeu d'exemple reconstruit au démarrage) — APP_MODE=operational pour la mise en service" }
  "exercise" { "exercice (station vide ; l'OPCOM et les cellules créent unités et ressources)" }
  default { "opérationnel (rien de simulé ; réseau hospitalier et géographie seulement)" }
}

if ($NoStart) {
  Write-Host "`nImages et réglages prêts. Pour démarrer :  docker compose up -d   (puis $url)"
  exit 0
}

# --- 4. Démarrage -------------------------------------------------------------
Step 4 "Démarrage de la pile"
# --remove-orphans : un conteneur d'une version précédente (ex. `tiles` d'un
# fond de carte souverain) ne survit pas à une mise à jour.
if ($mustBuild) { & docker compose --project-directory $deploy up -d --build --remove-orphans } else { & docker compose --project-directory $deploy up -d --remove-orphans }
if ($LASTEXITCODE -ne 0) { throw "docker compose up a échoué — lisez les lignes ci-dessus ; le port $port est-il libre ?" }

# --- 5. Santé -----------------------------------------------------------------
Step 5 "Attente de l'API (jusqu'à 3 minutes : la base s'initialise au premier démarrage)"
$deadline = (Get-Date).AddMinutes(3)
$up = $false
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$url/api/health" -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $up = $true; break }
  } catch { }
  Start-Sleep -Seconds 5
}
if ($up) { Ok "API en ligne" } else { Warn "l'API ne répond pas encore — docker compose ps, puis docker compose logs api" }

Write-Host @"

  Poste de commandement :  $url$(if ($Domain) { "   (public : https://$Domain)" })
  Depuis un autre poste :  la même adresse avec l'IP de la station (ipconfig) — pare-feu : autoriser le port $port en entrée (README § 11)
  Compte fondateur      :  m.zraib  /  code temporaire ARGOS-2026  (à changer à la première connexion)
  État de la station    :  .\scripts\status.ps1
  Fond de carte         :  $mapHint
  Mode de la station    :  $profileHint   (README § 6 bis ; se change aussi dans Paramètres)
  Démonstration à distance (tunnel, ADR 0013) :  .\scripts\tunnel.ps1

"@
