# Handoff — AuraMind 2.0.0

Written 2026-09-09; updated 2026-09-21 (classroom portal + graded quizzes, memory sparks, Android listening, natural voices, push sender, aurora motion). Context for continuing this work in another tool.

Read `CLAUDE.md` first for conventions, then `ARCHITECTURE.md` for structure.
This file covers only what those two don't: current state, what's left, and
the traps that cost real time.

---

## Where things stand

| | |
|---|---|
| Version | 2.0.0 (root, app and Android now agree) |
| Play | versionCode 7, closed testing (Alpha), **submitted for review 2026-09-16** |
| Branch | `main`; open PRs: #85 (natural voices, push sender, aurora motion), #68 (Dependabot, rebase requested after #78) |
| CI | Node **22 + 24** (20 dropped, EOL); required checks still list `build-and-test (20.x)` until changed in repo settings |
| Migrations | all applied through `20260921000100_classroom_quiz_grading.sql` (verified live 2026-09-21) |

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
6. **Accept the Orpheus model terms** in the Groq console (org admin):
   console.groq.com/playground?model=canopylabs%2Forpheus-v1-english.
   Until then `/api/ai/speech` gets `model_terms_required` from Groq, answers
   503, and every AI voice silently falls back to the device voice. Orpheus is
   a Groq *preview* model (~$22 per 1M characters); if it is withdrawn, swap
   `SPEECH_MODEL`/`SPEECH_VOICES` in `api/_aiHandler.ts` and `AI_VOICES` in
   `src/services/voice/aiVoice.ts`.

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
    returns results (WebKit bug 239816), so `AuraListenPlugin.swift`
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
- **Voice study listening on Android** (merged in #79).
  Android WebView has no `SpeechRecognition`, so spoken answers never worked
  in the app. `AuraListenPlugin` wraps `SpeechRecognizer`;
  `services/voice/nativeRecognition.ts` presents it in the Web Speech shape so
  `useVoiceStudy` is unchanged. Verified on the emulator: Android's mic prompt
  appears, *Don't allow* surfaces as `not-allowed`, and after allowing,
  loudness streams and silence ends with `no-speech`. **Still needs one phone
  test with a real spoken answer**, since the emulator mic can't be fed audio.
- **Dependabot #68** (jsdom 30, vitest 5, jest-dom 7): #78 is merged, so it
  passes once rebased (`@dependabot rebase`, not a plain re-run).
- **Push sender — built, awaiting credentials.** Server sender, admin send
  endpoint, and daily due-card cron all shipped (see 2026-09-21 below);
  nothing delivers until the Firebase console steps at the end of that
  section are done (google-services.json + FCM_* env vars).
- **Aurora motion — shipped** (2026-09-21, below), dashboard shell, landing
  hero, and (same day) the Android focus aura (see bottom). Nothing remains
  in this theme.
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
  session landed on the auramind.app origin and the app bounced to `/auth`.
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
  `localStorage['auramind:sparkLog']` (7-day retention) gives cross-surface
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
  expanding gaps; wired into `StudyModePage` behind `auramind_sparksEnabled`.
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
  every privileged route), zod-validated (`auramind://` links only, caps on  
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

1. Firebase console → project + Android app `com.auramind.app` (debug build
   uses `com.auramind.app.debug` — register it too if pushes are wanted in
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
