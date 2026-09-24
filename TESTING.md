# AuraMind — Testing Runbook

Everything below was executed and verified on 2026-09-21 (see "Verified
today" at the bottom). Windows is the test environment; commands run from
the repo root unless noted.

---

## 1. Fast lane (code health) — ~2 min

```powershell
cd auramind-gemini
npm run type-check   # tsc --noEmit
npm run lint         # eslint
npm test -- --run    # vitest: 57 files / 484 tests
```

## 2. Web E2E (Playwright) — ~5 min

```powershell
# one-time per session: start the dev stack
powershell -ExecutionPolicy Bypass -File .\dev-api-3002.ps1     # API on 3002
powershell -ExecutionPolicy Bypass -File .\dev-web-3001.ps1     # Vite on 3001, proxies /api -> 3002

cd auramind-gemini
npx playwright test e2e/landing-aurora.spec.ts e2e/layout.spec.ts e2e/smoke.spec.ts   # public, no seeding
npx playwright test e2e/aurora.spec.ts          # seeded; needs root .env service key
npx playwright test e2e/onboarding.spec.ts e2e/spark.spec.ts e2e/android-shell.spec.ts
```

Notes:
- The config's `webServer` reuses an already-running 3001 server (or starts
  its own), so the launchers are optional for the public specs — but the
  seeded specs need the real API on 3002, so start both.
- Seeded specs mint real `e2e-*` accounts with the service-role key from the
  root `.env` and delete them afterwards; without the key they skip.
- Playwright must run Windows-side: WSL2 cannot reach Windows loopback
  services (NAT + firewall), so a WSL-side run sees no server at all.

## 3. Android on the emulator — ~10 min (first build)

```powershell
cd auramind-gemini
npm run build:apk:debug        # vite mobile build + cap sync + gradle (~10 min cold)

# boot a device (any AVD works; Medium_Phone is the usual)
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone &

# install + launch + attach the debugger
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb install -r android\app\build\outputs\apk\debug\app-debug.apk
& $adb shell am start -n com.auramind.app.debug/com.auramind.app.MainActivity
$p = & $adb shell pidof com.auramind.app.debug
& $adb forward tcp:9222 localabstract:webview_devtools_remote_$p
# now: chrome://inspect -> the WebView, or Playwright connectOverCDP(9222)
```

Honesty check (per the HANDOFF stale-worker trap): the APK's bundle must be
today's build. Compare chunk hashes:

```bash
grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' auramind-gemini/android/app/src/main/assets/public/index.html
grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' auramind-gemini/dist/index.html
# identical hash = the device runs this build, not a cached old one
```

Drive the emulator by URL, not taps — blind taps on a live account deleted a
card once (HANDOFF). Emulator ports shift across reboots; re-check
`adb devices` instead of trusting 5554/5556.

## 4. What can't be tested locally (human steps in HANDOFF)

- Real push delivery — needs `google-services.json` + `FCM_*` (sender is
  built and fails closed without them)
- AI voices — needs Orpheus model terms accepted in the Groq console
- Turnstile-protected sign-in — the E2E seeders bypass CAPTCHA by design;
  one manual `auramind.app/auth` sign-in covers it
- Play release — console publish + testers

## Verified today (2026-09-21)

| Check | Result |
|---|---|
| `type-check` / `lint` (Windows) | green |
| `npm test -- --run` (Windows) | 57 files / 484 tests passed |
| Playwright public specs (landing-aurora, layout, smoke) | 18/18 |
| Playwright seeded specs (aurora, onboarding, spark, android-shell) | 13/13, incl. aurora parallax measured on a real seeded session |
| Debug APK build (Vite → Capacitor → gradle) | 82 MB app-debug.apk |
| Emulator (Medium_Phone) install + launch | pid live, WebView at /dashboard |
| Stale-worker honesty check | chunk hashes match the fresh build |
