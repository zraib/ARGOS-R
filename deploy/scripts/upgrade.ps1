# ============================================================================
# ARGOS / IRIS — mise à jour d'une station depuis un nouveau paquet, EN GARDANT
# LES COMPTES (PowerShell, Docker Desktop). Voir MISE-A-JOUR-STATION.md.
#
# À lancer depuis le dossier deploy\ du NOUVEAU paquet, décompressé à part :
#   .\scripts\upgrade.ps1 -Current C:\iris\deploy [-Backups D:\sauvegardes\iris] [-SkipBackup]
#
# Ce que fait le script, dans l'ordre — et rien d'autre :
#   1. vérifie Docker, le paquet (VERSION, images) et l'installation actuelle ;
#   2. SAUVEGARDE l'installation actuelle (pg_dump + volume de l'API) ;
#   3. reprend le .env actuel (secrets, port, HTTPS, fond de carte) ;
#   4. arrête l'ancienne pile SANS toucher aux volumes (jamais `down -v`) ;
#   5. vérifie que les volumes iris_api_data et iris_db_data sont bien là ;
#   6. installe le nouveau paquet (install.ps1 : images, .env conservé, démarrage) ;
#   7. contrôle la santé de l'API et rappelle quoi vérifier, et comment revenir en arrière ;
#   8. RECENSE les données avant et après (ADR 0033) — incidents, unités, hôpitaux,
#      abris, morgues, zones, messages, comptes… — et signale tout ce qui manquerait.
#
# Les comptes et le domaine vivent dans les volumes Docker, pas dans le dossier
# du paquet : remplacer le code ne les touche pas. Relançable : chaque étape
# constate ce qui est déjà fait.
# Si PowerShell refuse le script : Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# ============================================================================
param(
  [Parameter(Mandatory = $true)][string]$Current,
  [string]$Backups = "",
  [switch]$SkipBackup
)
$ErrorActionPreference = "Stop"
# Les scripts du paquet ont pu arriver marqués « vient d'Internet » (zip téléchargé) :
# on retire la marque des voisins pour que les scripts appelés ensuite passent.
Get-ChildItem -Path $PSScriptRoot -Filter *.ps1 | Unblock-File -ErrorAction SilentlyContinue
$new = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$newEnv = Join-Path $new ".env"
$newVersionFile = Join-Path $new "VERSION"

