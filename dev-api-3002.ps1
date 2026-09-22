# AuraMind dev API on port 3002 — companion to the Vite server on 3001.
# (E2E layout per HANDOFF: API on 3002, Vite proxy pointed at it, so the
# browser never dials Vite itself for /api.)
Set-Location (Join-Path $PSScriptRoot "api")
$env:PORT = "3002"
Write-Host "AuraMind API dev server -> http://127.0.0.1:3002" -ForegroundColor Cyan
npx tsx server.js
