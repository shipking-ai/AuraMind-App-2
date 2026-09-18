# Handoff — AuraMind 2.0.0

Written 2026-09-09, updated 2026-09-18. Context for continuing this work in another tool.

Read `CLAUDE.md` first for conventions, then `ARCHITECTURE.md` for structure.
This file covers only what those two don't: current state, what's left, and
the traps that cost real time.

---

## Where things stand

| | |
|---|---|
| Version | 2.0.0 (root, app and Android now agree) |
| Play | versionCode 7, closed testing (Alpha), **submitted for review 2026-09-16** |
| Branch | `main`; open PRs: #68 (Dependabot, test tooling), #78 (test polyfill for #68) |
| CI | Node **22 + 24** (20 dropped, EOL); required checks still list `build-and-test (20.x)` until changed in repo settings |
| Migrations | all applied, through `20260917000000_league_weekly_xp_atomic` |

---

## Outstanding — human, not code

1. **Required status checks.** GitHub → Settings → Branches → `main`: replace
   `build-and-test (20.x)` with `build-and-test (24.x)`. Until then every PR
   shows BLOCKED waiting for a check that no longer runs.
2. **Play closed test.** Version 7 was sent for review. Target audience must
   be **13+** (the Terms say 13+; ticking under-13 pulls in the Families
   policy). Advertising ID: **No** (none in the merged manifest). Once
   approved, 12+ testers must stay opted in for **14 continuous days** before
   *Apply for production* unlocks. Voice features (#77 and the listening
   branch) reach testers only in the next build (versionCode 8+).
