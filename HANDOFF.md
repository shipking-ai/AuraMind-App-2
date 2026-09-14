# Handoff — AuraMind 2.0.0

Written 2026-09-09. Context for continuing this work in another tool.

Read `CLAUDE.md` first for conventions, then `ARCHITECTURE.md` for structure.
This file covers only what those two don't: current state, what's left, and
the traps that cost real time.

---

## Where things stand

| | |
|---|---|
| Version | 2.0.0 (root, app and Android now agree) |
| Play | versionCode 7, **alpha / closed testing, draft** |
| Branch | `main`, clean, everything pushed |
| Migrations | all applied, including the four from 2026-09-07/08 |

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
- **`chat-stream` edge function** is deployed with `verify_jwt: false`, and
  nothing in the client calls it. Worth confirming it is unused and removing
  it, or locking it down.
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
