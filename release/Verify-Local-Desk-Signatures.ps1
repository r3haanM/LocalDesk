# Local Desk v1.0.3 - Windows Authenticode Signature & SHA-256 Verification Script
param(
  [switch]$RequireValidSignature = $false
)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SetupCandidate = Join-Path $ScriptDir "Local-Desk-Setup-1.0.3-x64.exe"
$LocalExeCandidate = Join-Path $ScriptDir "Local Desk.exe"
$InstalledExeCandidate = Join-Path $env:LOCALAPPDATA "Programs\LocalDesk\Local Desk.exe"
$InstalledUninstCandidate = Join-Path $env:LOCALAPPDATA "Programs\LocalDesk\Uninstall Local Desk.exe"

$Targets = @()
if (Test-Path -LiteralPath $SetupCandidate) { $Targets += $SetupCandidate }
if (Test-Path -LiteralPath $LocalExeCandidate) { $Targets += $LocalExeCandidate }
if (Test-Path -LiteralPath $InstalledExeCandidate) { $Targets += $InstalledExeCandidate }
if (Test-Path -LiteralPath $InstalledUninstCandidate) { $Targets += $InstalledUninstCandidate }

if ($Targets.Count -eq 0) {
  Write-Error "No Local Desk executables found to verify in $ScriptDir or %LOCALAPPDATA%\Programs\LocalDesk."
  exit 1
}

$AnyFailed = $false
foreach ($FilePath in $Targets) {
  Write-Host "=================================================================="
  Write-Host "Inspecting File: $FilePath"
  $HashObj = Get-FileHash -LiteralPath $FilePath -Algorithm SHA256
  $VerInfo = (Get-Item -LiteralPath $FilePath).VersionInfo
  $Sig = Get-AuthenticodeSignature -LiteralPath $FilePath

  Write-Host "  SHA-256 Checksum   : $($HashObj.Hash.ToLower())"
  Write-Host "  Product Name       : $($VerInfo.ProductName)"
  Write-Host "  Product Version    : $($VerInfo.ProductVersion)"
  Write-Host "  Publisher Metadata : $($VerInfo.CompanyName)"
  Write-Host "  Signature Status   : $($Sig.Status)"
  Write-Host "  Status Message     : $($Sig.StatusMessage)"

  if ($Sig.SignerCertificate) {
    Write-Host "  Signer Subject     : $($Sig.SignerCertificate.Subject)"
    Write-Host "  Signer Issuer      : $($Sig.SignerCertificate.Issuer)"
    Write-Host "  Cert Thumbprint    : $($Sig.SignerCertificate.Thumbprint)"
    Write-Host "  Valid From / To    : $($Sig.SignerCertificate.NotBefore) -> $($Sig.SignerCertificate.NotAfter)"
  } else {
    Write-Host "  Signer Certificate : None (Unsigned Binary)"
  }

  if ($Sig.TimeStamperCertificate) {
    Write-Host "  Timestamp Authority: $($Sig.TimeStamperCertificate.Subject)"
  } else {
    Write-Host "  Timestamp Authority: None"
  }

  if ($RequireValidSignature -and ($Sig.Status -ne 'Valid')) {
    Write-Error "FAIL: Production signature verification failed for $FilePath (Status: $($Sig.Status))"
    $AnyFailed = $true
  }
}

if ($AnyFailed) {
  exit 1
}
Write-Host "=================================================================="
Write-Host "Verification completed."
