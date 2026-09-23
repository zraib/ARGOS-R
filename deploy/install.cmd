@echo off
rem ARGOS / IRIS - installe la station (images, .env, tuiles embarquees, demarrage).
rem Lance scripts\install.ps1 en contournant la politique d'execution PowerShell :
rem les fichiers extraits d'un zip telecharge portent la marque "vient d'Internet"
rem et PowerShell refuse alors le script ("n'est pas signe numeriquement").
rem Le lanceur retire cette marque de tous les scripts du paquet, puis execute
rem le script avec -ExecutionPolicy Bypass (portee : cette commande seulement).
rem Les arguments sont transmis tels quels.
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%HERE%scripts' -Filter *.ps1 | Unblock-File -ErrorAction SilentlyContinue; Get-ChildItem -Path '%HERE%' -File | Unblock-File -ErrorAction SilentlyContinue"
rem Approuve une fois l'editeur IRIS (certificat du paquet) et verifie les signatures.
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%scripts\trust.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%scripts\install.ps1" %*
exit /b %ERRORLEVEL%