function Step([string]$n, [string]$msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok([string]$msg) { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "    !   $msg" -ForegroundColor Yellow }

# --- 1. Préalables ------------------------------------------------------------
Step 1 "Préalables"
$engine = ""
try { $engine = (& docker version --format "{{.Server.Version}}" 2>$null) } catch { $engine = "" }
if (-not $engine -or $LASTEXITCODE -ne 0) {
  throw "Docker ne répond pas. Démarrez Docker Desktop, attendez « Engine running », puis relancez."
}
Ok "moteur Docker $engine"

if (-not (Test-Path $newVersionFile)) { throw "Ce dossier n'est pas le deploy\ d'un paquet : VERSION absent ($new)." }
$newVersion = (Get-Content $newVersionFile -Raw).Trim()
$images = @()
if (Test-Path (Join-Path $new "images")) { $images = @(Get-ChildItem -Path (Join-Path $new "images") -File | Where-Object { $_.Name -match "\.(tar|tar\.gz|tgz)$" }) }
if ($images.Count -eq 0) { throw "Aucune image dans $new\images : paquet incomplet, ou décompression interrompue." }
Ok "nouveau paquet : version $newVersion, $($images.Count) archive(s) d'images"

$Current = (Resolve-Path $Current).Path
$curEnv = Join-Path $Current ".env"
if (-not (Test-Path $curEnv)) { throw "Installation actuelle introuvable : pas de .env dans $Current (attendu : le dossier deploy\ de la station qui tourne)." }
$curVersion = "(inconnue)"
if (Test-Path (Join-Path $Current "VERSION")) { $curVersion = (Get-Content (Join-Path $Current "VERSION") -Raw).Trim() }
if ($Current -eq $new) { throw "Le nouveau paquet a été décompressé PAR-DESSUS l'installation actuelle ($new). Décompressez-le dans un dossier à part (MISE-A-JOUR-STATION.md § 3) pour garder de quoi revenir en arrière." }
Ok "installation actuelle : $Current (version $curVersion) → $newVersion"

# --- 2. Sauvegarde ------------------------------------------------------------
Step 2 "Sauvegarde de l'installation actuelle"
if ($SkipBackup) {
  Warn "sauvegarde SAUTÉE à votre demande (-SkipBackup) : aucun retour en arrière possible par restore.ps1"
} else {
  $backupScript = Join-Path $Current "scripts\backup.ps1"
  if (-not (Test-Path $backupScript)) { throw "backup.ps1 absent de $Current\scripts : sauvegardez à la main (README § 12) ou relancez avec -SkipBackup." }
  # backup.ps1 s'arrête sur la première erreur (throw) : si l'on passe la ligne
  # suivante, la sauvegarde est faite — on n'installe rien sans elle.
  if ($Backups) { & $backupScript -Dest $Backups } else { & $backupScript }
  Ok "sauvegarde faite (notez l'horodatage affiché : c'est lui que restore.ps1 demande)"
}

# --- 3. Réglages : le .env actuel est repris ----------------------------------
Step 3 "Réglages (.env)"
if (Test-Path $newEnv) {
  $same = (Get-FileHash $newEnv -Algorithm SHA256).Hash -eq (Get-FileHash $curEnv -Algorithm SHA256).Hash
  if ($same) { Ok ".env déjà repris (identique à l'actuel)" }
  else { throw "Un .env DIFFÉRENT de l'actuel existe déjà dans $new. Supprimez-le (ou remplacez-le par une copie de $curEnv) puis relancez : les secrets doivent rester les mêmes, sinon la base n'est plus joignable et tout le monde est déconnecté." }
} else {
  Copy-Item $curEnv $newEnv
  Ok ".env repris depuis l'installation actuelle (AUTH_DEV_SECRET, POSTGRES_PASSWORD, port, HTTPS, fond de carte)"
}
# --- 3 bis. Le fond de carte est celui du PAQUET, pas de l'ancien .env --------
# Le mode carte est figé dans l'image web du paquet (en ligne : MAP_TILES=external ;
# hors ligne « -souv » : sovereign). Un .env repris d'une station en ligne dirait
# encore « external » : le profil des tuiles ne partirait pas et install.ps1
# n'importerait pas les tuiles embarquées. On aligne donc MAP_TILES, le profil
# Compose `sovereign` et l'URL Valhalla sur le paquet, en gardant tout le reste
# (secrets, port, HTTPS, autres profils comme public-quick). Ainsi passer d'une
# station en ligne à la version hors ligne — ou l'inverse — est le même geste.
$example = Join-Path $new ".env.example"
function Get-KeyValue([string]$file, [string]$key) {
  $line = Get-Content $file | Where-Object { $_ -match "^\s*$key=(.*)$" } | Select-Object -Last 1
  if ($line -and $line -match "^\s*$key=(.*)$") { return $Matches[1].Trim() }
  return $null
}
if (Test-Path $example) {
  $packageMap = Get-KeyValue $example "MAP_TILES"
  $currentMap = Get-KeyValue $newEnv "MAP_TILES"
  if ($packageMap -and $currentMap -ne $packageMap) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $content = [System.IO.File]::ReadAllText($newEnv, $utf8)
    function Set-Key([string]$key, [string]$value) {
      if ($script:content -match "(?m)^\s*$key=.*$") { $script:content = $script:content -replace "(?m)^\s*$key=.*$", "$key=$value" }
      else { $script:content = $script:content.TrimEnd() + "`r`n$key=$value`r`n" }
    }
    Set-Key "MAP_TILES" $packageMap
    $profiles = @(((Get-KeyValue $newEnv "COMPOSE_PROFILES") -split ",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne "sovereign" })
    if ($packageMap -eq "sovereign") { $profiles += "sovereign" }
    Set-Key "COMPOSE_PROFILES" ($profiles -join ",")
    if ($packageMap -eq "sovereign") { Set-Key "VALHALLA_TILE_URLS" "" }
    elseif (-not (Get-KeyValue $newEnv "VALHALLA_TILE_URLS")) { Set-Key "VALHALLA_TILE_URLS" (Get-KeyValue $example "VALHALLA_TILE_URLS") }
    [System.IO.File]::WriteAllText($newEnv, $content, $utf8)
    Ok "fond de carte aligné sur le paquet : MAP_TILES=$packageMap (COMPOSE_PROFILES=$($profiles -join ','))$(if ($packageMap -eq 'sovereign') { ' — les tuiles embarquées seront importées par install.ps1' })"
  }
}
# Les nouveaux réglages ont des défauts ; on signale seulement ceux qui manquent.
if (Test-Path $example) {
  $known = @(Get-Content $newEnv | Where-Object { $_ -match "^\s*([A-Z_]+)=" } | ForEach-Object { ($_ -split "=", 2)[0].Trim() })
  $missing = @(Get-Content $example | Where-Object { $_ -match "^\s*([A-Z_]+)=" } | ForEach-Object { ($_ -split "=", 2)[0].Trim() } | Where-Object { $known -notcontains $_ })
  if ($missing.Count -gt 0) { Warn ("réglages nouveaux, laissés à leur défaut : " + ($missing -join ", ") + "  (voir .env.example pour les changer)") }
}

# --- 4. Arrêt de l'ancienne pile, volumes intacts -----------------------------
Step 4 "Arrêt de l'ancienne pile (les volumes restent)"
& docker compose --project-directory $Current down --remove-orphans
if ($LASTEXITCODE -ne 0) { throw "docker compose down a échoué dans $Current" }
Ok "ancienne pile arrêtée — aucun volume supprimé"

# --- 5. Les volumes sont là ---------------------------------------------------
Step 5 "Volumes des comptes et de la base"
$volumes = @(& docker volume ls -q)
foreach ($v in @("iris_api_data", "iris_db_data")) {
  if ($volumes -contains $v) { Ok "$v présent" } else { throw "Volume $v ABSENT : on n'installe pas par-dessus une station dont les données ont disparu. Restaurez d'abord (restore.ps1) ou vérifiez le nom du projet compose (docker volume ls)." }
}

# --- 5 bis. Recensement des données, AVANT (ADR 0033) ------------------------
# La pile est arrêtée : les instantanés du volume sont dans leur état final. Le
# recensement lit le volume en LECTURE SEULE avec l'image de l'API (Node) — ni
# compte, ni réseau, ni écriture — et compte chaque collection.
$censusLabels = [ordered]@{
  incidents = "incidents"; subIncidents = "sous-incidents"; actionsLog = "actions entreprises"; victims = "victimes"
  units = "unités"; hospitals = "hôpitaux"; fieldHospitals = "hôpitaux de campagne"; wards = "services"; shelters = "abris"
  morgues = "sites mortuaires"; mortuaryRecords = "dossiers mortuaires"; equipment = "équipements"; posts = "postes sur la carte"
  drawings = "zones et croquis"; simulations = "simulations"; channels = "canaux"; messages = "messages"; attachments = "pièces jointes"
  users = "comptes"; missions = "missions"; orders = "bons de travail"; persons = "personnels"; teams = "équipes"
  vehicles = "véhicules"; supplies = "logistique"; incidentTypes = "types d'incident ajoutés"; trackers = "traceurs"
}
function Get-Census {
  $census = Join-Path $PSScriptRoot "census.js"
  if (-not (Test-Path $census)) { return $null }
  try {
    $json = Get-Content $census -Raw | & docker run --rm -i -v iris_api_data:/data:ro iris-api:latest node - 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $json) { return $null }
    return (($json | Out-String) | ConvertFrom-Json)
  } catch { return $null }
}
function Format-Census($c) {
  return (@($censusLabels.Keys | Where-Object { [int]$c.$_ -gt 0 } | ForEach-Object { "$($censusLabels[$_]) $([int]$c.$_)" }) -join " · ")
}
Step "5 bis" "Recensement des données (avant)"
$before = Get-Census
if ($before) {
  Ok ("avant : " + (Format-Census $before))
  try { ($before | ConvertTo-Json -Compress) | Set-Content -Path (Join-Path $new "census-avant.json") -Encoding UTF8 } catch { }
} else {
  Warn "recensement impossible (image iris-api:latest absente ?) — la comparaison de l'étape 8 sera sautée"
}

# --- 6. Installation du nouveau paquet ----------------------------------------
Step 6 "Installation du paquet $newVersion (images, .env conservé, démarrage)"
& (Join-Path $PSScriptRoot "install.ps1")

# --- 7. Contrôle --------------------------------------------------------------
Step 7 "Contrôle"
function Get-EnvValue([string]$file, [string]$key, [string]$default) {
  $line = Get-Content $file | Where-Object { $_ -match "^\s*$key=(.*)$" } | Select-Object -Last 1
  if ($line -and $line -match "^\s*$key=(.*)$") { return $Matches[1].Trim() }
  return $default
}
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
if ((Get-EnvValue $newEnv "COMPOSE_FILE" "") -match "https|letsencrypt") {
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
  $p = [int](Get-EnvValue $newEnv "HTTPS_PORT" "443"); $url = if ($p -eq 443) { "https://localhost" } else { "https://localhost:$p" }
} else {
  $p = [int](Get-EnvValue $newEnv "HTTP_PORT" "80"); $url = if ($p -eq 80) { "http://localhost" } else { "http://localhost:$p" }
}
$health = $null
try { $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 10 } catch { }
if ($health -and $health.status -eq "ok") {
  Ok ("API en ligne — mode " + $health.appMode + ", version " + $newVersion)
} else {
  Warn "l'API ne répond pas encore : .\scripts\status.ps1 puis docker compose logs api --tail 50"
}

# --- 8. Rien n'a disparu (ADR 0033) ------------------------------------------
Step 8 "Données : rien ne doit avoir disparu"
$lost = @()
if ($before) {
  $after = $null
  # La nouvelle API relit ses instantanés au démarrage : on lui laisse le temps.
  for ($i = 0; $i -lt 6 -and -not $after; $i++) { Start-Sleep -Seconds 5; $after = Get-Census }
  if ($after) {
    foreach ($k in $censusLabels.Keys) {
      $a = [int]$before.$k; $b = [int]$after.$k
      if ($b -lt $a) { $lost += "$($censusLabels[$k]) : $a → $b" }
    }
    if ($lost.Count -eq 0) {
      Ok ("données intactes — " + (Format-Census $after))
    } else {
      Write-Host "    !!  DES DONNÉES MANQUENT APRÈS LA MISE À JOUR :" -ForegroundColor Red
      foreach ($l in $lost) { Write-Host "        $l" -ForegroundColor Red }
      Write-Host "        Ne travaillez pas sur la station : revenez en arrière (ci-dessous) et signalez-le." -ForegroundColor Red
    }
  } else {
    Warn "recensement après mise à jour impossible : comparez à la main avec census-avant.json ($new)"
  }
} else {
  Warn "pas de recensement avant la mise à jour : comparaison sautée"
}

Write-Host @"

  Mise à jour $curVersion → $newVersion terminée. À vérifier maintenant dans le navigateur ($url) :
    1. se connecter avec un compte EXISTANT (pas le fondateur) : la connexion prouve que les comptes sont repris ;
    2. Gestion des utilisateurs : la liste est intacte ;
    3. Hospinet / OPSnet / Ressources : les entités créées avant la mise à jour sont là ;
    4. Paramètres › Profil de données : mode « Opérationnel ».

  Revenir en arrière (si quelque chose ne va pas) :
    cd $new ; docker compose --project-directory . down          (sans -v)
    cd $Current ; .\scripts\install.ps1                          (recharge les anciennes images, mêmes volumes)
    et, si les données avaient été modifiées à tort : .\scripts\restore.ps1 -Stamp <horodatage de l'étape 2>

"@
