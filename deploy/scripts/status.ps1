# ARGOS / IRIS — état de la station : services, santé, tuiles, volumes
# Sans `-f` : docker compose lit COMPOSE_FILE dans .env (HTTPS activé ou non — README § 11).
$deploy = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
docker compose --project-directory $deploy ps
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
$envFile = Join-Path $deploy ".env"
$url = Get-StationUrl $envFile
Write-Host "`nSanté de l'API ($url) :"
try { (Invoke-WebRequest -UseBasicParsing "$url/api/health").Content } catch { Write-Host "  injoignable : $_" }
# Tuiles : seulement en fond de carte souverain (MAP_TILES dans .env) ; en
# externe, le navigateur appelle les fournisseurs et la station n'en sert pas.
$mapMode = "external"
if (Test-Path $envFile) {
  $mapLine = Get-Content $envFile | Where-Object { $_ -match "^\s*MAP_TILES=(\w+)" } | Select-Object -Last 1
  if ($mapLine -and $mapLine -match "^\s*MAP_TILES=(\w+)") { $mapMode = $Matches[1] }
}
if ($mapMode -eq "sovereign") {
  Write-Host "`nCatalogue des tuiles :"
  try { (Invoke-WebRequest -UseBasicParsing "$url/tiles/").StatusCode } catch { Write-Host "  injoignable : $_" }
  Write-Host "`nTuiles provisionnées :"
  docker compose --project-directory $deploy run --rm tiles-fetch status
} else {
  Write-Host "`nFond de carte : externe (Esri/Maxar, OpenStreetMap, relief en ligne) — pas de serveur de tuiles sur la station."
}
Write-Host "`nVolumes :"
docker system df -v | Select-String "iris_"
