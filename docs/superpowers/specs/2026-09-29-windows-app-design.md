# AuraMind for Windows — full-potential design

- **Date:** 2026-09-29
- **Branch:** `feat/windows-desktop-app` (PR #119, which provides the Tauri 2 shell this builds on)
- **Status:** approved in conversation, section by section; this document awaits review

## 1. Intent

**What was asked:** make the Windows app bring out the full potential of a
Windows app, and make it look awesome/beautiful.

**Who it's for:** students who study daily on a Windows PC.

**Success looks like:**
- It feels like a real Windows 11 app, not a website in a frame: branded,
  no white flash, native window behaviour.
- It does what a browser tab can't: study nudges (tray, notifications,
  taskbar badge, start with Windows), a Quick Review window on a global
  shortcut, drop-to-create from files and Explorer, and `auramind://` links
  with working Google/Notion sign-in.
- The React app stays shared with web and mobile. Windows-only behaviour
  lives in the Rust shell and a thin platform layer.

**Decisions made in the conversation:**

| Question | Decision |
|---|---|
| Capabilities | All four: study nudges, Quick Review, drop to create, deep links + sign-in |
| Window look | **C · Branded native:** the real title bar recolored to AuraMind navy, aurora underneath |
| Quick Review shape | **A · Corner panel** above the tray |
| Notification and tray menu | As mocked ("12 cards are ready", *Quick review* / *Later*; menu below) |
| Architecture | **1 · Split:** Rust owns the OS side, React owns the data |

