@echo off
rem ARGOS / IRIS - restauration.
rem Lance scripts\restore.ps1 en contournant la politique d'execution PowerShell :
rem les fichiers extraits d'un zip telecharge portent la marque "vient d'Internet"
rem et PowerShell refuse alors le script ("n'est pas signe numeriquement").
rem Le lanceur retire cette marque de tous les scripts du paquet, puis execute
rem le script avec -ExecutionPolicy Bypass (portee : cette commande seulement).
rem Les arguments sont transmis tels quels :  upgrade.cmd -Current C:\iris\deploy
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%HERE%scripts' -Filter *.ps1 | Unblock-File -ErrorAction SilentlyContinue; Get-ChildItem -Path '%HERE%' -File | Unblock-File -ErrorAction SilentlyContinue"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%scripts\restore.ps1" %*
exit /b %ERRORLEVEL%
