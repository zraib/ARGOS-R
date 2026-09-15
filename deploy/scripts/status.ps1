# ARGOS / IRIS — état de la station : services, santé, tuiles, volumes
$compose = Join-Path $PSScriptRoot "..\docker-compose.yml"
docker compose -f $compose ps
Write-Host "`nSanté de l'API :"
try { (Invoke-WebRequest -UseBasicParsing "http://localhost/api/health").Content } catch { Write-Host "  injoignable : $_" }
Write-Host "`nCatalogue des tuiles :"
try { (Invoke-WebRequest -UseBasicParsing "http://localhost/tiles/").StatusCode } catch { Write-Host "  injoignable : $_" }
Write-Host "`nTuiles provisionnées :"
docker compose -f $compose run --rm tiles-fetch status
Write-Host "`nVolumes :"
docker system df -v | Select-String "iris_"