**Fixed constraints (from PR #119):**
- The app origin `https://tauri.localhost` never changes.
- Capabilities stay minimal.
- The navigation guard (`stays_in_app`) stays.
- No code-signing certificate yet (SmartScreen warns; there is no MSIX).

## 2. Architecture

Rust owns everything that talks to Windows. React owns data and decisions,
and tells Rust what to show through a small command/event contract.

```
React (main window, /)                        Rust shell (src-tauri)
 ├─ desktop/dueStatePublisher ──set_due_state──▶ tray, taskbar badge
 ├─ desktop/nudgePlanner ─────schedule_nudges──▶ nudge timer ─▶ Windows toast
 ├─ desktop/deepLinkRouter ◀──deep-link event── deep-link + single-instance
 ├─ desktop/fileHandoff ◀────create-from-file── Explorer verb / tray picker
 └─ refreshWorkspace() ◀─────cards-changed ───┐
React (quick-review window, /quick-review)    │
 └─ rates cards ──────────────cards-changed ───┘ (Rust relays to main)
```

- **One source of truth for study data.** Due counts, fading decks and
  FSRS are computed only in TypeScript. Rust never queries Supabase. This is
  the same rule the Android widget follows.
- **Quick Review is a second window on the same bundle**, route
  `/quick-review`, so it shares the session, the data and the rating code.
- **Every Windows-only React module** lives under `src/desktop/` and is a
  no-op unless `isDesktopApp()`. The website and phone apps don't change.

### Rust modules (`src-tauri/src/`)

| Module | Responsibility |
|---|---|
| `lib.rs` | Builder, plugin registration, window creation (existing, trimmed to wiring) |
| `guard.rs` | `stays_in_app` / `opens_externally` (moved out of `lib.rs` unchanged, plus one exact exception: `ms-settings:notifications`) |
| `chrome.rs` | Windows 11 caption/text/border colors via DWM; show-after-first-paint with a 3 s fallback |
| `tray.rs` | Tray icon, tooltip and menu; due-dot icon variant |
| `badge.rs` | Taskbar overlay badge (1–9, 9+, cleared at 0) |
| `nudges.rs` | Holds the schedule from React, fires toasts with actions, quiet hours, pause-until-midnight; `plan` logic is pure and unit-tested |
| `quick_review.rs` | Creates, positions (work area of the monitor under the cursor), shows and hides the Quick Review window; registers the global shortcut |
| `handoff.rs` | Validates file paths from Explorer/tray (extension allowlist, 50 MB cap), reads the file, emits it to React |
| `links.rs` | Parses `auramind://` URLs (allowlist) and forwards them; single-instance argument routing (`--create <path>`, deep links, `--hidden`) |

### React modules (`auramind-gemini/src/desktop/`)

| Module | Responsibility |
|---|---|
| `bridge.ts` | Typed wrappers for every command and event below; lazy `@tauri-apps/api` import |
| `dueStatePublisher.ts` | From workspace cards: `{ due, fadingCount, topDecks, streak, studying }` on change and each minute, deduplicated. `fadingCount` = reviewed cards whose recall is in the memory-spark band (65–90%, `cardRetrievability`) |
| `nudgePlanner.ts` | Pure: reminder time + due state → nudge schedule (daily reminder, at most one extra afternoon nudge when ≥10 cards are fading) |
| `deepLinkRouter.ts` | `auramind://app/...` → `lib/deepLinks.ts` allowlist → navigate; `auramind://auth/callback` → PKCE exchange |
| `fileHandoff.ts` | Base64 payload → `File` → generator preloaded |
| `DesktopChrome.tsx` | Window title per route, suppressed browser context menu (except text inputs), Ctrl+N / Ctrl+, shortcuts, desktop scrollbars, first-paint signal |
| `DropOverlay.tsx` | Full-window "Drop to make a course" glow; plain HTML5 drop, so the website gets it too |
| `pages/quickReview/QuickReviewPage.tsx` | The corner panel UI |

### Command and event contract

| Direction | Name | Payload |
|---|---|---|
| React → Rust | `app_ready` | — (first paint; shows the main window) |
| React → Rust | `set_due_state` | `{ due: number, fadingCount: number, topDecks: string[], streak: number, studying: boolean }` |
| React → Rust | `schedule_nudges` | `{ nudges: { at: ISO, title, body }[], quietStart, quietEnd }` |
| React → Rust | `quick_review_done` | — (hide the panel) |
| React → Rust | `cards_changed` | — (from Quick Review; Rust emits `cards-changed` to the main window) |
| React → Rust | `show_main` | `{ path?: string }` (open/focus the main window, optionally at a route) |
| React → Rust | `set_shortcut` | `{ accelerator: string }` → `{ ok: boolean, reason?: "taken" }` |
| React → Rust | `get_autostart` / `set_autostart` | `boolean` |
| Rust → React | `deep-link` | `{ url: string }` |
| Rust → React | `create-from-file` | `{ name, mime, base64 }` or `{ error: "unsupported" \| "too-large" \| "unreadable" }` |
| Rust → React | `cards-changed` | — (relayed from Quick Review to the main window) |
| Rust → React | `open-route` | `{ path: string }` (tray and notification clicks) |

The global shortcut, autostart and file picker are driven from Rust, so
the web layer gets **no plugin permissions for them**. Capabilities grow
only by the app's own commands above, `core:event` (listen), and
`core:window:allow-set-title`. No filesystem or shell permission is ever
granted to the web layer; Rust reads Explorer/tray files itself. Each
window gets its own capability: `quick-review` can't set titles, open the
file picker, or change autostart.

## 3. Look and launch

- **Title bar (option C).** Native decorations. On Windows 11, via
  `DwmSetWindowAttribute`:
  - caption `#0b1022`
  - title text `#e8e6ff`
  - border `#8B5CF6` at reduced intensity

  Windows 10 ignores those attributes and falls back to the dark theme.
  Snap Layouts, the native caption buttons, rounded corners and
  accessibility are unchanged.
- **No white flash.** The main window is created hidden with background
  `#060a16`. React calls `app_ready` after first paint; Rust shows the
  window, or does so anyway after 3 s.
- **Opens to the app.** In the Windows app, `/` redirects to `/dashboard`
  (signed in) or `/auth` (signed out). The marketing landing page is
  web-only.
- **Desktop manners:**
  - window title per route ("Library · AuraMind")
  - no browser context menu except in text inputs
  - Ctrl+N new course (the generator), Ctrl+, settings (Ctrl+K palette already exists)
  - slim themed scrollbars (`html.platform-desktop`)
- **Quick Review window:**
  - frameless, transparent, with the Windows **acrylic** backdrop tinted navy
  - rounded 14 px corners, always on top, `skip_taskbar`
- **Icon.** Regenerated with `tauri icon` from the vector mark
  (`public/favicons,logos/favicon.svg`) into a multi-size ICO (16/24/32/48/64/256)
  plus the PNGs Tauri needs. Replaces the icon upscaled from the 512 px PNG.
- **Installer.** NSIS with branded header (150×57) and sidebar (164×314)
  art: navy with the violet aurora and the mark. Start menu entry plus an
  optional desktop shortcut. Per-user install (unchanged).

## 4. Study nudges

- **Due state.** `dueStatePublisher` sends `{ due, fadingCount, topDecks,
  streak, studying }` when workspace cards change and once a minute, and only
  when the value changed.
- **Tray.**
  - Icon (plus a due-dot variant when `due > 0`).
  - Tooltip "AuraMind · 12 cards due".
  - Left-click opens/focuses the main window.
  - Right-click menu:
    - header: AuraMind · "12 cards due · 12-day streak"
    - Quick review (Ctrl+Alt+Space)
    - Open AuraMind
    - New course from file…
    - Start with Windows ✓
    - Pause reminders for today
    - Quit
- **Taskbar badge.** Overlay icon 1–9 or 9+ while due; cleared at 0.
- **Notifications.** Windows toasts with **Quick review** and **Later**
  actions. Clicking the body opens the main window; *Quick review* opens the
  panel.
- **Schedule** (`nudgePlanner`, pure):
  - The daily reminder at the time already set in Settings (shared with the
    phone apps), only if `due > 0`.
  - At most one extra afternoon nudge (15:00) when `fadingCount ≥ 10`.
  - Never in quiet hours (22:00–08:00) or while a study session or Quick
    Review is open.
  - React re-plans on every due-state change. Rust holds the timer, because
    WebView2 throttles timers in hidden windows.
  - "Pause reminders for today" suppresses toasts until local midnight.
- **Close to tray.** ✕ hides the main window. The first time, one toast says
  "AuraMind is still running in the tray". Only **Quit** exits.
- **Start with Windows.** Off by default. Toggled from the tray or
  Settings. Launches with `--hidden`, straight to the tray.
- **Notification identity.** The installer's Start-menu shortcut registers
  the AppUserModelID (the bundle identifier) that Windows needs for toasts
  and their buttons.

## 5. Quick Review

- **Open:**
  - Ctrl+Alt+Space from anywhere, the tray item, or the toast's button.
  - If the shortcut is taken, `set_shortcut` returns `taken` and Settings
    offers another.
- **Window:**
  - created on first use, then hidden and re-shown
  - 380 × 300, bottom-right of the work area of the monitor under the
    cursor
  - stays on top, and **doesn't hide on blur** (you can keep typing beside
    it)
  - Esc, ✕ or finishing hides it
