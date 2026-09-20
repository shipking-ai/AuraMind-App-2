# Handoff — AuraMind 2.0.0

Written 2026-09-09; updated 2026-09-20 (admin hub, notifications, memory sparks in flight). Context for continuing this work in another tool.

Read `CLAUDE.md` first for conventions, then `ARCHITECTURE.md` for structure.
This file covers only what those two don't: current state, what's left, and
the traps that cost real time.

---

## Where things stand

| | |
|---|---|
| Version | 2.0.0 (root, app and Android now agree) |
| Play | versionCode 7, **alpha / closed testing, draft** |
| Branch | `main`, 4 commits ahead of origin at last update |
| Migrations | all applied, including `20260919000000_classroom_portal.sql` |

---

## Outstanding — human, not code

1. **Publish the draft release.** Play Console → Testing → Closed testing →
   the version 7 release → Publish. It's uploaded but invisible until you do.
   Play will likely demand the setup checklist first (store listing, content
   rating, data safety, target audience).
2. **Add 12 testers** on that same track. Google requires 12 testers for 14
   *continuous* days before production is unlocked, for personal accounts
   created after 2023-11-13. The clock doesn't start until the release is
   published, so this is the long pole.
3. **Confirm sign-in works** at auramind.app/auth. Turnstile is wired and the
   site key is correct, but nobody has completed a CAPTCHA end to end.

After the first publish, `status=completed` in the release workflow makes a
dispatch go live without a console visit.

---

## Outstanding — code

Nothing is broken. These are the next things worth doing, roughly in order of
value:

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
  `src/test/setup.ts` restores it. CI pins Node 20/22 and never hit this.

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
  `npm run migrate`.

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

Then drive it with Playwright over `connectOverCDP('http://127.0.0.1:9222')`.
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
