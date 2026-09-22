# AuraMind web (Vite) on port 3001, /api proxied to the API on 3002.
# Uses 127.0.0.1, not localhost: vite binds ::1 only on this machine and
# Node resolves localhost IPv6-first, which kills every proxied call.
Set-Location (Join-Path $PSScriptRoot "auramind-gemini")
$env:VITE_API_PROXY_TARGET = "http://127.0.0.1:3002"
Write-Host "AuraMind web -> http://localhost:3001  (API proxy -> 127.0.0.1:3002)" -ForegroundColor Cyan
npm run dev -- --port 3001