3. **www.auramind.app certificate expired 2026-08-19.** DNS is correct
   (CNAME to Vercel, no CAA, Let's Debug passes); the apex is fine. Fix in
   Vercel → project → Settings → Domains: re-add `www.auramind.app` as a
   redirect to the apex.
4. **Stripe live smoke.** One real checkout. It starts a 7-day trial, so the
   first charge lands after the trial.
5. **Confirm sign-in works** at auramind.app/auth in a real browser. Automated
   browsers can't reach `challenges.cloudflare.com`, so they always show
   "Couldn't load the verification check".

After the first publish, `status=completed` in the release workflow makes a
dispatch go live without a console visit.

---

## Outstanding — code

Nothing is broken. These are the next things worth doing, roughly in order of
value:

- **Voice study listening on Android** (PR from `feat/android-speech-recognition`).
  Android WebView has no `SpeechRecognition`, so spoken answers never worked
  in the app. `AuraListenPlugin` wraps `SpeechRecognizer`;
  `services/voice/nativeRecognition.ts` presents it in the Web Speech shape so
  `useVoiceStudy` is unchanged. Verified on the emulator: Android's mic prompt
  appears, *Don't allow* surfaces as `not-allowed`, and after allowing,
  loudness streams and silence ends with `no-speech`. **Still needs one phone
  test with a real spoken answer**, since the emulator mic can't be fed audio.
- **Dependabot #68** (jsdom 30, vitest 5, jest-dom 7) passes once #78 is
  merged and #68 is rebased (`@dependabot rebase`, not a plain re-run).

- **Push sender.** `push_tokens` fills as devices opt in, but no server sends
  FCM messages yet and no `google-services.json` is configured.
- **Aurora motion.** Scroll-reactive chrome (elevating top bar, hide-on-scroll
  nav) is in; the aurora and prism are still a static gradient and a slow drift.
- **`anon` EXECUTE on RPCs** is revoked, but `authenticated` can still call 14
  SECURITY DEFINER functions. That's by design — those are the app's own RPCs
  and each guards itself with `auth.uid()` — but it's worth re-reading if the
  threat model changes.
- **Leaked-password protection** is a Supabase Pro feature. Not an oversight.
- **Tests on Node 25+.** Node's own `localStorage` global shadows jsdom's;
  `src/test/setup.ts` restores it. CI runs Node 22/24 and never hits this.

---

## Traps

Each of these cost real time. None are obvious from the code.

### `verify_jwt: true` does not mean "signed-in users only"

It only checks that the caller presents *a* valid JWT, and the public anon key
shipped in the web bundle is one. On 2026-09-14 eleven legacy edge functions
were deleted after an audit found open relays among them: `send-email` sent
arbitrary HTML from `hello@auramind.app` to anyone, `auth_send_email_hook`
accepted the hard-coded secret `testsecret123`, and `chat-stream` proxied the
Groq key with no auth at all. None were called by the app. Sources are backed
up outside the repo in `edge-function-backups-2026-09-14/`.

A function that must not be public checks the user itself
(`auth.getUser(token)`) or a shared secret, and fails closed when that secret
is unset.

### Android WebView has no Web Speech API at all

`window.speechSynthesis` and `SpeechRecognition` are both `undefined` inside
the Capacitor app, while the same code works in Chrome. Every voice feature
was silent on Android until 2026-09-17. All speaking now goes through
`services/voice/speechOutput.ts` (native `AuraSpeechPlugin` on Android, Web
Speech elsewhere). Don't call `window.speechSynthesis` directly.

Related native traps:
- TextToSpeech and SpeechRecognizer need `<queries>` entries for
  `TTS_SERVICE` / `RecognitionService` on Android 11+, or they initialise with
  no engine and fail silently.
- A `BroadcastReceiver` may not bind services, so `SpokenReminderReceiver`
  creates TextToSpeech with the *application* context.
- `am force-stop` wipes the app's alarms. To test a reminder "with the app
  closed", use `am kill` after pressing Home.
- Exact alarms aren't granted by default on Android 14+; the spoken reminder
  falls back to an inexact alarm (up to about a minute late), like the
  notification it accompanies.

### Required checks are named after the CI matrix

Branch protection lists checks by job name, e.g. `build-and-test (22.x)`.
Changing the Node matrix renames the jobs, and the old name then blocks every
PR forever. Change the matrix and the protection rule together.

### Weekly XP is written only by `increment_weekly_xp`

`league_memberships` has no insert/update policy on purpose: users could set
their own XP with one PostgREST call. Write through the RPC, which adds the
delta once in a single atomic upsert (the earlier version double-counted).

### realtime-notify is gated by a Vault secret

`broadcast_user_notification()` reads `realtime_notify_secret` from Vault and
sends it as `x-webhook-secret`; the function compares it with
`REALTIME_WEBHOOK_SECRET` and returns 503 if that is missing. Rotating it means
updating both, Vault first. See
`supabase/migrations/20260914000000_realtime_notify_secret.sql`.

### The service worker served the previous release's JavaScript

Fixed in `697d2b0e`, but understand it before touching PWA config.

Capacitor serves from `https://localhost` — an origin that never changes
between releases — and worker registrations live in `app_webview/Default/`,
which survives `install -r` and Play updates. The workbox precache covered
`index.html`, so a still-registered old worker answered navigations from its
own cache and booted the *previous* build.

This is why a "verified on device" claim can be false. **A fix I confirmed
working was running the previous bundle entirely.** If a change doesn't appear
on device, compare the built index chunk hash against the loaded one before
assuming the code is wrong.

The worker is now web-only and actively unregistered on native.

### Entitlement has no fallback, deliberately

`api/_lib/entitlement.ts` reads `subscription_status` from `app_metadata` only.
Adding a `user_metadata` fallback "for compatibility" reintroduces a paywall
bypass: `auth.updateUser` lets any signed-in user write `user_metadata`
directly. There is a regression test asserting the forged value is ignored.

### Play burns a versionCode permanently

`versionCode` comes from `github.run_number`, which is monotonic. Don't
hardcode it, and don't "reset" it.

### A draft app only accepts draft releases

Until one release is published by hand, Play rejects any other status:
*"Only releases with status draft may be created on draft app."* The workflow
takes a `status` input defaulting to `draft`.

### RemoteViews has a view whitelist

The widget layout must use only `LinearLayout`, `RelativeLayout`,
`FrameLayout`, `GridLayout`, `TextView`, `ImageView`, `Button`, `ProgressBar`
and friends. A bare `<View>` makes the *entire* layout fail to inflate — the
picker shows a grey placeholder and the launcher says "Couldn't add widget",
with nothing in the app logs.

### framer-motion owns `style.transform`

It composes `transform` from the values it manages, so an inline
`style={{ transform: ... }}` on a `motion.div` is silently overwritten. Pass
the value to `animate`/`initial` instead. This made the flipped card render
its answer mirrored.

### Flex items default to `min-width: auto`

They refuse to shrink below their content, which is how the chat header ran
past the viewport on 412px phones. `min-w-0` is the fix — but it must go on
whichever ancestor is actually overflowing, and icon buttons inside need
`shrink-0` or they squash instead.

### Reminders need `repeats: true`

Capacitor treats a `schedule.on` pattern as one-shot unless the flag is set.
Everything looks healthy — permission granted, notifications pending — and the
reminder simply fires once and never again.

---

## Environment quirks (this machine)

- **Bash heredocs strip backslashes.** Writing JS/YAML with regexes or Windows
  paths through a heredoc silently corrupts them. Use an editor tool instead.
- **Git Bash rewrites absolute paths.** `adb shell ls /data/...` becomes
  `C:/Program Files/Git/data/...`. Prefix with `MSYS_NO_PATHCONV=1`.
- **PowerShell has no `&&`.** Use `;` or separate commands.
- **The Supabase MCP connection is read-only.** Writes go through PostgREST
  with the service-role key from the root `.env`, or through
  `npm run migrate`. The linked CLI works for reads and rolled-back tests:
  `npx supabase@latest db query --linked -f file.sql -o json`.
- **Claude Code's auto mode blocks** `gh pr merge` on unreviewed PRs,
  branch-protection edits and production migrations. Those are done by hand
  (or allowed in permission settings).

---

## Verifying Android changes

The emulator plus CDP is the fastest honest loop. Screenshots alone hide
plenty — the mirrored card and the collapsed layout both looked fine until
measured.

```bash
# build, install, launch
cd auramind-gemini
npm run build:apk:debug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.auramind.app.debug/com.auramind.app.MainActivity

# attach a real debugger to the WebView
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.auramind.app.debug)
```

Then drive it with Playwright over `connectOverCDP('http://127.0.0.1:9222')`,
or evaluate directly over the page's `webSocketDebuggerUrl` (from
`curl localhost:9222/json`) to call plugins, e.g.
`window.Capacitor.Plugins.AuraSpeech.speak({ text: 'hi' })`. Audio can't be
heard, but `adb shell dumpsys audio` lists the playing track and its usage.
Navigate by URL rather than tapping coordinates — blind taps on a live account
deleted a card during this work.

