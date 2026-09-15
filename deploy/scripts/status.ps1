# ARGOS / IRIS — état de la station : services, santé, tuiles, volumes
$compose = Join-Path $PSScriptRoot "..\docker-compose.yml"
docker compose -f $compose ps
Write-Host "`nSanté de l'API :"
try { (Invoke-WebRequest -UseBasicParsing "http://localhost/api/health").Content } catch { Write-Host "  injoignable : $_" }
# Tuiles : seulement en fond de carte souverain (MAP_TILES dans .env) ; en
# externe, le navigateur appelle les fournisseurs et la station n'en sert pas.
$envFile = Join-Path $PSScriptRoot "..\.env"
$mapMode = "external"
if (Test-Path $envFile) {
  $mapLine = Get-Content $envFile | Where-Object { $_ -match "^\s*MAP_TILES=(\w+)" } | Select-Object -Last 1
  if ($mapLine -and $mapLine -match "^\s*MAP_TILES=(\w+)") { $mapMode = $Matches[1] }
}
if ($mapMode -eq "sovereign") {
  Write-Host "`nCatalogue des tuiles :"
  try { (Invoke-WebRequest -UseBasicParsing "http://localhost/tiles/").StatusCode } catch { Write-Host "  injoignable : $_" }
  Write-Host "`nTuiles provisionnées :"
  docker compose -f $compose run --rm tiles-fetch status
} else {
  Write-Host "`nFond de carte : externe (Esri/Maxar, OpenStreetMap, relief en ligne) — pas de serveur de tuiles sur la station."
}
Write-Host "`nVolumes :"
docker system df -v | Select-String "iris_"
