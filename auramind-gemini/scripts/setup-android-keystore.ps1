<#
.SYNOPSIS
  Android keystore setup for AuraMind.
  - Generates a debug keystore for development builds.
  - Documents the production keystore generation steps.

.DESCRIPTION
  Run this script once after cloning the repo or when the debug keystore is missing.
  Production keystores should be generated manually and kept in a secure location
  (never committed to git).

.PARAMETER KeystoreDir
  Directory where keystore files will be placed. Default: android/keystore
#>

param(
  [string]$KeystoreDir = "android\keystore"
)

$ErrorActionPreference = "Stop"

# Resolve paths relative to the repo root (where this script lives)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path "$ScriptDir\.."
$TargetDir = Join-Path -Path $RepoRoot -ChildPath $KeystoreDir

# ---------------------------------------------------------------------------
# 1.  Create keystore directory (gitignored by default)
# ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $TargetDir)) {
  New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
  Write-Host "[✓] Created keystore directory: $TargetDir"
} else {
  Write-Host "[i] Keystore directory already exists: $TargetDir"
}

# Add .gitignore to the keystore directory so secrets are never committed
$gitignorePath = Join-Path -Path $TargetDir -ChildPath ".gitignore"
if (-not (Test-Path -LiteralPath $gitignorePath)) {
  Set-Content -Path $gitignorePath -Value "*" -Encoding ASCII
  Write-Host "[✓] Added .gitignore to keystore directory"
}

# ---------------------------------------------------------------------------
# 2.  Debug keystore — for development / CI debug builds
# ---------------------------------------------------------------------------
$debugKeystore = Join-Path -Path $TargetDir -ChildPath "debug.keystore"

if (-not (Test-Path -LiteralPath $debugKeystore)) {
  Write-Host "[.] Generating debug keystore ..."

  # The alias, storepass, and keypass below are WELL-KNOWN defaults used by
  # Android Studio and Gradle.  They are safe for debug builds.
  & keytool -genkey -v -keystore $debugKeystore `
    -alias androiddebugkey `
    -storepass android `
    -keypass android `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -dname "CN=Android Debug, O=Android, C=US"

  if ($LASTEXITCODE -eq 0) {
    Write-Host "[✓] Debug keystore created at: $debugKeystore"
    Write-Host "    Alias       : androiddebugkey"
    Write-Host "    StorePass   : android"
    Write-Host "    KeyPass     : android"
  } else {
    Write-Host "[!] keytool failed.  Ensure the JDK is on your PATH."
    Write-Host "    You can also generate the keystore manually via Android Studio:"
    Write-Host "    Build → Generate Signed Bundle / APK → Create new..."
  }
} else {
  Write-Host "[i] Debug keystore already exists: $debugKeystore"
}

# ---------------------------------------------------------------------------
# 3.  Production keystore — for release builds going to Google Play
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════"
Write-Host "  PRODUCTION KEYSTORE — DO NOT COMMIT TO GIT"
Write-Host "═══════════════════════════════════════════════════════════════════"
Write-Host ""
Write-Host "When you are ready to publish to Google Play, generate a production"
Write-Host "keystore using keytool (example command below).  Keep this file"
Write-Host "BACKED UP and SECURE — losing it means you cannot upload updates."
Write-Host ""
Write-Host "  keytool -genkey -v -keystore android/keystore/release.keystore ^"
Write-Host "    -alias auramind-release ^"
Write-Host "    -keyalg RSA -keysize 2048 -validity 10000"
Write-Host ""
Write-Host "Keep these in a password manager (1Password / Bitwarden):"
Write-Host "  • Keystore file        → android/keystore/release.keystore"
Write-Host "  • Keystore password    → (strong, unique)"
Write-Host "  • Key alias            → auramind-release"
Write-Host "  • Key password         → (strong, unique)"
Write-Host ""
Write-Host "After generating, update the signing config in:"
Write-Host "  capacitor.config.ts  (android.buildOptions)"
Write-Host "  android/app/build.gradle (signingConfigs.release)"
Write-Host ""
Write-Host "See docs/M6-store-submission-playbook.md for the full publishing guide."

# ---------------------------------------------------------------------------
# 4.  Update capacitor.config.ts with debug keystore path
# ---------------------------------------------------------------------------
$capConfig = Join-Path -Path $RepoRoot -ChildPath "capacitor.config.ts"
if (Test-Path -LiteralPath $capConfig) {
  $content = Get-Content -Path $capConfig -Raw
  # Replace the undefined buildOptions with debug keystore defaults
  $newContent = $content -replace `
    '(keystorePath: )undefined',
    '`$1"android/keystore/debug.keystore"'
  $newContent = $newContent -replace `
    '(keystoreAlias: )undefined',
    '`$1"androiddebugkey"'
  $newContent = $newContent -replace `
    '(keystorePassword: )undefined',
    '`$1"android"'
  $newContent = $newContent -replace `
    '(keyPassword: )undefined',
    '`$1"android"'
  Set-Content -Path $capConfig -Value $newContent -Encoding UTF8 -NoNewline
  Write-Host ""
  Write-Host "[✓] Updated capacitor.config.ts with debug keystore defaults"
}

Write-Host ""
Write-Host "Setup complete.  Run 'npm run build:android' to build a release APK/AAB."