The emulator's `system_server` died once mid-session and took the app with it.
If everything fails at once with `DeadSystemException`, it's the emulator, not
the app.

---

## What changed recently

`git log --oneline -20` covers it, but the themes:

- **Security** — paywall bypass (entitlement moved to `app_metadata`), the
  client bundle publishing every `VITE_` var, `anon` EXECUTE on SECURITY
  DEFINER functions, `card_analytics` leaking across users
- **Silent failures** — rate limiting never awaited, reminders firing once,
  the service worker serving stale code. All three looked healthy from outside
- **Android design** — an editorial token layer over the drifted platform CSS,
  de-boxed home and library, real type scale
- **Native** — haptics on the study loop, home-screen widget, one loading
  screen instead of two, reminders synced at app start

---

## 2026-09-14 - prod-hardening pass (traps that cost real time)

- **Phantom deps hide behind hoisting.** `api/index.ts` imported `zod`
  without declaring it; it resolved from `C:/Users/<you>/node_modules`
  on dev machines while CI `npm ci` failed with TS2307. A dep audit that
  regenerates the lockfile will silently drop such entries. When CI fails
  on a module that works locally, check `require.resolve` paths before
  anything else - and beware user-level `node_modules` above the repo.
- **Turnstile defeats `networkidle`.** The widget holds a
  `challenges.cloudflare.com` blob connection open indefinitely, so
  `page.waitForLoadState("networkidle")` never fires on `/auth` (worse
  in sandboxed networks where the challenge fetch hangs). Assert layout
  with `domcontentloaded` plus locator waits instead.
- **Fresh e2e profiles trip one-time UI.** Playwright starts with empty
  storage, so the consent banner renders over visual baselines. Ambient
  chrome (banner, boot loader) belongs behind the `/__e2e` harness flag,
  not dismissed per-spec.
- **Sticky `getLaunchUrl()` + fresh `useNavigate` identity.** Capacitor
  returns the launch intent URL for the process lifetime, and this RR
  build returns a new `navigate` every render - so any effect dep on
  `[navigate]` re-applies the boot route after every navigation (~79ms
  later, measurable as a second pushState). Deep-link effects mount once
  (`[]`) and read route/navigate through refs. Verified live: the bounce
  reproduces only in deep-link-launched processes.
- **`UNIQUE(card_id)` vs window readers.** If a table is read by time
  window (session replay) but written latest-only (upsert), re-grades
  silently migrate rows out of old windows. Match the write shape to the
  read shape; use a `(user, card, timestamp)` key for idempotent retry.
- **Emulator ports shift on restart.** After a reboot 5556 was gone and
  the phone reappeared as 5554 - always re-check `adb devices` plus
  `getprop ro.product.model` instead of trusting remembered ports.
