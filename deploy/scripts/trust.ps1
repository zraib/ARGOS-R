# ============================================================================
# ARGOS / IRIS — approuver l'éditeur des scripts de la station (ADR 0031)
#
# Les scripts PowerShell du paquet sont signés (Authenticode) par le certificat
# « IRIS Station - Signature des scripts », livré dans deploy\certs\
# iris-signature.cer. Pour que Windows les exécute sans contournement — même
# extraits d'un zip téléchargé (« n'est pas signé numériquement ») —, ce
# certificat doit figurer parmi les Autorités de certification racines de
# confiance ET les Éditeurs approuvés. Ce script :
#   1. l'y ajoute, une fois : pour toute la machine en administrateur (sans
#      question), sinon pour l'utilisateur courant (Windows demande alors de
#      confirmer l'ajout : répondre Oui) ;
#   2. ne remplace JAMAIS en silence un certificat IRIS déjà approuvé par un
#      autre : un paquet signé par une autre clé est signalé (-Replace pour
#      assumer un changement de clé) ;
#   3. vérifie la signature de chaque script du paquet et dit ce qu'il en est.
# Appelé par install.cmd et upgrade.cmd ; relançable seul (trust.cmd). Il ne
# bloque rien : les lanceurs .cmd exécutent les scripts dans tous les cas.
#
#   .\trust.cmd [-Replace] [-NoPrompt]
# ============================================================================
param(
  [switch]$Replace,
  [switch]$NoPrompt
)
$ErrorActionPreference = "Stop"
$deploy = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cerPath = Join-Path $deploy "certs\iris-signature.cer"

function Ok([string]$msg) { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "    !   $msg" -ForegroundColor Yellow }
function Info([string]$msg) { Write-Host "        $msg" }

Write-Host "`nSignature des scripts (éditeur IRIS)" -ForegroundColor Cyan
if (-not (Test-Path $cerPath)) {
  Warn "aucun certificat dans ce paquet (deploy\certs\iris-signature.cer) : scripts non signés — les lanceurs .cmd les exécutent quand même."
  exit 0
}
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList $cerPath
$thumb = $cert.Thumbprint
Info "certificat : $($cert.Subject)"
Info "empreinte  : $thumb (valable jusqu'au $($cert.NotAfter.ToString('dd/MM/yyyy')))"

function Open-Store([string]$name, [string]$location, [string]$mode) {
  $loc = [System.Security.Cryptography.X509Certificates.StoreLocation]$location
  $s = New-Object System.Security.Cryptography.X509Certificates.X509Store -ArgumentList $name, $loc
  $s.Open([System.Security.Cryptography.X509Certificates.OpenFlags]$mode)
  return $s
}
# Les certificats IRIS (même sujet) d'un magasin.
function Find-Iris([string]$name, [string]$location) {
  $s = Open-Store $name $location "ReadOnly"
  try { return @($s.Certificates | Where-Object { $_.Subject -eq $cert.Subject }) } finally { $s.Close() }
}
function Add-ToStore([string]$name, [string]$location) {
  $s = Open-Store $name $location "ReadWrite"
  try { $s.Add($cert) } finally { $s.Close() }
}
function Remove-FromStore([string]$name, [string]$location, $old) {
  $s = Open-Store $name $location "ReadWrite"
  try { $s.Remove($old) } finally { $s.Close() }
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$where = if ($admin) { "LocalMachine" } else { "CurrentUser" }

# --- 1. état des magasins ----------------------------------------------------
$trusted = @{}
$others = @()
foreach ($store in "Root", "TrustedPublisher") {
  $found = @(Find-Iris $store "LocalMachine") + @(Find-Iris $store "CurrentUser")
  $trusted[$store] = @($found | Where-Object { $_.Thumbprint -eq $thumb }).Count -gt 0
  $others += @($found | Where-Object { $_.Thumbprint -ne $thumb })
}

# --- 2. approbation ----------------------------------------------------------
if ($trusted["Root"] -and $trusted["TrustedPublisher"]) {
  Ok "éditeur IRIS déjà approuvé sur cette station"
} elseif ($others.Count -gt 0 -and -not $Replace) {
  $old = ($others | Select-Object -ExpandProperty Thumbprint -Unique) -join ", "
  Warn "un AUTRE certificat IRIS est déjà approuvé ici (empreinte $old) : ce paquet est signé par une autre clé."
  Warn "rien n'est ajouté. Vérifier l'origine du paquet ; si le changement de clé est voulu : .\trust.cmd -Replace"
} else {
  try {
    if ($Replace) {
      # Changement de clé assumé : l'ancien éditeur IRIS n'est plus approuvé là où on le peut.
      foreach ($store in "Root", "TrustedPublisher") {
        foreach ($loc in @("CurrentUser") + @(if ($admin) { "LocalMachine" })) {
          foreach ($o in @(Find-Iris $store $loc | Where-Object { $_.Thumbprint -ne $thumb })) { Remove-FromStore $store $loc $o }
        }
      }
    }
    if (-not $trusted["TrustedPublisher"]) { Add-ToStore "TrustedPublisher" $where }
    $rootOk = $trusted["Root"]
    if (-not $rootOk) {
      if (-not $admin -and ($NoPrompt -or -not [Environment]::UserInteractive)) {
        Warn "racine de confiance non ajoutée (session sans dialogue) : lancer trust.cmd en administrateur."
      } else {
        if (-not $admin) { Info "Windows va demander de confirmer l'installation du certificat (empreinte $thumb) : répondre Oui." }
        Add-ToStore "Root" $where
        $rootOk = $true
      }
    }
    if ($rootOk) {
      Ok ("éditeur IRIS approuvé — " + $(if ($admin) { "pour toute la machine" } else { "pour l'utilisateur courant" }))
    }
  } catch {
    Warn "approbation non faite : $($_.Exception.Message)"
    Warn "les lanceurs .cmd exécutent quand même les scripts ; relancer trust.cmd (en administrateur : sans question)."
  }
}

# --- 3. vérification des signatures ------------------------------------------
$files = @(Get-ChildItem -Path $PSScriptRoot -Recurse -File -Include *.ps1, *.psm1, *.psd1)
$problems = @()
foreach ($f in $files) {
  $sig = Get-AuthenticodeSignature -FilePath $f.FullName
  $status = [string]$sig.Status
  if ($status -eq "Valid" -and $sig.SignerCertificate.Thumbprint -eq $thumb) { continue }
  $why = switch ($status) {
    "NotSigned" { "non signé" }
    "HashMismatch" { "MODIFIÉ depuis sa signature — ne pas l'exécuter sans savoir pourquoi" }
    "Valid" { "signé par un autre éditeur : $($sig.SignerCertificate.Subject)" }
    default { "signature intacte, éditeur pas encore approuvé ici ($status)" }
  }
  $problems += "$($f.Name) : $why"
}
if ($problems.Count -eq 0) {
  Ok "$($files.Count) script(s) : signature valide, éditeur IRIS"
} else {
  foreach ($p in $problems) { Warn $p }
}
exit 0