- **Content** (`/quick-review`):
  - due cards across decks, most overdue first, up to 10 per session
  - Space flips; 1–4 or click rates Again / Hard / Good / Easy
  - progress bar along the bottom
  - done state: "All caught up · next card due in 3h", fading out after 2 s
- **Ratings** use exactly the study screen's rating path (FSRS, review
  history, offline handling). Afterwards `cards-changed` refreshes the main
  window, which updates the tray and badge.
- **Signed out:** "Sign in to AuraMind" opens the main window.

## 6. Drop to create

- **Accepted types** (the generator's own list):
  - documents: `.pdf .pptx .docx .doc .txt .md`
  - audio: `.mp3 .wav .m4a .ogg .webm`
- **Drag onto the window.** `DropOverlay` shows the full-window glow "Drop
  to make a course"; drop opens the generator with the file loaded.
  Standard HTML5 drag-and-drop (`dragDropEnabled: false` stays), so the
  website gets it too.
- **Explorer.**
  - The NSIS installer hooks add per-user verbs
    (`HKCU\Software\Classes\SystemFileAssociations\<ext>\shell\AuraMind`),
    "Make a course with AuraMind" → `AuraMind.exe --create "%1"`.
  - Uninstall removes them.
  - On Windows 11 they appear under "Show more options"; a top-level entry
    needs a signed MSIX (out of scope).
- **Tray → "New course from file…"** opens a native file picker filtered to
  the same types.
- **Rust handoff checks** (Explorer and tray are the only places Rust reads a
  file):
  - allowlisted extension and size ≤ 50 MB
  - errors map to a friendly message ("AuraMind can't make a course from
    .xyz files")

## 7. Deep links and sign-in

- **Scheme.** The installer registers `auramind://` per user. The
  single-instance plugin forwards links to the running app.
- **App links.** `auramind://app/<path>` is checked against the same
  allowlist as the phone apps (`lib/deepLinks.ts`), then navigated.
  Anything else is ignored.
- **OAuth (Google, Notion).**
  - In the Windows build only, the Supabase client is created with
    `flowType: 'pkce'` (web and mobile keep the current flow).
  - `signInWithOAuth({ redirectTo: 'auramind://auth/callback',
    skipBrowserRedirect: true })` returns the provider URL, which opens in
    the default browser.
  - The callback's `code` goes to `exchangeCodeForSession`. The PKCE
    verifier stays in the app's origin storage, so a forged link can't sign
    anyone in.
- **Manual prerequisite.** Add `auramind://auth/callback` to Supabase →
  Authentication → URL Configuration → Redirect URLs. Until a test sign-in
  succeeds, the OAuth buttons stay hidden in the app (the current
  behaviour). Setting `VITE_DESKTOP_OAUTH=true` in `.env.desktop` turns them
  on; it must be added to the `CLIENT_ENV` allowlist in `src/lib/env.ts`
  (it's public, not a secret).

## 8. Errors and degradation

| Situation | Behaviour |
|---|---|
| Windows 10 | Standard dark title bar; everything else works |
| Shortcut taken | Settings explains and offers another |
| Windows notifications off | Settings: "Notifications are turned off in Windows" + button to `ms-settings:notifications` |
| Offline | Tray and Quick Review show the last known count; ratings use the study screen's offline handling |
| Explorer file rejected | Friendly message naming the extension or size |
| Unknown deep link | Ignored, focus only |
| OAuth redirect not allowlisted | Buttons stay hidden (`VITE_DESKTOP_OAUTH` unset) |

## 9. Testing

- **Rust unit tests:**
  - `guard` (existing + `ms-settings:notifications`)
  - `links` parsing
  - `handoff` validation
  - `nudges` gating (quiet hours, pause-until-midnight, the one-extra cap)
- **Web unit tests:**
  - `dueStatePublisher` (dedupe, per-minute tick)
  - `nudgePlanner`
  - `deepLinkRouter` (allowlist, PKCE callback)
  - `fileHandoff`
  - `DropOverlay`
  - `QuickReviewPage` (flip, rate, done, signed out)
  - `DesktopChrome` (title, context menu, shortcuts)
- **CI:** `desktop-windows.yml` builds on every PR (already in place).
- **Hand checklist on a real Windows 11 machine** (docs, run before the first
  release):
  - installer and uninstaller
  - title bar colours
  - no white flash
  - tray and menu
  - badge
  - toast buttons
  - Ctrl+Alt+Space placement on two monitors
  - Explorer verb
  - drop overlay
  - `auramind://` link
  - Google sign-in
  - start with Windows `--hidden`
  - Quit

## 10. Out of scope

- A top-level Windows 11 context-menu entry, MSIX, and the Microsoft Store
  (all need a code-signing certificate).
- Windows 11 widgets for the Tauri app (the PWA widget stays web-only).
- macOS and Linux builds.
- A personal FSRS tuner.
