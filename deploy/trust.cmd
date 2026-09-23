@echo off
rem ARGOS / IRIS - approuve l'editeur des scripts de la station (certificat IRIS,
rem deploy\certs\iris-signature.cer) et verifie la signature de chaque script.
rem En administrateur : pour toute la machine, sans question ; sinon pour
rem l'utilisateur courant (Windows demande de confirmer : repondre Oui).
rem Ensuite les scripts .ps1 du paquet s'executent sans contournement, meme
rem extraits d'un zip telecharge. install.cmd et upgrade.cmd le font deja.
rem Options :  -Replace  (changement de cle assume)   -NoPrompt  (sans dialogue)
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%scripts\trust.ps1" %*
exit /b %ERRORLEVEL%
