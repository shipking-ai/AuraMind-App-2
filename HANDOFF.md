# Handoff — BonaMind 2.0.0

Written 2026-09-09; updated 2026-09-28 (FSRS scheduler repair, the iPhone app, one special capability per platform, a sideloadable IPA, Live Activity in CI, the admin oracle closed), 2026-10-11 (the native Expo app, part 1, and the shared `@bonamind/core`), and 2026-10-12 (every claim re-verified against the code; the stale rows below corrected, the PR list refreshed, the BonaMind rebrand and the community tab recorded). Context for continuing this work in another tool.

Read `CLAUDE.md` first for conventions, then `ARCHITECTURE.md` for structure.
This file covers only what those two don't: current state, what's left, and
the traps that cost real time.

---

## Where things stand

| | |
|---|---|
| Version | 2.2.0 (root, app, Android and Wear agree; Windows reads it from `auramind-gemini/package.json`). 2.2.0 carries the rename and the Windows layout; it is the first BonaMind Windows release (tag `desktop-v2.2.0` once #180 merges). The `desktop-v2.1.0` draft (old layout) was never published and can be deleted. Play's versionCode 14 still says 2.0.0 |
| Play | versionCode 14 (the BonaMind rename, built after #172 and #176), closed testing (Alpha), **rolled out and sent for review 2026-10-16** together with the BonaMind listing |
| Branch | `main` at `707f6fc7` (2026-10-16, through #177: rename PR4, brand guard and docs — the BonaMind rename is done; #176 the Gradle heap fix). Repo renamed to `shipking-ai/BonaMind` 2026-10-13 |
| CI | Node **22 + 24** (20 dropped, EOL); required checks are `build-and-test (22.x)` and `(24.x)` |
| Migrations | all applied through `20260925_close_admin_oracle.sql` (verified live 2026-09-28); merged since: `20260929_cards_rls_owner_and_deck.sql` (#116) and `20260930_marketplace_fork_and_listing.sql` (#137) — **live application of those two not re-verified** |
| iOS | builds and screenshots in CI (`mobile-ios.yml`); unsigned device IPA on demand; **never run on a real phone yet** |
| Native app | `mobile/` (Expo SDK 57, RN 0.86) + `packages/core` (`@bonamind/core`). Part 1 merged (#156) and runs in Expo Go on a real iPhone; unsigned IPA built on `main` 2026-10-12. Part 2 (create a course on the phone) merged (#164). See the 2026-10-11 and 2026-10-12 sections |
| Tests | 137 files / 968 declared cases (734 unit, 155 API, 26 seeded Playwright, 53 in `packages/core`). The seeded e2e specs skip in CI — they mint real accounts with the service-role key, which CI does not have |

---

## Outstanding — human, not code

1. ~~**Required status checks.**~~ Done — `main` requires
   `build-and-test (22.x)` and `(24.x)`.
2. **Play closed test.** Version 7 was sent for review. Target audience must
   be **13+** (the Terms say 13+; ticking under-13 pulls in the Families
   policy). Advertising ID: **No** (none in the merged manifest). Once
   approved, 12+ testers must stay opted in for **14 continuous days** before
   *Apply for production* unlocks. Voice features (#77 and the listening
   branch) reach testers only in the next build (versionCode 8+).
3. ~~**www.bonamind.app certificate.**~~ Fixed — `www` serves a valid
   certificate (expires 2026-12-21, checked 2026-09-28) and 308-redirects to
   the apex.
4. **Stripe live smoke.** One real checkout. It starts a 7-day trial, so the
   first charge lands after the trial.
5. **Confirm sign-in works** at bonamind.app/auth in a real browser. Automated
   browsers can't reach `challenges.cloudflare.com`, so they always show
   "Couldn't load the verification check".
6. **Accept the Orpheus model terms** in the Groq console (org admin):
   console.groq.com/playground?model=canopylabs%2Forpheus-v1-english.
   Until then `/api/ai/speech` gets `model_terms_required` from Groq, answers
   503, and every AI voice silently falls back to the device voice. Orpheus is
   a Groq *preview* model (~$22 per 1M characters); if it is withdrawn, swap
   `SPEECH_MODEL`/`SPEECH_VOICES` in `api/_aiHandler.ts` and `AI_VOICES` in
   `src/services/voice/aiVoice.ts`.
7. **Put the iPhone build on a phone.** Everything iOS is CI-verified only.
   Run `mobile-ios.yml` (workflow_dispatch), download
   `bonamind-ios-unsigned-ipa`, sign it with Sideloadly and a free Apple ID —
   full steps under "Getting the app onto an iPhone from Windows" below. The
   three things that have never executed on hardware: Siri (`BonaMindIntents`),
   the Live Activity, and native dictation (`SFSpeechRecognizer`).
8. **Apple Developer Program ($99/yr) is the only way past the 7-day wall.**
   A free Apple ID signature expires weekly, allows 3 sideloaded apps, and
   grants no App Groups (so Home Screen widgets can't read the due count) and
   no APNs. Paying also unlocks TestFlight, where internal testers get builds
   without App Review. Nothing in the code depends on this; it's purely a
   distribution ceiling.
9. ~~**Merge PR #156 (native app, part 1).**~~ Merged 2026-10-12. All checks green; `main` needs one
   approving review and auto mode won't bypass it, so merge by hand (admin:
   "Merge without waiting for requirements", squash). `mobile-builds.yml` can
   only be dispatched once it is on `main`. Two more PRs are open and small —
   worth the same sitting: **#157** (the Live Activity update must be ordered
   after its start, iOS) and **#147** (Android release config hardening).
10. **Native app owner items** (none block merging):
    - ~~Supabase redirect URL `bonamind://auth/callback`~~ — added 2026-10-10.
    - ~~Expo account~~ — `shipking-ai`, signed in on the dev PC and in Expo Go.
    - E2E for `mobile-builds.yml`: secrets `E2E_EMAIL_IOS` and
      `E2E_EMAIL_ANDROID` (`SUPABASE_SERVICE_ROLE_KEY` already exists), two
      test accounts each with a course of 5+ cards.
    - Android continuity (the Expo app ships as `com.auramind.app` to replace
      the Capacitor build): upload the existing upload keystore to EAS and
      set `ANDROID_VERSION_CODE` above the last Play build.
    - Trademark search for "Linnea" before any store listing.
11. ~~**Apex redirect broke the apps' API calls.**~~ Fixed 2026-10-15.
    From 2026-10-11 Vercel 308-redirected `bonamind.app` to `www`; the
    Android release build and `.env.desktop` call `https://bonamind.app`, and
    a CORS preflight that gets a redirect fails (see the trap "A redirect on
    the API host breaks every app"). The redirect was removed (Vercel project
    `auramind-gemini` → Domains: `bonamind.app` now serves Production
    directly; `www.bonamind.app` serves too). Verified: preflights from
    `https://localhost` and `https://tauri.localhost` to both hosts answer
    204. **Don't re-add an apex↔www redirect** without moving every app's
    API host first. Both hosts serving means no canonical redirect for SEO;
    the code treats the apex as canonical (`api/_lib/origin.ts`
    `APP_ORIGIN`, `src/lib/branding.ts` `PRODUCT_SITE_URL`). The native Expo
    app calls `https://www.bonamind.app` (`EXPO_PUBLIC_API_BASE_URL`), which
    also works.
12. **Course creation on the phone (Part 2) needs the API deployed.** The app
    calls the new `/api/extract/document` and `/api/extract/image` endpoints on
    `www.bonamind.app`, so they work only after the Part 2 PR is merged and
    Vercel deploys. Photo reading uses Gemini when **`GEMINI_API_KEY`** is set,
    otherwise Groq's image model through the existing `GROQ_API_KEY` (default
    `qwen/qwen3.8-27b`, swap with `GROQ_VISION_MODEL`; Gemini's with
    `GEMINI_VISION_MODEL`). No new key is required.
    Then make one course from each source in Expo Go and check it appears on
    bonamind.app.
13. **BonaMind rename, owner steps** (spec
    `docs/superpowers/specs/2026-10-13-bonamind-rename-design.md`; all four
    PRs merged — #168, #170, #172, #177):
    - ~~Supabase redirect URL `bonamind://auth/callback`~~ — added. Keep the
      `auramind://auth/callback` entry: older Windows installs still send it. <!-- legacy-name: ok -->
    - **Play listing:** paste `store/android/listings/en-US/` (`title.txt`
      "BonaMind", `full_description.txt`) and
      `store/android/changelogs/en-US.txt`; replace the screenshots with
      `store/graphics/android/screenshots/` (five, from the real app) and the
      feature graphic with `store/graphics/android/feature-1024x500.png`.
    - ~~**Android:** ship the post-PR3 build~~ — versionCode 14 rolled out on
      Alpha and sent for review 2026-10-16 (the first two attempts ran out of
      Gradle heap, see the trap "Signing the release bundle needs a 4 GB
      heap"). Play warns that the bundle has native code without debug
      symbols: the native code is AndroidX's (`libdatastore_shared_counter.so`,
      `libandroidx.graphics.path.so`), not ours, so it only affects reading
      crashes inside those libraries. `ndk { debugSymbolLevel 'SYMBOL_TABLE' }`
      in the release build type would clear it on the next build.
    - **Windows:** ~~add `TAURI_SIGNING_PRIVATE_KEY`~~ (added 2026-10-16)
      and ~~bump the version~~ (2.2.0, with the Windows layout). Next: once
      #180 is on `main`, push the tag `desktop-v2.2.0`; `Desktop Windows`
      builds, signs and drafts the release. Review the draft, run
      `docs/windows-app-checklist.md` on a real PC, then publish. It is the
      first BonaMind Windows release (the only earlier one is the retired
      June AuraMind build). <!-- legacy-name: ok -->

After the first publish, `status=completed` in the release workflow makes a
dispatch go live without a console visit.

---

## Outstanding — code

Nothing is broken. These are the next things worth doing, roughly in order of
value:

- **iOS app — builds in CI, not yet signed.** `auramind-gemini/ios/` (Capacitor
  8, Swift Package Manager, generated on Windows — no CocoaPods). The
  `Mobile iOS` workflow builds it unsigned on a GitHub Mac, runs it in an
  iPhone simulator and uploads a screenshot. What differs from Android:
  - Both apps share the phone layout; `src/lib/platform.ts` gates the
    Android-only parts (spoken reminders, widgets, push for now).
  - Listening: WKWebView exposes `webkitSpeechRecognition` but it never
    returns results (WebKit bug 239816), so `BonaListenPlugin.swift`
    (SFSpeechRecognizer) is used; both apps now listen natively. App-local
    plugins register in `MainViewController.swift`. Needs a real iPhone to
    verify transcription.
  - Read-aloud uses WKWebView's `speechSynthesis`; AI voices play via `<audio>`.
  - API CORS: production sent none, so the apps' web views blocked API
    responses. `_middleware.ts` now allowlists the site, `https://localhost`
    (Android) and `capacitor://localhost` (iOS).
  - Payments: Stripe checkout opens in Safari (Capacitor sends outside links
    there), which Apple allows **on the US storefront only** (guideline
    3.1.1, May 2025). Other countries need In-App Purchase, so ship iOS
    US-only until that exists. The app re-checks the subscription on resume.
  - Push on iOS needs APNs (Apple Developer account) plus Firebase iOS
    config; until then `pushService` reports it unavailable.
  - Next: Apple Developer Program, then a signed TestFlight job.
- **Personal FSRS tuning needs rebuilding.** The scheduler now uses the
  official `ts-fsrs` (FSRS-6, long-term mode, whole-day intervals). The old
  hand-written scheduler made intervals ~140x too long (Hard could schedule
  36,500 days out); `20260922000000_fsrs_scheduler_repair.sql` reset the cards
  it had written. `fsrsAdaptation.ts` still tunes a 20-number vector for the
  old model, so `scheduleFSRS` ignores anything but a full 21-number FSRS-6
  vector — profile chips and the starting-difficulty nudge still work, but
  per-user weights do not affect intervals until the tuner is rebuilt on the
  FSRS-6 optimizer (`fsrs-rs` / its WASM build).

- **Voice study listening on Android** (merged in #79).
  Android WebView has no `SpeechRecognition`, so spoken answers never worked
  in the app. `BonaListenPlugin` wraps `SpeechRecognizer`;
  `services/voice/nativeRecognition.ts` presents it in the Web Speech shape so
  `useVoiceStudy` is unchanged. Verified on the emulator: Android's mic prompt
  appears, *Don't allow* surfaces as `not-allowed`, and after allowing,
  loudness streams and silence ends with `no-speech`. **Still needs one phone
  test with a real spoken answer**, since the emulator mic can't be fed audio.
- **Push sender — built, awaiting credentials.** Server sender, admin send
  endpoint, and daily due-card cron all shipped (see 2026-09-21 below);
  nothing delivers until the Firebase console steps at the end of that
  section are done (google-services.json + FCM_* env vars).
- **Aurora motion — shipped** (2026-09-21, below), dashboard shell, landing
  hero, and (same day) the Android focus aura (see bottom). Nothing remains
  in this theme.
- **Per-platform capabilities — shipped** (2026-09-22, below): Study Float
  (desktop PiP), Chrome built-in AI, the Windows 11 widget board, Android 16
  Live Updates, iOS Live Activity + Siri. Each is additive and invisible where
  unsupported. What's *not* done: none of the iOS half has run on hardware.
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
arbitrary HTML from `hello@bonamind.app` to anyone, `auth_send_email_hook`
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
`services/voice/speechOutput.ts` (native `BonaSpeechPlugin` on Android, Web
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

### Signing the release bundle needs a 4 GB heap

On 2026-10-15 the release build failed twice at `:app:signReleaseBundle`
with only "A failure occurred while executing
FinalizeBundleTask$BundleToolRunnable". `--stacktrace` (now always on in
`mobile-android.yml`) showed `java.lang.OutOfMemoryError: Java heap space`:
signing reads the whole bundle, which carries ~77 MB of web assets (about
50 MB of it the landing page's videos), and the 1.5 GB Gradle heap was no
longer enough. `gradle.properties` now sets `-Xmx4g`. The same build passes
locally, so a CI-only signing failure is this, not the keystore.

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

### `setRequestPromotedOngoing` is API 36.1, not 36

Android 16's promoted (Live Update) notifications look like one API level.
They aren't: `Notification.ProgressStyle` landed in 36, but
`setRequestPromotedOngoing` only exists in **36.1**, and compileSdk 36 rev 2
fails to compile a direct call. `BonaLiveUpdatePlugin.requestPromotion` calls
it reflectively and no-ops when absent, which also keeps the plugin working on
older Androids. If a platform method "should exist" and doesn't, check it with
`javap -classpath $ANDROID_HOME/platforms/android-36/android.jar` before
believing the docs.

### Document Picture-in-Picture needs a gesture and a real browser window

`documentPictureInPicture.requestWindow()` throws `NotAllowedError` without
user activation, so the Study Float button opens the window inside the click
handler — never after an await. The PiP document starts with no styles at all;
`copyStyles` clones every stylesheet in, and cross-origin sheets throw on
`cssRules`, so each one is copied inside its own try.

Embedded/automation browser panes **cannot host a PiP window** at all — it
fails with `InvalidStateError: Internal error: no window`. That is the harness,
not the feature. Verify the reviewer UI by mounting `FloatReviewer` at float
size in a normal page; the window itself needs a real Chrome or Edge.

### The Xcode project file is hand-maintained

There is no Mac here, so `ios/App/App.xcodeproj/project.pbxproj` is edited as
text. Every object needs a **globally unique 24-hex ID** — copying a nearby
block and keeping its IDs produces a project that still parses and then builds
the wrong file (this happened once with `AuraMindIntents.swift` inheriting <!-- legacy-name: ok -->
`MainViewController.swift`'s IDs). After any pbxproj edit, check: unique keys,
no reference to an undefined ID, balanced braces. CI is a slow way to find out.

### Free provisioning is why the Live Activity uses `pushType: nil`

`Activity.request(..., pushType: nil)` is the only mode a free Apple ID can
sign: a push token needs an APNs entitlement that personal teams don't get.
Free accounts also have no App Groups, so anything that shares data between the
app and the widget extension silently reads nothing on a sideloaded build.
Keep the Live Activity's state flowing through ActivityKit in-process.

### iOS blocks plain HTTP, which breaks a LAN dev server silently

A live-reload IPA pointed at `http://192.168.x.x:3000` installs fine and then
shows a white screen — App Transport Security refuses the connection with
nothing in the UI. `mobile-ios.yml` adds `NSAllowsLocalNetworking` plus
`NSLocalNetworkUsageDescription` when the URL is `http://`. HTTPS needs
neither.

### A real `Cache` hands out a fresh `Response` for every match

A `Map`-based Cache stub does not: the second read gets a body that the first
already consumed, so the code under test sees an empty payload. A widget-worker
test failed this way and the bug was entirely in the stub. Store the body
*text* in the stub and build a new `Response` per match before suspecting the
worker.

### Green vitest does not mean green CI

`vi.fn()` with no type argument gives `mock.calls` an empty tuple type, so
indexing it is a type error that only `tsc` sees — the tests pass locally and
the PR fails on type-check. Run `npm run type-check` after *adding tests*, not
only after changing source.

### A root gesture recognizer eats every tap on iOS (native app)

`AuroraScreen` once wrapped the whole app in a `GestureDetector` with
`Gesture.Manual()` so the glow could follow the finger. On iOS that
recognizer begins on *every* touch, and UIKit then cancels the touch in the
view underneath: no `Pressable` fired and the Turnstile web view never got its
tap. Jest can't see this (gesture-handler is mocked); only a phone does. To
observe touches app-wide, use the passive `onTouchStart`/`onTouchMove` View
props, which never claim the responder. Keep real gestures (`CardStack`)
scoped to the view they belong to.

### `Stack.Protected` drops a redirect it refuses

`src/app/index.tsx` redirected to `/today` unconditionally. Signed out, the
guard refuses `/today` and the redirect is silently dropped, leaving the app
on the empty index route: aurora only, no sign-in. Redirect targets must be
chosen from the auth state.

### Turnstile retries itself; don't rebuild it on error

The widget's `error-callback` fires on transient failures that Turnstile then
retries (`retry: 'auto'`). Remounting the web view on each one made the check
flash and restart forever. Drop the token on error or expiry and keep the
widget; rebuild it only after a sign-in attempt has spent the single-use
token.

"Unable to connect to website" in the widget had two causes, fixed
2026-10-11:
- **Hostname allowlist.** The Turnstile widget in Cloudflare still listed the
  old domain after the move to `bonamind.app`. The native app's widget runs
  with `baseUrl: https://bonamind.app`, so that hostname must be allowed.
  Re-check this on any future domain change.
- **WebView allowlist.** react-native-webview checks `originWhitelist` on
  *every* navigation, iframes included, and only `about:blank` is implicitly
  allowed. Turnstile's challenge also uses `about:srcdoc`, which
  `['https://*']` refused. `allowTurnstileNavigation` in
  `mobile/src/auth/TurnstileGate.tsx` now decides each request instead.

### A cross-host redirect strips the API token (native app)

`https://bonamind.app/api/...` answers 308 to `www.bonamind.app`. Fetch
drops `Authorization` on a cross-origin redirect, and on the phone the
redirected streaming POST to `/api/ai/chat/stream` never answered: Prof.
Linnea sat on "Thinking…" forever. Point API clients at the host that serves
(`curl -sI https://bonamind.app/` shows which), never one that redirects.

### The AI proxy reports failures inside a 200 stream

When every provider fails, `api/_aiHandler.ts` still answers 200 and writes
`data: {"error": "..."}` then `[DONE]`. A client that reads only
`choices[0].delta.content` sees an empty reply. `streamLinnea` in
`packages/core` now throws `unavailable` on an in-stream error and `busy` on a
reply with no words; the app also abandons a reply that is silent for 30 s.

### `isFetchedAfterMount` can wait forever inside `staleTime`

The study screen waited for `isFetchedAfterMount` so it would build the queue
from fresh data. With `staleTime: 30_000`, opening it within 30 s of Today's
fetch triggers no refetch, so the flag never turns true: a black screen.
Screens that need fresh data pass `{ refetchOnMount: 'always' }` to
`useCards` / `useFsrsProfile`, and the study screen falls back to the cached
copy after 6 s regardless.

### `formSheet` with detents collapses a flex layout (native app)

The Linnea chat was a react-native-screens `formSheet` with
`sheetAllowedDetents: [0.5, 1]` and a transparent background. On iOS the
column collapsed: the message list drew over the header, and Today showed
through the sheet. It is now `presentation: 'modal'` (an iOS page sheet) with
its own night background and aurora. Re-test layout on a device before going
back to detents.

### A swipe that "does nothing" on the study card (native app)

Three separate causes, all fixed 2026-10-12. Check all three before blaming
gesture-handler:
- **A scroll view inside the card.** Each face's text sits in a `ScrollView`
  so long cards can scroll. On iOS a scroll view that can scroll *or bounce*
  claims the drag before the card's `Gesture.Pan` sees it. `FaceBody` in
  `CardStack.tsx` enables scrolling and bouncing only when the text overflows.
- **Swiping the question.** Swipes rate only after the answer is shown, so a
  swipe on the question rubber-banded back. That read as broken. A full
  swipe on the question now flips the card. It still never rates a card whose
  answer hasn't been seen.
- **Waiting on the save.** `StudyScreen` awaited the outbox write before
  re-rendering, so a slow or failing SQLite write held the next card back.
  `session.rate` advances the queue synchronously; the screen now re-renders
  first and awaits the save after, reporting a failure to Sentry.

### Two Turnstile site keys are in circulation

`mobile-android.yml` and `mobile-ios.yml` hardcode one public Turnstile site
key for the Capacitor builds (`0x4AAAAAAAEsHm7dsqEhBi3Nr`).
`auramind-gemini/.env` holds a different one. The native app (`mobile/.env.local`, copied
from that `.env`) signs in successfully with the `.env` key, so
`mobile-builds.yml` now uses that one too (2026-10-12). Whether the Capacitor
key is stale is unverified. If the Capacitor apps' human check fails, compare
it with the key in the Cloudflare dashboard. A key whose widget lacks the
app's hostname shows "Unable to connect to website".

### The dependency audit fails PRs that didn't touch dependencies

`Dependency audit (prod deps, critical gate)` runs `npm audit --omit=dev
--audit-level=critical` for `auramind-gemini/` and `api/` on every PR. A newly
published critical advisory therefore fails whichever PR runs next, whatever
that PR changed. On 2026-10-12 it was `proxy-addr` ≤ 2.0.7 (GHSA-jqcg-44mw-7w3h),
pulled in through Express in both packages (shadcn → MCP SDK → express on the
website). `npm audit fix` (never `--force`) in the failing package, then run
the type-check, tests and build.

### Don't roll back the rename's storage migration; roll forward

Once the PR1 web deploy has run on a browser, that browser's settings,
saved chats and local XP live under `bonamind…` keys only. A Vercel instant
rollback to an older build would read the old `auramind…` keys, find nothing, <!-- legacy-name: ok -->
and show every returning user default settings: theme, consent banner, an
empty chat history. Rolling forward again doesn't recover what they changed
in between, because the migration's run-once marker is already set.

Queued offline reviews are safe either way. The IndexedDB move never deletes
a database and drains the old one again on every launch. If PR1's web build
misbehaves, ship a fix forward.

### The widget and Wear tile keep their pre-rename class names

Android finds a placed home-screen widget, and Wear OS an added tile, by the
class name registered in the manifest. `AuraMindWidgetProvider` and <!-- legacy-name: ok -->
`AuraMindTileService` are now empty subclasses of the `BonaMind*` classes. <!-- legacy-name: ok -->
**Never rename or delete them, and never register the BonaMind classes
instead.** That silently removes the widget or tile from every user's screen.
Code that asks Android about placed widgets or tiles must name the registered
class (`new ComponentName(context, AuraMindWidgetProvider.class)`, <!-- legacy-name: ok -->
`requestUpdate(AuraMindTileService::class.java)`). <!-- legacy-name: ok -->

### The old repo URL must never be reused

Installed Windows apps check `shipking-ai/AuraMind-App-2` for updates until <!-- legacy-name: ok -->
they update once. GitHub redirects that URL to `shipking-ai/BonaMind` only
while no repo of the old name exists. **Don't create a repo called
`AuraMind-App-2`.** <!-- legacy-name: ok -->

### Pre-rename names live in one web file

The rename to BonaMind moved every stored key from `auramind…` to <!-- legacy-name: ok -->
`bonamind…`. `auramind-gemini/src/lib/legacyNames.ts` is the **only** web
source file allowed to spell a pre-rename name, and
`src/__tests__/legacyStorageNames.test.ts` fails CI on any other. It holds the
migration's old prefix and the old link scheme. It also holds names that can
never change: `urn:auramind:classroom:*` (raised by an applied migration), the <!-- legacy-name: ok -->
Windows widget tag `auramind-due` (the widget board finds pinned widgets by <!-- legacy-name: ok -->
tag), and the owner's Google Group address. Don't "finish the rename" on
those. Other permanent names are listed in the spec's "What never changes"
table: `com.auramind.app`, the signing-key alias `auramind-upload`, the Wear
paths `/auramind/sync` and `/auramind/grade`, the notification channel
`auramind_study_session` and `auramind_biometric_creds`.

### A redirect on the API host breaks every app

The Android, iOS and Windows apps run the site from their own origin
(`https://localhost`, `capacitor://localhost`, `https://tauri.localhost`) and
call the API on another host. Every signed-in call carries an
`Authorization` header, so the web view first sends a CORS preflight
(`OPTIONS`), and **a preflight that gets any redirect fails** — the app
launches and looks fine, but AI, chat, Stripe and account calls all error.
So the host in `VITE_API_BASE_URL` (the Android release workflow,
`.env.desktop`) must answer directly. Check it with
`curl -X OPTIONS -H "Origin: https://localhost" -H "Access-Control-Request-Method: POST" -I https://<host>/api/ai/chat`:
204 is right, 30x is this trap. `desktopIdentity.test.ts` keeps the Windows
and Android hosts identical; the domain setting itself lives in Vercel.

### The brand guard (`scripts/check-brand.mjs`)

CI fails any line in a tracked file that says `AuraMind`, `auramind`, <!-- legacy-name: ok -->
`Prof. Aura` or `ProfAura` outside the allow-list (run it locally with <!-- legacy-name: ok -->
`node scripts/check-brand.mjs`). Permanent names (`com.auramind.app`, the <!-- legacy-name: ok -->
folder name, the signing alias, the Wear paths, applied migrations, …) are
allow-listed in the script, each with its reason. Code that exists to read
or accept an old name carries the marker `legacy-name: ok` in a comment on
the same line. Adding an allow-list entry is the owner's decision, never a
way to turn CI green; it needs a one-line reason and a test case in
`scripts/check-brand.test.mjs`.

### Full website suite timeouts on this PC

`npx vitest run` in `auramind-gemini/` on this machine sometimes ends with a
few "Test timed out" and "Worker forks emitted error" failures in different
files each run (androidNative, desktopShell, analyticsFunnel, realtimeE2E…).
Rerun the named files alone before suspecting a change. They pass alone, and
CI is the arbiter.

### `@types/jest` 30 breaks Jest 29's failure output

`jest-expo` runs Jest 29. `@types/jest@30` hoists `expect@30` and
`jest-message-util@30`, and any failing suite then prints only
`isError is not a function` with no assertion or stack. Keep `@types/jest` at
the version `npx expo install --check` expects (29.5.14 for SDK 57).

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
- **`npx expo login -b` crashes on Windows.** The CLI opens the URL with
  `cmd /c start`, which splits it at the first `&`, so the browser never opens
  and the callback server dies. Use plain `npx expo login` (username +
  password) or an `EXPO_TOKEN` access token.
- **Expo Go requires sign-in** on both the phone and the CLI before it will
  open a project ("You need to be signed in to Expo Go and Expo CLI").
- **`npx expo install` fails with `EALLOWSCRIPTS`** under this machine's npm
  allow-scripts policy. Use `npm install <pkg>@<version expo expects>`.
- **The iMac is a Late 2013 on Catalina** (Xcode 12.4 max) and cannot build
  the iOS app. iOS builds run on GitHub's macOS runners (or EAS).

---

## Running the seeded E2E specs locally

`onboarding.spec.ts` and `spark.spec.ts` mint real accounts with the
service-role key from the root `.env`; without it (CI) they skip. They need
the Vite dev server on 3001 (the spark force hook is dev-only) and the API
somewhere else — `auramind-gemini/.env` points the `/api` proxy at 3001, i.e.
at Vite itself, which hangs every API call. Run the API on 3002 and override
the proxy:

```bash
cd api && PORT=3002 npx tsx server.js
cd auramind-gemini && VITE_API_PROXY_TARGET=http://localhost:3002 npm run dev -- --port 3001
cd auramind-gemini && npx playwright test e2e/onboarding.spec.ts e2e/spark.spec.ts
```

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
adb shell am start -n com.bonamind.app.debug/com.bonamind.app.MainActivity

# attach a real debugger to the WebView
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.bonamind.app.debug)
```

Then drive it with Playwright over `connectOverCDP('http://127.0.0.1:9222')`,
or evaluate directly over the page's `webSocketDebuggerUrl` (from
`curl localhost:9222/json`) to call plugins, e.g.
`window.Capacitor.Plugins.BonaSpeech.speak({ text: 'hi' })`. Audio can't be
heard, but `adb shell dumpsys audio` lists the playing track and its usage.
Navigate by URL rather than tapping coordinates — blind taps on a live account
deleted a card during this work.

The emulator's `system_server` died once mid-session and took the app with it.
If everything fails at once with `DeadSystemException`, it's the emulator, not
the app.

---

## Verifying iOS changes (no Mac)

Everything iOS happens on GitHub's macOS runners via `.github/workflows/mobile-ios.yml`:

- **`ios-simulator`** — builds for the simulator, boots it, and screenshots
  the `/__preview/ios` tour. This is the fast loop: push, read the artifact.
- **`ios-device-ipa`** (workflow_dispatch) — builds `-sdk iphoneos` with
  `CODE_SIGNING_ALLOWED=NO`, asserts `App.app/PlugIns/BonaMindWidgets.appex`
  exists, and zips `Payload/` by hand into `BonaMind-unsigned.ipa`. It uses
  `build`, not `archive`: with signing off, archiving doesn't reliably place
  `App.app` in the `.xcarchive`.
  Optional `server_url` input rewrites `capacitor.config.json` to load the web
  app from a URL instead of its own bundle — the Expo-Go-shaped trick. Sideload
  once and every web change arrives with a pull-to-refresh; only Swift changes
  need a new IPA.

Swift that only CI compiles is still unverified behaviour. Compiling proves the
types line up and nothing else.

### Getting the app onto an iPhone from Windows

1. Run `mobile-ios.yml` (Actions → Run workflow), then
   `gh run download <id> -n bonamind-ios-unsigned-ipa -D <dir>`. `gh` unzips
   the artifact, so what lands is the real `.ipa`, ~70 MB.
2. Install **Sideloadly**. It needs Apple's own iTunes *and* iCloud from
   apple.com — the Microsoft Store versions don't expose the device.
3. Plug the phone in, trust the computer, drag the IPA into Sideloadly, enter
   the Apple ID, Start. **Leave "Remove app extensions" unchecked** — that
   checkbox strips the widget extension, i.e. the Live Activity.
4. On the phone: Settings → General → VPN & Device Management → the Apple ID →
   Trust. Until then launching fails with a vague "Untrusted Developer".

Signatures last **7 days** on a free account (re-run Sideloadly, or use AltStore
Classic which re-signs over Wi-Fi), 3 apps at a time, 10 app IDs per week — the
app plus its extension burn two per sideload.

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
- **Platform reach** — an iPhone app with its own design rather than a port,
  and one capability per platform that only that platform can offer (PiP float,
  on-device AI, Windows widget board, Live Updates, Live Activity + Siri)
- **Scheduling** — the FSRS implementation was arithmetically wrong and is now
  ts-fsrs; bad intervals in production were repaired by migration
- **Authorization** — the admin oracle (`is_admin(uuid)`) is closed to clients,
  and role and entitlement are read from `app_metadata` only
- **Identity** — the product is BonaMind now (#139, #143–#145, merged
  2026-10-04): the app name and the domain moved to bonamind.app through
  single-source-of-truth constants. `auramind` survives only where Play <!-- legacy-name: ok -->
  already keyed it — the Android package (`com.auramind.app`) and the CI
  artifact names (`auramind-ios-unsigned-ipa`). The Windows/`AuraMind-windows` <!-- legacy-name: ok -->
  checkouts predate this and still carry the old names.
- **Community tab** (#137) — browse and fork published decks, migration
  `20260930_marketplace_fork_and_listing.sql`.

---

## 2026-10-16 - Windows app: the look (paper, ink, index card)

The first Windows layout read as generic ("AI slop": rounded cards, violet
buttons everywhere). It now has a point of view, combining three directions
the owner picked from:

- **Structure from Windows itself:** a command bar on top (the page's main
  actions), details lists with columns (Course / Due / Cards / Last
  studied), a status bar at the bottom (streak, weekly recall, key hints).
- **Feel from paper and ink:** light mode is warm paper (`#f6f3ec`), dark
  mode a warm desk (`#262420`), not navy. Headlines and numbers use a serif
  (`--win-serif`, Georgia); rules instead of boxes; primary buttons are ink.
  Violet appears only as the marker on the current sidebar place and as
  link underlines.
- **The index card only where you study:** the session shows a ruled index
  card (red top line, blue rules); the question in the serif, the answer in
  a handwriting face (`Ink Free`, built into Windows). Text sits on the
  rules: they fall at 29px + 30n under a 44px header band, so the question
  starts 15px below it and every line is 30px.
- **Window frame:** the dark title bar is the desk colour (`#1f1d1a`) and
  the window background matches the theme (`#f6f3ec` / `#262420`, also the
  launch colour in `tauri.conf.json`).
- **Reused pages (Create, Linnea):** `windows-reused.css` turns gradient
  headline text into ink, removes violet glows, makes the violet action
  buttons ink, sets their headings in the serif, and pads them. Their
  violet selection tints remain until Phase 2 rebuilds them.
- The sidebar's "Create" is now **New course**; Today has no greeting.

## 2026-10-16 - Windows app: its own simple, Windows 11-style layout

Spec `docs/superpowers/specs/2026-10-16-windows-native-shell-design.md`,
plan `docs/superpowers/plans/2026-10-16-windows-native-shell.md`. The
Windows app no longer looks like the website in a window.

- **Where it lives:** `auramind-gemini/src/components/windows/`. Chosen the
  way the iPhone app is: `NovaDashboardShell` returns `WindowsShell` when
  `shouldUseWindowsShell(pathname)` (Windows app, not `/admin`), and
  `NovaHub` picks `WindowsToday` / `WindowsLibrary` / `WindowsSettings`;
  `StudyModePage` keeps the engine and draws `WindowsStudySession` /
  `WindowsStudyComplete` / `WindowsStudyEmpty` (`studyDesign()`).
  `/dashboard/study` redirects to Today on Windows.
- **Sidebar:** Today, Library, Create, Linnea, Classes (members only,
  `useClassMembership`), Settings. ☰ / Ctrl+B collapse it
  (`bonamind_win_sidebar`); under 900px it collapses without saving.
- **Theme:** on Windows the theme default is `system` and auto night mode is
  off (`themeDefaults()` in `lib/appPreferences.ts`), so the app follows
  Windows live. `desktop.applyTheme` sets the window theme and background,
  and the Rust command `set_title_bar_theme` recolours the title bar
  (`chrome.rs` `title_bar_colors`; light hands caption and text back to
  Windows). `tauri.conf.json` no longer forces `"theme": "Dark"`.
- **Styles:** `src/styles/windows.css` (variables, shell, building blocks)
  and `src/styles/windows-reused.css`, which re-maps the hard-coded dark
  colours of the reused Create, Linnea and Classes pages inside the shell.
  The chat's `android-chat-*` classes get `!important` overrides there
  because `platform-styles.css` repaints them navy with `!important`.
- **No custom cursor on Windows:** `CustomCursor` hid the Windows pointer
  (`cursor: none`); it now stays off in the Windows app.
- **Seeing it without the app or an account:** the dev-only route
  `/__e2e/windows?screen=today|library|session|answer|complete|settings|chat|create`
  renders the screens with sample data; `node scripts/capture-windows-screens.mjs`
  (in `auramind-gemini/`, with `npm run dev` running) screenshots them in
  light and dark into `.superpowers/windows-screens/` (git-ignored).
- **Trap — two key handlers:** `StudyModePage` has its own window keydown
  handler (Space flips, 1–4 rate). Any platform session screen that handles
  keys itself must switch it off, or Space flips twice (the answer never
  shows) and every grade is saved twice. It stands down when `windowsDesign`
  is true; `windowsStudyKeys.test.tsx` renders the real page to pin it.
- **Trap — don't pin the window theme for "System":** `getCurrentWindow().setTheme('dark')`
  makes Tauri set WebView2's `PreferredColorScheme`, after which
  `prefers-color-scheme` stops following Windows (the app followed only the
  first switch). `desktop.applyTheme(theme, followSystem)` passes `null`
  for System; only an explicit Light/Dark (or auto night mode) pins it.
- **Not done (Phase 2, once there is usage):** Windows-native Create and
  Prof. Linnea (they are the website pages, restyled), reminders inside the
  Windows Settings (it links to the full settings page), and the Study Float
  button (Document PiP needs a real browser window).

## 2026-10-15 - BonaMind rename, PR4: brand guard and docs (rename done)

- **Rename — done.** With this PR every surface, doc and workflow says
  BonaMind and Prof. Linnea; the old names survive only on the guard's
  allow-list or on lines marked `legacy-name: ok`.
- **Guard:** `scripts/check-brand.mjs` (+ `node:test` cases in
  `scripts/check-brand.test.mjs`), run in both required `build-and-test` CI jobs. See the trap
  "The brand guard".
- **Docs and URLs:** README, CLAUDE.md, ARCHITECTURE, CONTRIBUTING (clone
  `shipking-ai/BonaMind`), DEPLOYMENT, the issue-template links, root
  `package.json` repository/bugs, the iOS artifact names
  (`bonamind-ios-unsigned-ipa`, `bonamind-ios-live-reload-ipa`), the API's
  service name (`bonamind-api`) and export filename, and a CHANGELOG
  `### BonaMind rename` entry.
- **Fixed on the way:** `.env.desktop` called the retired domain, which now <!-- legacy-name: ok -->
  301s, so a Windows build made from it would have failed every signed-in
  API call (preflight + redirect; see the trap). It now uses the Android
  build's host. DEPLOYMENT.md named the updater key file wrongly.
- **README banner:** `docs/assets/banner.png` still showed the old wordmark
  (binary files are outside the guard's scan). It is now rendered from
  `banner.svg` by `auramind-gemini/scripts/render-banner.mjs` (Playwright,
  run on Windows for Segoe UI); edit the SVG, then re-run the script. The
  platform line now reads WEB · ANDROID · iOS · WINDOWS.
- **Owner decisions (2026-10-15):** `LICENSE` now names BonaMind as the
  product and mark (CogniVect and the terms unchanged), and `src/lib/seo.ts`
  no longer sets `twitter:site`/`twitter:creator` — there is no BonaMind
  account, and the old handle would point link previews at the old brand.

## 2026-10-14 - BonaMind rename, PR3: code names and bonamind:// links

- **Web.** The code names change, and `src/__tests__/codeNames.test.ts` enforces it:
  - `ProfAura*` → `ProfLinnea*`, `AuraChatMode` → `LinneaChatMode`; <!-- legacy-name: ok -->
  - the Capacitor plugins `AuraSpeech`/`AuraListen`/`AuraLiveActivity`/`AuraLiveUpdate`/`AuraDevice` → `Bona*`;
  - `auraAiService` → `bonaAiService`, `useAuraMind` → `useBonaMind`; <!-- legacy-name: ok -->
  - `components/auramind/` and `lib/auramind/` → `bonamind/`, and `public/auramind/` assets → `public/bonamind/`. <!-- legacy-name: ok -->
- **Android.** The plugin classes are now `Bona*`, and the widget resources are
  `bonamind_widget_info` and `widget_bonamind`. The widget's code moved to
  `BonaMindWidgetProvider` and the watch tile's to `BonaMindTileService`. The
  manifests still register **`.AuraMindWidgetProvider` and `.AuraMindTileService`**: <!-- legacy-name: ok -->
  empty stand-in subclasses that keep placed widgets and added tiles alive.
  `src/__tests__/androidIdentity.test.ts` pins this.
- **iOS.** The types, files, the widget extension folder and the target are all
  `BonaMind*`. `project.pbxproj` was edited by hand (object IDs unchanged), and
  `iosNativeSource.test.ts` now checks that every file it references exists.
  The unsigned build in `mobile-ios.yml` is the real check.
- **Windows.**
  - The crate is `bonamind-desktop` and the library `bonamind_desktop_lib`.
  - The installer's Explorer verb is `BonaMindVerb`, under the registry key `shell\BonaMind`.
  - The updater points at `shipking-ai/BonaMind`.
  - The identifier stays `com.auramind.app`.
- **Links.** Every surface now sends `bonamind://`: shortcuts, widget, tile,
  Live Update, Live Activity, Siri, push reminders and the Windows OAuth return.
  `src/__tests__/linkSenders.test.ts` enforces it. Everything still
  **accepts** `auramind://`. <!-- legacy-name: ok -->
- **Kept on purpose:**
  - the aura glow-effect names (`auraDepth`, `AndroidAura`, `VoiceAura`) and the "Aura Sans"/"Aura Script" typefaces;
  - the Wear data-layer paths, now `WEAR_SYNC_PATH`/`WEAR_GRADE_PATH` in `legacyNames.ts`. The sweep had renamed them, which would have broken phone↔watch sync.
- **Owner:** after merging, ship new Android and Windows builds.

## 2026-10-13 - BonaMind rename, PR2: Prof. Linnea and visible copy

- **The tutor is Prof. Linnea everywhere a person reads.** That covers chat,
  the iPhone and Android screens, the generator, settings, the legal pages, the
  AI system prompts, Android strings and shortcuts, and the store text. Where
  the old copy said plain "Aura", it now says "Linnea". The in-app copy uses no
  pronoun for her. The Play listing already said "she" for Prof. Aura, and that <!-- legacy-name: ok -->
  wording is kept.
- **Saved reminder lines map forward.** The spoken-reminder line a user picks
  is stored as its text. `currentReminderMessage` (`src/lib/reminderSchedule.ts`)
  shows and speaks a line saved as "Prof. Aura here…" (or with "AuraMind") in <!-- legacy-name: ok -->
  its current wording.
- **Every remaining "AuraMind" is now BonaMind:** <!-- legacy-name: ok -->
  - the HTML shell, the iOS permission strings and the Windows app description;
  - the payment emails (`api/stripe-webhook.ts`), the reminder push title, the
    `User-Agent` and the server logs.
  - The dashboard header and the loading screen built the wordmark from two
    spans (`Aura<span>Mind</span>`), so a plain text search never found them.
  - The watch app name, its complication and sync text, the Siri description,
    the Android eyebrows ("CREATE WITH LINNEA") and the Play description
    (its privacy link pointed at the dead `auramind.app`). <!-- legacy-name: ok -->
  - Art: the Windows installer sidebar (`generate-assets.ps1` →
    `nsis-sidebar.bmp`) and the Play feature graphic were regenerated.
  - **Play screenshots** are now real app screens. The old set was web pages
    and static mockups showing AuraMind. <!-- legacy-name: ok -->
    `scripts/capture-android-screenshots.mjs` drives a development debug build
    on an emulator through Chrome DevTools to each sample-data screen
    (`/__e2e/android?screen=…`). It captures them at 1080×1920 in demo mode.
    The harness now passes the real top-bar title (`AndroidMobileTopBar`
    `title`), which read "BONAMIND" there before. Rebuild with
    `npm run build:android` afterwards, so a direct Gradle build can't pick up
    the development bundle.
  - The landing page and share previews say "BonaMind builds your course".
    A first-time visitor hasn't met Prof. Linnea yet.
- **Avatar files:**
  - `public/favicons,logos/prof-aura-*` is now `prof-linnea-*`, and
    `scripts/generate-android-assets.mjs` reads the new names;
  - `store/graphics/prof-aura-variant-*` is now `prof-linnea-variant-*`.
- **Guards:**
  - `src/__tests__/visibleBrand.test.ts` fails on standalone "AuraMind", <!-- legacy-name: ok -->
    "Prof. Aura" or a standalone "Aura". Uses that never meant the tutor are <!-- legacy-name: ok -->
    kept on a short list, each with a reason: the font names, two music tracks,
    the focus-aura glow and the top league tier.
  - The web guard also scans the native code (Java, Kotlin, Swift, Rust), the
    watch app, the Windows asset script and the Play listing text. It catches
    all-caps forms and the dead `auramind.app` domain. <!-- legacy-name: ok -->
  - `api/tests/brandCopy.test.ts` does the same for the API.
- **Windows auto-update** now points at `shipking-ai/BonaMind` releases.
- **Unchanged:** stored chat history still says "Prof. Aura" where it was <!-- legacy-name: ok -->
  written that way. Code names (`ProfAura*`, `Aura*` plugins) change in PR3. <!-- legacy-name: ok -->

## 2026-10-13 - BonaMind rename, PR1: stored data moves to new names

Spec `docs/superpowers/specs/2026-10-13-bonamind-rename-design.md`; plan
`docs/superpowers/plans/2026-10-13-bonamind-rename.md` (PR1 = Tasks 1–6). The
GitHub repo is now `shipking-ai/BonaMind`; the old URL redirects.

- **Web storage.** `public/storage-migrate.js` is a classic script, loaded
  first in `index.html`, so it runs before every module. A first import in
  `index.tsx` would not, because the bundler runs shared chunks ahead of the
  entry. It moves every localStorage key that starts with `auramind` + <!-- legacy-name: ok -->
  `_ - . :` to `bonamind` + the same rest.
  - A key that already exists under the new name wins.
  - If a write fails, the old value goes back under its old name.
  - The marker `bonamind_storage_migrated_v1` is set only when every key moved.
  - Capacitor Preferences gets the async twin (`migrateLegacyKeysAsync`) from
    `NativeRuntime`. The code itself reads and writes only the new names.
- **Offline reviews.** `src/services/offline/offlineDb.ts` merges
  `auramind-offline` into `bonamind-offline`, by key and only where the key is <!-- legacy-name: ok -->
  missing, under a Web Lock. It then removes the copied records from the old
  database. It **never deletes a database**: a delete blocked by another tab
  stays queued, wipes the database when that tab closes and hangs every open
  behind it. That is how the first design lost every queued review.
- **Push taps.** `pushTapTarget` follows `bonamind://` and `auramind://` links <!-- legacy-name: ok -->
  through the deep-link allowlist.
- **Android.** `LegacyPrefs` moves `auramind_spoken_reminder` and the Wear <!-- legacy-name: ok -->
  `auramind_wear_grade_queue` on first read. `WidgetPrefs.read` lets the widget <!-- legacy-name: ok -->
  and Quick Settings tile fall back to the old key until the app has run once.
  CI now runs the phone app's JVM tests (`:app:testDebugUnitTest`).
- **Links.** Android, iOS, Windows, the web router and `POST /api/push/send`
  accept both `bonamind://` and `auramind://`. Everything still **sends** <!-- legacy-name: ok -->
  `auramind://` until PR3. <!-- legacy-name: ok -->
- **Also renamed.** The iOS Siri keys (`bonamind_widget_due`/`_deck`/
  `_pending_route`) and the `bonamind_ci_*` keys `mobile-ios.yml` reads. The
  `robots.txt` sitemap now points at `https://www.bonamind.app`.

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
- **IEEE negative zero breaks strict equality.** `0 * -0.08` is `-0`;
  vitest's `toBe(0)` (Object.is) and framer's transform serialization both
  distinguish it from `0`. Any `scroll * depth` helper must normalise
  (`y === 0 ? 0 : y`) or the static baseline won't be byte-identical.
- **Emulator ports shift on restart.** After a reboot 5556 was gone and
  the phone reappeared as 5554 - always re-check `adb devices` plus
  `getprop ro.product.model` instead of trusting remembered ports.

---

## 2026-09-18 - Classroom Portal

Student/teacher LMS-lite: create classes, join via a 6-char invite code or
deep link, assign decks/quizzes, per-student progress with most-missed terms.
Built on the Nova design system. Applied to the live project and verified
end-to-end (DB smoke + real-browser Playwright).

### What shipped

- **Migration** `supabase/migrations/20260919000000_classroom_portal.sql`:
  tables `classrooms`, `classroom_memberships`, `assignments`,
  `assignment_progress`; definer helpers `is_class_member` /
  `is_class_teacher`; RLS is client-read-only (`SELECT`), *every* write goes
  through a SECURITY DEFINER RPC; invite codes are `^[A-Z2-9]{6}$`.
- **App** routes `/dashboard/classes` and `/dashboard/classes/:id` (lazy in
  `NovaHub`), nav item in `NovaDashboardShell`, service layer
  `services/classroom/{classroom,assignment}Service.ts`, pure mappers in
  `lib/classroom/format.ts`, components `ClassProgress` + `AssignDeckModal`.
- **Tests** `src/__tests__/classroom.test.ts` (19) - mappers, due/percent
  math, join-code sanitation, error classification. Full suite 384 passing.

### How the security model works (keep it this way)

Roles are **class-scoped**; global `UserRole` is untouched. A class has one
`owner` plus `teacher`/`student` members. RLS policies are scoped
`TO authenticated` only so `anon` never evaluates the definer helpers (empty
rows, not 500s). Definers `SET search_path = public, pg_temp`, are
`REVOKE EXECUTE FROM PUBLIC, anon` and `GRANT ... TO authenticated`.

Aggregates (status, accuracy, most-missed terms from FSRS/`card_reviews`)
are persisted, not computed live - the Quizlet model: teacher reads every
member's progress rows, a student reads only their own.

### Traps found here

- **`accept_class_deck` INSERTed columns that don't exist.** Both deck/copy
  INSERTs referenced `decks.source_label` and `cards.header`/`image`/
  `source_label`/`citations` — none exist on the real schema (PL/pgSQL only
  errors at call time, so this survived type-check/build). Caught by a live
  smoke test; fixed in the migration file and re-applied to the DB before any
  commit. If you ever see "column does not exist" from an RPC, verify column
  names against `information_schema.columns` — definitions don't validate.
- **`join_classroom_with_code` once selected a nonexistent `is_public`
  column** (a removed `v_locked` CTE). Same class of bug as above; fixed
  before shipping. The RPC returns `SETOF classrooms`, not `{ok, id}`.
- **`rpc().single()` can resolve to `null` or fan out** the same way table
  `.single()` can. Service layer normalizes through `asRow()` before mapping.
- **`accept_class_deck` is the idempotency key** for the student flow: it
  copies the source deck to a student-owned row once, then `record_progress`
  recomputes status from the student's own reviews. Re-running never
  regresses a `completed` status backwards.
- **Freshly accepted class decks work in StudyMode** because the study page
  reloads the deck by id from the DB instead of trusting workspace state.
- **Membership table is roster-readable by all members, by design.** Any
  member can `SELECT` the membership rows of their own class (that's the
  People tab); cross-class rows are invisible under RLS. Emails stay behind
  the `classroom_roster()` RPC (teacher-only). Verified in the smoke test.
- **Class cards used a `<button>` nested inside a `<motion.button>`** —
  invalid HTML that React only flags at runtime (a console error that the UI
  E2E caught; type-check/build can't see it). The outer card is now a
  `role="button"` div with keyboard handling so the inner invite-copy button
  stays a real button. Grep `motion\.button|<button` when adding cards.

### Verification

`npm run type-check`, `npm run lint`, full `npm test` (384), and `npm run
build` all pass. The migration is **applied** to the live project
(`ndwiaawqkkzdsdqeglez`); objects verified in `pg_class`/`pg_proc`, and a 29-
assertion end-to-end smoke test (teacher create class → assign deck/quiz →
student join/accept/record → RLS isolation checks, simulated
authenticated roles via `request.jwt.claims`) passed against the live DB.

Real-browser UI E2E (Playwright, `npm run dev` stack) also passes: seeded a
captcha-free session via GoTrue admin `generate_link` → `verify` (Turnstile
gates the password grant — never fight the widget in tests), granted
`app_metadata.subscription_status: 'active'` (the dashboard gates on
entitlement), and exercised sign in → create class → detail/tabs → delete
with **zero console or page errors**. This surfaced and fixed the nested-
button bug above. Re-run `npm run diagnostics` after any further SQL changes.

---

## 2026-09-18 - Onboarding + tester role (security fix)

Two features plus one security fix the tester role forced into the open.
Nothing in `Outstanding — code` changed; the push sender and Aurora motion
are still the next items.

### What shipped

- **Onboarding flow** — `/onboarding` (persona + topic), lazy-routed in
  `App.tsx`; the gate `lib/onboardingGate.ts` (`hasCompletedOnboarding`)
  routes fresh accounts through it from signUp, signIn, and the email callback;
  legacy picker accounts and internal roles skip it. `PaymentPage`
  personalizes copy from `?role=&topic=`; `services/decks/topicDeckService.ts`
  pre-creates the topic deck *before* the paywall (Groq → Puter → offline
  template), so the library is never empty. New funnel event
  `onboarding_completed`.
- **`tester` internal role** — `UserRole.TESTER`, hierarchy 30 (below
  employee): `hasFreeAccess` true, zero staff powers. Admin role picker and
  the API zod role enums accept it.

### Security fix: the client's role source was still user_metadata

Adding tester to `hasFreeAccess` exposed that `mapAuthUserToProfile` still
read `role` from **user_metadata** and fed it to `getPermissions` — any
signed-in user could set `user_metadata.role = 'tester'` (or `admin`) with one
`auth.updateUser` call and unlock the paywall. Same bug class as the
entitlement move: the server reader got fixed, the client's source did not.

- `resolveAuthorizationRole()` (`utils/permissions.ts`) is now the only role
  source for permission decisions: `app_metadata.role` ONLY, fails closed on
  unknown values. The onboarding persona lives on a display-only
  `profile.persona` field.
- Server parity: `isEntitledWithRoleAccess()` in `api/_lib/entitlement.ts`
  (owner/ceo/admin/employee/tester, app_metadata only) now gates `/api/ai`
  chat + transcribe. Previously `hasFreeAccess` was client-only decoration —
  staff hit 402 on the AI proxy despite an unlocked UI.
- Regression tests on both sides: `src/__tests__/permissions.test.ts`;
  `api/tests/entitlement-source.test.ts` (a forged
  `user_metadata.role = 'tester'` through `/api/ai` must 402 before any
  provider call).
- **The rule, restated:** `user_metadata.role` = display persona;
  `app_metadata.role` = authorization. The `user_profiles.role` elevation
  check in `syncSession` stays safe only because that column is server-synced
  from app_metadata and persona strings grant no permission bits — do not
  loosen either half.

### E2E seeding without fighting Turnstile

`scripts/e2e-seed-session.mjs` + `e2e/onboarding.spec.ts` — 3 tests: the role
step (all personas render, Continue disabled), the full flow to
`/subscribe?role=student&topic=…` with personalized copy, and the
bounce-to-dashboard for finished accounts. The seeder creates/reuses a user
via the GoTrue admin API (service-role key from the root `.env`), sets
`user_metadata` per scenario (`--fresh` = empty, else
`onboarding_completed: true`), and mints a session via `generate_link` →
magic-link verify → Playwright storage state in `e2e/.auth/`.

Traps found here:

- **vitest `env` values are stringified.** `UPSTASH_X: undefined` in
  vitest.config becomes the literal string `"undefined"`, which
  `Boolean(process.env.X)` treats as *configured*. To unset inherited env you
  must `delete process.env.X` in a `setupFiles` file — `api/tests/setup.ts`
  does that and tripwires any test that still reaches the limiter.
- **Inherited shell env breaks CI-green suites locally.** UPSTASH_* exported
  from the root `.env` made 7 API tests fail on this machine while CI passed
  (fetch mocks saw Upstash instead of the provider). When local failures make
  no sense, diff the shell env against CI before suspecting the code.
- **`redirect_to` cannot override the Supabase Site URL** unless the target
  is on the project's redirect allowlist — localhost is not, so the seeded
  session landed on the bonamind.app origin and the app bounced to `/auth`.
  Fix: run the verify hop in Node (`redirect: 'manual'`), take the
  `#access_token=…` fragment off the Location header, and navigate the *local*
  `/auth/callback` with it so `detectSessionInURL` stores the session on the
  right origin.
- **Playwright route interception doesn't help there**: `route.fetch` dials
  Supabase from the browser context and hits the same wall as direct
  navigation.
- **Playwright's Chromium fails the Supabase hop with
  `ERR_CERT_DATE_INVALID`** on this machine (sandbox TLS/clock
  interception). The seeder launches with `--ignore-certificate-errors`;
  only localhost is visited afterward.
- **vite on this machine binds `::1` only**, and Node resolves `localhost`
  IPv6-first: proxy targets must be `127.0.0.1`, not `localhost`, or every
  proxied `/api` call dies with EADDRINUSE noise and 500s.
- **`test.use({ storageState })` is captured at collection time**, before any
  `beforeAll` can seed. Pre-create empty `{}` state files at module scope and
  let the seeder overwrite them.
- The browser always logs `Failed to load resource: 402` for the entitlement
  probe on fresh accounts — expected, `App.tsx` catches it. Assert on
  `pageerror` plus filtered console errors, not raw console output.

Run: `npx playwright test e2e/onboarding.spec.ts --project=chromium` (vite on
3001; cleanest with the API also running: `PORT=3002 npx tsx server.js` in
`api/` plus `VITE_API_PROXY_TARGET=http://127.0.0.1:3002` on the vite
process). Seeded `e2e-*` users are deleted from auth after runs;
`e2e/.auth/` is gitignored — storage states contain live session tokens and
must never be committed.

### Verification

API 95/95; web type-check, lint, 405 unit tests, and production build green;
E2E 3/3 against the live project. No SQL changed, so no migration or
`npm run diagnostics` rerun was needed.

---

## 2026-09-20 - Admin hub unification, real notifications, honest charts

Committed as `be65a1f6` (user-authored; reviewed and verified before commit).

### What shipped

- **Admin hub** — `AdminShell` deleted; every `/admin/*` path renders inside
  `NovaDashboardShell` via `pages/admin/AdminHub.tsx` (own
  `DashboardWorkspaceProvider`). New `/admin` Overview (fleet stats, role/plan
  breakdowns, newest signups, health strip fed by `/api/admin/test` +
  `/api/admin/health/payments`) and `/admin/settings` (coupon CRUD via
  `/api/coupons/*`, read-only env readout through the `CLIENT_ENV` allowlist).
  Command palette's eleven phantom admin pages removed — every palette entry
  now resolves to a real route. Admin sidebar gained "Back to Dashboard"; the
  Admin section now renders on `/dashboard/*` for admins too (was
  Ctrl+K-only).
- **Notification bell is real** — `NotificationPanel.tsx` over the shared
  `notificationStore` (unread badge, mark-all-read, `actionUrl` click-through,
  outside-click + Escape close). Store is shared with QuizGenerationNotifier,
  so the panel shows real events.
- **Honest overview charts** — the sin-wave `makeSpark` fiction deleted.
  `services/database/modules/reviewActivityService.ts` reads real
  `card_reviews` history (RLS-scoped, `(user_id, reviewed_at)` indexed) and
  buckets by local day; falls back to bucketing client cards by `lastReviewed`
  (undercounts multi-review days, never invents). `bucketReviewsByDay` is pure
  and unit-tested.
- **Stale-JWT self-heal** — `syncSession` re-fetches the user via
  `auth.getUser()` on boot, so role promotions and avatars uploaded on another
  device appear without re-login.
- **Avatars in TopBar** — from `user_metadata.avatar_url`, initials fallback
  on image error. `Scholar` plan removed everywhere.

### Security fix: updateUserById replaced metadata wholesale

Every `auth.admin.updateUserById` call (Stripe checkout, subscription
updates, cancellation, cron dunning, admin status override) passed a bare
`app_metadata: { subscription_status }`. That call **replaces** the record:
any purchase or dunning event would have wiped `app_metadata.role` and
demoted staff/testers. All call sites now spread the existing
app/user_metadata first; `stripe-flow.test.ts` pins that a buyer carrying
`role: 'admin'` survives provisioning.

### Verification

Web type-check, lint, 410 unit tests, production build green; API 95/95.
No SQL changed.

---

## 2026-09-20 - Memory sparks (sporadic resurfacing)

Spec: `SPECS/memory-sparks.md`. Sparks resurface cards in the FSRS
retrievability band ~0.65–0.90 (fading, not forgotten) across three surfaces,
all driven by one pure scheduler. Phase 2 (background voice via Foreground
Service, server push sparks) is explicitly out of scope.

### What shipped

- **`services/memory/sparkScheduler.ts` (pure)** — eligibility band, sporadic
  firing (jittered ~90 s poll × 15% coin, ramped at quiet-hours edges), daily
  cap 12, per-card cap 2/day, 20 min between sparks, 3 h re-review floor,
  weighted pick toward lowest retrievability with jitter. Spark log in
  `localStorage['BonaMind:sparkLog']` (7-day retention) gives cross-surface
  suppression — no DB migration.
- **Surface 1: in-app pop-up** — `components/memory/MemorySpark.tsx`, mounted
  once in `NovaDashboardShell`; fires only on dashboard-ish routes while the
  tab is visible, never during study/chat/admin. Front spoken through
  `speechOutput`, reveal → grade with the real SRS path
  (calculateSRS → dbService.updateCard → cardReviewsService, fire-and-forget).
- **Surface 2: notification sparks** — `lib/sparkNotificationSchedule.ts`
  (pure planner: 2–4 one-shot times/day inside waking hours, ≥2 h apart,
  band-jittered so spacing holds) + `hooks/useSparkSync.ts` mounted next to
  `useReminderSync` in App.tsx. Native only, 'maintain' mode (never prompts on
  launch), cancel-first with fixed IDs 7411–7414 so re-plans replace rather
  than stack. One-shots deliberately avoid the `repeats` trap. Tap deep-links
  to `/dashboard/spark/:cardId` (`pages/dashboard/SparkReviewPage.tsx`) which
  speaks the prompt and offers reveal + grading; unknown card ids degrade
  gently.
- **Surface 3: interleaved sessions** — `services/memory/sessionComposer.ts`
  (pure) mixes ≤20% near-due cards from OTHER decks into the study queue at
  expanding gaps; wired into `StudyModePage` behind `bonamind_sparksEnabled`.
  Gap base scales with queue size so the ratio is actually reachable; the
  last insertion only happens while a full gap can still be honored (no
  tail-bunching).
- **Settings** — "Memory sparks" section: master toggle plus per-surface
  toggles (pop-up, notifications), stored via appPreferences. Quiet hours
  default 22–8 (scheduler constants; per-surface quiet-hours UI deferred).

### Traps found here

- **getFSRSState's SM-2 fallback fabricates stability for never-reviewed
  cards** (interval 0, ease 2.5 → stability > 0), so forgettingCurve(0, s) =
  1 — a naive retrievability helper reports 100% for fresh cards. Gate on
  `lastReviewed` before trusting retrievability.
- **Destructured parameter defaults like `rand = Math.random()`** failed to
  apply under this toolchain (vitest transform), yielding `rand is not a
  function`; defaulting inside the body via `typeof rand === 'function'` is
  the reliable pattern for injectable randomness.
- **updateUserById wholesale replacement** (documented above) applies to any
  metadata write — the spark log stays client-side partly so sparks never
  need one.

### Verification

Web type-check, lint, 455 unit tests (45 new: scheduler 28, composer 9,
notification planner 8), production build green. No SQL changed. Spark E2E
since landed in `82ec13dc` (pop-up, grading, deep-link; skips in CI without
the service key).

---

## 2026-09-21 - Push sender (FCM), dormant until credentials land

The last piece of the push system: `push_tokens` (2026-09-11 migration), the
client registration flow (`pushService.ts`), and the conditional Android
gradle plugin all existed; only the server could not deliver. Now it can —
the moment credentials arrive. Nothing else in the code changes when they do.

### What shipped

- **`api/_lib/push.ts`** — FCM HTTP v1 sender. Service-account JWT signed with
  `node:crypto` RS256 (no firebase-admin dependency — every dep must be
  declared, and crypto does this fine), OAuth token cached ~55 min in module
  scope. `sendPushToUsers()` reads `public.push_tokens`, caps 5 tokens/user,
  prunes tokens FCM reports dead (404 / UNREGISTERED) so the table doesn't
  fill with corpses that slow every future send. Fails closed:
  unconfigured → `configured: false` report, zero network calls.
- **`POST /api/push/send`** — admin-only (same `app_metadata` role gate as
  every privileged route), zod-validated (`auramind://` links only, caps on <!-- legacy-name: ok -->
  title/body/userIds). Used for admin-triggered sends and manual testing.
- **Daily due-card reminders** — cron job 4 on the existing
  `/api/cron/dunning` run (14:00 UTC in vercel.json): users with cards due in
  the next 24h get one quiet push (“Cards are coming due…”) deep-linking to
  the dashboard, capped at 2000 users/run. Timing is deliberate: NOT
  morning — in-app habit covers the first session of the day.
- **Tests** — `api/tests/pushLib.test.ts` (config parsing incl. base64 keys,
  prune vs transient-failure classification) and `api/tests/pushSend.test.ts`
  (fails closed unconfigured, 401/403 gates, payload validation, happy path).

### Activation checklist (human, no code)

1. Firebase console → project + Android app `com.bonamind.app` (debug build
   uses `com.bonamind.app.debug` — register it too if pushes are wanted in
   debug).
2. `google-services.json` → `auramind-gemini/android/app/` and rebuild. The
   gradle plugin applies itself when the file exists (already wired in
   `app/build.gradle`).
3. Service account with `firebase-messaging(sender)` → key JSON → set
   `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_KEY` (raw or base64) on the API.
4. Test: enable push in app Settings on a device (token lands in
   `push_tokens`), then `POST /api/push/send` as an admin.

### Traps found here

- **Mocks must be URL-aware.** The sender makes two different fetches (OAuth
  exchange → token endpoint, then FCM). A mock that 404s everything fails
  before the FCM call, and the test failure points at the wrong thing.
- **`createSign().sign()` needs a real PEM**, even in tests — throw up a
  512-bit key with `generateKeyPairSync` rather than stubbing crypto.

### Verification

API 113/113 (14 new). Web type-check, lint green (one doc-comment change).
No SQL changed, so no migration or `npm run diagnostics` rerun.

---

## 2026-09-21 - Aurora motion (scroll-reactive background)

The dashboard aurora and orbs are no longer a static gradient plus a
time-only drift: they form a depth stack that responds to scrolling.
Everything lives in `NovaDashboardShell.tsx`.

### How it works

- The shell scrolls on the **inner** `<main id="nova-main-content">`, not
  the window — so the effect can't use framer's `useScroll()` default. The
  shell owns one `useMotionValue` fed by a **rAF-throttled passive scroll
  listener** on that element, **clamped to 900px** (a long page saturates
  the effect instead of pushing layers off-screen) and **reset to 0 on
  route change** so every page starts at the static baseline.
- Layer depths (per px scrolled, after a shared spring stiffness 60):
  aurora `y −0.09` + `scale +0.00006` + `hue-rotate 0.04°` (nearest veil,
  the hue drift), orbs `+0.22 / +0.12 / +0.05` (positive = drifts down =
  deeper), grid `+0.03` counter-drift (farthest anchor). All MotionValues →
  zero re-renders; framer composes the transforms on the compositor.
- **Parallax wrapper pattern:** each orb is wrapped in a `ParallaxLayer`
  that owns the scroll `y`, while the orb *inside* keeps its original
  time-drift `animate`. Two elements, two transforms — no property fight
  (the framer-owns-`style.transform` trap).
- Reduced-motion (`useRM`): the scroll listener never attaches and orb
  time-drift stops — the exact pre-change static background. The aurora
  layer is oversized (`-inset-24`) so translate/scale can't expose an edge.
- Bleed/study routes have no scroller → scrollTop stays 0 → static.

### Verification

`e2e/aurora.spec.ts` (seeded session, skips in CI like the other seeded
specs): scrolls `main#nova-main-content` by 700px, reads computed
transform/filter of both background layers before/after, asserts ≥2 layers
moved and `.nova-shell` did not. Measured, not eyeballed. Plus web
type-check, lint, 472 unit tests, production build.

E2E traps worth keeping: the seeder writes its storage state **to the
`--name` path** (pass the state file path, not a display name), and
`--with-spark-deck` is the flag that grants `subscription_status: 'active'`
— a fresh account without entitlement bounces to /subscribe before any
shell renders.

### Landing hero, same pass

`e2e/landing-aurora.spec.ts` also covers the landing page (public — no
seeding): the four hero mesh blobs sit in `HeroBlobParallax` wrappers
( ModernLandingPage.tsx, container tagged `data-hero-mesh`) — depth 0.18 /
0.10 / 0.04, the last at −0.05 for a near-layer, with the third also
hue-drifting. Two more traps:

- **Playwright's `reducedMotion` emulation does not reach
  `window.matchMedia` here** (probed: reduce=false under 'reduce'). The
  reduced-motion test stubs matchMedia in `addInitScript` instead, and
  additionally asserts the wrappers are gone entirely (`transform: none`).
- **`test.use()` must sit at describe level** — inside a `test()` body it
  throws "did not expect test.use() to be called here". Sibling describes
  with different `use()` options is the pattern.
- The hero's first `<section>` is a hidden react-aria live region; target
  the hero by class or a data attribute, never `section >> nth=0`.
---

## 2026-09-21 - Android aura: scroll-reactive depth (theme complete)

The last item from "Aurora motion": the Android focus aura now responds to
scroll, matching the web shell's grammar. Nothing else in the theme remains.

### What shipped

- **`components/native/auraDepth.ts` (pure)** — clamped scroll (cap 900, NaN
  → 0), per-layer depths (core −0.08, halo −0.05, orbits +0.10, particles
  +0.18), hue drift 0.05°/px, shared spring {60/20/0.8} kept in sync with
  NovaDashboardShell's constants. Unit-tested in `src/__tests__/auraDepth.test.ts`.
- **`AndroidAura.tsx`** — opt-in `scrollY` MotionValue prop. Framer owns `y`
  on four per-layer `<motion.g>` wrappers and `filter` on the root `<motion.svg>`;
  the CSS keyframes keep their inner groups. No element has two owners of one
  property. The two other render sites (welcome screen, previews) pass no prop
  and render byte-identical to before.
- **`AndroidOverview`** (`AndroidMobileScreens.tsx`) — rAF-throttled passive
  listener on `main#nova-main-content`, reset to 0 keyed on
  `location.pathname` (NOT `navigate` — the stale-navigate trap). Reduced-motion
  never attaches the listener; overflow-hidden pages simply never scroll.

### Verification

Web type-check + lint green. The vitest runner can't execute on the WSL
checkout (Windows node_modules, Linux runtime — rollup native module missing);
the pure module was verified by compiling `auraDepth.ts` with tsc and running
20 runtime assertions against the real code, which caught two bugs a review
would have missed: IEEE `-0` from `0 × negative depth` (broke `toBe(0)`) and
an over-eager `!Number.isFinite` guard sending Infinity to 0 instead of
saturating. Vitest suite should be run from the Windows side (`npm test`).

### Traps found here

- **`-0` breaks strict equality** (added to Traps above).
- **Framer's `useSpring` overloads reject `MotionValue | 0`** — pass a stable
  fallback MotionValue (`useMotionValue(0)`), not a literal, when the source
  may be absent.
- **`(900 * 0.05).toFixed(2)` is `"45.00"`, not `"45"`** — the rounding helper
  trims trailing zeros; don't write test expectations with toFixed against it.

---

## 2026-09-22 - FSRS was arithmetically wrong (#87)

The scheduler had been hand-rolled and the math was broken: intervals came out
roughly **140x too long**, so a Hard rating could schedule a card 36,500 days
out. Nobody noticed because a wrong interval looks exactly like a right one
until the card fails to come back.

### What shipped

- **`services/study/fsrs.ts` now delegates to `ts-fsrs` (FSRS-6)** — the
  official implementation, instead of a reimplementation of the paper.
  `calculateSRS` / `previewIntervals` / `formatInterval` /
  `retentionFromSetting` in `services/study/srs.ts` keep their signatures, so
  callers are unchanged.
- **`supabase/migrations/20260922000000_fsrs_scheduler_repair.sql`** — one-off
  repair of schedules already written by the broken code: reviewed cards drop
  their stored `fsrs_state` (the scheduler rebuilds it from the interval on the
  next review, via `getFSRSState`'s fallback), intervals are capped at 30 days,
  and anything due more than 30 days out is due now. Never-reviewed cards are
  untouched — their `fsrs_state` may hold a personalised starting difficulty.
- The **UPDATE is gated on the `schema_migrations` ledger**, so re-running the
  file can't wipe progress made under the new scheduler. Worth copying: a
  repair migration is the one kind that is actively dangerous to re-run.

### Verification

Applied to production by hand (2026-09-22 14:34Z) and checked after:
`still_far_future=0`, `interval_over_30=0`, `reviewed_cards=38`,
`reviewed_with_state=0`, `max_interval=30`.

### Traps found here

- **The personal FSRS tuner went with the old math.** `fsrsAdaptation`'s
  weight vector was fitted to the broken scheduler, so it had to go; a
  replacement should use the FSRS-6 optimizer against `card_reviews`. 38
  reviewed cards is far too little to fit — leave it until there are hundreds.
- **A migration only on `main` is not in your working copy.** Checking out a
  branch that predates it and running `npm run migrate` gives a confusing
  "file not found"; `git checkout origin/main -- supabase/migrations/<file>`
  first. Apply with the repo's own runner (`node run-migrations.js`), not the
  Supabase CLI, which needs the file under a linked project.

---

## 2026-09-22 - The iPhone app (#86)

The brief was explicit: **not** a reskinned Android build. iOS gets its own
design language and the capabilities only iOS has.

### What shipped

- **`components/ios/`** — `IOSShell`, `IOSScreens`, `IOSStudySession`,
  `IOSChatView`, `IOSSettingsScreen`, `IOSWelcomeScreen`, plus `iosDesign.ts`
  (tokens) and `iosHaptics.ts`. Large titles that collapse on scroll, grouped
  inset lists, a real tab bar, sheet-style presentation — the platform's
  grammar, not a translation of the Android one.
- **Study, two ways** — the card can be a *deck* (swipe to grade) or a
  *notebook* page, chosen by the learner rather than by us.
- **Chat that isn't a message list.** Three modes: Talk, Notebook and Cards.
- **Siri** — `ios/App/App/BonaMindIntents.swift` exposes "Quiz me" and "Cards
  due" through `AppShortcutsProvider`. The spoken due count comes from what the
  app last published, so it's stale until the app has been opened once.
- **Live Activity + Dynamic Island** — `BonaLiveActivityPlugin.swift` and the
  `BonaMindWidgets` extension (`StudySessionAttributes`,
  `StudySessionLiveActivity`). Requested with `pushType: nil`; see the trap.
- **Native dictation** — `SFSpeechRecognizer` behind the same Web Speech shape
  the Android plugin uses, so `useVoiceStudy` is untouched on both.
- **CI screenshots** — `mobile-ios.yml` boots a simulator and photographs the
  `/__preview/ios` tour, which is how this was designed without a Mac.

### Verification

Type-check, lint and vitest green (`iosScreens.test.tsx`,
`iosStudyAndChat.test.tsx`); simulator screenshots reviewed each push.
**Nothing here has run on a physical phone** — Siri, the Live Activity and
dictation in particular are compile-verified only.

---

## 2026-09-22 - One capability per platform (#90, #92, #93, #91)

The principle: each platform gets something it alone can do, and every one of
them is additive — absent the API, the app is exactly what it was.

- **Study Float (#90), desktop web.** A Document Picture-in-Picture window that
  floats review cards over everything else. `components/float/StudyFloat.tsx`:
  `isStudyFloatSupported`, `buildFloatQueue` (due cards, capped at 50),
  `copyStyles`, and `FloatReviewer` — Space/Enter flips, 1–4 grade, Esc closes,
  and the grade labels are the real intervals from `previewIntervals`.
  Grading goes through the new **`services/study/quickReview.ts`**, shared with
  MemorySpark so there is one grade path, not three.
- **On-device AI (#92), Chrome/Edge.** `lib/builtInAI.ts` wraps Summarizer,
  Translator and LanguageDetector (Gemini Nano, in the browser): free, offline,
  and the card text never leaves the machine. `LocalAIAssist` adds "Key idea"
  and "Translate" to the rating bar, web-only. Every call is raced against a
  timeout because `availability()` can hang on the component updater, and every
  failure resolves to "unavailable" rather than a permanent spinner.
- **The Windows 11 widget board (#93).** `public/widget-sw.js` plus an Adaptive
  Card template and data; `lib/windowsWidget.ts` publishes due count, deck and
  streak from the app, deduped, and `WindowsWidgetSync` mounts it next to
  `MemorySpark`. The manifest `widgets` member and `workbox.importScripts` are
  wired in `lib/pwa.ts`.
- **Android 16 Live Updates (#91).** `BonaLiveUpdatePlugin.java` posts the
  session as a promoted ongoing notification: `Notification.ProgressStyle` with
  a segment per card, points for the ones still to come back, and
  `setShortCriticalText` for the count. Verified on a real Android 17 emulator
  image, not just compiled.
- **The facade that stopped the duplication** — `lib/sessionLiveUpdate.ts`.
  Android's Live Update and iOS's Live Activity want the same three facts in
  different shapes, and `StudyModePage` was growing one effect for each.
  `startSessionLiveUpdate` takes the session and fans out; adding a third
  platform means editing one file.

### Traps found here

See Traps above: PiP needs a gesture (and can't run in an embedded pane),
`setRequestPromotedOngoing` is 36.1, a stubbed `Cache` replays consumed bodies,
and vitest passing doesn't mean `tsc` passes.

---

## 2026-09-23 - An IPA you can sideload (#94)

`mobile-ios.yml` gained `ios-device-ipa`, so an iPhone build can be installed
without a Mac and without the $99 program — full runbook under "Verifying iOS
changes (no Mac)" above. The `server_url` input turns it into a live-reload
shell that loads the web app from a URL, which makes iteration a refresh
instead of a 15-minute round trip.

Run 35805655820 on `main`: both jobs green, `bonamind-ios-unsigned-ipa`, 70 MB.

---

## 2026-09-24 - Live Activity in CI + iOS preview deploy

- **Live Activity is driven in CI now.** The preview tour ends on a live step
  (`/session/neuro?live=1`, `LiveActivityDriver` in `IOSVisualPreview.tsx`):
  real `startSessionLiveUpdate`, one `updateSessionLiveUpdate` 4s later, never
  ended. The Swift plugin prints `LIVE_ACTIVITY_STARTED/UPDATED` under
  `#if DEBUG` only. `start/updateLiveActivity` now resolve `boolean` instead of
  `void` (callers ignore it; `liveActivity.test.ts` updated). Tour entries
  with query strings need `previewTourUrl` — naive string concat produced
  `?live=1?tour=1`.
  - **Superseded 2026-09-30:** this entry used to claim `mobile-ios.yml`
    "fails closed unless both `true` lines are in the sim log, and uploads
    `live-activity*.png` (Pro device, island in-frame)". Both were false — see
    the 2026-09-30 entry. The artifacts were never the Dynamic Island.
- **iOS preview deploy:** `npm run build:ios-preview`
  (`scripts/build-ios-preview.mjs` — a wrapper because PowerShell has no
  inline-env syntax) bakes `VITE_IOS_PREVIEW=true`; verified present in the
  preview bundle and absent (`void 0`) in release. Hosting is a second Vercel
  project (steps in DEPLOYMENT.md); release builds redirect `/__preview/ios`
  to `/`.
- **Incidental:** removed dead `liveUpdate` direct imports in
  `StudyModePage.tsx` (the facade replaced them; lint was red on `main`);
  `npm ci` was required first — `node_modules` was missing `ts-fsrs`/`ws`.

Full suite 553 green at the time.

---

## 2026-09-25 - Admin oracle closed (applied 2026-09-25)

- **Finding:** `is_admin(uuid)` / `is_super_admin(uuid)` take an arbitrary
  uuid, so any signed-in user could probe whether an account is an admin. The
  only in-repo consumer of either form was the `audit_events` SELECT policy
  (always with `auth.uid()`).
- **Fix:** `supabase/migrations/20260925_close_admin_oracle.sql` moves the
  policy onto `current_user_is_admin()` (verified self-contained, no
  dependency on the uuid forms) and revokes client EXECUTE on both uuid
  functions (service_role kept). JWT is the canonical admin source, so a
  legacy table-only admin loses audit reads. Applied to the live project on
  2026-09-25 (`schema_migrations`).
- **Pinned by `adminOracle.test.ts`:** replays GRANT/REVOKE per function in
  filename order and asserts the effective grant denies client roles; fails
  without the migration (verified both directions).
- **Left open:** `promote_admin` / `deactivate_admin` are granted to
  `authenticated` but their bodies live only in the live DB (not in any
  migration file) — unauditable from here. Needs
  `pg_get_functiondef()` output before touching.

---

## 2026-09-30 - The iOS Live Activity was never verified in CI

- **Finding:** `ios-simulator` has been green for days and the "Live Activity"
  steps read as proof. They are not. Downloaded artifact `ios-simulator` from
  run `36656826327` and every `live-activity*.png` / `live-boot.png` is the
  app's own flashcard screen — no Dynamic Island, no lock-screen presentation.
  The overlay burned into the frame says it: `plugs=LiveActivity:false`,
  `av=false st=false up=false`, and neither log contains a single
  `ActivityKit` line.
- **Why it went green:** `available: false` (correct — a fresh simulator has
  Live Activities off) took a branch that emitted `::warning::` and `exit 0`.
  But `read_prefs` returns `MISSING` for an absent key, and `MISSING != true`
  hit the *same* branch. So a driver that never ran, or crashed before
  probing, was indistinguishable from a clean refusal. The step proved nothing
  in either case.
- **Also misleading:** "Screenshot every iOS screen" emitted 24 PNGs containing
  only **9 distinct frames** — `shot-18`–`shot-24` are byte-identical to
  `live-activity.png` and `shot-12`–`shot-17` to each other, because the tour
  stalls on the study screen and the loop re-captures it. A fixed shot count
  says nothing about coverage.
- **Fix:** steps renamed to what they do (`Attempt a Live Activity during the
  tour (simulator normally refuses)`, `Live-boot the Live Activity driver and
  assert its contract`, `Screenshot the iOS tour`), artifacts renamed
  `liveactivity-attempt-tour*.png` / `liveactivity-liveboot.*` so nobody
  reads them as island proof, and the tour step now reports the distinct-frame
  count. The gate distinguishes `MISSING` from `false` and asserts the
  graceful-bail contract: the driver ran, detected the refusal, and did **not**
  claim `started`/`updated` it never achieved.
- **Verified** the gate against 8 driver states, including the one the old code
  waved through (`available=MISSING` → now exit 1). Only
  `available=true` + `started=true` + `updated=true` passes, and that is the
  only path that proves the ActivityKit integration.
- **Still unproven, and only a real device can prove it:** the Dynamic Island
  and lock-screen layout, and push-driven updates. There is no `simctl` API to
  enable Live Activities on a simulator, so CI cannot close this. Tracked with
  the TestFlight work.
- **Trap for the next person:** `bonamind_ci_live_session` is **not** a
  boolean — `LiveActivityDriver` writes `session-mounted:<path>`. Comparing it
  to `true` fails every run. The other five keys are `"true"`/`"false"`.

---

## 2026-10-11 - Native app, part 1 (#156)

A real native app (React Native + Expo), not a web wrapper, beside the
Capacitor builds. Spec and plan:
`docs/superpowers/specs/2026-10-08-bonamind-native-app-part1-design.md`,
`docs/superpowers/plans/2026-10-08-bonamind-native-app-part1.md`.

### What shipped

- **`packages/core` (`@bonamind/core`)** — platform-free TypeScript shared by
  the website and the app: domain types, FSRS scheduling (moved from the
  website; golden fixtures prove identical output), `planReview`, Supabase
  queries, an offline outbox, and the Prof. Linnea streaming client. Linked
  with `file:` so each app keeps its own lockfile. The website's old
  `services/study/fsrs.ts`/`srs.ts` are one-line re-exports.
- **`mobile/`** — Expo SDK 57 / RN 0.86, dark-only "Aurora + Paper" design,
  native tabs (Liquid Glass on iOS 26), Today / Courses / Search / You,
  swipe study session, Prof. Linnea sheet, SQLite cache + outbox so study
  works offline. iOS bundle id `com.bonamind.app`; Android keeps
  `com.auramind.app` so it can replace the Capacitor app as an update.
- **CI** — `mobile.yml` (type-check, lint, tests), a `core` job in `ci.yml`,
  and manual `mobile-builds.yml` (unsigned IPA for Sideloadly, Maestro e2e).

### Running it on a phone (Expo Go)

`mobile/.env.local` (git-ignored) holds the four public `EXPO_PUBLIC_*`
values copied from `auramind-gemini/.env`. Then, inside `mobile/`:
`npx expo login` once, `npx expo start --go`, scan the QR code with the iPhone
camera. Google sign-in can't work in Expo Go (it uses its own `exp://` scheme
instead of `bonamind://`); email + password and email codes do.

### Found on the first real-device run (all fixed on the PR)

Blank launch when signed out, no button responding, and a human check that
kept restarting. Each is a trap above ("`Stack.Protected` drops a redirect",
"A root gesture recognizer eats every tap", "Turnstile retries itself").

After sign-in worked (same day): **Start review** opened a black screen
("`isFetchedAfterMount` can wait forever"), and Prof. Linnea never answered,
with her messages drawn over the sheet header ("A cross-host redirect strips
the API token", "The AI proxy reports failures inside a 200 stream",
"`formSheet` with detents collapses a flex layout"). The study screen now
shows `LoadingScreen` (`mobile/src/design/components/LoadingScreen.tsx`)
while it fetches: the prism logo drawn in Skia, a light comet running its
outline, a breathing core, orbiting sparks, and a rotating status line. It is
still under Reduce Motion. The Send button is disabled while Linnea answers.

2026-10-12: swiping a card didn't move to the next one. See the trap "A swipe
that 'does nothing' on the study card". The card hint now reads "Tap or
swipe to reveal" (`e2e/core-loop.yaml` taps that text).

### Known gaps

- **Device clock skew** isn't handled: a phone clock running ahead writes
  future `last_reviewed` values, and the conflict rule then refuses website
  updates to those cards until real time catches up. Needs a server time
  reference.
- **Retention** is the website default (85%); the website stores it per
  browser, so the phone can't read the user's choice.
- **Unverified on hardware:** Liquid Glass, frame rates, haptics, Reduce
  Motion, the swipe study loop, offline sync. `mobile-builds.yml` has never
  run.

### Next

Rename pass (AuraMind → BonaMind and Prof. Aura → Prof. Linnea in the existing <!-- legacy-name: ok -->
code, `auramind_*` storage keys), then part 3 (billing, notifications), part 4 <!-- legacy-name: ok -->
(iOS-only features), part 5 (stores). Part 2 is below.

---

## 2026-10-12 - Native app, part 2: create a course on the phone

Spec `docs/superpowers/specs/2026-10-12-bonamind-native-app-part2-create-design.md`,
plan `docs/superpowers/plans/2026-10-12-bonamind-native-app-part2.md`.

### What shipped

- **Four sources:** topic, link (web page or YouTube transcript), PDF (≤ 3 MB),
  photos (1–5 pages, camera or library). The sizes are Quick ~10, Standard ~20
  and Deep ~35 cards. Then a review deck (swipe left to remove with Undo,
  right to keep, hold to edit, rename) and save. The flow is reached from the
  Courses header **+** or Today's empty state.
- **`@bonamind/core/src/create/`:** `splitSource` (6,000-character pieces, at
  most 8, because `/api/ai/chat` caps a message at 8,000), the prompts,
  `parseCards` (it never throws and dedupes), and `buildCourse` (a busy or
  unparseable piece is retried once, then skipped; rate limits wait 3 s and
  8 s; a 402 aborts; offline stops with `partial` so the build can resume).
  `createCourse` lives in `src/data/queries.ts`: it inserts the deck, then all
  cards with the same initial FSRS and personalized difficulty as the website,
  and deletes the deck if the cards fail.
- **API:** `POST /api/extract/document` (`unpdf`) and `POST /api/extract/image`
  (Gemini's OpenAI-compatible endpoint with `image_url` data URIs). Both are
  signed-in and entitled (402) and sit in the `ai` rate-limit bucket.
  `_providers.ts` gained `providerByName`.
- **App (`mobile/src/create/`):** source readers (`expo-document-picker`,
  `expo-file-system/legacy`, `expo-image-picker`, `expo-image-manipulator`,
  `expo-clipboard`), `ask` (45 s timeout), and a zustand build store that lives
  outside the screens (leaving the sheet doesn't cancel; going offline pauses
  and resumes from the last finished piece). Then the New course sheet, the
  live building view (prism, real steps, cards landing on paper), the review
  deck and the ready screen (confetti, Study now).

### Traps found here

- **Core has no DOM or Node types.** `AbortSignal` and `setTimeout` don't
  type-check in `packages/core`. Use structural types (`AbortLike`) and reach
  timers through `globalThis`.
- **A brand guard scans core's comments.** `test/brandNames.test.ts` failed on
  a comment naming the `auramind-gemini` folder. Refer to "the website"
  instead.
- **`expo install --check` moves after any install.** Adding modules pulled a
  newer SDK 57 patch list. Six existing packages had to be bumped to keep it
  clean.
- **`task-done` and pipes.** Piping the test runner through `grep` hides its
  exit code, so a failing suite got recorded as passing once. Never pipe the
  runner in a gate command.
- **A sentence regex that consumes text drops it.** `/[^.!?]+[.!?]+(?=\s|$)/`
  silently skipped everything before "3.14", "e.g." or "U.S.". That hit every
  link, because `/api/fetch-url` collapses a page into one paragraph.
  `splitSource` now splits without consuming text (`replace(/([.!?])\s+/g,
  '$1\0')`, with no lookbehind, for Hermes). A test joins the pieces back and
  checks that no characters were lost.
- **NetInfo calls a new listener at once.** It can also report "connected"
  while requests fail. A "resume when online" listener therefore fired
  immediately and looped, leaking a listener each turn. The build store
  resumes once per pause, after 2 s, and skips `isInternetReachable ===
  false`. The jest mock now calls listeners on subscribe, like the library.
- **Tabs stay mounted.** The Courses screen read `justCreated` once at mount
  and never saw a course made from its own **+**. It now subscribes.

### Review follow-ups (all fixed on the PR, 2026-10-12)

The final review's 11 minor items are fixed, each with a test:
- **Errors:** a fully rate-limited build reports `rate_limited`, not `empty`.
- **Topic builds:** they pause offline and resume. Prompts are capped
  (topic 200 characters, avoid list 3,000) so the proxy's silent
  8,000-character cut can't drop the JSON rules.
- **Progress:** it never counts past the target.
- **Photos:** they're size-checked before upload (1.5 MB each, 3 MB in all),
  with photo-specific wording.
- **Link field:** the clipboard fills it once per visit to Link.
- **Review deck:** editing a card no longer remounts it.
- **Titles:** a blank title saves as the one the course was made with.
- **Store:** a stale source read can't hijack a newer build.
- **Closing the sheet:** it clears the build on unmount, so it no longer
  flashes.
- **Dev server:** `api/server.js` parses JSON bodies up to 5 MB. Express's
  100 KB default returned 413 for every real PDF or photo.

### Owner check

Outstanding item 12 above covers deploying, `GEMINI_API_KEY` and one course
per source on the phone. Vercel has no `GEMINI_API_KEY` (2026-10-12), so
photos go through Groq. Its free tier caps that model at ~1,000 output tokens
per minute (requests use `max_tokens: 900`), so a dense multi-page photo set
can come back partial and back-to-back photo courses can hit a 429 ("give it a
minute"). Adding a free Gemini key (aistudio.google.com/apikey) makes Gemini
the first choice. Planned: on-device text recognition (Apple Vision / ML Kit)
once the app moves off Expo Go to development builds; it's free, offline and
private, with the server as the fallback.
