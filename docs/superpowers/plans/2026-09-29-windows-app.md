# AuraMind for Windows (full potential) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Tauri 2 Windows shell from PR #119 into a full Windows 11 app: branded native window, study nudges (tray, toasts, taskbar badge, start with Windows), a Quick Review corner window on a global shortcut, drop-to-create (window, Explorer, tray), and `auramind://` links with PKCE Google/Notion sign-in.

**Architecture:** Rust (`auramind-gemini/src-tauri/src/`) owns everything that talks to Windows. React owns data and decisions and sends Rust small messages over a typed command/event contract (`auramind-gemini/src/desktop/bridge.ts`). Quick Review is a second window on the same bundle at `/quick-review`. Every Windows-only React module is a no-op unless `isDesktopApp()`.

**Tech Stack:** Tauri 2.12, Rust 1.95 (plugins: global-shortcut, autostart, dialog, deep-link, single-instance with `deep-link`), `tauri-winrt-notification`, `windows` (DWM), `window-vibrancy`, `chrono`, `serde`; React 19 + Vite 8 + Vitest 5; `@tauri-apps/api` 2.12.

**Spec:** `docs/superpowers/specs/2026-09-29-windows-app-design.md`

## Global Constraints

- Work only in the worktree `C:\Users\wegot\AuraMind Website\AuraMind-windows` on branch `feat/windows-desktop-app`. The main checkout is the user's working copy; never switch its branch.
- The app origin is `https://tauri.localhost` (`useHttpsScheme: true`). Never change it.
- The web layer never gets filesystem or shell permissions. Rust reads Explorer/tray files itself.
- FSRS, due counts and "fading" are computed only in TypeScript. Rust never calls Supabase.
- "Fading" means a reviewed card whose `cardRetrievability(card, now)` is in `[SPARK_BAND_MIN, SPARK_BAND_MAX]` (0.65–0.90) from `services/memory/sparkScheduler.ts`.
- Accepted course files: documents `pdf pptx docx doc txt md`, audio `mp3 wav m4a ogg webm`. Max 50 MB (52_428_800 bytes).
- Quiet hours 22:00–08:00 (`DEFAULT_QUIET_START_HOUR` / `DEFAULT_QUIET_END_HOUR`). Daily reminder time comes from preference `auramind_reminderTime` (default `"09:00"`), gated by `auramind_dailyReminder` (default `true`); the extra afternoon nudge (15:00) is gated by `auramind_dueReminder` (default `true`) and `fadingCount >= 10`.
- Global shortcut default `CommandOrControl+Alt+Space`; stored in preference `auramind_quickReviewShortcut`.
- Quick Review window: label `quick-review`, 380×300 logical px, 12 px margin from the work-area corner, max 10 cards per session.
- Title bar colours (Windows 11): caption `#0b1022`, text `#e8e6ff`, border `#8B5CF6`.
- Windows AppUserModelID for toasts = bundle identifier `com.auramind.app`.
- Start with Windows is **off** by default; autostart launches with `--hidden`.
- OAuth redirect `auramind://auth/callback`; buttons stay hidden unless `VITE_DESKTOP_OAUTH=true`.
- Commits: Conventional Commits, **no** `Co-Authored-By` or tool footers. Run `npm run type-check`, `npm run lint`, and the touched tests before each commit.
- Git pushes: the credential manager needs a re-login; push with `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`.

## Review Focus

1. **Monitor under the cursor sits left of / above the primary monitor (negative coordinates).** Quick Review must still open inside that monitor's work area, not on the primary one. Pinned by `quick_review::position_in_work_area` tests in Task 7.
2. **Due count at 0 after having been positive.** Tray tooltip, dot icon and taskbar badge must all clear, not stay on the last number. Pinned by `badge::badge_for` / tray label tests in Task 8.
3. **A deep link or Explorer file arrives while the app is starting (window not ready yet).** It must be delivered once the web layer is listening, not dropped. Pinned by the outbox tests in Task 6 (`events_before_ready_are_held_in_order`) and the `useDesktopIntegration` tests in Task 14.
4. **A file whose extension is allowed but whose name has uppercase or a double extension (`Notes.PDF`, `evil.pdf.exe`).** Uppercase accepted; the real last extension decides. Pinned by `handoff` tests in Task 3 and `courseFiles` tests in Task 11.
5. **Reminder time is inside quiet hours, or already passed today.** The planner must roll to the next valid time, never fire in quiet hours, and never schedule two nudges within 2 hours. Pinned by `nudgePlanner` tests in Task 13.

---

## File Map

**Rust — `auramind-gemini/src-tauri/`**

| File | Responsibility |
|---|---|
| `Cargo.toml` | Add plugins/crates and `tray-icon`, `image-png` features |
| `build.rs` | App manifest so app commands get per-window permissions |
| `tauri.conf.json` | Main window hidden at start; deep-link scheme; NSIS art + hooks |
| `capabilities/main.json`, `capabilities/quick-review.json` | Per-window permissions (replace `default.json`) |
| `windows/installer-hooks.nsh` | Explorer "Make a course with AuraMind" verbs (add/remove) |
| `windows/generate-assets.ps1` | Renders tray, badge and installer art from `icons/icon.png` |
| `icons/tray*.png`, `icons/badges/*.png`, `windows/nsis-*.bmp` | Generated, committed assets |
| `src/lib.rs` | Builder wiring only |
| `src/guard.rs` | Navigation guard (moved from `lib.rs`) |
| `src/links.rs` | CLI args + `auramind://` parsing |
| `src/handoff.rs` | Course-file validation + reading |
| `src/nudges.rs` | Nudge store, gating, timer thread, toasts |
| `src/chrome.rs` | DWM colours, show-after-paint |
| `src/tray.rs` | Tray icon + menu |
| `src/badge.rs` | Taskbar overlay badge |
| `src/quick_review.rs` | Quick Review window + global shortcut |
| `src/state.rs` | Shared `AppState` (due state, pending events, flags) |
| `src/commands.rs` | All `#[tauri::command]`s |

**Web — `auramind-gemini/src/`**

| File | Responsibility |
|---|---|
| `desktop/bridge.ts` | Typed `invoke`/`listen` wrappers |
| `desktop/dueState.ts` | Pure: cards → `DueState` |
| `desktop/nudgePlanner.ts` | Pure: due state + prefs → nudges |
| `desktop/useDesktopIntegration.ts` | Main-window hook: publish due state, schedule nudges, route events |
| `desktop/deepLinkRouter.ts` | `auramind://` → navigate or PKCE exchange |
| `desktop/DesktopChrome.tsx` | app_ready, titles, context menu, shortcuts |
| `desktop/DesktopSettingsSection.tsx` | Settings: shortcut, start with Windows, notification status |
| `lib/courseFiles.ts` | Accepted extensions + classify |
| `lib/pendingGeneratorFile.ts` | Hand a `File` to the generator across navigation |
| `components/shared/DropOverlay.tsx` | Full-window drop target |
| `services/study/rateCard.ts` | Shared rating path (study screen semantics) |
| `pages/quickReview/QuickReviewPage.tsx` | The corner panel |
| `styles/desktop.css` | `html.platform-desktop` scrollbars, quick-review transparency |
| Modified: `App.tsx`, `index.tsx`, `services/database/supabase.ts`, `components/auth/AuthPage.tsx`, `pages/generator/GeneratorPage.tsx`, `pages/dashboard/SparkReviewPage.tsx`, `pages/settings/SettingsPage.tsx`, `lib/env.ts`, `.env.desktop` | |

---
### Task 1: Move the navigation guard into `guard.rs` (+ one settings exception)

**Files:**
- Create: `auramind-gemini/src-tauri/src/guard.rs`
- Modify: `auramind-gemini/src-tauri/src/lib.rs` (delete lines 13–41 and the `tests` module; import from `guard`)

**Interfaces:**
- Produces: `pub fn stays_in_app(url: &Url) -> bool`, `pub fn opens_externally(url: &Url) -> bool`, `pub const APP_HOST: &str`

- [ ] **Step 1: Create `guard.rs` with the existing code and tests, plus the new failing test**

```rust
//! What stays inside the app window, and what the OS may open.

use url::Url;

/// Where the app itself is served from. Changing this would move every
/// user's saved session and offline data to a new, empty origin, so it must
/// match `useHttpsScheme: true` in tauri.conf.json forever.
pub const APP_HOST: &str = "tauri.localhost";

/// The single Windows settings page the app may open (Settings → "turn on
/// notifications"). Exact match only; no other `ms-settings:` URI passes.
const NOTIFICATION_SETTINGS: &str = "ms-settings:notifications";

/// Whether a navigation stays inside the app window.
///
/// Anything else (Stripe checkout, help links, sign-in providers) opens in the
/// user's own browser, the way Capacitor sends outside links out of the phone
/// apps. Keeping checkout out of the app window also means Stripe's success
/// redirect to auramind.app lands in the browser, not over the bundled app;
/// the app re-checks the subscription when its window regains focus.
pub fn stays_in_app(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "data" | "blob" => true,
        "http" | "https" => match url.host_str() {
            Some(APP_HOST) => true,
            // `tauri dev` loads the Vite dev server instead of the bundle.
            Some("localhost") | Some("127.0.0.1") => cfg!(debug_assertions),
            _ => false,
        },
        _ => false,
    }
}

/// URLs worth handing to the operating system when they leave the app.
pub fn opens_externally(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto") || url.as_str() == NOTIFICATION_SETTINGS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn the_bundled_app_stays_in_the_window() {
        assert!(stays_in_app(&url("https://tauri.localhost/dashboard")));
        assert!(stays_in_app(&url("https://tauri.localhost/deck/abc?tab=community")));
        assert!(stays_in_app(&url("tauri://localhost/")));
        assert!(stays_in_app(&url("about:blank")));
    }

    #[test]
    fn outside_sites_leave_the_window() {
        for outside in [
            "https://checkout.stripe.com/c/pay/cs_live_123",
            "https://auramind.app/subscribe?payment=success",
            "https://accounts.google.com/o/oauth2/auth",
            "https://tauri.localhost.evil.example/",
            "http://evil.example/https://tauri.localhost",
        ] {
            assert!(!stays_in_app(&url(outside)), "{outside} must open outside the app");
        }
    }

    #[test]
    fn only_web_and_mail_links_are_handed_to_the_os() {
        assert!(opens_externally(&url("https://auramind.app/privacy")));
        assert!(opens_externally(&url("mailto:hello@auramind.app")));
        assert!(!opens_externally(&url("file:///C:/Windows/System32/cmd.exe")));
        assert!(!opens_externally(&url("ms-settings:privacy")));
    }

    #[test]
    fn exactly_the_notification_settings_page_may_open() {
        assert!(opens_externally(&url("ms-settings:notifications")));
        assert!(!opens_externally(&url("ms-settings:notifications-evil")));
        assert!(!opens_externally(&url("ms-settings:windowsupdate")));
    }

    #[test]
    fn the_dev_server_is_only_trusted_in_debug_builds() {
        assert_eq!(stays_in_app(&url("http://localhost:3000/")), cfg!(debug_assertions));
    }
}
```

- [ ] **Step 2: Rewire `lib.rs`**

Replace lines 9–41 of `src/lib.rs` (the `use` lines, `APP_HOST`, `stays_in_app`, `opens_externally`) with:

```rust
mod guard;

use guard::{opens_externally, stays_in_app};
use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
```

and delete the whole `#[cfg(test)] mod tests { … }` block at the bottom (lines 88–129). The tests now live in `guard.rs`.

- [ ] **Step 3: Run the Rust tests**

Run: `cargo test --manifest-path auramind-gemini/src-tauri/Cargo.toml`
Expected: 5 passed (4 moved + `exactly_the_notification_settings_page_may_open`).

- [ ] **Step 4: Commit**

```bash
git add auramind-gemini/src-tauri/src/guard.rs auramind-gemini/src-tauri/src/lib.rs
git commit -m "refactor(desktop): move the navigation guard into guard.rs" -m "Allows exactly ms-settings:notifications to open, for the Settings button that sends users to turn notifications on."
```

---

### Task 2: `links.rs` — launch arguments and `auramind://` URLs

**Files:**
- Create: `auramind-gemini/src-tauri/src/links.rs`
- Modify: `auramind-gemini/src-tauri/src/lib.rs` (add `mod links;`)

**Interfaces:**
- Produces:
  - `pub enum LaunchIntent { Hidden, Create(std::path::PathBuf), Open(String) }` (derives `Debug, Clone, PartialEq, Eq`)
  - `pub fn parse_args(args: &[String]) -> Vec<LaunchIntent>` — `args` excludes nothing; element 0 (the exe path) is skipped
  - `pub fn is_app_url(s: &str) -> bool` — true only for `auramind://app/...` and `auramind://auth/callback...`

- [ ] **Step 1: Write the failing tests**

```rust
//! What a launch (or a second launch forwarded by single-instance) asks for.
//!
//! The Explorer verb runs `AuraMind.exe --create "<path>"`, autostart runs
//! `AuraMind.exe --hidden`, and Windows runs `AuraMind.exe "auramind://..."`
//! for a deep link. Parsing is pure so every shape is unit-tested; the
//! allowlist of in-app routes stays in TypeScript (`lib/deepLinks.ts`).

use std::path::PathBuf;
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchIntent {
    /// Start in the tray without showing the window (autostart).
    Hidden,
    /// Make a course from this file (Explorer verb).
    Create(PathBuf),
    /// An `auramind://` link to hand to the web layer.
    Open(String),
}

/// Only the two shapes the app understands. Everything else is ignored so a
/// crafted link can't reach the web layer at all.
pub fn is_app_url(s: &str) -> bool {
    let Ok(url) = Url::parse(s) else { return false };
    if url.scheme() != "auramind" {
        return false;
    }
    match url.host_str() {
        Some("app") => true,
        Some("auth") => url.path() == "/callback",
        _ => false,
    }
}

pub fn parse_args(args: &[String]) -> Vec<LaunchIntent> {
    let mut intents = Vec::new();
    let mut rest = args.iter().skip(1);
    while let Some(arg) = rest.next() {
        match arg.as_str() {
            "--hidden" => intents.push(LaunchIntent::Hidden),
            "--create" => {
                if let Some(path) = rest.next() {
                    intents.push(LaunchIntent::Create(PathBuf::from(path)));
                }
            }
            other if is_app_url(other) => intents.push(LaunchIntent::Open(other.to_string())),
            _ => {}
        }
    }
    intents
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        std::iter::once("C:\\AuraMind\\AuraMind.exe")
            .chain(list.iter().copied())
            .map(String::from)
            .collect()
    }

    #[test]
    fn no_arguments_means_a_normal_launch() {
        assert!(parse_args(&args(&[])).is_empty());
    }

    #[test]
    fn autostart_starts_hidden() {
        assert_eq!(parse_args(&args(&["--hidden"])), vec![LaunchIntent::Hidden]);
    }

    #[test]
    fn the_explorer_verb_passes_a_path() {
        assert_eq!(
            parse_args(&args(&["--create", "C:\\Users\\a\\Notes.pdf"])),
            vec![LaunchIntent::Create(PathBuf::from("C:\\Users\\a\\Notes.pdf"))]
        );
    }

    #[test]
    fn a_trailing_create_without_a_path_is_ignored() {
        assert!(parse_args(&args(&["--create"])).is_empty());
    }

    #[test]
    fn app_links_and_the_auth_callback_pass() {
        assert_eq!(
            parse_args(&args(&["auramind://app/study"])),
            vec![LaunchIntent::Open("auramind://app/study".into())]
        );
        assert!(is_app_url("auramind://auth/callback?code=abc"));
    }

    #[test]
    fn anything_else_is_dropped() {
        for bad in [
            "https://auramind.app/app/study",
            "auramind://auth/other",
            "auramind://evil/app",
            "auramind:app/study",
            "--unknown",
            "not a url",
        ] {
            assert!(parse_args(&args(&[bad])).is_empty(), "{bad} must be ignored");
        }
    }
}
```

- [ ] **Step 2: Add `mod links;` under `mod guard;` in `lib.rs`**

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path auramind-gemini/src-tauri/Cargo.toml links`
Expected: 6 passed.

- [ ] **Step 4: Commit**

```bash
git add auramind-gemini/src-tauri/src/links.rs auramind-gemini/src-tauri/src/lib.rs
git commit -m "feat(desktop): parse launch arguments and auramind:// links"
```

---

### Task 3: `handoff.rs` — validate and read a course file

**Files:**
- Create: `auramind-gemini/src-tauri/src/handoff.rs`
- Modify: `auramind-gemini/src-tauri/Cargo.toml` (add `base64 = "0.22"`, `serde = { version = "1", features = ["derive"] }`), `src/lib.rs` (`mod handoff;`)

**Interfaces:**
- Produces:
  - `pub const DOC_EXTS: &[&str]`, `pub const AUDIO_EXTS: &[&str]`, `pub const MAX_BYTES: u64 = 52_428_800;`
  - `#[derive(Serialize)] #[serde(tag = "kind", rename_all = "camelCase")] pub enum Handoff { File { name: String, mime: &'static str, base64: String }, Error { name: String, reason: &'static str } }` — `reason` ∈ `"unsupported" | "too-large" | "unreadable"`
  - `pub fn read(path: &std::path::Path) -> Handoff`
- Serialized examples (consumed by `bridge.ts`, Task 10): `{"kind":"file","name":"a.pdf","mime":"application/pdf","base64":"..."}`, `{"kind":"error","name":"a.exe","reason":"unsupported"}`

- [ ] **Step 1: Write the module with failing tests**

```rust
//! Files handed to AuraMind from outside the app (Explorer verb, tray file
//! picker). The only place Rust reads a user file: it checks the extension
//! and size, then passes the bytes to the web layer, which feeds the same
//! generator as a drag-and-drop. The lists mirror the generator's own
//! `accept` attributes; `courseFiles.test.ts` fails if they drift.

use base64::Engine;
use serde::Serialize;
use std::path::Path;

pub const DOC_EXTS: &[&str] = &["pdf", "pptx", "docx", "doc", "txt", "md"];
pub const AUDIO_EXTS: &[&str] = &["mp3", "wav", "m4a", "ogg", "webm"];
pub const MAX_BYTES: u64 = 52_428_800; // 50 MB

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Handoff {
    File { name: String, mime: &'static str, base64: String },
    Error { name: String, reason: &'static str },
}

fn mime_for(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "pdf" => "application/pdf",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc" => "application/msword",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "webm" => "audio/webm",
        _ => return None,
    })
}

/// The real (last) extension, lowercased. `evil.pdf.exe` → `exe`.
fn extension(path: &Path) -> Option<String> {
    path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase())
}

pub fn read(path: &Path) -> Handoff {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let Some(mime) = extension(path).as_deref().and_then(mime_for) else {
        return Handoff::Error { name, reason: "unsupported" };
    };
    let Ok(meta) = std::fs::metadata(path) else {
        return Handoff::Error { name, reason: "unreadable" };
    };
    if !meta.is_file() {
        return Handoff::Error { name, reason: "unreadable" };
    }
    if meta.len() > MAX_BYTES {
        return Handoff::Error { name, reason: "too-large" };
    }
    match std::fs::read(path) {
        Ok(bytes) => Handoff::File {
            name,
            mime,
            base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        },
        Err(_) => Handoff::Error { name, reason: "unreadable" },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("auramind-handoff-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::File::create(&path).unwrap().write_all(bytes).unwrap();
        path
    }

    #[test]
    fn a_pdf_is_read_and_encoded() {
        let path = temp_file("Notes.PDF", b"%PDF-1.7");
        assert_eq!(
            read(&path),
            Handoff::File {
                name: "Notes.PDF".into(),
                mime: "application/pdf",
                base64: "JVBERi0xLjc=".into()
            }
        );
    }

    #[test]
    fn the_last_extension_decides() {
        let path = temp_file("evil.pdf.exe", b"MZ");
        assert_eq!(read(&path), Handoff::Error { name: "evil.pdf.exe".into(), reason: "unsupported" });
    }

    #[test]
    fn a_missing_file_is_unreadable() {
        let path = std::env::temp_dir().join("auramind-does-not-exist.pdf");
        assert_eq!(read(&path), Handoff::Error { name: "auramind-does-not-exist.pdf".into(), reason: "unreadable" });
    }

    #[test]
    fn a_directory_is_unreadable() {
        let dir = std::env::temp_dir().join(format!("auramind-dir-{}.pdf", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(matches!(read(&dir), Handoff::Error { reason: "unreadable", .. }));
    }

    #[test]
    fn every_listed_extension_has_a_mime_type() {
        for ext in DOC_EXTS.iter().chain(AUDIO_EXTS) {
            assert!(mime_for(ext).is_some(), "{ext} needs a mime type");
        }
    }

    #[test]
    fn it_serialises_the_shape_the_web_layer_expects() {
        let json = serde_json::to_string(&Handoff::Error { name: "a.exe".into(), reason: "unsupported" }).unwrap();
        assert_eq!(json, r#"{"kind":"error","name":"a.exe","reason":"unsupported"}"#);
    }
}
```

The size cap is checked from metadata before reading; it isn't unit-tested with a real 50 MB file (too slow). The check is one comparison, covered by review.

- [ ] **Step 2: Add the dependencies**

In `Cargo.toml` under `[dependencies]` add:

```toml
base64 = "0.22"
serde = { version = "1", features = ["derive"] }
```

Add `mod handoff;` to `lib.rs`.

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path auramind-gemini/src-tauri/Cargo.toml handoff`
Expected: 6 passed.

- [ ] **Step 4: Commit**

```bash
git add auramind-gemini/src-tauri/Cargo.toml auramind-gemini/src-tauri/Cargo.lock auramind-gemini/src-tauri/src/handoff.rs auramind-gemini/src-tauri/src/lib.rs
git commit -m "feat(desktop): validate and read files handed in from Explorer"
```

---

### Task 4: `nudges.rs` — which scheduled nudges fire now (pure)

**Files:**
- Create: `auramind-gemini/src-tauri/src/nudges.rs`
- Modify: `Cargo.toml` (add `chrono = { version = "0.4", default-features = false, features = ["clock"] }`), `src/lib.rs` (`mod nudges;`)

**Interfaces:**
- Produces:
  - `#[derive(Debug, Clone, Deserialize, PartialEq)] #[serde(rename_all = "camelCase")] pub struct Nudge { pub at_ms: i64, pub title: String, pub body: String }`
  - `pub struct Gate { pub paused_until_ms: Option<i64>, pub busy: bool }`
  - `pub const STALE_AFTER_MS: i64 = 30 * 60 * 1000;`
  - `pub fn take_due(nudges: &mut Vec<Nudge>, now_ms: i64, gate: &Gate) -> Vec<Nudge>`
  - `pub fn next_local_midnight_ms(now: chrono::DateTime<chrono::Local>) -> i64`
- JSON from React (Task 10): `{"nudges":[{"atMs":1790000000000,"title":"12 cards are ready","body":"About 5 minutes. …"}]}`

- [ ] **Step 1: Write the module with failing tests**

```rust
//! Study nudges: React plans them (quiet hours, reminder time, wording in
//! `desktop/nudgePlanner.ts`); Rust holds them and fires them on time,
//! because WebView2 throttles timers in hidden windows. This part is pure:
//! given the plan, the clock and the gate, what fires now.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Nudge {
    pub at_ms: i64,
    pub title: String,
    pub body: String,
}

/// Reasons to stay quiet right now.
#[derive(Debug, Default, Clone)]
pub struct Gate {
    /// "Pause reminders for today" — until local midnight.
    pub paused_until_ms: Option<i64>,
    /// The user is studying (study screen or Quick Review open).
    pub busy: bool,
}

/// A nudge more than this late (the PC was asleep) is dropped, not fired.
pub const STALE_AFTER_MS: i64 = 30 * 60 * 1000;

/// Remove every nudge whose time has come and return the ones to show.
/// Due nudges are consumed even when gated, so a paused reminder doesn't
/// fire the moment the pause ends.
pub fn take_due(nudges: &mut Vec<Nudge>, now_ms: i64, gate: &Gate) -> Vec<Nudge> {
    let (due, later): (Vec<Nudge>, Vec<Nudge>) = nudges.drain(..).partition(|n| n.at_ms <= now_ms);
    *nudges = later;
    let paused = gate.paused_until_ms.is_some_and(|until| now_ms < until);
    if paused || gate.busy {
        return Vec::new();
    }
    due.into_iter().filter(|n| now_ms - n.at_ms <= STALE_AFTER_MS).collect()
}

pub fn next_local_midnight_ms(now: chrono::DateTime<chrono::Local>) -> i64 {
    let tomorrow = now.date_naive().succ_opt().expect("date in range");
    tomorrow
        .and_hms_opt(0, 0, 0)
        .and_then(|t| t.and_local_timezone(chrono::Local).earliest())
        .map(|t| t.timestamp_millis())
        .unwrap_or(now.timestamp_millis() + 24 * 60 * 60 * 1000)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nudge(at_ms: i64) -> Nudge {
        Nudge { at_ms, title: "12 cards are ready".into(), body: "About 5 minutes.".into() }
    }

    #[test]
    fn nothing_fires_before_its_time() {
        let mut plan = vec![nudge(1_000)];
        assert!(take_due(&mut plan, 999, &Gate::default()).is_empty());
        assert_eq!(plan.len(), 1);
    }

    #[test]
    fn a_due_nudge_fires_once() {
        let mut plan = vec![nudge(1_000), nudge(9_000)];
        assert_eq!(take_due(&mut plan, 1_000, &Gate::default()), vec![nudge(1_000)]);
        assert_eq!(plan, vec![nudge(9_000)]);
        assert!(take_due(&mut plan, 1_500, &Gate::default()).is_empty());
    }

    #[test]
    fn a_paused_day_consumes_without_firing() {
        let mut plan = vec![nudge(1_000)];
        let gate = Gate { paused_until_ms: Some(5_000), busy: false };
        assert!(take_due(&mut plan, 1_000, &gate).is_empty());
        assert!(plan.is_empty(), "must not fire the moment the pause ends");
    }

    #[test]
    fn an_expired_pause_no_longer_blocks() {
        let mut plan = vec![nudge(6_000)];
        let gate = Gate { paused_until_ms: Some(5_000), busy: false };
        assert_eq!(take_due(&mut plan, 6_000, &gate).len(), 1);
    }

    #[test]
    fn studying_suppresses() {
        let mut plan = vec![nudge(1_000)];
        let gate = Gate { paused_until_ms: None, busy: true };
        assert!(take_due(&mut plan, 1_000, &gate).is_empty());
    }

    #[test]
    fn a_nudge_missed_while_asleep_is_dropped() {
        let mut plan = vec![nudge(0)];
        assert!(take_due(&mut plan, STALE_AFTER_MS + 1, &Gate::default()).is_empty());
        assert!(plan.is_empty());
    }

    #[test]
    fn midnight_is_later_today_boundary() {
        use chrono::TimeZone;
        let now = chrono::Local.with_ymd_and_hms(2026, 9, 29, 15, 30, 0).unwrap();
        let midnight = chrono::Local.with_ymd_and_hms(2026, 9, 30, 0, 0, 0).unwrap();
        assert_eq!(next_local_midnight_ms(now), midnight.timestamp_millis());
    }
}
```

- [ ] **Step 2: Add `chrono` to `Cargo.toml` and `mod nudges;` to `lib.rs`**

```toml
chrono = { version = "0.4", default-features = false, features = ["clock"] }
```

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path auramind-gemini/src-tauri/Cargo.toml nudges`
Expected: 7 passed.

- [ ] **Step 4: Commit**

```bash
git add auramind-gemini/src-tauri/Cargo.toml auramind-gemini/src-tauri/Cargo.lock auramind-gemini/src-tauri/src/nudges.rs auramind-gemini/src-tauri/src/lib.rs
git commit -m "feat(desktop): decide which study nudges fire, pure and tested"
```

---
### Task 5: Brand assets — crisp icon, tray, badges, installer art

**Files:**
- Regenerate: `auramind-gemini/src-tauri/icons/*` (from the SVG mark)
- Create: `auramind-gemini/src-tauri/windows/generate-assets.ps1`
- Create (generated, committed): `icons/tray.png`, `icons/tray-due.png`, `icons/badges/{1..9,9plus}.png`, `windows/nsis-header.bmp`, `windows/nsis-sidebar.bmp`
- Modify: `auramind-gemini/src-tauri/tauri.conf.json` (NSIS art)

**Interfaces:**
- Produces files later tasks `include_bytes!`: `icons/tray.png`, `icons/tray-due.png`, `icons/badges/1.png` … `icons/badges/9.png`, `icons/badges/9plus.png` (all 32×32 RGBA PNG).

- [ ] **Step 1: Regenerate the app icon from the vector mark**

```bash
cd auramind-gemini
npx tauri icon "public/favicons,logos/favicon.svg" -o src-tauri/icons
rm -rf src-tauri/icons/android src-tauri/icons/ios src-tauri/icons/icon.icns
```

Expected: `src-tauri/icons/icon.ico` and the PNGs listed in `tauri.conf.json` → `bundle.icon` are rewritten.

- [ ] **Step 2: Write the asset generator**

`auramind-gemini/src-tauri/windows/generate-assets.ps1`:

```powershell
# Renders the Windows-only brand assets from icons/icon.png.
# Run from auramind-gemini/src-tauri:  powershell -ExecutionPolicy Bypass -File windows/generate-assets.ps1
# Outputs are committed; rerun only when the mark or palette changes.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$mark = [System.Drawing.Image]::FromFile((Join-Path $root 'icons/icon.png'))
$navy = [System.Drawing.ColorTranslator]::FromHtml('#060a16')
$violet = [System.Drawing.ColorTranslator]::FromHtml('#7C3AED')
$violetLight = [System.Drawing.ColorTranslator]::FromHtml('#8B5CF6')
$pink = [System.Drawing.ColorTranslator]::FromHtml('#FF9ACD')

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'
  return @($bmp, $g)
}

# Tray icons (32x32): the mark, and the mark with a "due" dot.
foreach ($variant in 'tray', 'tray-due') {
  $bmp, $g = New-Canvas 32 32
  $g.DrawImage($mark, 0, 0, 32, 32)
  if ($variant -eq 'tray-due') {
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $navy), 19, 19, 13, 13)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $violetLight), 21, 21, 9, 9)
  }
  $bmp.Save((Join-Path $root "icons/$variant.png"), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

# Taskbar overlay badges (32x32; Windows draws them at 16x16 logical).
New-Item -ItemType Directory -Force (Join-Path $root 'icons/badges') | Out-Null
$labels = @('1','2','3','4','5','6','7','8','9','9+')
foreach ($label in $labels) {
  $bmp, $g = New-Canvas 32 32
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $violet), 0, 0, 31, 31)
  $size = if ($label.Length -gt 1) { 13 } else { 18 }
  $font = New-Object System.Drawing.Font 'Segoe UI Semibold', $size, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $g.DrawString($label, $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 1, 32, 32), $fmt)
  $file = if ($label -eq '9+') { '9plus' } else { $label }
  $bmp.Save((Join-Path $root "icons/badges/$file.png"), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

# NSIS installer art (24-bit BMP): header 150x57, sidebar 164x314.
function Save-Aurora([int]$w, [int]$h, [string]$name, [int]$markSize, [bool]$withWordmark) {
  $bmp, $g = New-Canvas $w $h
  $g.Clear($navy)
  foreach ($glow in @(@($violet, 0.55, 0.30, 0.9), @($pink, 0.20, 0.85, 0.6))) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $cx = $w * $glow[1]; $cy = $h * $glow[2]; $r = [Math]::Max($w, $h) * $glow[3]
    $path.AddEllipse($cx - $r / 2, $cy - $r / 2, $r, $r)
    $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
    $brush.CenterColor = [System.Drawing.Color]::FromArgb(110, $glow[0]); $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $glow[0]))
    $g.FillPath($brush, $path)
  }
  $x = if ($withWordmark) { ($w - $markSize) / 2 } else { $w - $markSize - 8 }
  $y = if ($withWordmark) { $h * 0.30 } else { ($h - $markSize) / 2 }
  $g.DrawImage($mark, [int]$x, [int]$y, $markSize, $markSize)
  if ($withWordmark) {
    $font = New-Object System.Drawing.Font 'Segoe UI Semilight', 20, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'
    $g.DrawString('AuraMind', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, ($y + $markSize + 10), $w, 30), $fmt)
  }
  $flat = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $fg = [System.Drawing.Graphics]::FromImage($flat); $fg.DrawImage($bmp, 0, 0, $w, $h); $fg.Dispose()
  $flat.Save((Join-Path $root "windows/$name"), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $flat.Dispose(); $g.Dispose(); $bmp.Dispose()
}
Save-Aurora 150 57 'nsis-header.bmp' 40 $false
Save-Aurora 164 314 'nsis-sidebar.bmp' 72 $true
$mark.Dispose()
Write-Host 'Generated tray, badge and installer assets.'
```

- [ ] **Step 3: Run it and check the outputs**

```bash
cd auramind-gemini/src-tauri
powershell -ExecutionPolicy Bypass -File windows/generate-assets.ps1
powershell -Command "Add-Type -AssemblyName System.Drawing; Get-ChildItem icons/tray*.png, icons/badges/*.png, windows/*.bmp | ForEach-Object { \$i=[System.Drawing.Image]::FromFile(\$_.FullName); '{0} {1}x{2}' -f \$_.Name,\$i.Width,\$i.Height; \$i.Dispose() }"
```

Expected: `tray.png 32x32`, `tray-due.png 32x32`, ten badges `32x32`, `nsis-header.bmp 150x57`, `nsis-sidebar.bmp 164x314`. Open `windows/nsis-sidebar.bmp` and one badge to eyeball them (navy + violet aurora, mark centred; white digit on violet).

- [ ] **Step 4: Point the installer at the art**

In `tauri.conf.json` → `bundle.windows.nsis`, add:

```json
"installerIcon": "icons/icon.ico",
"headerImage": "windows/nsis-header.bmp",
"sidebarImage": "windows/nsis-sidebar.bmp"
```

- [ ] **Step 5: Commit**

```bash
git add auramind-gemini/src-tauri/icons auramind-gemini/src-tauri/windows auramind-gemini/src-tauri/tauri.conf.json
git commit -m "feat(desktop): crisp icon from the vector mark, tray/badge and installer art"
```

---

### Task 6: App state, the event outbox, branded title bar, and show-after-paint

**Files:**
- Create: `src-tauri/src/state.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/chrome.rs`, `src-tauri/capabilities/main.json`, `src-tauri/capabilities/quick-review.json`
- Delete: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/build.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json` (main window `"visible": false`), `src-tauri/Cargo.toml`

**Interfaces:**
- Produces (Rust):
  - `state::Outbox` with `pub fn push(&mut self, ev: Outgoing) -> Option<Outgoing>` and `pub fn mark_ready(&mut self) -> Vec<Outgoing>`; `pub struct Outgoing { pub event: &'static str, pub payload: serde_json::Value }`
  - `state::AppState { outbox: Mutex<Outbox>, hidden_start: AtomicBool, due: Mutex<DueState>, nudges: Mutex<Vec<Nudge>>, paused_until_ms: Mutex<Option<i64>>, quick_review_open: AtomicBool }`
  - `state::DueState { due: u32, fading_count: u32, top_decks: Vec<String>, streak: u32, studying: bool }` (serde camelCase)
  - `state::emit_to_main(app: &AppHandle, event: &'static str, payload: serde_json::Value)` — emits now if the web layer is ready, else queues
  - `chrome::show_main_window(app: &AppHandle)`, `chrome::brand_title_bar(window: &WebviewWindow)`, `chrome::colorref(hex: &str) -> Option<u32>`
  - Commands: `app_ready()`, `show_main(path: Option<String>)`
- Produces (permission identifiers): `allow-app-ready`, `allow-show-main`

- [ ] **Step 1: Write `state.rs` with the outbox tests first**

```rust
//! Shared state and the outbox that holds events until the web layer is
//! listening. A deep link or Explorer file can arrive before React has
//! mounted (cold start, autostart); without the outbox it would be lost.

use crate::nudges::Nudge;
use serde::Deserialize;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, PartialEq)]
pub struct Outgoing {
    pub event: &'static str,
    pub payload: serde_json::Value,
}

#[derive(Debug, Default)]
pub struct Outbox {
    ready: bool,
    queued: Vec<Outgoing>,
}

impl Outbox {
    /// Returns the event back when it can be emitted now; queues it otherwise.
    pub fn push(&mut self, ev: Outgoing) -> Option<Outgoing> {
        if self.ready {
            Some(ev)
        } else {
            self.queued.push(ev);
            None
        }
    }

    /// The web layer is listening: hand back everything queued, in order.
    pub fn mark_ready(&mut self) -> Vec<Outgoing> {
        self.ready = true;
        std::mem::take(&mut self.queued)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DueState {
    pub due: u32,
    pub fading_count: u32,
    pub top_decks: Vec<String>,
    pub streak: u32,
    pub studying: bool,
}

#[derive(Default)]
pub struct AppState {
    pub outbox: Mutex<Outbox>,
    pub hidden_start: AtomicBool,
    pub due: Mutex<DueState>,
    pub nudges: Mutex<Vec<Nudge>>,
    pub paused_until_ms: Mutex<Option<i64>>,
    pub quick_review_open: AtomicBool,
}

pub fn emit_to_main(app: &AppHandle, event: &'static str, payload: serde_json::Value) {
    let state = app.state::<AppState>();
    let now = state.outbox.lock().unwrap().push(Outgoing { event, payload });
    if let Some(ev) = now {
        let _ = app.emit_to("main", ev.event, ev.payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(event: &'static str) -> Outgoing {
        Outgoing { event, payload: serde_json::json!({}) }
    }

    #[test]
    fn events_before_ready_are_held_in_order() {
        let mut outbox = Outbox::default();
        assert_eq!(outbox.push(ev("deep-link")), None);
        assert_eq!(outbox.push(ev("create-from-file")), None);
        assert_eq!(outbox.mark_ready(), vec![ev("deep-link"), ev("create-from-file")]);
    }

    #[test]
    fn events_after_ready_go_straight_out() {
        let mut outbox = Outbox::default();
        outbox.mark_ready();
        assert_eq!(outbox.push(ev("open-route")), Some(ev("open-route")));
        assert!(outbox.mark_ready().is_empty());
    }

    #[test]
    fn due_state_reads_the_web_layers_json() {
        let parsed: DueState = serde_json::from_str(
            r#"{"due":12,"fadingCount":3,"topDecks":["Spanish A1"],"streak":5,"studying":false}"#,
        )
        .unwrap();
        assert_eq!(parsed.due, 12);
        assert_eq!(parsed.top_decks, vec!["Spanish A1".to_string()]);
    }
}
```

- [ ] **Step 2: Write `chrome.rs`**

```rust
//! The main window's look: Windows 11 title bar in AuraMind colours, and
//! shown only once React has painted (no white flash).

use tauri::{AppHandle, Manager, WebviewWindow};

/// `#rrggbb` → Win32 COLORREF (0x00BBGGRR).
pub fn colorref(hex: &str) -> Option<u32> {
    let hex = hex.strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let v = u32::from_str_radix(hex, 16).ok()?;
    let (r, g, b) = ((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
    Some((b << 16) | (g << 8) | r)
}

/// Caption, title text and border colours. Windows 10 doesn't support these
/// attributes and returns an error, which is ignored: it keeps the dark
/// title bar from `theme: "Dark"`.
#[cfg(windows)]
pub fn brand_title_bar(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };
    let Ok(raw) = window.hwnd() else { return };
    let hwnd = HWND(raw.0 as _);
    for (attr, hex) in [
        (DWMWA_CAPTION_COLOR, "#0b1022"),
        (DWMWA_TEXT_COLOR, "#e8e6ff"),
        (DWMWA_BORDER_COLOR, "#8B5CF6"),
    ] {
        if let Some(color) = colorref(hex) {
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    attr,
                    &color as *const u32 as *const _,
                    std::mem::size_of::<u32>() as u32,
                );
            }
        }
    }
}

#[cfg(not(windows))]
pub fn brand_title_bar(_window: &WebviewWindow) {}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// If React never reports its first paint (a crash, a very slow machine),
/// show the window anyway so the app can't stay invisible.
pub fn show_fallback(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        let state = app.state::<crate::state::AppState>();
        if state.hidden_start.load(std::sync::atomic::Ordering::SeqCst) {
            return;
        }
        if let Some(window) = app.get_webview_window("main") {
            if !window.is_visible().unwrap_or(true) {
                show_main_window(&app);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_becomes_bgr() {
        assert_eq!(colorref("#0b1022"), Some(0x0022_100b));
        assert_eq!(colorref("#8B5CF6"), Some(0x00f6_5c8b));
        assert_eq!(colorref("#e8e6ff"), Some(0x00ff_e6e8));
    }

    #[test]
    fn malformed_hex_is_rejected() {
        assert_eq!(colorref("0b1022"), None);
        assert_eq!(colorref("#fff"), None);
        assert_eq!(colorref("#zzzzzz"), None);
    }
}
```

- [ ] **Step 3: Write `commands.rs`**

```rust
//! Commands the web layer may call. Each is also listed in build.rs so it
//! gets its own permission, granted per window in capabilities/*.json.

use crate::chrome::show_main_window;
use crate::state::{emit_to_main, AppState};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};

/// React has painted: show the window (unless started hidden) and deliver
/// anything that arrived during startup.
#[tauri::command]
pub fn app_ready(app: AppHandle, state: State<AppState>) {
    if !state.hidden_start.load(Ordering::SeqCst) {
        show_main_window(&app);
    }
    let queued = state.outbox.lock().unwrap().mark_ready();
    for ev in queued {
        let _ = app.emit_to("main", ev.event, ev.payload);
    }
}

/// Open or focus the main window, optionally at an in-app route.
#[tauri::command]
pub fn show_main(app: AppHandle, path: Option<String>) {
    show_main_window(&app);
    if let Some(path) = path.filter(|p| p.starts_with('/') && !p.starts_with("//")) {
        emit_to_main(&app, "open-route", serde_json::json!({ "path": path }));
    }
}
```

- [ ] **Step 4: App manifest in `build.rs`**

```rust
fn main() {
    // Listing the app's own commands gives each one a permission
    // (allow-app-ready, …), so capabilities/*.json can grant them per window.
    // Add every new #[tauri::command] here.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["app_ready", "show_main"])),
    )
    .expect("failed to run tauri-build");
}
```

- [ ] **Step 5: Split capabilities per window**

Delete `capabilities/default.json`. Create `capabilities/main.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main",
  "description": "The main AuraMind window. Remote pages get nothing: capabilities apply only to the app's own origin.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-set-title",
    "opener:allow-open-url",
    "updater:default",
    "process:allow-restart",
    "allow-app-ready",
    "allow-show-main"
  ]
}
```

Create `capabilities/quick-review.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "quick-review",
  "description": "The Quick Review corner panel: reviewing cards and handing off to the main window, nothing else.",
  "windows": ["quick-review"],
  "permissions": [
    "core:event:default",
    "allow-show-main"
  ]
}
```

- [ ] **Step 6: Wire it in `lib.rs` and hide the window at start**

In `tauri.conf.json` → `app.windows[0]` add `"visible": false`.

In `Cargo.toml` add:

```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.61", features = ["Win32_Foundation", "Win32_Graphics_Dwm"] }
```

Replace `run()` in `lib.rs` with:

```rust
mod chrome;
mod commands;
mod guard;
mod handoff;
mod links;
mod nudges;
mod state;

use guard::{opens_externally, stays_in_app};
use links::{parse_args, LaunchIntent};
use state::AppState;
use std::sync::atomic::Ordering;
use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch focuses the running
        // window instead of opening another copy.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            chrome::show_main_window(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![commands::app_ready, commands::show_main])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let hidden = parse_args(&args).contains(&LaunchIntent::Hidden);
            app.state::<AppState>().hidden_start.store(hidden, Ordering::SeqCst);

            // The main window is declared in tauri.conf.json with
            // `create: false` so it can be built here with a navigation guard.
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .expect("tauri.conf.json must declare the main window");
            let handle = app.handle().clone();
            let window = WebviewWindowBuilder::from_config(app, &config)?
                .on_navigation(move |url| {
                    if stays_in_app(url) {
                        return true;
                    }
                    if opens_externally(url) {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;
            chrome::brand_title_bar(&window);
            chrome::show_fallback(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AuraMind");
}
```

(`handoff` and `nudges` produce "never used" warnings until Tasks 7 and 9; that's expected.)

- [ ] **Step 7: Run tests and a dev build**

Run: `cargo test --manifest-path auramind-gemini/src-tauri/Cargo.toml`
Expected: all previous tests + 3 `state` + 2 `chrome` pass.

Run: `cd auramind-gemini && npm run build:desktop:web && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds. (The window won't show until Task 16 calls `app_ready`; the 3-second fallback shows it, which is how you know the fallback works.)

- [ ] **Step 8: Commit**

```bash
git add auramind-gemini/src-tauri
git commit -m "feat(desktop): branded title bar, show after first paint, per-window permissions" -m "The main window starts hidden and appears when React reports its first paint (app_ready), with a 3-second fallback so it can never stay invisible. Events that arrive before the web layer is listening are held in an outbox and delivered in order."
```

---
### Task 7: Quick Review window and the global shortcut (Rust)

**Files:**
- Create: `src-tauri/src/quick_review.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`, `src-tauri/capabilities/main.json`, `src-tauri/capabilities/quick-review.json`

**Interfaces:**
- Consumes: `state::AppState.quick_review_open`, `state::emit_to_main`, `guard::{stays_in_app, opens_externally}`
- Produces:
  - `quick_review::position_in_work_area(work: Rect, window: (u32, u32), margin: i32) -> (i32, i32)`; `pub struct Rect { pub x: i32, pub y: i32, pub width: u32, pub height: u32 }`
  - `quick_review::show(app: &AppHandle)`, `hide(app: &AppHandle)`, `toggle(app: &AppHandle)`
  - `quick_review::DEFAULT_SHORTCUT: &str = "CommandOrControl+Alt+Space"`
  - Commands: `quick_review_done()`, `cards_changed()`, `set_shortcut(accelerator: String) -> ShortcutResult` where `#[derive(Serialize)] #[serde(rename_all = "camelCase")] pub struct ShortcutResult { pub ok: bool, pub reason: Option<&'static str> }` (`reason` = `"taken"` or `"invalid"`)
  - Permissions: `allow-quick-review-done`, `allow-cards-changed`, `allow-set-shortcut`

- [ ] **Step 1: Write `quick_review.rs` with the placement tests first**

```rust
//! The Quick Review corner panel: a small always-on-top window on the same
//! bundle (/quick-review), opened by a global shortcut, the tray or a
//! notification. Created once, then only hidden and re-shown.

use crate::guard::{opens_externally, stays_in_app};
use crate::state::AppState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

pub const LABEL: &str = "quick-review";
pub const DEFAULT_SHORTCUT: &str = "CommandOrControl+Alt+Space";
const WIDTH: f64 = 380.0;
const HEIGHT: f64 = 300.0;
const MARGIN: f64 = 12.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Bottom-right of a monitor's work area (the part the taskbar doesn't
/// cover), in physical pixels. Works for monitors left of or above the
/// primary one, whose coordinates are negative.
pub fn position_in_work_area(work: Rect, window: (u32, u32), margin: i32) -> (i32, i32) {
    let x = work.x + work.width as i32 - window.0 as i32 - margin;
    let y = work.y + work.height as i32 - window.1 as i32 - margin;
    (x.max(work.x), y.max(work.y))
}

fn target_work_area(app: &AppHandle) -> Option<(Rect, f64)> {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let area = monitor.work_area();
    Some((
        Rect { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height },
        monitor.scale_factor(),
    ))
}

fn build(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let handle = app.clone();
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("quick-review".into()))
        .title("Quick review")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .on_navigation(move |url| {
            if stays_in_app(url) {
                return true;
            }
            if opens_externally(url) {
                let _ = handle.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .build()?;
    #[cfg(windows)]
    let _ = window_vibrancy::apply_acrylic(&window, Some((11, 16, 34, 170)));
    Ok(window)
}

pub fn show(app: &AppHandle) {
    let window = match app.get_webview_window(LABEL) {
        Some(w) => w,
        None => match build(app) {
            Ok(w) => w,
            Err(_) => return,
        },
    };
    if let Some((work, scale)) = target_work_area(app) {
        let size = ((WIDTH * scale).round() as u32, (HEIGHT * scale).round() as u32);
        let (x, y) = position_in_work_area(work, size, (MARGIN * scale).round() as i32);
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    let _ = window.show();
    let _ = window.set_focus();
    app.state::<AppState>().quick_review_open.store(true, Ordering::SeqCst);
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
    app.state::<AppState>().quick_review_open.store(false, Ordering::SeqCst);
}

pub fn toggle(app: &AppHandle) {
    let open = app
        .get_webview_window(LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if open {
        hide(app)
    } else {
        show(app)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRIMARY: Rect = Rect { x: 0, y: 0, width: 1920, height: 1040 };

    #[test]
    fn sits_above_the_taskbar_bottom_right() {
        assert_eq!(position_in_work_area(PRIMARY, (380, 300), 12), (1528, 728));
    }

    #[test]
    fn follows_a_monitor_left_of_the_primary() {
        let left = Rect { x: -2560, y: 0, width: 2560, height: 1392 };
        assert_eq!(position_in_work_area(left, (570, 450), 18), (-588, 924));
    }

    #[test]
    fn follows_a_monitor_above_the_primary() {
        let above = Rect { x: 0, y: -1080, width: 1920, height: 1040 };
        assert_eq!(position_in_work_area(above, (380, 300), 12), (1528, -352));
    }

    #[test]
    fn never_leaves_a_tiny_work_area() {
        let tiny = Rect { x: 100, y: 100, width: 200, height: 150 };
        assert_eq!(position_in_work_area(tiny, (380, 300), 12), (100, 100));
    }
}
```

- [ ] **Step 2: Add the commands to `commands.rs`**

```rust
use crate::quick_review;
use serde::Serialize;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[tauri::command]
pub fn quick_review_done(app: AppHandle) {
    quick_review::hide(&app);
}

/// Quick Review rated a card: the main window reloads its counts.
#[tauri::command]
pub fn cards_changed(app: AppHandle) {
    emit_to_main(&app, "cards-changed", serde_json::json!({}));
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutResult {
    pub ok: bool,
    pub reason: Option<&'static str>,
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, accelerator: String) -> ShortcutResult {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    match shortcuts.register(accelerator.as_str()) {
        Ok(()) => ShortcutResult { ok: true, reason: None },
        Err(err) => {
            // Put the previous default back so the feature isn't left dead.
            let _ = shortcuts.register(quick_review::DEFAULT_SHORTCUT);
            let reason = if err.to_string().to_lowercase().contains("already") { "taken" } else { "invalid" };
            ShortcutResult { ok: false, reason: Some(reason) }
        }
    }
}
```

- [ ] **Step 3: Dependencies, manifest, permissions, wiring**

`Cargo.toml` `[dependencies]`:

```toml
tauri-plugin-global-shortcut = "2"
```

and under `[target.'cfg(windows)'.dependencies]`:

```toml
window-vibrancy = "0.6"
```

`build.rs` commands list: `&["app_ready", "show_main", "quick_review_done", "cards_changed", "set_shortcut"]`.

`capabilities/main.json` permissions: add `"allow-set-shortcut"`. `capabilities/quick-review.json`: add `"allow-quick-review-done"`, `"allow-cards-changed"`.

`lib.rs`: add `mod quick_review;`, extend `generate_handler!` with `commands::quick_review_done, commands::cards_changed, commands::set_shortcut`, and register the plugin plus the default shortcut inside `.setup(...)` before building the main window:

```rust
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

app.handle().plugin(
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                quick_review::toggle(app);
            }
        })
        .build(),
)?;
// Taken by another app? Settings offers another; startup must not fail.
let _ = app.global_shortcut().register(quick_review::DEFAULT_SHORTCUT);
```

- [ ] **Step 4: Run tests and build**

Run: `cargo test --manifest-path auramind-gemini/src-tauri/Cargo.toml quick_review`
Expected: 4 passed.
Run: `cargo build --manifest-path auramind-gemini/src-tauri/Cargo.toml`
Expected: builds. If a Tauri method name differs in the installed 2.x version (e.g. `work_area`, `monitor_from_point`), check `cargo doc --open -p tauri` and adapt without changing behaviour.

- [ ] **Step 5: Commit**

```bash
git add auramind-gemini/src-tauri
git commit -m "feat(desktop): Quick Review corner window on Ctrl+Alt+Space" -m "A frameless acrylic window on the same bundle (/quick-review), placed bottom-right of the work area of the monitor under the cursor, including monitors with negative coordinates. Created once, then hidden and re-shown."
```

---

### Task 8: Tray, taskbar badge, toasts, close to tray, start with Windows

**Files:**
- Create: `src-tauri/src/tray.rs`, `src-tauri/src/badge.rs`
- Modify: `src-tauri/src/nudges.rs` (runtime + toasts), `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/main.json`

**Interfaces:**
- Consumes: `state::{AppState, DueState, emit_to_main}`, `nudges::{Nudge, Gate, take_due, next_local_midnight_ms}`, `quick_review::show`, `chrome::show_main_window`, `handoff::read`, assets from Task 5
- Produces:
  - `badge::badge_for(due: u32) -> Option<&'static [u8]>`
  - `tray::tooltip(due: u32) -> String`, `tray::header(due: u32, streak: u32) -> String`, `tray::build(app: &AppHandle) -> tauri::Result<()>`, `tray::update(app: &AppHandle, state: &DueState)`
  - `nudges::start(app: &AppHandle)`, `nudges::toast(app: &AppHandle, title: &str, body: &str, with_actions: bool)`
  - Commands: `set_due_state(state: DueState)`, `schedule_nudges(nudges: Vec<Nudge>)`, `get_autostart() -> bool`, `set_autostart(enabled: bool) -> bool` (returns the resulting state)
  - Permissions: `allow-set-due-state`, `allow-schedule-nudges`, `allow-get-autostart`, `allow-set-autostart`

- [ ] **Step 1: `badge.rs` with tests first**

```rust
//! The taskbar overlay badge: a violet count while cards are due.

pub fn badge_for(due: u32) -> Option<&'static [u8]> {
    Some(match due {
        0 => return None,
        1 => include_bytes!("../icons/badges/1.png"),
        2 => include_bytes!("../icons/badges/2.png"),
        3 => include_bytes!("../icons/badges/3.png"),
        4 => include_bytes!("../icons/badges/4.png"),
        5 => include_bytes!("../icons/badges/5.png"),
        6 => include_bytes!("../icons/badges/6.png"),
        7 => include_bytes!("../icons/badges/7.png"),
        8 => include_bytes!("../icons/badges/8.png"),
        9 => include_bytes!("../icons/badges/9.png"),
        _ => include_bytes!("../icons/badges/9plus.png"),
    })
}

pub fn apply(app: &tauri::AppHandle, due: u32) {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else { return };
    let icon = badge_for(due).and_then(|bytes| tauri::image::Image::from_bytes(bytes).ok());
    let _ = window.set_overlay_icon(icon);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_due_clears_the_badge() {
        assert!(badge_for(0).is_none());
    }

    #[test]
    fn one_to_nine_have_their_own_badge_and_more_is_nine_plus() {
        assert_ne!(badge_for(1), badge_for(2));
        assert_eq!(badge_for(10), badge_for(250));
        assert_ne!(badge_for(9), badge_for(10));
    }
}
```

- [ ] **Step 2: `tray.rs` with label tests first**

```rust
//! The tray: due count at a glance and the approved menu.

use crate::state::{emit_to_main, AppState, DueState};
use crate::{badge, chrome, handoff, nudges, quick_review};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;

const TRAY_ID: &str = "main";

pub struct TrayHandles {
    header: MenuItem<Wry>,
    autostart: CheckMenuItem<Wry>,
}

fn cards(n: u32) -> String {
    if n == 1 { "1 card".into() } else { format!("{n} cards") }
}

pub fn tooltip(due: u32) -> String {
    if due == 0 { "AuraMind · all caught up".into() } else { format!("AuraMind · {} due", cards(due)) }
}

pub fn header(due: u32, streak: u32) -> String {
    let due_part = if due == 0 { "All caught up".to_string() } else { format!("{} due", cards(due)) };
    if streak == 0 { due_part } else { format!("{due_part} · {streak}-day streak") }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let header_item = MenuItem::with_id(app, "header", header(0, 0), false, None::<&str>)?;
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart_on, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &header_item,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quick-review", "Quick review", true, Some("CommandOrControl+Alt+Space"))?,
            &MenuItem::with_id(app, "open", "Open AuraMind", true, None::<&str>)?,
            &MenuItem::with_id(app, "new-course", "New course from file…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &MenuItem::with_id(app, "pause", "Pause reminders for today", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
        ],
    )?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .tooltip(tooltip(0))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quick-review" => quick_review::show(app),
            "open" => chrome::show_main_window(app),
            "new-course" => pick_course_file(app),
            "autostart" => toggle_autostart(app),
            "pause" => {
                let until = nudges::next_local_midnight_ms(chrono::Local::now());
                *app.state::<AppState>().paused_until_ms.lock().unwrap() = Some(until);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                chrome::show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    app.manage(TrayHandles { header: header_item, autostart });
    Ok(())
}

pub fn update(app: &AppHandle, state: &DueState) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tooltip(state.due)));
        let bytes: &[u8] = if state.due > 0 {
            include_bytes!("../icons/tray-due.png")
        } else {
            include_bytes!("../icons/tray.png")
        };
        let _ = tray.set_icon(Image::from_bytes(bytes).ok());
    }
    if let Some(handles) = app.try_state::<TrayHandles>() {
        let _ = handles.header.set_text(header(state.due, state.streak));
    }
    badge::apply(app, state.due);
}

pub fn set_autostart_checked(app: &AppHandle, on: bool) {
    if let Some(handles) = app.try_state::<TrayHandles>() {
        let _ = handles.autostart.set_checked(on);
    }
}

fn toggle_autostart(app: &AppHandle) {
    let launcher = app.autolaunch();
    let on = launcher.is_enabled().unwrap_or(false);
    let _ = if on { launcher.disable() } else { launcher.enable() };
    set_autostart_checked(app, launcher.is_enabled().unwrap_or(false));
}

/// Tray → "New course from file…": native picker, then the same handoff as
/// the Explorer verb.
pub fn pick_course_file(app: &AppHandle) {
    let exts: Vec<&str> = handoff::DOC_EXTS.iter().chain(handoff::AUDIO_EXTS).copied().collect();
    let handle = app.clone();
    app.dialog()
        .file()
        .set_title("Make a course from a file")
        .add_filter("Documents and audio", &exts)
        .pick_file(move |picked| {
            let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return };
            let payload = serde_json::to_value(handoff::read(&path)).unwrap_or_default();
            chrome::show_main_window(&handle);
            emit_to_main(&handle, "create-from-file", payload);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tooltip_counts_and_clears() {
        assert_eq!(tooltip(12), "AuraMind · 12 cards due");
        assert_eq!(tooltip(1), "AuraMind · 1 card due");
        assert_eq!(tooltip(0), "AuraMind · all caught up");
    }

    #[test]
    fn header_matches_the_mockup() {
        assert_eq!(header(12, 12), "12 cards due · 12-day streak");
        assert_eq!(header(0, 3), "All caught up · 3-day streak");
        assert_eq!(header(4, 0), "4 cards due");
    }
}
```

- [ ] **Step 3: Toast runtime in `nudges.rs`**

Append to `nudges.rs` (above the `tests` module):

```rust
use tauri::{AppHandle, Manager};

/// Windows needs the AppUserModelID from the installer's Start-menu shortcut
/// to show toasts with buttons. `tauri dev` has no shortcut, so debug builds
/// borrow PowerShell's id.
#[cfg(windows)]
fn app_id(app: &AppHandle) -> String {
    if cfg!(debug_assertions) {
        tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

#[cfg(windows)]
pub fn toast(app: &AppHandle, title: &str, body: &str, with_actions: bool) {
    use tauri_winrt_notification::Toast;
    let handle = app.clone();
    let mut toast = Toast::new(&app_id(app)).title(title).text1(body);
    if with_actions {
        toast = toast.add_button("Quick review", "quick-review").add_button("Later", "later");
    }
    let _ = toast
        .on_activated(move |action| {
            match action.as_deref() {
                Some("quick-review") => crate::quick_review::show(&handle),
                Some("later") => {}
                _ => crate::chrome::show_main_window(&handle),
            }
            Ok(())
        })
        .show();
}

#[cfg(not(windows))]
pub fn toast(_app: &AppHandle, _title: &str, _body: &str, _with_actions: bool) {}

/// Checks the plan every 30 seconds. Rust holds the timer because WebView2
/// throttles timers in hidden windows.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let state = app.state::<crate::state::AppState>();
        let gate = Gate {
            paused_until_ms: *state.paused_until_ms.lock().unwrap(),
            busy: state.due.lock().unwrap().studying
                || state.quick_review_open.load(std::sync::atomic::Ordering::SeqCst),
        };
        let now = chrono::Utc::now().timestamp_millis();
        let fire = take_due(&mut state.nudges.lock().unwrap(), now, &gate);
        for nudge in fire {
            toast(&app, &nudge.title, &nudge.body, true);
        }
    });
}
```

If the installed `tauri-winrt-notification` names differ (`add_button`, `on_activated`'s closure type), check its docs.rs page for that version and adapt; behaviour must stay: two buttons, body click opens the main window.

- [ ] **Step 4: Commands**

Add to `commands.rs`:

```rust
use crate::nudges::Nudge;
use crate::state::DueState;
use crate::tray;
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn set_due_state(app: AppHandle, state: State<AppState>, due: DueState) {
    let changed = *state.due.lock().unwrap() != due;
    if changed {
        tray::update(&app, &due);
        *state.due.lock().unwrap() = due;
    }
}

#[tauri::command]
pub fn schedule_nudges(state: State<AppState>, nudges: Vec<Nudge>) {
    *state.nudges.lock().unwrap() = nudges;
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> bool {
    let launcher = app.autolaunch();
    let _ = if enabled { launcher.enable() } else { launcher.disable() };
    let on = launcher.is_enabled().unwrap_or(false);
    tray::set_autostart_checked(&app, on);
    on
}
```

Note the argument is named `due` (JS sends `{ due: {...} }`), matching `bridge.ts` in Task 10.

- [ ] **Step 5: Close to tray + wiring**

`Cargo.toml`: change `tauri = { version = "2", features = ["tray-icon", "image-png"] }` and add:

```toml
tauri-plugin-autostart = "2"
tauri-plugin-dialog = "2"
```

and under `[target.'cfg(windows)'.dependencies]`: `tauri-winrt-notification = "0.7"`.

`build.rs` commands: add `"set_due_state", "schedule_nudges", "get_autostart", "set_autostart"`. `capabilities/main.json`: add `"allow-set-due-state"`, `"allow-schedule-nudges"`, `"allow-get-autostart"`, `"allow-set-autostart"`.

`lib.rs`: add `mod badge; mod tray;`; register plugins after `process`:

```rust
.plugin(tauri_plugin_dialog::init())
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    Some(vec!["--hidden"]),
))
```

extend `generate_handler!` with the four commands; and at the end of `.setup`, after `show_fallback`:

```rust
tray::build(app.handle())?;
nudges::start(app.handle());

// ✕ keeps AuraMind in the tray so reminders keep working; Quit exits.
let close_handle = app.handle().clone();
window.on_window_event(move |event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        if let Some(w) = close_handle.get_webview_window("main") {
            let _ = w.hide();
        }
        let marker = close_handle
            .path()
            .app_data_dir()
            .map(|d| d.join("tray-notice-shown"));
        if let Ok(marker) = marker {
            if !marker.exists() {
                let _ = std::fs::create_dir_all(marker.parent().unwrap());
                let _ = std::fs::write(&marker, b"1");
                nudges::toast(&close_handle, "AuraMind is still running", "It's in the tray, so your reminders keep working. Quit from the tray icon.", false);
            }
        }
    }
});
```

- [ ] **Step 6: Run tests and build**

Run: `cargo test --manifest-path auramind-gemini/src-tauri/Cargo.toml`
Expected: all pass, including 2 `badge` + 2 `tray`.
Run: `cargo build --manifest-path auramind-gemini/src-tauri/Cargo.toml`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add auramind-gemini/src-tauri
git commit -m "feat(desktop): tray, taskbar badge, study toasts, close to tray, start with Windows" -m "React sends the due state; Rust only displays it. Toasts carry Quick review / Later and are held by a Rust timer (WebView2 throttles hidden windows). Start with Windows is off by default and launches --hidden."
```

---
### Task 9: Deep links, second launches, and the Explorer verb

**Files:**
- Modify: `src-tauri/src/links.rs` (add `intents_to_events`), `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Create: `src-tauri/windows/installer-hooks.nsh`

**Interfaces:**
- Consumes: `links::{parse_args, LaunchIntent, is_app_url}`, `handoff::{read, Handoff}`, `state::{Outgoing, emit_to_main}`, `chrome::show_main_window`
- Produces:
  - `links::intents_to_events(intents: &[LaunchIntent], read: impl Fn(&std::path::Path) -> serde_json::Value) -> Vec<(&'static str, serde_json::Value)>` — `("deep-link", {"url": …})` and `("create-from-file", <Handoff json>)`; `Hidden` produces nothing
  - Events to the web layer: `deep-link` `{ url: string }`, `create-from-file` (Handoff JSON)

- [ ] **Step 1: Failing test for `intents_to_events` (append to `links.rs` tests)**

```rust
    #[test]
    fn intents_become_web_events() {
        let intents = vec![
            LaunchIntent::Hidden,
            LaunchIntent::Open("auramind://app/study".into()),
            LaunchIntent::Create(PathBuf::from("C:\\a\\Notes.pdf")),
        ];
        let events = intents_to_events(&intents, |p| serde_json::json!({ "kind": "file", "name": p.file_name().unwrap().to_str().unwrap() }));
        assert_eq!(
            events,
            vec![
                ("deep-link", serde_json::json!({ "url": "auramind://app/study" })),
                ("create-from-file", serde_json::json!({ "kind": "file", "name": "Notes.pdf" })),
            ]
        );
    }
```

- [ ] **Step 2: Implement it in `links.rs`**

```rust
/// What each launch intent tells the web layer. File reading is injected so
/// this stays pure (the app passes `handoff::read`).
pub fn intents_to_events(
    intents: &[LaunchIntent],
    read: impl Fn(&std::path::Path) -> serde_json::Value,
) -> Vec<(&'static str, serde_json::Value)> {
    intents
        .iter()
        .filter_map(|intent| match intent {
            LaunchIntent::Hidden => None,
            LaunchIntent::Open(url) => Some(("deep-link", serde_json::json!({ "url": url }))),
            LaunchIntent::Create(path) => Some(("create-from-file", read(path))),
        })
        .collect()
}
```

Run: `cargo test --manifest-path auramind-gemini/src-tauri/Cargo.toml links`
Expected: 7 passed.

- [ ] **Step 3: Wire launches in `lib.rs`**

`Cargo.toml`: `tauri-plugin-single-instance = { version = "2", features = ["deep-link"] }` and `tauri-plugin-deep-link = "2"`.

`tauri.conf.json`: add to `"plugins"`:

```json
"deep-link": { "desktop": { "schemes": ["auramind"] } }
```

and in `bundle.windows.nsis` add `"installerHooks": "windows/installer-hooks.nsh"`.

In `lib.rs` add a helper and use it for cold start, second launches and deep-link events:

```rust
use tauri_plugin_deep_link::DeepLinkExt;

fn deliver(app: &tauri::AppHandle, intents: &[LaunchIntent]) {
    let events = links::intents_to_events(intents, |path| {
        serde_json::to_value(handoff::read(path)).unwrap_or_default()
    });
    if !events.is_empty() {
        chrome::show_main_window(app);
    }
    for (event, payload) in events {
        state::emit_to_main(app, event, payload);
    }
}
```

Replace the single-instance registration with:

```rust
.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
    let intents = parse_args(&args);
    if intents.is_empty() {
        chrome::show_main_window(app);
    } else {
        deliver(app, &intents);
    }
}))
.plugin(tauri_plugin_deep_link::init())
```

In `.setup`, right after computing `hidden`:

```rust
#[cfg(debug_assertions)]
let _ = app.deep_link().register_all(); // `tauri dev` isn't installed, so register at runtime

let handle = app.handle().clone();
app.deep_link().on_open_url(move |event| {
    let intents: Vec<LaunchIntent> = event
        .urls()
        .into_iter()
        .map(|u| u.to_string())
        .filter(|u| links::is_app_url(u))
        .map(LaunchIntent::Open)
        .collect();
    deliver(&handle, &intents);
});
```

and after the main window is built (so the outbox queues until `app_ready`):

```rust
deliver(app.handle(), &parse_args(&args));
```

- [ ] **Step 4: The Explorer verb**

`src-tauri/windows/installer-hooks.nsh`:

```nsis
; "Make a course with AuraMind" in Explorer's right-click menu, per user.
; Keep this list in sync with DOC_EXTS/AUDIO_EXTS in src/handoff.rs
; (courseFiles.test.ts checks both). On Windows 11 it appears under
; "Show more options"; a top-level entry needs a signed MSIX.

!macro AuraMindVerb EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuraMind" "" "Make a course with AuraMind"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuraMind" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuraMind\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" --create "%1"'
!macroend

!macro AuraMindUnverb EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuraMind"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro AuraMindVerb "pdf"
  !insertmacro AuraMindVerb "pptx"
  !insertmacro AuraMindVerb "docx"
  !insertmacro AuraMindVerb "doc"
  !insertmacro AuraMindVerb "txt"
  !insertmacro AuraMindVerb "md"
  !insertmacro AuraMindVerb "mp3"
  !insertmacro AuraMindVerb "wav"
  !insertmacro AuraMindVerb "m4a"
  !insertmacro AuraMindVerb "ogg"
  !insertmacro AuraMindVerb "webm"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro AuraMindUnverb "pdf"
  !insertmacro AuraMindUnverb "pptx"
  !insertmacro AuraMindUnverb "docx"
  !insertmacro AuraMindUnverb "doc"
  !insertmacro AuraMindUnverb "txt"
  !insertmacro AuraMindUnverb "md"
  !insertmacro AuraMindUnverb "mp3"
  !insertmacro AuraMindUnverb "wav"
  !insertmacro AuraMindUnverb "m4a"
  !insertmacro AuraMindUnverb "ogg"
  !insertmacro AuraMindUnverb "webm"
!macroend
```

- [ ] **Step 5: Build the installer to prove the hooks compile**

Run: `cd auramind-gemini && npx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'`
Expected: `AuraMind_<version>_x64-setup.exe` is produced. NSIS errors in the hooks would fail this step.

- [ ] **Step 6: Commit**

```bash
git add auramind-gemini/src-tauri
git commit -m "feat(desktop): auramind:// links, second-launch routing and the Explorer verb" -m "Links, Explorer files and second launches all go through one path and wait in the outbox until the web layer is listening, so a cold-start link isn't lost."
```

---

### Task 10: `desktop/bridge.ts` — the typed contract

**Files:**
- Create: `auramind-gemini/src/desktop/bridge.ts`, `auramind-gemini/src/__tests__/desktopBridge.test.ts`

**Interfaces:**
- Consumes: `isDesktopApp()` from `lib/platform.ts`
- Produces (exact names later tasks use):

```ts
export interface DueState { due: number; fadingCount: number; topDecks: string[]; streak: number; studying: boolean }
export interface PlannedNudge { atMs: number; title: string; body: string }
export type FileHandoff =
  | { kind: 'file'; name: string; mime: string; base64: string }
  | { kind: 'error'; name: string; reason: 'unsupported' | 'too-large' | 'unreadable' };
export interface ShortcutResult { ok: boolean; reason?: 'taken' | 'invalid' | null }
export interface DesktopEvents {
  'deep-link': { url: string };
  'create-from-file': FileHandoff;
  'cards-changed': Record<string, never>;
  'open-route': { path: string };
}
export const desktop: {
  appReady(): Promise<void>;
  showMain(path?: string): Promise<void>;
  setDueState(due: DueState): Promise<void>;
  scheduleNudges(nudges: PlannedNudge[]): Promise<void>;
  quickReviewDone(): Promise<void>;
  cardsChanged(): Promise<void>;
  setShortcut(accelerator: string): Promise<ShortcutResult>;
  getAutostart(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<boolean>;
  setTitle(title: string): Promise<void>;
  on<K extends keyof DesktopEvents>(event: K, handler: (payload: DesktopEvents[K]) => void): Promise<() => void>;
};
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() => vi.fn());
const setTitle = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: (...a: unknown[]) => listen(...a) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setTitle }) }));

import { desktop } from '../desktop/bridge';

type W = Window & { __TAURI_INTERNALS__?: unknown };

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  listen.mockReset();
  setTitle.mockReset();
});
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; });

describe('desktop bridge', () => {
  it('does nothing in a browser tab', async () => {
    await desktop.appReady();
    await desktop.setDueState({ due: 1, fadingCount: 0, topDecks: [], streak: 0, studying: false });
    expect(invoke).not.toHaveBeenCalled();
    await expect(desktop.getAutostart()).resolves.toBe(false);
    await expect(desktop.setShortcut('Ctrl+Alt+Q')).resolves.toEqual({ ok: false, reason: 'invalid' });
    const off = await desktop.on('deep-link', () => {});
    expect(listen).not.toHaveBeenCalled();
    off();
  });

  it('sends each command with the argument names Rust expects', async () => {
    (window as W).__TAURI_INTERNALS__ = {};
    const due = { due: 12, fadingCount: 3, topDecks: ['Spanish A1'], streak: 5, studying: false };
    await desktop.setDueState(due);
    await desktop.scheduleNudges([{ atMs: 1, title: 't', body: 'b' }]);
    await desktop.showMain('/dashboard/generator');
    await desktop.setAutostart(true);
    expect(invoke).toHaveBeenCalledWith('set_due_state', { due });
    expect(invoke).toHaveBeenCalledWith('schedule_nudges', { nudges: [{ atMs: 1, title: 't', body: 'b' }] });
    expect(invoke).toHaveBeenCalledWith('show_main', { path: '/dashboard/generator' });
    expect(invoke).toHaveBeenCalledWith('set_autostart', { enabled: true });
  });

  it('delivers event payloads to the handler', async () => {
    (window as W).__TAURI_INTERNALS__ = {};
    const unlisten = vi.fn();
    listen.mockImplementation(async (_name: string, cb: (e: { payload: unknown }) => void) => {
      cb({ payload: { url: 'auramind://app/study' } });
      return unlisten;
    });
    const handler = vi.fn();
    const off = await desktop.on('deep-link', handler);
    expect(listen).toHaveBeenCalledWith('deep-link', expect.any(Function));
    expect(handler).toHaveBeenCalledWith({ url: 'auramind://app/study' });
    off();
    expect(unlisten).toHaveBeenCalled();
  });

  it('a failing command never throws into the UI', async () => {
    (window as W).__TAURI_INTERNALS__ = {};
    invoke.mockRejectedValueOnce(new Error('not allowed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(desktop.appReady()).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd auramind-gemini && npx vitest run src/__tests__/desktopBridge.test.ts`
Expected: FAIL (module `../desktop/bridge` not found).

- [ ] **Step 3: Implement `bridge.ts`**

```ts
/**
 * The Windows app's contract between React and the Rust shell
 * (src-tauri/src/commands.rs). Every call is a no-op in a browser tab or the
 * phone apps, and never throws into the UI: a missing native feature must
 * degrade to the plain app. Tauri packages load lazily so none of this
 * reaches the website's bundle.
 */
import { isDesktopApp } from '../lib/platform';

export interface DueState { due: number; fadingCount: number; topDecks: string[]; streak: number; studying: boolean }
export interface PlannedNudge { atMs: number; title: string; body: string }
export type FileHandoff =
  | { kind: 'file'; name: string; mime: string; base64: string }
  | { kind: 'error'; name: string; reason: 'unsupported' | 'too-large' | 'unreadable' };
export interface ShortcutResult { ok: boolean; reason?: 'taken' | 'invalid' | null }
export interface DesktopEvents {
  'deep-link': { url: string };
  'create-from-file': FileHandoff;
  'cards-changed': Record<string, never>;
  'open-route': { path: string };
}

async function call<T>(command: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  if (!isDesktopApp()) return fallback as T;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<T>(command, args)) ?? (fallback as T);
  } catch (err) {
    console.warn(`[desktop] ${command} failed`, err);
    return fallback as T;
  }
}

export const desktop = {
  appReady: () => call<void>('app_ready'),
  showMain: (path?: string) => call<void>('show_main', { path }),
  setDueState: (due: DueState) => call<void>('set_due_state', { due }),
  scheduleNudges: (nudges: PlannedNudge[]) => call<void>('schedule_nudges', { nudges }),
  quickReviewDone: () => call<void>('quick_review_done'),
  cardsChanged: () => call<void>('cards_changed'),
  setShortcut: (accelerator: string) =>
    call<ShortcutResult>('set_shortcut', { accelerator }, { ok: false, reason: 'invalid' }),
  getAutostart: () => call<boolean>('get_autostart', undefined, false),
  setAutostart: (enabled: boolean) => call<boolean>('set_autostart', { enabled }, false),
  async setTitle(title: string): Promise<void> {
    if (!isDesktopApp()) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setTitle(title);
    } catch {
      /* title is cosmetic */
    }
  },
  async on<K extends keyof DesktopEvents>(
    event: K,
    handler: (payload: DesktopEvents[K]) => void,
  ): Promise<() => void> {
    if (!isDesktopApp()) return () => {};
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<DesktopEvents[K]>(event, (e) => handler(e.payload));
    } catch {
      return () => {};
    }
  },
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/desktopBridge.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add auramind-gemini/src/desktop/bridge.ts auramind-gemini/src/__tests__/desktopBridge.test.ts
git commit -m "feat(desktop): typed React-to-shell bridge that is inert outside the app"
```

---
### Task 11: Drop to create — accepted files, generator handoff, drop overlay

**Files:**
- Create: `src/lib/courseFiles.ts`, `src/lib/pendingGeneratorFile.ts`, `src/components/shared/DropOverlay.tsx`, `src/__tests__/courseFiles.test.ts`, `src/__tests__/dropOverlay.test.tsx`
- Modify: `src/pages/generator/GeneratorPage.tsx` (after `handleDragOver`, ~line 235), `src/App.tsx` (mount overlay next to `<DesktopUpdateBanner />`, ~line 891)

**Interfaces:**
- Consumes: `FileHandoff` type from `desktop/bridge.ts`
- Produces:
  - `courseFiles.ts`: `DOC_EXTS`, `AUDIO_EXTS` (readonly string arrays), `type CourseFileKind = 'document' | 'audio'`, `courseFileKind(name: string): CourseFileKind | null`, `extensionOf(name: string): string`, `fileFromHandoff(h: { name: string; mime: string; base64: string }): File`, `unsupportedMessage(name: string): string`
  - `pendingGeneratorFile.ts`: `offerGeneratorFile(file: File): void`, `takePendingGeneratorFile(): File | null`, `onGeneratorFile(cb: (file: File) => void): () => void`
  - `DropOverlay` (default export none; named `export function DropOverlay()`)

- [ ] **Step 1: Failing tests for `courseFiles` (with parity checks)**

`src/__tests__/courseFiles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AUDIO_EXTS, DOC_EXTS, courseFileKind, extensionOf, fileFromHandoff, unsupportedMessage,
} from '../lib/courseFiles';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf-8');
const rustList = (src: string, name: string) =>
  [...(src.match(new RegExp(`${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/"(\w+)"/g)].map((m) => m[1]);

describe('course files', () => {
  it('classifies by the real last extension, case-insensitively', () => {
    expect(courseFileKind('Notes.PDF')).toBe('document');
    expect(courseFileKind('lecture.m4a')).toBe('audio');
    expect(courseFileKind('evil.pdf.exe')).toBeNull();
    expect(courseFileKind('no-extension')).toBeNull();
    expect(extensionOf('a.b.DocX')).toBe('docx');
  });

  it('matches the Rust handoff lists', () => {
    const rs = read('src-tauri/src/handoff.rs');
    expect(rustList(rs, 'DOC_EXTS')).toEqual([...DOC_EXTS]);
    expect(rustList(rs, 'AUDIO_EXTS')).toEqual([...AUDIO_EXTS]);
  });

  it('matches the Explorer verbs the installer registers', () => {
    const nsh = read('src-tauri/windows/installer-hooks.nsh');
    const install = nsh.slice(nsh.indexOf('NSIS_HOOK_POSTINSTALL'), nsh.indexOf('NSIS_HOOK_POSTUNINSTALL'));
    const verbs = [...install.matchAll(/AuraMindVerb "(\w+)"/g)].map((m) => m[1]).sort();
    expect(verbs).toEqual([...DOC_EXTS, ...AUDIO_EXTS].sort());
  });

  it("matches the generator's own file inputs", () => {
    const page = read('src/pages/generator/GeneratorPage.tsx');
    expect(page).toContain(`accept="${DOC_EXTS.map((e) => `.${e}`).join(',')}"`);
    for (const ext of AUDIO_EXTS) expect(page).toContain(`.${ext}`);
  });

  it('rebuilds a File from the Rust handoff', async () => {
    const file = fileFromHandoff({ name: 'a.txt', mime: 'text/plain', base64: 'aGk=' });
    expect(file.name).toBe('a.txt');
    expect(file.type).toBe('text/plain');
    expect(await file.text()).toBe('hi');
  });

  it('names the rejected extension', () => {
    expect(unsupportedMessage('setup.exe')).toBe("AuraMind can't make a course from .exe files.");
    expect(unsupportedMessage('README')).toBe("AuraMind can't make a course from that file.");
  });
});
```

The generator's document `accept` string today is `.pdf,.pptx,.txt,.md,.doc,.docx`, a different order. Step 3 reorders it to match `DOC_EXTS` (same set, no behaviour change).

- [ ] **Step 2: Run to see failures**

Run: `npx vitest run src/__tests__/courseFiles.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/courseFiles.ts`:

```ts
/**
 * Files AuraMind can turn into a course: the generator's document and audio
 * inputs. The same lists live in src-tauri/src/handoff.rs (Explorer/tray)
 * and src-tauri/windows/installer-hooks.nsh (Explorer verbs);
 * courseFiles.test.ts fails if any of them drift.
 */
export const DOC_EXTS = ['pdf', 'pptx', 'docx', 'doc', 'txt', 'md'] as const;
export const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'webm'] as const;
export type CourseFileKind = 'document' | 'audio';

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function courseFileKind(name: string): CourseFileKind | null {
  const ext = extensionOf(name);
  if ((DOC_EXTS as readonly string[]).includes(ext)) return 'document';
  if ((AUDIO_EXTS as readonly string[]).includes(ext)) return 'audio';
  return null;
}

export function fileFromHandoff(h: { name: string; mime: string; base64: string }): File {
  const bytes = Uint8Array.from(atob(h.base64), (c) => c.charCodeAt(0));
  return new File([bytes], h.name, { type: h.mime });
}

export function unsupportedMessage(name: string): string {
  const ext = extensionOf(name);
  return ext ? `AuraMind can't make a course from .${ext} files.` : "AuraMind can't make a course from that file.";
}
```

In `GeneratorPage.tsx` line 753 change `accept=".pdf,.pptx,.txt,.md,.doc,.docx"` to `accept=".pdf,.pptx,.docx,.doc,.txt,.md"`.

Run: `npx vitest run src/__tests__/courseFiles.test.ts` → 6 passed.

- [ ] **Step 4: `pendingGeneratorFile.ts` and the generator hook**

```ts
/**
 * Hands a file to the generator across a navigation. The drop overlay, the
 * Explorer verb and the tray picker all end here: if the generator is
 * mounted it gets the file now, otherwise it picks it up on mount.
 */
let pending: File | null = null;
const listeners = new Set<(file: File) => void>();

export function offerGeneratorFile(file: File): void {
  if (listeners.size > 0) listeners.forEach((listener) => listener(file));
  else pending = file;
}

export function takePendingGeneratorFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}

export function onGeneratorFile(cb: (file: File) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
```

In `GeneratorPage.tsx`, add imports:

```ts
import { courseFileKind } from '../../lib/courseFiles';
import { onGeneratorFile, takePendingGeneratorFile } from '../../lib/pendingGeneratorFile';
```

and directly after `handleDragOver` (~line 235):

```ts
  // Files handed in from the drop overlay, Explorer or the tray.
  const acceptHandedFile = useRef<(file: File) => void>(() => {});
  acceptHandedFile.current = (file: File) => {
    if (courseFileKind(file.name) === 'audio') void handleAudioSelect(file);
    else void handleFileSelect(file);
  };
  useEffect(() => {
    const waiting = takePendingGeneratorFile();
    if (waiting) acceptHandedFile.current(waiting);
    return onGeneratorFile((file) => acceptHandedFile.current(file));
  }, []);
```

- [ ] **Step 5: Failing overlay test**

`src/__tests__/dropOverlay.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m) } }));
const offer = vi.hoisted(() => vi.fn());
vi.mock('../lib/pendingGeneratorFile', () => ({ offerGeneratorFile: (f: File) => offer(f) }));

import { DropOverlay } from '../components/shared/DropOverlay';

function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }

function setup() {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DropOverlay />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}

const files = (...list: File[]) => ({ types: ['Files'], files: list });

beforeEach(() => { toastError.mockReset(); offer.mockReset(); });

describe('DropOverlay', () => {
  it('appears when files are dragged over the window', () => {
    setup();
    act(() => { fireEvent.dragEnter(window, { dataTransfer: files() }); });
    expect(screen.getByText('Drop to make a course')).toBeInTheDocument();
  });

  it('ignores drags that carry no files (text, links)', () => {
    setup();
    act(() => { fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'], files: [] } }); });
    expect(screen.queryByText('Drop to make a course')).toBeNull();
  });

  it('a supported file goes to the generator', () => {
    setup();
    act(() => { fireEvent.dragEnter(window, { dataTransfer: files() }); });
    const pdf = new File(['x'], 'Notes.pdf', { type: 'application/pdf' });
    fireEvent.drop(screen.getByTestId('drop-overlay'), { dataTransfer: files(pdf) });
    expect(offer).toHaveBeenCalledWith(pdf);
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/generator');
    expect(screen.queryByText('Drop to make a course')).toBeNull();
  });

  it('an unsupported file explains itself and stays put', () => {
    setup();
    act(() => { fireEvent.dragEnter(window, { dataTransfer: files() }); });
    fireEvent.drop(screen.getByTestId('drop-overlay'), { dataTransfer: files(new File(['x'], 'setup.exe')) });
    expect(toastError).toHaveBeenCalledWith("AuraMind can't make a course from .exe files.");
    expect(offer).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');
  });
});
```

- [ ] **Step 6: Implement `DropOverlay.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { courseFileKind, unsupportedMessage } from '../../lib/courseFiles';
import { offerGeneratorFile } from '../../lib/pendingGeneratorFile';

const hasFiles = (e: DragEvent | React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Drag a document or recording anywhere over AuraMind to make a course.
 * Plain HTML5 drag-and-drop, so the website gets it as well as the Windows
 * app (which keeps dragDropEnabled: false so WebView2 delivers File objects).
 */
export function DropOverlay() {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setActive(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    // Without this the browser opens a file dropped outside the overlay.
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); depth.current = 0; setActive(false); };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!active) return null;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    depth.current = 0;
    setActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!courseFileKind(file.name)) {
      toast.error(unsupportedMessage(file.name));
      return;
    }
    offerGeneratorFile(file);
    navigate('/dashboard/generator');
  };

  return (
    <div
      data-testid="drop-overlay"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#060a16]/70 backdrop-blur-sm"
    >
      <div className="pointer-events-none absolute inset-4 rounded-3xl border-2 border-dashed border-violet-400/60 shadow-[inset_0_0_120px_rgba(139,92,246,0.35)]" />
      <div className="pointer-events-none text-center">
        <p className="text-2xl font-semibold text-white">Drop to make a course</p>
        <p className="mt-2 text-sm text-violet-200/80">PDF, slides, Word, text or a recording</p>
      </div>
    </div>
  );
}
```

Mount in `App.tsx` next to the update banner:

```tsx
import { DropOverlay } from "./components/shared/DropOverlay";
// …
{!isVisualHarness && user && <DropOverlay />}
```

- [ ] **Step 7: Run tests, type-check, lint**

Run: `npx vitest run src/__tests__/courseFiles.test.ts src/__tests__/dropOverlay.test.tsx && npm run type-check && npm run lint`
Expected: 10 passed; type-check and lint clean.

- [ ] **Step 8: Commit**

```bash
git add auramind-gemini/src/lib/courseFiles.ts auramind-gemini/src/lib/pendingGeneratorFile.ts auramind-gemini/src/components/shared/DropOverlay.tsx auramind-gemini/src/pages/generator/GeneratorPage.tsx auramind-gemini/src/App.tsx auramind-gemini/src/__tests__/courseFiles.test.ts auramind-gemini/src/__tests__/dropOverlay.test.tsx
git commit -m "feat(web): drop a file anywhere to make a course" -m "One list of accepted files shared by the generator, the Rust handoff and the installer's Explorer verbs, with a test that fails if they drift."
```

---

### Task 12: One rating path — `services/study/rateCard.ts`

**Files:**
- Create: `src/services/study/rateCard.ts`, `src/__tests__/rateCard.test.ts`
- Modify: `src/pages/dashboard/SparkReviewPage.tsx` (replace the body of `grade`, lines 53–87)

**Interfaces:**
- Produces: `rateCard(input: { card: Card; rating: Rating; userId: string | null | undefined; surface: string }): Promise<Partial<Card>>` — returns the update it wrote (for optimistic UI)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateCard = vi.hoisted(() => vi.fn());
const recordReview = vi.hoisted(() => vi.fn());
const queueCardReview = vi.hoisted(() => vi.fn());
const online = vi.hoisted(() => ({ value: true }));
vi.mock('../services/database/dbService', () => ({ dbService: { updateCard: (...a: unknown[]) => updateCard(...a) } }));
vi.mock('../services/database/modules/cardReviewsService', () => ({ cardReviewsService: { recordReview: (...a: unknown[]) => recordReview(...a) } }));
vi.mock('../services/offline/offlineStudyService', () => ({
  isOnline: () => online.value,
  queueCardReview: (...a: unknown[]) => queueCardReview(...a),
}));
vi.mock('../services/analytics/analyticsService', () => ({ analyticsService: { track: vi.fn() } }));

import { rateCard } from '../services/study/rateCard';
import { Rating, type Card } from '../types';

const card = { id: 'c1', deckId: 'd1', front: 'la madrugada', back: 'early morning', interval: 0, repetition: 0, easeFactor: 2.5 } as Card;

beforeEach(() => {
  online.value = true;
  updateCard.mockReset().mockResolvedValue(card);
  recordReview.mockReset().mockResolvedValue(undefined);
  queueCardReview.mockReset().mockResolvedValue(undefined);
});

describe('rateCard', () => {
  it('writes the schedule, including the new FSRS state, and records the review', async () => {
    const update = await rateCard({ card, rating: Rating.GOOD, userId: 'u1', surface: 'quick-review' });
    expect(update.fsrsState).toBeDefined();
    expect(update.nextReview).toBeGreaterThan(Date.now());
    expect(updateCard).toHaveBeenCalledWith('c1', update);
    expect(recordReview).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', cardId: 'c1', rating: Rating.GOOD }));
    expect(queueCardReview).not.toHaveBeenCalled();
  });

  it('queues the review first when offline', async () => {
    online.value = false;
    await rateCard({ card, rating: Rating.AGAIN, userId: 'u1', surface: 'quick-review' });
    expect(queueCardReview).toHaveBeenCalledWith('c1', Rating.AGAIN, expect.any(Object));
    expect(queueCardReview.mock.invocationCallOrder[0]).toBeLessThan(updateCard.mock.invocationCallOrder[0]);
  });

  it('never throws when a write fails', async () => {
    updateCard.mockRejectedValueOnce(new Error('network'));
    recordReview.mockRejectedValueOnce(new Error('network'));
    await expect(rateCard({ card, rating: Rating.HARD, userId: 'u1', surface: 'spark' })).resolves.toBeDefined();
  });

  it('skips review history without a user', async () => {
    await rateCard({ card, rating: Rating.EASY, userId: null, surface: 'spark' });
    expect(recordReview).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/__tests__/rateCard.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `rateCard.ts`**

```ts
/**
 * Rate one card: FSRS schedule, persist, review history, offline queue.
 * The study screen's semantics in one place so Quick Review and memory
 * sparks can't drift from it. Never throws: a failed write must not trap the
 * user on a card.
 */
import type { Card, Rating } from '../../types';
import { calculateSRS } from './srs';
import { dbService } from '../database/dbService';
import { cardReviewsService } from '../database/modules/cardReviewsService';
import { isOnline, queueCardReview } from '../offline/offlineStudyService';
import { analyticsService } from '../analytics/analyticsService';

export async function rateCard(input: {
  card: Card;
  rating: Rating;
  userId: string | null | undefined;
  surface: string;
}): Promise<Partial<Card>> {
  const { card, rating, userId, surface } = input;
  const res = calculateSRS(card, rating);
  const now = Date.now();
  const update: Partial<Card> = {
    interval: res.interval,
    repetition: res.repetition,
    easeFactor: res.easeFactor,
    nextReview: now + res.interval * 86_400_000,
    lastReviewed: now,
  };
  if (res.fsrsState) update.fsrsState = res.fsrsState;

  // Same reason as the study screen: updateCard() swallows a failed write,
  // so offline the only durable record is the queue.
  if (!isOnline()) {
    try { await queueCardReview(card.id, rating, res); } catch { /* best effort */ }
  }
  try { await dbService.updateCard(card.id, update); } catch { /* keep the user moving */ }
  if (userId) {
    cardReviewsService
      .recordReview({
        userId,
        cardId: card.id,
        rating,
        srsResult: { interval: res.interval, repetition: res.repetition, easeFactor: res.easeFactor, fsrsState: res.fsrsState },
        reviewedAt: now,
      })
      .catch(() => { /* fire-and-forget */ });
  }
  analyticsService.track('card_rated', { cardId: card.id, surface, rating });
  return update;
}
```

- [ ] **Step 3: Use it from `SparkReviewPage`**

Replace the body of `grade` (lines 53–87) with:

```ts
  const grade = async (rating: Rating) => {
    if (!card) return;
    recordSpark('notification', card.id);
    const update = await rateCard({ card, rating, userId, surface: 'spark-notification' });
    workspace?.updateCardOptimistically?.(card.id, update);
    analyticsService.track('spark_reviewed', { cardId: card.id, surface: 'notification', rating });
    navigate('/dashboard', { replace: true });
  };
```

Replace the imports of `calculateSRS`, `dbService`, `cardReviewsService` with `import { rateCard } from '../../services/study/rateCard';`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/rateCard.test.ts && npx vitest run -t spark && npm run type-check`
Expected: 4 passed; existing spark tests pass; type-check clean.

- [ ] **Step 5: Commit**

```bash
git add auramind-gemini/src/services/study/rateCard.ts auramind-gemini/src/__tests__/rateCard.test.ts auramind-gemini/src/pages/dashboard/SparkReviewPage.tsx
git commit -m "refactor(study): one rateCard path for sparks and Quick Review" -m "Memory-spark reviews now also queue offline, like the study screen."
```

---
### Task 13: Due state and the nudge planner (pure)

**Files:**
- Create: `src/desktop/dueState.ts`, `src/desktop/nudgePlanner.ts`, `src/__tests__/dueState.test.ts`, `src/__tests__/nudgePlanner.test.ts`

**Interfaces:**
- Consumes: `DueState`, `PlannedNudge` (bridge.ts); `cardRetrievability`, `SPARK_BAND_MIN`, `SPARK_BAND_MAX`, `DEFAULT_QUIET_START_HOUR`, `DEFAULT_QUIET_END_HOUR` (sparkScheduler.ts)
- Produces:
  - `computeDueState(input: { cards: Card[]; decks: Deck[]; now: number; streak: number; studying: boolean }): DueState`
  - `interface NudgePrefs { reminderTime: string; dailyReminder: boolean; dueReminder: boolean; quietStartHour: number; quietEndHour: number }`
  - `DEFAULT_NUDGE_PREFS: NudgePrefs` (`'09:00'`, `true`, `true`, 22, 8)
  - `planNudges(state: DueState, prefs: NudgePrefs, now: number): PlannedNudge[]`
  - `nudgeText(state: DueState): { title: string; body: string }`

- [ ] **Step 1: Failing tests for `computeDueState`**

```ts
import { describe, it, expect, vi } from 'vitest';

const retrievability = vi.hoisted(() => new Map<string, number>());
vi.mock('../services/memory/sparkScheduler', () => ({
  SPARK_BAND_MIN: 0.65,
  SPARK_BAND_MAX: 0.9,
  cardRetrievability: (card: { id: string }) => retrievability.get(card.id) ?? 1,
}));

import { computeDueState } from '../desktop/dueState';
import type { Card, Deck } from '../types';

const NOW = 1_800_000_000_000;
const deck = (id: string, title: string) => ({ id, title }) as Deck;
const card = (id: string, deckId: string, nextReview: number, lastReviewed?: number) =>
  ({ id, deckId, front: id, back: id, nextReview, lastReviewed }) as Card;

describe('computeDueState', () => {
  it('counts due cards and names the two decks with the most', () => {
    const state = computeDueState({
      cards: [card('a', 'es', NOW - 1), card('b', 'es', NOW), card('c', 'bio', NOW - 5), card('d', 'law', NOW - 5), card('e', 'bio', NOW - 1), card('f', 'es', NOW + 1)],
      decks: [deck('es', 'Spanish A1'), deck('bio', 'Enzymes'), deck('law', 'Con Law')],
      now: NOW,
      streak: 12,
      studying: false,
    });
    expect(state).toEqual({ due: 5, fadingCount: 0, topDecks: ['Enzymes', 'Spanish A1'], streak: 12, studying: false });
  });

  it('treats a card with no schedule as due, like the study screen', () => {
    expect(computeDueState({ cards: [{ id: 'x', deckId: 'd', front: '', back: '' } as Card], decks: [], now: NOW, streak: 0, studying: false }).due).toBe(1);
  });

  it('counts only reviewed cards in the spark band as fading', () => {
    retrievability.set('a', 0.7).set('b', 0.95).set('c', 0.6).set('d', 0.8);
    const state = computeDueState({
      cards: [card('a', 'es', NOW + 9, NOW - 9), card('b', 'es', NOW + 9, NOW - 9), card('c', 'es', NOW + 9, NOW - 9), card('d', 'es', NOW + 9)],
      decks: [deck('es', 'Spanish A1')],
      now: NOW,
      streak: 0,
      studying: true,
    });
    expect(state.fadingCount).toBe(1); // a only: b too strong, c too weak, d never reviewed
    expect(state.studying).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `dueState.ts`**

```ts
import type { Card, Deck } from '../types';
import type { DueState } from './bridge';
import { cardRetrievability, SPARK_BAND_MAX, SPARK_BAND_MIN } from '../services/memory/sparkScheduler';

/** What the tray, badge and nudges show. Pure; FSRS stays in TypeScript. */
export function computeDueState(input: {
  cards: Card[];
  decks: Deck[];
  now: number;
  streak: number;
  studying: boolean;
}): DueState {
  const { cards, decks, now, streak, studying } = input;
  const dueByDeck = new Map<string, number>();
  let due = 0;
  let fadingCount = 0;
  for (const card of cards) {
    if ((card.nextReview ?? 0) <= now) {
      due += 1;
      dueByDeck.set(card.deckId, (dueByDeck.get(card.deckId) ?? 0) + 1);
    }
    if (card.lastReviewed) {
      const r = cardRetrievability(card, now);
      if (r >= SPARK_BAND_MIN && r <= SPARK_BAND_MAX) fadingCount += 1;
    }
  }
  const titles = new Map(decks.map((d) => [d.id, d.title]));
  const topDecks = [...dueByDeck.entries()]
    .map(([id, count]) => ({ title: titles.get(id), count }))
    .filter((d): d is { title: string; count: number } => Boolean(d.title))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 2)
    .map((d) => d.title);
  return { due, fadingCount, topDecks, streak, studying };
}
```

Run: `npx vitest run src/__tests__/dueState.test.ts` → 3 passed.

- [ ] **Step 3: Failing tests for the planner**

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_NUDGE_PREFS, nudgeText, planNudges } from '../desktop/nudgePlanner';
import type { DueState } from '../desktop/bridge';

const at = (h: number, m = 0, day = 29) => new Date(2026, 8, day, h, m).getTime();
const state = (over: Partial<DueState> = {}): DueState => ({ due: 12, fadingCount: 0, topDecks: ['Spanish A1', 'Enzymes'], streak: 3, studying: false, ...over });

describe('planNudges', () => {
  it('nothing due, nothing planned', () => {
    expect(planNudges(state({ due: 0 }), DEFAULT_NUDGE_PREFS, at(7))).toEqual([]);
  });

  it('plans the daily reminder later today', () => {
    const [n] = planNudges(state(), DEFAULT_NUDGE_PREFS, at(7));
    expect(n.atMs).toBe(at(9));
  });

  it('rolls to tomorrow once today’s time has passed', () => {
    const [n] = planNudges(state(), DEFAULT_NUDGE_PREFS, at(10));
    expect(n.atMs).toBe(at(9, 0, 30));
  });

  it('never lands in quiet hours: a 23:30 reminder moves to 08:00', () => {
    const [n] = planNudges(state(), { ...DEFAULT_NUDGE_PREFS, reminderTime: '23:30' }, at(12));
    expect(n.atMs).toBe(at(8, 0, 30));
  });

  it('respects the daily-reminder switch', () => {
    expect(planNudges(state(), { ...DEFAULT_NUDGE_PREFS, dailyReminder: false }, at(7))).toEqual([]);
  });

  it('adds one afternoon nudge only when 10+ cards are fading', () => {
    expect(planNudges(state({ fadingCount: 9 }), DEFAULT_NUDGE_PREFS, at(7))).toHaveLength(1);
    const plan = planNudges(state({ fadingCount: 10 }), DEFAULT_NUDGE_PREFS, at(7));
    expect(plan.map((n) => n.atMs)).toEqual([at(9), at(15)]);
  });

  it('never two nudges within 2 hours', () => {
    const plan = planNudges(state({ fadingCount: 20 }), { ...DEFAULT_NUDGE_PREFS, reminderTime: '14:00' }, at(7));
    expect(plan.map((n) => n.atMs)).toEqual([at(14)]);
  });

  it('plans only the next 24 hours', () => {
    for (const n of planNudges(state({ fadingCount: 20 }), DEFAULT_NUDGE_PREFS, at(16))) {
      expect(n.atMs - at(16)).toBeLessThanOrEqual(24 * 3600_000);
    }
  });
});

describe('nudgeText', () => {
  it('matches the approved notification', () => {
    expect(nudgeText(state({ fadingCount: 4 }))).toEqual({
      title: '12 cards are ready',
      body: 'About 5 minutes. Spanish A1 and Enzymes are fading.',
    });
  });

  it('reads naturally for one card and no fading decks', () => {
    expect(nudgeText(state({ due: 1, topDecks: ['Enzymes'] }))).toEqual({
      title: '1 card is ready',
      body: 'About 1 minute. From Enzymes.',
    });
  });
});
```

- [ ] **Step 4: Implement `nudgePlanner.ts`**

```ts
/**
 * When to nudge, and what to say. Pure; the Rust shell holds the timer.
 * Rules (spec §4): the daily reminder at the user's time if anything is due;
 * at most one extra afternoon nudge when 10+ cards are fading; never in
 * quiet hours; never two within 2 hours; only the next 24 hours.
 */
import type { DueState, PlannedNudge } from './bridge';
import { DEFAULT_QUIET_END_HOUR, DEFAULT_QUIET_START_HOUR } from '../services/memory/sparkScheduler';

export interface NudgePrefs {
  reminderTime: string; // "HH:MM"
  dailyReminder: boolean;
  dueReminder: boolean;
  quietStartHour: number;
  quietEndHour: number;
}

export const DEFAULT_NUDGE_PREFS: NudgePrefs = {
  reminderTime: '09:00',
  dailyReminder: true,
  dueReminder: true,
  quietStartHour: DEFAULT_QUIET_START_HOUR,
  quietEndHour: DEFAULT_QUIET_END_HOUR,
};

const HOUR = 3_600_000;
const AFTERNOON_HOUR = 15;
const SECONDS_PER_CARD = 25;
const MIN_GAP = 2 * HOUR;

const isQuiet = (t: number, p: NudgePrefs) => {
  const h = new Date(t).getHours();
  return h >= p.quietStartHour || h < p.quietEndHour;
};

/** Next local time at hh:mm at or after `now`, pushed out of quiet hours. */
function nextAt(now: number, hh: number, mm: number, p: NudgePrefs): number {
  const d = new Date(now);
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() < now) d.setDate(d.getDate() + 1);
  if (isQuiet(d.getTime(), p)) {
    if (d.getHours() >= p.quietStartHour) d.setDate(d.getDate() + 1);
    d.setHours(p.quietEndHour, 0, 0, 0);
  }
  return d.getTime();
}

export function nudgeText(state: DueState): { title: string; body: string } {
  const title = state.due === 1 ? '1 card is ready' : `${state.due} cards are ready`;
  const minutes = Math.max(1, Math.round((state.due * SECONDS_PER_CARD) / 60));
  const time = minutes === 1 ? 'About 1 minute.' : `About ${minutes} minutes.`;
  const decks = state.topDecks.join(' and ');
  let tail = '';
  if (decks && state.fadingCount > 0) tail = ` ${decks} ${state.topDecks.length > 1 ? 'are' : 'is'} fading.`;
  else if (decks) tail = ` From ${decks}.`;
  return { title, body: `${time}${tail}` };
}

export function planNudges(state: DueState, prefs: NudgePrefs, now: number): PlannedNudge[] {
  if (state.due <= 0) return [];
  const [hh, mm] = prefs.reminderTime.split(':').map((n) => Number.parseInt(n, 10));
  const text = nudgeText(state);
  const times: number[] = [];
  if (prefs.dailyReminder && Number.isFinite(hh) && Number.isFinite(mm)) {
    times.push(nextAt(now, hh, mm, prefs));
  }
  if (prefs.dueReminder && state.fadingCount >= 10) {
    const afternoon = nextAt(now, AFTERNOON_HOUR, 0, prefs);
    if (times.every((t) => Math.abs(t - afternoon) >= MIN_GAP)) times.push(afternoon);
  }
  return times
    .filter((t) => t - now <= 24 * HOUR)
    .sort((a, b) => a - b)
    .map((atMs) => ({ atMs, ...text }));
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/dueState.test.ts src/__tests__/nudgePlanner.test.ts`
Expected: 13 passed.

- [ ] **Step 6: Commit**

```bash
git add auramind-gemini/src/desktop/dueState.ts auramind-gemini/src/desktop/nudgePlanner.ts auramind-gemini/src/__tests__/dueState.test.ts auramind-gemini/src/__tests__/nudgePlanner.test.ts
git commit -m "feat(desktop): due state and nudge planning, pure and tested"
```

---

### Task 14: Main-window integration, deep links and in-app sign-in

**Files:**
- Create: `src/desktop/deepLinkRouter.ts`, `src/desktop/useDesktopIntegration.ts`, `src/__tests__/deepLinkRouter.test.ts`, `src/__tests__/desktopIntegration.test.tsx`
- Modify: `src/App.tsx` (call the hook next to `useSparkSync('maintain')`, ~line 761), `src/services/database/supabase.ts` (line 36), `src/components/auth/AuthPage.tsx` (OAuth handlers + visibility), `src/lib/env.ts` (CLIENT_ENV), `.env.desktop`

**Interfaces:**
- Consumes: `desktop` (bridge), `computeDueState`, `planNudges`, `DEFAULT_NUDGE_PREFS`, `parseDeepLink` (lib/deepLinks.ts), `fileFromHandoff`, `unsupportedMessage` (courseFiles), `offerGeneratorFile`, `refreshWorkspace` (lib/workspaceRefresh.ts), `useStudyStats`, `useAppPreference`
- Produces:
  - `routeDeepLink(url: string, deps: { navigate: (path: string) => void; exchangeCode: (code: string) => Promise<{ error: unknown }> }): Promise<'navigated' | 'signed-in' | 'sign-in-failed' | 'ignored'>`
  - `useDesktopIntegration(input: { cards: Card[]; decks: Deck[]; userId: string | null | undefined; enabled: boolean }): void`
  - `QUICK_REVIEW_SHORTCUT_PREF = 'auramind_quickReviewShortcut'`, `DEFAULT_QUICK_REVIEW_SHORTCUT = 'CommandOrControl+Alt+Space'`
  - `desktopOAuthEnabled(): boolean` (in `AuthPage.tsx` scope)

- [ ] **Step 1: Failing tests for the router**

```ts
import { describe, it, expect, vi } from 'vitest';
import { routeDeepLink } from '../desktop/deepLinkRouter';

const deps = () => ({ navigate: vi.fn(), exchangeCode: vi.fn(async () => ({ error: null })) });

describe('routeDeepLink', () => {
  it('opens allowlisted app routes', async () => {
    const d = deps();
    await expect(routeDeepLink('auramind://app/study', d)).resolves.toBe('navigated');
    expect(d.navigate).toHaveBeenCalledWith('/dashboard/study');
  });

  it('ignores routes outside the allowlist', async () => {
    const d = deps();
    await expect(routeDeepLink('auramind://app/admin/users', d)).resolves.toBe('ignored');
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('finishes sign-in with the PKCE code', async () => {
    const d = deps();
    await expect(routeDeepLink('auramind://auth/callback?code=abc', d)).resolves.toBe('signed-in');
    expect(d.exchangeCode).toHaveBeenCalledWith('abc');
    expect(d.navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('a failed or refused sign-in returns to the sign-in page', async () => {
    const d = deps();
    d.exchangeCode.mockResolvedValueOnce({ error: new Error('bad verifier') });
    await expect(routeDeepLink('auramind://auth/callback?code=forged', d)).resolves.toBe('sign-in-failed');
    expect(d.navigate).toHaveBeenLastCalledWith('/auth?error=oauth');
    const d2 = deps();
    await expect(routeDeepLink('auramind://auth/callback?error=access_denied', d2)).resolves.toBe('sign-in-failed');
    expect(d2.exchangeCode).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement `deepLinkRouter.ts`**

```ts
/**
 * auramind:// links in the Windows app. App links go through the same
 * allowlist as the phone apps. The auth callback finishes PKCE sign-in: the
 * verifier never left this origin, so a forged code can't sign anyone in.
 */
import { parseDeepLink } from '../lib/deepLinks';

export async function routeDeepLink(
  url: string,
  deps: { navigate: (path: string) => void; exchangeCode: (code: string) => Promise<{ error: unknown }> },
): Promise<'navigated' | 'signed-in' | 'sign-in-failed' | 'ignored'> {
  if (url.startsWith('auramind://auth/callback')) {
    const params = new URL(url).searchParams;
    const code = params.get('code');
    if (!code || params.get('error')) {
      deps.navigate('/auth?error=oauth');
      return 'sign-in-failed';
    }
    const { error } = await deps.exchangeCode(code);
    if (error) {
      deps.navigate('/auth?error=oauth');
      return 'sign-in-failed';
    }
    deps.navigate('/dashboard');
    return 'signed-in';
  }
  const path = parseDeepLink(url);
  if (!path) return 'ignored';
  deps.navigate(path);
  return 'navigated';
}
```

Run: `npx vitest run src/__tests__/deepLinkRouter.test.ts` → 4 passed.

- [ ] **Step 3: Failing test for the integration hook**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const bridge = vi.hoisted(() => ({
  setDueState: vi.fn(async () => {}),
  scheduleNudges: vi.fn(async () => {}),
  setShortcut: vi.fn(async () => ({ ok: true })),
  handlers: new Map<string, (p: unknown) => void>(),
}));
vi.mock('../desktop/bridge', () => ({
  desktop: {
    setDueState: bridge.setDueState,
    scheduleNudges: bridge.scheduleNudges,
    setShortcut: bridge.setShortcut,
    on: async (event: string, handler: (p: unknown) => void) => { bridge.handlers.set(event, handler); return () => bridge.handlers.delete(event); },
  },
}));
const refresh = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../lib/workspaceRefresh', () => ({ refreshWorkspace: () => refresh() }));
vi.mock('../hooks/useStudyStats', () => ({ useStudyStats: () => ({ streak: 4 }) }));
const offer = vi.hoisted(() => vi.fn());
vi.mock('../lib/pendingGeneratorFile', () => ({ offerGeneratorFile: (f: File) => offer(f) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m) } }));
vi.mock('../services/database/supabase', () => ({ supabase: { auth: { exchangeCodeForSession: vi.fn(async () => ({ error: null })) } } }));

import { useDesktopIntegration } from '../desktop/useDesktopIntegration';
import type { Card, Deck } from '../types';

function Harness({ cards }: { cards: Card[] }) {
  useDesktopIntegration({ cards, decks: [{ id: 'd', title: 'Spanish A1' } as Deck], userId: 'u1', enabled: true });
  return <div data-testid="where">{useLocation().pathname}</div>;
}
function mount(cards: Card[]) {
  return render(<MemoryRouter initialEntries={['/dashboard']}><Routes><Route path="*" element={<Harness cards={cards} />} /></Routes></MemoryRouter>);
}
const due = (id: string) => ({ id, deckId: 'd', front: id, back: id, nextReview: 0 }) as Card;

beforeEach(() => {
  bridge.setDueState.mockClear(); bridge.scheduleNudges.mockClear(); bridge.handlers.clear();
  refresh.mockClear(); offer.mockClear(); toastError.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('useDesktopIntegration', () => {
  it('publishes the due state once per change, not per render', async () => {
    const { rerender } = mount([due('a'), due('b')]);
    await act(async () => {});
    expect(bridge.setDueState).toHaveBeenCalledTimes(1);
    expect(bridge.setDueState).toHaveBeenLastCalledWith(expect.objectContaining({ due: 2, streak: 4, topDecks: ['Spanish A1'] }));
    rerender(<MemoryRouter initialEntries={['/dashboard']}><Routes><Route path="*" element={<Harness cards={[due('a'), due('b')]} />} /></Routes></MemoryRouter>);
    await act(async () => {});
    expect(bridge.setDueState).toHaveBeenCalledTimes(1);
  });

  it('clears to zero when the last card is done', async () => {
    const { rerender } = mount([due('a')]);
    await act(async () => {});
    rerender(<MemoryRouter initialEntries={['/dashboard']}><Routes><Route path="*" element={<Harness cards={[]} />} /></Routes></MemoryRouter>);
    await act(async () => {});
    expect(bridge.setDueState).toHaveBeenLastCalledWith(expect.objectContaining({ due: 0 }));
    expect(bridge.scheduleNudges).toHaveBeenLastCalledWith([]);
  });

  it('a file from Explorer lands in the generator; a rejected one explains itself', async () => {
    mount([]);
    await act(async () => {});
    await act(async () => { bridge.handlers.get('create-from-file')!({ kind: 'file', name: 'a.pdf', mime: 'application/pdf', base64: 'aGk=' }); });
    expect(offer).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.pdf' }));
    await act(async () => { bridge.handlers.get('create-from-file')!({ kind: 'error', name: 'big.pdf', reason: 'too-large' }); });
    expect(toastError).toHaveBeenCalledWith('big.pdf is over the 50 MB limit.');
  });

  it('Quick Review ratings refresh the workspace; routes and links navigate', async () => {
    const { getByTestId } = mount([]);
    await act(async () => {});
    await act(async () => { bridge.handlers.get('cards-changed')!({}); });
    expect(refresh).toHaveBeenCalled();
    await act(async () => { bridge.handlers.get('open-route')!({ path: '/dashboard/decks' }); });
    expect(getByTestId('where')).toHaveTextContent('/dashboard/decks');
    await act(async () => { bridge.handlers.get('deep-link')!({ url: 'auramind://app/study' }); });
    expect(getByTestId('where')).toHaveTextContent('/dashboard/study');
  });
});
```

- [ ] **Step 4: Implement `useDesktopIntegration.ts`**

```ts
/**
 * The main window's side of the Windows app: tell the shell what's due,
 * plan nudges, and act on what the shell forwards (links, files, routes,
 * Quick Review ratings). Does nothing outside the Windows app.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Card, Deck } from '../types';
import { desktop, type FileHandoff } from './bridge';
import { computeDueState } from './dueState';
import { DEFAULT_NUDGE_PREFS, planNudges } from './nudgePlanner';
import { routeDeepLink } from './deepLinkRouter';
import { fileFromHandoff, unsupportedMessage } from '../lib/courseFiles';
import { offerGeneratorFile } from '../lib/pendingGeneratorFile';
import { refreshWorkspace } from '../lib/workspaceRefresh';
import { useStudyStats } from '../hooks/useStudyStats';
import { useAppPreference } from '../lib/appPreferences';
import { supabase } from '../services/database/supabase';

export const QUICK_REVIEW_SHORTCUT_PREF = 'auramind_quickReviewShortcut';
export const DEFAULT_QUICK_REVIEW_SHORTCUT = 'CommandOrControl+Alt+Space';
const MINUTE = 60_000;

function handoffError(h: Extract<FileHandoff, { kind: 'error' }>): string {
  if (h.reason === 'too-large') return `${h.name} is over the 50 MB limit.`;
  if (h.reason === 'unreadable') return `AuraMind couldn't open ${h.name}.`;
  return unsupportedMessage(h.name);
}

export function useDesktopIntegration(input: {
  cards: Card[];
  decks: Deck[];
  userId: string | null | undefined;
  enabled: boolean;
}): void {
  const { cards, decks, userId, enabled } = input;
  const navigate = useNavigate();
  const location = useLocation();
  const { streak } = useStudyStats(userId ?? null);
  const [reminderTime] = useAppPreference('auramind_reminderTime', DEFAULT_NUDGE_PREFS.reminderTime);
  const [dailyReminder] = useAppPreference('auramind_dailyReminder', true);
  const [dueReminder] = useAppPreference('auramind_dueReminder', true);
  const [shortcut] = useAppPreference(QUICK_REVIEW_SHORTCUT_PREF, DEFAULT_QUICK_REVIEW_SHORTCUT);
  const studying = location.pathname.startsWith('/dashboard/study/');

  // Re-evaluate each minute: cards become due with time, not only on change.
  const tick = useMinuteTick(enabled);
  const state = useMemo(
    () => computeDueState({ cards, decks, now: Date.now(), streak: streak ?? 0, studying }),
    // tick forces a recompute every minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, decks, streak, studying, tick],
  );
  const last = useRef('');
  useEffect(() => {
    if (!enabled) return;
    const key = JSON.stringify(state);
    if (key === last.current) return;
    last.current = key;
    void desktop.setDueState(state);
    void desktop.scheduleNudges(
      planNudges(state, { ...DEFAULT_NUDGE_PREFS, reminderTime, dailyReminder, dueReminder }, Date.now()),
    );
  }, [enabled, state, reminderTime, dailyReminder, dueReminder]);

  useEffect(() => {
    if (enabled && shortcut !== DEFAULT_QUICK_REVIEW_SHORTCUT) void desktop.setShortcut(shortcut);
  }, [enabled, shortcut]);

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    if (!enabled) return;
    const go = (path: string) => navigateRef.current(path);
    const offs = [
      desktop.on('deep-link', ({ url }) => {
        void routeDeepLink(url, {
          navigate: go,
          exchangeCode: async (code) =>
            supabase ? supabase.auth.exchangeCodeForSession(code) : { error: new Error('offline') },
        });
      }),
      desktop.on('create-from-file', (h) => {
        if (h.kind === 'error') {
          toast.error(handoffError(h));
          return;
        }
        offerGeneratorFile(fileFromHandoff(h));
        go('/dashboard/generator');
      }),
      desktop.on('open-route', ({ path }) => {
        if (path.startsWith('/') && !path.startsWith('//')) go(path);
      }),
      desktop.on('cards-changed', () => { void refreshWorkspace(); }),
    ];
    return () => { offs.forEach((p) => void p.then((off) => off())); };
  }, [enabled]);
}

function useMinuteTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), MINUTE);
    return () => clearInterval(id);
  }, [enabled]);
  return tick;
}
```

Run: `npx vitest run src/__tests__/desktopIntegration.test.tsx` → 4 passed.

- [ ] **Step 5: Mount it in `App.tsx`**

After `useSparkSync('maintain');` (~line 761):

```ts
  // Windows app: tray/badge due state, study nudges, links, files, Quick
  // Review refreshes. Inert in a browser tab and the phone apps.
  useDesktopIntegration({ cards, decks, userId: user?.id, enabled: isDesktopApp() && !isQuickReviewWindow });
```

with imports `import { useDesktopIntegration } from "./desktop/useDesktopIntegration";` and `isDesktopApp` from `./lib/platform`. `isQuickReviewWindow` is defined in Task 15; until then use `enabled: isDesktopApp()`, and Task 15 adds the second condition.

- [ ] **Step 6: PKCE in the Windows build, and the OAuth buttons**

`src/services/database/supabase.ts` line 36:

```ts
        // The Windows app finishes OAuth through auramind://auth/callback,
        // which needs PKCE (the code is useless without the verifier stored
        // in this origin). Web and mobile keep the current flow.
        return createClient(supabaseUrl, supabaseAnonKey, isDesktopApp() ? { auth: { flowType: 'pkce' } } : undefined);
```

with `import { isDesktopApp } from '../../lib/platform';`.

`src/lib/env.ts` CLIENT_ENV: add `VITE_DESKTOP_OAUTH: import.meta.env.VITE_DESKTOP_OAUTH,` next to `VITE_IOS_PREVIEW`. `.env.desktop`: add the commented line

```
# Turn on Google/Notion sign-in in the app once auramind://auth/callback is in
# Supabase → Authentication → URL Configuration → Redirect URLs.
# VITE_DESKTOP_OAUTH=true
```

`AuthPage.tsx`: add

```ts
import { isDesktopApp } from "../../lib/platform";
import { readClientEnv } from "../../lib/env";

/** The Windows app can finish OAuth via auramind:// once Supabase allows it. */
function desktopOAuthEnabled(): boolean {
  return isDesktopApp() && readClientEnv("VITE_DESKTOP_OAUTH") === "true";
}
```

Change `const inAppShell = isAppShell();` to `const inAppShell = isAppShell() && !desktopOAuthEnabled();` (so the existing show/hide logic needs no other change), and at the top of both `handleGoogleSSO` and `handleNotionSSO` bodies, after the `!supabase` guard, add (with the matching provider):

```ts
    if (desktopOAuthEnabled()) {
      setLoading(true);
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: "auramind://auth/callback", skipBrowserRedirect: true },
      });
      setLoading(false);
      if (oauthError || !data?.url) {
        setError(oauthError?.message || "Google sign-in failed");
        return;
      }
      // desktopLinks routes this to the user's browser.
      window.open(data.url, "_blank");
      return;
    }
```

- [ ] **Step 7: Full check and commit**

Run: `npx vitest run src/__tests__/deepLinkRouter.test.ts src/__tests__/desktopIntegration.test.tsx src/__tests__/turnstileNative.test.ts src/__tests__/clientSecretExposure.test.ts && npm run type-check && npm run lint`
Expected: all pass (the secret-exposure test accepts `VITE_DESKTOP_OAUTH`: it's a flag, not a key).

```bash
git add auramind-gemini/src auramind-gemini/.env.desktop
git commit -m "feat(desktop): due state, nudges, links and PKCE sign-in wired into the main window"
```

---
### Task 15: The Quick Review page

**Files:**
- Create: `src/pages/quickReview/QuickReviewPage.tsx`, `src/styles/desktop.css`, `src/__tests__/quickReviewPage.test.tsx`
- Modify: `src/App.tsx` (route + window gating), `src/index.tsx` (import `./styles/desktop.css`)

**Interfaces:**
- Consumes: `desktop.{cardsChanged, quickReviewDone, showMain}`, `rateCard`, `dbService.fetchCards(userId)`, `dbService.fetchDecks(userId)`, `useCurrentUserId()` (`string | null | undefined`), `Rating`
- Produces: default export `QuickReviewPage`; exported pure helpers `pickDueCards(cards: Card[], now: number, limit?: number): Card[]` and `formatNextDue(ms: number | null, now: number): string`; `QUICK_REVIEW_LIMIT = 10`; `DONE_HIDE_MS = 2000`

- [ ] **Step 1: Failing tests**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Card } from '../types';

const userId = vi.hoisted(() => ({ value: 'u1' as string | null | undefined }));
vi.mock('../hooks/useCurrentUserId', () => ({ useCurrentUserId: () => userId.value }));
const fetchCards = vi.hoisted(() => vi.fn());
vi.mock('../services/database/dbService', () => ({
  dbService: { fetchCards: (...a: unknown[]) => fetchCards(...a), fetchDecks: async () => [{ id: 'd', title: 'Spanish A1' }] },
}));
const rateCard = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../services/study/rateCard', () => ({ rateCard: (...a: unknown[]) => rateCard(...a) }));
const bridge = vi.hoisted(() => ({ cardsChanged: vi.fn(), quickReviewDone: vi.fn(), showMain: vi.fn() }));
vi.mock('../desktop/bridge', () => ({ desktop: bridge }));

import QuickReviewPage, { formatNextDue, pickDueCards } from '../pages/quickReview/QuickReviewPage';

const NOW = Date.now();
const card = (id: string, nextReview: number): Card =>
  ({ id, deckId: 'd', front: `front ${id}`, back: `back ${id}`, nextReview }) as Card;

beforeEach(() => {
  userId.value = 'u1';
  fetchCards.mockReset();
  rateCard.mockClear();
  Object.values(bridge).forEach((f) => f.mockClear());
});
afterEach(() => vi.useRealTimers());

describe('pickDueCards', () => {
  it('most overdue first, at most 10, future cards excluded', () => {
    const cards = Array.from({ length: 14 }, (_, i) => card(`c${i}`, NOW - i * 1000)).concat(card('future', NOW + 1000));
    const picked = pickDueCards(cards, NOW);
    expect(picked).toHaveLength(10);
    expect(picked[0].id).toBe('c13');
    expect(picked.some((c) => c.id === 'future')).toBe(false);
  });
});

describe('formatNextDue', () => {
  it('reads naturally', () => {
    expect(formatNextDue(null, NOW)).toBe('');
    expect(formatNextDue(NOW + 25 * 60_000, NOW)).toBe('Next card due in 25 min');
    expect(formatNextDue(NOW + 3 * 3_600_000, NOW)).toBe('Next card due in 3h');
    expect(formatNextDue(NOW + 30 * 3_600_000, NOW)).toBe('Next card due tomorrow');
  });
});

describe('QuickReviewPage', () => {
  it('flips with Space, rates with 1–4, and tells the main window', async () => {
    fetchCards.mockResolvedValue([card('a', NOW - 10), card('b', NOW - 5)]);
    render(<QuickReviewPage />);
    expect(await screen.findByText('front a')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByText('back a')).toBeInTheDocument();
    await act(async () => { fireEvent.keyDown(window, { key: '3', code: 'Digit3' }); });
    expect(rateCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ id: 'a' }), surface: 'quick-review' }));
    expect(bridge.cardsChanged).toHaveBeenCalled();
    expect(screen.getByText('front b')).toBeInTheDocument();
  });

  it('rating keys do nothing until the answer is shown', async () => {
    fetchCards.mockResolvedValue([card('a', NOW - 10)]);
    render(<QuickReviewPage />);
    await screen.findByText('front a');
    await act(async () => { fireEvent.keyDown(window, { key: '3', code: 'Digit3' }); });
    expect(rateCard).not.toHaveBeenCalled();
  });

  it('finishing shows the done state and hides itself after 2 seconds', async () => {
    fetchCards.mockResolvedValue([card('a', NOW - 10), card('later', NOW + 3 * 3_600_000)]);
    render(<QuickReviewPage />);
    await screen.findByText('front a');
    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await act(async () => { fireEvent.keyDown(window, { key: '4', code: 'Digit4' }); });
    expect(screen.getByText('All caught up')).toBeInTheDocument();
    expect(screen.getByText('Next card due in 3h')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(bridge.quickReviewDone).toHaveBeenCalled();
  });

  it('Esc hides the panel', async () => {
    fetchCards.mockResolvedValue([card('a', NOW - 10)]);
    render(<QuickReviewPage />);
    await screen.findByText('front a');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(bridge.quickReviewDone).toHaveBeenCalled();
  });

  it('signed out: offers sign-in in the main window', async () => {
    userId.value = null;
    render(<QuickReviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to AuraMind' }));
    expect(bridge.showMain).toHaveBeenCalledWith('/auth');
    expect(bridge.quickReviewDone).toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/__tests__/quickReviewPage.test.tsx` → FAIL (module missing).

- [ ] **Step 2: Implement the page**

```tsx
/**
 * Quick Review: the corner panel opened by Ctrl+Alt+Space, the tray or a
 * notification. Up to 10 due cards, most overdue first; Space flips, 1–4
 * rates, Esc hides. Ratings use the study screen's path (rateCard) and the
 * main window refreshes its counts through the shell.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Card } from '../../types';
import { Rating } from '../../types';
import { dbService } from '../../services/database/dbService';
import { rateCard } from '../../services/study/rateCard';
import { desktop } from '../../desktop/bridge';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';

export const QUICK_REVIEW_LIMIT = 10;
export const DONE_HIDE_MS = 2000;

const RATINGS = [
  ['Again', Rating.AGAIN],
  ['Hard', Rating.HARD],
  ['Good', Rating.GOOD],
  ['Easy', Rating.EASY],
] as const;

export function pickDueCards(cards: Card[], now: number, limit = QUICK_REVIEW_LIMIT): Card[] {
  return cards
    .filter((c) => (c.nextReview ?? 0) <= now)
    .sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))
    .slice(0, limit);
}

export function formatNextDue(ms: number | null, now: number): string {
  if (ms === null) return '';
  const minutes = Math.max(1, Math.round((ms - now) / 60_000));
  if (minutes < 60) return `Next card due in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Next card due in ${hours}h`;
  return 'Next card due tomorrow';
}

export default function QuickReviewPage() {
  const userId = useCurrentUserId();
  const [queue, setQueue] = useState<Card[]>([]);
  const [deckTitles, setDeckTitles] = useState<Record<string, string>>({});
  const [nextDue, setNextDue] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add('quick-review-window');
    return () => document.documentElement.classList.remove('quick-review-window');
  }, []);

  const load = useCallback(async () => {
    if (typeof userId !== 'string') return;
    setLoading(true);
    const [cards, decks] = await Promise.all([dbService.fetchCards(userId), dbService.fetchDecks(userId)]);
    const now = Date.now();
    setQueue(pickDueCards(cards, now));
    const future = cards.map((c) => c.nextReview ?? 0).filter((t) => t > now);
    setNextDue(future.length ? Math.min(...future) : null);
    setDeckTitles(Object.fromEntries(decks.map((d) => [d.id, d.title])));
    setIndex(0);
    setRevealed(false);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // The window is hidden, not closed, between uses: reload when it returns.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  const done = !loading && index >= queue.length;
  const card = queue[index];

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => void desktop.quickReviewDone(), DONE_HIDE_MS);
    return () => clearTimeout(id);
  }, [done]);

  const rate = useCallback(async (rating: Rating) => {
    if (!card || !revealed) return;
    await rateCard({ card, rating, userId, surface: 'quick-review' });
    void desktop.cardsChanged();
    setRevealed(false);
    setIndex((i) => i + 1);
  }, [card, revealed, userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { void desktop.quickReviewDone(); return; }
      if (!card) return;
      if (e.code === 'Space') { e.preventDefault(); setRevealed(true); return; }
      const n = Number.parseInt(e.key, 10);
      if (n >= 1 && n <= 4) void rate(RATINGS[n - 1][1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, rate]);

  const shell = 'flex h-screen w-screen flex-col rounded-[14px] border border-violet-400/30 bg-[#0b1022]/80 p-4 text-[#eceaff] select-none';

  if (userId === null) {
    return (
      <div className={`${shell} items-center justify-center gap-3 text-center`}>
        <p className="text-sm text-zinc-300">Sign in to review your cards.</p>
        <button
          type="button"
          onClick={() => { void desktop.showMain('/auth'); void desktop.quickReviewDone(); }}
          className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-400"
        >
          Sign in to AuraMind
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className={`${shell} items-center justify-center text-center transition-opacity`}>
        <p className="text-lg font-semibold">All caught up</p>
        <p className="mt-1 text-xs text-zinc-400">{formatNextDue(nextDue, Date.now())}</p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span className="truncate">Quick review{card ? ` · ${deckTitles[card.deckId] ?? ''}` : ''}</span>
        <span className="flex items-center gap-3">
          {queue.length > 0 && <span>{index + 1} / {queue.length}</span>}
          <button type="button" aria-label="Close" onClick={() => void desktop.quickReviewDone()} className="rounded px-1 text-zinc-500 hover:text-zinc-200">✕</button>
        </span>
      </div>

      {card && (
        <>
          <p className="mt-4 text-lg font-semibold leading-snug">{card.front || card.question}</p>
          {revealed ? (
            <p className="mt-3 border-t border-white/10 pt-3 text-sm text-zinc-300">{card.back || card.answer}</p>
          ) : (
            <button type="button" onClick={() => setRevealed(true)} className="mt-4 self-start rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
              Show answer
            </button>
          )}
          <div className="mt-auto">
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Rate your recall">
              {RATINGS.map(([label, rating], i) => (
                <button
                  key={label}
                  type="button"
                  disabled={!revealed}
                  onClick={() => void rate(rating)}
                  className={`rounded-lg py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${label === 'Good' ? 'bg-violet-500/45 hover:bg-violet-500/60' : 'bg-white/[0.06] hover:bg-white/10'}`}
                >
                  {label} <span className="opacity-50">{i + 1}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 h-[3px] overflow-hidden rounded bg-white/[0.08]">
              <div className="h-full rounded bg-gradient-to-r from-[#72F4FF] via-[#8B5CF6] to-[#FF9ACD]" style={{ width: `${(index / Math.max(queue.length, 1)) * 100}%` }} />
            </div>
            <p className="mt-2 text-center text-[10px] text-zinc-500">Space flip · 1–4 rate · Esc hide</p>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Transparent window background**

Create `src/styles/desktop.css`:

```css
/* The Quick Review window is transparent so the acrylic backdrop shows
   through the rounded panel. */
html.quick-review-window,
html.quick-review-window body,
html.quick-review-window #root {
  background: transparent !important;
}
```

Import it in `src/index.tsx` after `./styles/ios-native.css`: `import './styles/desktop.css';`

- [ ] **Step 4: Route and window gating in `App.tsx`**

Add the lazy import near the other pages:

```ts
const QuickReviewPage = React.lazy(() => import("./pages/quickReview/QuickReviewPage"));
```

Add a top-level route next to `/auth`:

```tsx
<Route path="/quick-review" element={<QuickReviewPage />} />
```

Right above the `useDesktopIntegration(...)` call (Task 14) define:

```ts
  // The Quick Review corner window loads this same app at /quick-review;
  // it must not run main-window chrome (banners, loader, integration).
  const isQuickReviewWindow = location.pathname.startsWith("/quick-review");
```

and change `enabled: isDesktopApp()` to `enabled: isDesktopApp() && !isQuickReviewWindow`. Gate the ambient UI with `!isQuickReviewWindow`: the `CinematicLoader` line (~864), `CookieConsentBanner`, `DesktopUpdateBanner` and `DropOverlay`.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/__tests__/quickReviewPage.test.tsx && npm run type-check && npm run lint`
Expected: 7 passed; clean.

```bash
git add auramind-gemini/src
git commit -m "feat(desktop): Quick Review page — flip, rate, done, signed out"
```

---

### Task 16: Main-window polish — first paint, titles, desktop manners, open to the app

**Files:**
- Create: `src/desktop/DesktopChrome.tsx`, `src/__tests__/desktopChrome.test.tsx`
- Modify: `src/App.tsx` (mount `<DesktopChrome />`, "/" route), `src/styles/desktop.css`

**Interfaces:**
- Consumes: `desktop.{appReady, setTitle}`, `isDesktopApp()`
- Produces: `DesktopChrome` component (renders nothing), `windowTitleFor(pathname: string): string`, `isTextTarget(el: EventTarget | null): boolean`

- [ ] **Step 1: Failing tests**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const bridge = vi.hoisted(() => ({ appReady: vi.fn(), setTitle: vi.fn() }));
vi.mock('../desktop/bridge', () => ({ desktop: bridge }));

import { DesktopChrome, windowTitleFor } from '../desktop/DesktopChrome';

type W = Window & { __TAURI_INTERNALS__?: unknown };
function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
const mount = (path = '/dashboard/decks') =>
  render(<MemoryRouter initialEntries={[path]}><DesktopChrome /><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter>);

beforeEach(() => { (window as W).__TAURI_INTERNALS__ = {}; bridge.appReady.mockClear(); bridge.setTitle.mockClear(); });
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; document.documentElement.classList.remove('platform-desktop'); });

describe('windowTitleFor', () => {
  it('names the page, then the app', () => {
    expect(windowTitleFor('/dashboard')).toBe('Home · AuraMind');
    expect(windowTitleFor('/dashboard/decks')).toBe('Library · AuraMind');
    expect(windowTitleFor('/dashboard/study/abc')).toBe('Study · AuraMind');
    expect(windowTitleFor('/somewhere-else')).toBe('AuraMind');
  });
});

describe('DesktopChrome', () => {
  it('reports first paint once and titles the window', async () => {
    mount();
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
    expect(bridge.appReady).toHaveBeenCalledTimes(1);
    expect(bridge.setTitle).toHaveBeenCalledWith('Library · AuraMind');
    expect(document.documentElement.classList.contains('platform-desktop')).toBe(true);
  });

  it('hides the browser context menu except in text fields', () => {
    mount();
    const div = document.createElement('div');
    const input = document.createElement('input');
    document.body.append(div, input);
    const onDiv = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    div.dispatchEvent(onDiv);
    const onInput = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    input.dispatchEvent(onInput);
    expect(onDiv.defaultPrevented).toBe(true);
    expect(onInput.defaultPrevented).toBe(false);
    div.remove(); input.remove();
  });

  it('Ctrl+N opens the generator and Ctrl+, opens settings', () => {
    const { getByTestId } = mount('/dashboard');
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    expect(getByTestId('where')).toHaveTextContent('/dashboard/generator');
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    expect(getByTestId('where')).toHaveTextContent('/dashboard/settings');
  });

  it('does nothing in a browser tab', () => {
    delete (window as W).__TAURI_INTERNALS__;
    mount();
    const onDiv = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(onDiv);
    expect(onDiv.defaultPrevented).toBe(false);
    expect(bridge.setTitle).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/__tests__/desktopChrome.test.tsx` → FAIL.

- [ ] **Step 2: Implement `DesktopChrome.tsx`**

```tsx
/**
 * Makes the Windows app behave like a Windows app rather than a browser tab:
 * reports first paint (the shell shows the window then, so there's no white
 * flash), names the window after the page, hides the browser's
 * Back/Reload/Inspect menu outside text fields, and adds desktop shortcuts.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { desktop } from './bridge';
import { isDesktopApp } from '../lib/platform';

const TITLES: Array<[string, string]> = [
  ['/dashboard/decks', 'Library'],
  ['/dashboard/study', 'Study'],
  ['/dashboard/chat', 'Prof. Aura'],
  ['/dashboard/generator', 'New course'],
  ['/dashboard/classes', 'Classes'],
  ['/dashboard/settings', 'Settings'],
  ['/deck/', 'Deck'],
  ['/auth', 'Sign in'],
];

export function windowTitleFor(pathname: string): string {
  if (pathname === '/dashboard' || pathname === '/dashboard/') return 'Home · AuraMind';
  const hit = TITLES.find(([prefix]) => pathname.startsWith(prefix));
  return hit ? `${hit[1]} · AuraMind` : 'AuraMind';
}

export function isTextTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function DesktopChrome() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const active = isDesktopApp();

  useEffect(() => {
    if (!active) return;
    document.documentElement.classList.add('platform-desktop');
    // Two frames: the first commits, the second has painted.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => void desktop.appReady()));
    return () => cancelAnimationFrame(id);
  }, [active]);

  useEffect(() => {
    if (active) void desktop.setTitle(windowTitleFor(location.pathname));
  }, [active, location.pathname]);

  useEffect(() => {
    if (!active) return;
    const onContextMenu = (e: MouseEvent) => { if (!isTextTarget(e.target)) e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); navigateRef.current('/dashboard/generator'); }
      if (e.key === ',') { e.preventDefault(); navigateRef.current('/dashboard/settings'); }
    };
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  return null;
}
```

- [ ] **Step 3: Desktop scrollbars**

Append to `src/styles/desktop.css`:

```css
/* Slim scrollbars that match the app, instead of Windows' grey ones. */
html.platform-desktop ::-webkit-scrollbar { width: 10px; height: 10px; }
html.platform-desktop ::-webkit-scrollbar-track { background: transparent; }
html.platform-desktop ::-webkit-scrollbar-thumb {
  background: rgba(139, 92, 246, 0.28);
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}
html.platform-desktop ::-webkit-scrollbar-thumb:hover { background-color: rgba(139, 92, 246, 0.45); }
```

- [ ] **Step 4: Mount it and open to the app**

In `App.tsx`: `import { DesktopChrome } from "./desktop/DesktopChrome";`, render `{!isQuickReviewWindow && <DesktopChrome />}` next to the banners, and in the `/` route insert a desktop branch before the landing page (after the `Capacitor.isNativePlatform() ? (…) :` branch):

```tsx
                  ) : isDesktopApp() ? (
                    // The installed app opens to the app, not the marketing page.
                    authChecked ? <Navigate to={user ? "/dashboard" : "/auth"} replace /> : null
                  ) : (
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/__tests__/desktopChrome.test.tsx && npm run type-check && npm run lint`
Expected: 5 passed; clean.

```bash
git add auramind-gemini/src
git commit -m "feat(desktop): no white flash, page titles, desktop shortcuts, opens to the app"
```

---
### Task 17: Settings — shortcut, start with Windows, notification status

**Files:**
- Create: `src/desktop/DesktopSettingsSection.tsx`, `src/desktop/accelerator.ts`, `src/__tests__/desktopSettings.test.tsx`
- Modify: `src/pages/settings/SettingsPage.tsx` (after the Memory sparks block, line 678), `src/desktop/bridge.ts` (+ `notificationsEnabled`), `src-tauri/src/commands.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json`, `src-tauri/Cargo.toml`

**Interfaces:**
- Consumes: `desktop.{setShortcut, getAutostart, setAutostart}`, `QUICK_REVIEW_SHORTCUT_PREF`, `DEFAULT_QUICK_REVIEW_SHORTCUT` (useDesktopIntegration.ts), `useAppPreference`
- Produces:
  - `accelerator.ts`: `acceleratorFromEvent(e: { key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null`, `displayAccelerator(acc: string): string`
  - `desktop.notificationsEnabled(): Promise<boolean | null>` (null = unknown / not Windows)
  - Rust command `notifications_enabled() -> Option<bool>`, permission `allow-notifications-enabled`
  - `DesktopSettingsSection` (renders nothing outside the Windows app)

- [ ] **Step 1: Rust command to read Windows' notification setting**

`Cargo.toml` windows features: add `"UI_Notifications"` and `"Foundation"`:

```toml
windows = { version = "0.61", features = ["Win32_Foundation", "Win32_Graphics_Dwm", "UI_Notifications", "Foundation"] }
```

`commands.rs`:

```rust
/// Whether Windows allows AuraMind's notifications. None when it can't tell
/// (dev builds without an installed shortcut, or not Windows).
#[tauri::command]
pub fn notifications_enabled(app: AppHandle) -> Option<bool> {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::UI::Notifications::{NotificationSetting, ToastNotificationManager};
        let id = HSTRING::from(app.config().identifier.as_str());
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&id).ok()?;
        return notifier.Setting().ok().map(|s| s == NotificationSetting::Enabled);
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        None
    }
}
```

Add `"notifications_enabled"` to `build.rs`, `"allow-notifications-enabled"` to `capabilities/main.json`, and the command to `generate_handler!`.

Add to `bridge.ts`:

```ts
  notificationsEnabled: () => call<boolean | null>('notifications_enabled', undefined, null),
```

Run: `cargo build --manifest-path auramind-gemini/src-tauri/Cargo.toml` → builds.

- [ ] **Step 2: Failing tests**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const bridge = vi.hoisted(() => ({
  setShortcut: vi.fn(async () => ({ ok: true })),
  getAutostart: vi.fn(async () => false),
  setAutostart: vi.fn(async (on: boolean) => on),
  notificationsEnabled: vi.fn(async () => true as boolean | null),
}));
vi.mock('../desktop/bridge', () => ({ desktop: bridge }));
const open = vi.hoisted(() => vi.fn());

import { DesktopSettingsSection } from '../desktop/DesktopSettingsSection';
import { acceleratorFromEvent, displayAccelerator } from '../desktop/accelerator';

type W = Window & { __TAURI_INTERNALS__?: unknown };
const key = (over: Partial<Parameters<typeof acceleratorFromEvent>[0]>) =>
  ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...over });

beforeEach(() => {
  (window as W).__TAURI_INTERNALS__ = {};
  Object.values(bridge).forEach((f) => f.mockClear());
  localStorage.clear();
  window.open = open as unknown as typeof window.open;
});
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; });

describe('accelerator', () => {
  it('needs a modifier and a real key', () => {
    expect(acceleratorFromEvent(key({ code: 'Space', key: ' ', ctrlKey: true, altKey: true }))).toBe('CommandOrControl+Alt+Space');
    expect(acceleratorFromEvent(key({ code: 'KeyQ', key: 'q', ctrlKey: true, shiftKey: true }))).toBe('CommandOrControl+Shift+Q');
    expect(acceleratorFromEvent(key({ code: 'F8', key: 'F8', altKey: true }))).toBe('Alt+F8');
    expect(acceleratorFromEvent(key({ code: 'KeyQ', key: 'q' }))).toBeNull();
    expect(acceleratorFromEvent(key({ code: 'ControlLeft', key: 'Control', ctrlKey: true }))).toBeNull();
  });

  it('reads like Windows', () => {
    expect(displayAccelerator('CommandOrControl+Alt+Space')).toBe('Ctrl + Alt + Space');
  });
});

describe('DesktopSettingsSection', () => {
  it('renders nothing in a browser tab', () => {
    delete (window as W).__TAURI_INTERNALS__;
    const { container } = render(<DesktopSettingsSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('records a new shortcut and saves it', async () => {
    render(<DesktopSettingsSection />);
    expect(await screen.findByText('Ctrl + Alt + Space')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await act(async () => { fireEvent.keyDown(window, { code: 'KeyQ', key: 'q', ctrlKey: true, altKey: true }); });
    expect(bridge.setShortcut).toHaveBeenCalledWith('CommandOrControl+Alt+Q');
    expect(screen.getByText('Ctrl + Alt + Q')).toBeInTheDocument();
    expect(localStorage.getItem('auramind_quickReviewShortcut')).toBe(JSON.stringify('CommandOrControl+Alt+Q'));
  });

  it('explains a shortcut another app owns and keeps the old one', async () => {
    bridge.setShortcut.mockResolvedValueOnce({ ok: false, reason: 'taken' } as never);
    render(<DesktopSettingsSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
    await act(async () => { fireEvent.keyDown(window, { code: 'KeyQ', key: 'q', ctrlKey: true, altKey: true }); });
    expect(screen.getByText('Another app already uses that shortcut. Try a different one.')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + Alt + Space')).toBeInTheDocument();
  });

  it('toggles start with Windows from the real state', async () => {
    render(<DesktopSettingsSection />);
    const toggle = await screen.findByRole('switch', { name: 'Start with Windows' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await act(async () => { fireEvent.click(toggle); });
    expect(bridge.setAutostart).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('says when Windows has notifications turned off, with a way to fix it', async () => {
    bridge.notificationsEnabled.mockResolvedValueOnce(false);
    render(<DesktopSettingsSection />);
    expect(await screen.findByText('Notifications are turned off in Windows')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Windows settings' }));
    expect(open).toHaveBeenCalledWith('ms-settings:notifications', '_blank');
  });
});
```

Run: `npx vitest run src/__tests__/desktopSettings.test.tsx` → FAIL.

- [ ] **Step 3: Implement `accelerator.ts`**

```ts
/** Keyboard shortcut strings in the form the Tauri global-shortcut plugin reads. */
const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

function keyName(code: string): string | null {
  if (code === 'Space') return 'Space';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return null;
}

export function acceleratorFromEvent(e: {
  key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean;
}): string | null {
  if (MODIFIER_CODES.test(e.code)) return null;
  const key = keyName(e.code);
  if (!key) return null;
  const mods = [e.ctrlKey || e.metaKey ? 'CommandOrControl' : null, e.altKey ? 'Alt' : null, e.shiftKey ? 'Shift' : null].filter(Boolean);
  // A bare key (or Shift+key) would fire while typing.
  if (!mods.some((m) => m === 'CommandOrControl' || m === 'Alt')) return null;
  return [...mods, key].join('+');
}

export function displayAccelerator(acc: string): string {
  return acc.split('+').map((p) => (p === 'CommandOrControl' ? 'Ctrl' : p)).join(' + ');
}
```

- [ ] **Step 4: Implement `DesktopSettingsSection.tsx`**

```tsx
/**
 * Settings → Windows app: the Quick Review shortcut, Start with Windows, and
 * whether Windows is letting reminders through. Renders nothing elsewhere.
 */
import React, { useEffect, useState } from 'react';
import { Monitor } from '@/components/icons';
import { desktop } from './bridge';
import { isDesktopApp } from '../lib/platform';
import { useAppPreference } from '../lib/appPreferences';
import { acceleratorFromEvent, displayAccelerator } from './accelerator';
import { DEFAULT_QUICK_REVIEW_SHORTCUT, QUICK_REVIEW_SHORTCUT_PREF } from './useDesktopIntegration';

const SHORTCUT_ERRORS = {
  taken: 'Another app already uses that shortcut. Try a different one.',
  invalid: "That shortcut can't be used. Include Ctrl or Alt.",
} as const;

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[#7A7A96]">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function DesktopSettingsSection() {
  const [shortcut, setShortcut] = useAppPreference(QUICK_REVIEW_SHORTCUT_PREF, DEFAULT_QUICK_REVIEW_SHORTCUT);
  const [recording, setRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [autostart, setAutostartState] = useState(false);
  const [notifications, setNotifications] = useState<boolean | null>(null);
  const active = isDesktopApp();

  useEffect(() => {
    if (!active) return;
    void desktop.getAutostart().then(setAutostartState);
    void desktop.notificationsEnabled().then(setNotifications);
  }, [active]);

  useEffect(() => {
    if (!recording) return;
    const onKey = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setRecording(false); return; }
      const acc = acceleratorFromEvent(e);
      if (!acc) return;
      e.preventDefault();
      setRecording(false);
      const result = await desktop.setShortcut(acc);
      if (result.ok) { setShortcut(acc); setShortcutError(null); }
      else setShortcutError(SHORTCUT_ERRORS[result.reason === 'taken' ? 'taken' : 'invalid']);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, setShortcut]);

  if (!active) return null;

  const toggleAutostart = async () => setAutostartState(await desktop.setAutostart(!autostart));
  const button = 'rounded-lg border border-[#2A2A3A] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.06]';

  return (
    <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6">
      <div className="mb-2 flex items-center gap-3">
        <Monitor className="h-5 w-5 text-violet-300" aria-hidden />
        <div>
          <h3 className="text-base font-semibold text-white">Windows app</h3>
          <p className="text-xs text-[#7A7A96]">Quick Review, reminders and startup on this PC.</p>
        </div>
      </div>

      <Row label="Quick Review shortcut" hint={shortcutError ?? 'Opens a few due cards from anywhere in Windows.'}>
        <kbd className="rounded-md border border-[#2A2A3A] bg-black/30 px-2 py-1 text-xs text-zinc-200">
          {recording ? 'Press keys…' : displayAccelerator(shortcut)}
        </kbd>
        <button type="button" className={button} onClick={() => { setShortcutError(null); setRecording(true); }}>Change</button>
        {shortcut !== DEFAULT_QUICK_REVIEW_SHORTCUT && (
          <button type="button" className={button} onClick={async () => { await desktop.setShortcut(DEFAULT_QUICK_REVIEW_SHORTCUT); setShortcut(DEFAULT_QUICK_REVIEW_SHORTCUT); }}>Reset</button>
        )}
      </Row>
      <div className="border-t border-[#2A2A3A]/30" />

      <Row label="Start with Windows" hint="Starts quietly in the tray so reminders arrive on time.">
        <button
          type="button"
          role="switch"
          aria-checked={autostart}
          aria-label="Start with Windows"
          onClick={() => void toggleAutostart()}
          className={`relative h-6 w-11 rounded-full transition-colors ${autostart ? 'bg-violet-500' : 'bg-[#2A2A3A]'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${autostart ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </Row>

      {notifications === false && (
        <>
          <div className="border-t border-[#2A2A3A]/30" />
          <Row label="Notifications are turned off in Windows" hint="Study reminders can't appear until you turn them on for AuraMind.">
            <button type="button" className={button} onClick={() => window.open('ms-settings:notifications', '_blank')}>
              Open Windows settings
            </button>
          </Row>
        </>
      )}
    </div>
  );
}
```

`window.open('ms-settings:notifications')` works because `desktopLinks.ts` routes non-app URLs to the opener, and `guard.rs` allows exactly that URI (Task 1). Add `'ms-settings:'` to `EXTERNAL_PROTOCOLS` in `src/lib/desktopLinks.ts` **only for the exact URL**: change the protocol check to

```ts
  if (url.href === 'ms-settings:notifications') return url;
  if (!EXTERNAL_PROTOCOLS.has(url.protocol)) return null;
```

and add to `desktopShell.test.tsx`'s `externalUrl` test: `expect(externalUrl('ms-settings:notifications', page)?.href).toBe('ms-settings:notifications'); expect(externalUrl('ms-settings:privacy', page)).toBeNull();`

The `opener:allow-open-url` permission's default scope only covers http(s)/mailto; in `capabilities/main.json` replace `"opener:allow-open-url"` with

```json
{ "identifier": "opener:allow-open-url", "allow": [{ "url": "https://*" }, { "url": "http://*" }, { "url": "mailto:*" }, { "url": "ms-settings:notifications" }] }
```

- [ ] **Step 5: Place it in Settings**

In `SettingsPage.tsx`, import `import { DesktopSettingsSection } from '../../desktop/DesktopSettingsSection';` and insert `<DesktopSettingsSection />` between the Memory sparks block's closing `</div>` (line 678) and `{/* Appearance */}`.

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run src/__tests__/desktopSettings.test.tsx src/__tests__/desktopShell.test.tsx && npm run type-check && npm run lint && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all pass.

```bash
git add auramind-gemini/src auramind-gemini/src-tauri
git commit -m "feat(desktop): Windows app settings — shortcut, start with Windows, notification status"
```

---

### Task 18: Docs, the hand checklist, and full verification

**Files:**
- Create: `docs/windows-app-checklist.md`
- Modify: `DEPLOYMENT.md` (Windows App section), `ARCHITECTURE.md` (Windows table), `CHANGELOG.md` (Unreleased → Added)

- [ ] **Step 1: The hand checklist**

`docs/windows-app-checklist.md`:

```markdown
# Windows app — hand checklist

Run on a real Windows 11 PC before each desktop release. CI can't click
notifications, the tray or Explorer. Tick every box; note the build.

Build: ____________  Date: ____________  Tester: ____________

## Install
- [ ] The installer shows the navy/violet header and sidebar art and the AuraMind icon.
- [ ] It installs without an administrator prompt; a Start menu entry appears.
- [ ] Uninstall removes the app and the Explorer menu entry.

## Window
- [ ] Launch: no white flash; the window appears once the app has drawn.
- [ ] Title bar is navy with light text and a violet border (Windows 11).
- [ ] Hovering maximize shows Snap Layouts.
- [ ] Signed in, it opens to the dashboard; signed out, to sign-in (never the marketing page).
- [ ] The title follows the page ("Library · AuraMind").
- [ ] Right-click on empty space shows no browser menu; in a text field it does.
- [ ] Ctrl+N opens the generator; Ctrl+, opens Settings.

## Tray, badge, notifications
- [ ] The tray icon shows "AuraMind · N cards due"; the menu matches the design.
- [ ] With cards due, the tray icon has a dot and the taskbar icon a number (1–9, 9+).
- [ ] Reviewing the last due card clears the dot and the badge.
- [ ] Set the reminder time 2 minutes ahead: a notification "N cards are ready" arrives with Quick review / Later.
- [ ] Quick review opens the corner panel; clicking the body opens the main window.
- [ ] "Pause reminders for today" stops further notifications until midnight.
- [ ] ✕ hides to the tray, and the first time a notification says it's still running. Quit exits.
- [ ] Settings → Start with Windows on; sign out of Windows and back in: AuraMind starts in the tray with no window.
- [ ] Turn AuraMind's notifications off in Windows: Settings shows the warning and its button opens the right Windows page.

## Quick Review
- [ ] Ctrl+Alt+Space opens the panel bottom-right, above the taskbar, frosted.
- [ ] With two monitors, it opens on the one the mouse is on (including a monitor left of the main one).
- [ ] Space flips, 1–4 rate, Esc hides; clicking the document behind it doesn't hide it.
- [ ] After a rating, the tray count drops.
- [ ] Finishing shows "All caught up · next card due in …" and hides after 2 seconds.
- [ ] Change the shortcut in Settings; the new one works; a taken one shows the explanation.

## Drop to create
- [ ] Dragging a PDF over the window shows the violet "Drop to make a course" glow; dropping opens the generator with it loaded.
- [ ] Dropping an .exe shows "AuraMind can't make a course from .exe files."
- [ ] Right-click a PDF in Explorer → Show more options → "Make a course with AuraMind" opens the generator with it.
- [ ] The same works when AuraMind wasn't running (cold start).
- [ ] Tray → "New course from file…" opens a picker filtered to documents and audio.

## Links and sign-in
- [ ] Win+R → `auramind://app/study` focuses AuraMind on Study.
- [ ] `auramind://app/admin` is ignored.
- [ ] (With `VITE_DESKTOP_OAUTH=true` and the Supabase redirect added) Continue with Google opens the browser and returns signed in.

## Updates
- [ ] About → Check for updates reports the installed version or offers the newer one.
```

- [ ] **Step 2: Update the docs**

`DEPLOYMENT.md` → "Windows App (Tauri 2)", add after the build commands:

```markdown
### What the app does beyond the website

Tray with the due count, a taskbar badge, study reminders as Windows
notifications, Start with Windows (off by default), a Quick Review corner
window on Ctrl+Alt+Space, drop-to-create (window, Explorer, tray),
`auramind://` links, and in-app Google/Notion sign-in. Run
`docs/windows-app-checklist.md` on a real PC before every release.

### Google/Notion sign-in in the app (one-time)

1. Supabase → Authentication → URL Configuration → Redirect URLs: add
   `auramind://auth/callback`.
2. In `auramind-gemini/.env.desktop`, uncomment `VITE_DESKTOP_OAUTH=true`.
3. Release a new version. Until then the app shows email + password only.
```

`ARCHITECTURE.md` → the Windows concerns table, add rows:

```markdown
  | Tray, taskbar badge, notifications, start with Windows | `src-tauri/src/{tray,badge,nudges}.rs`; due state from `desktop/dueState.ts`, schedule from `desktop/nudgePlanner.ts` |
  | Quick Review window | `src-tauri/src/quick_review.rs` + `pages/quickReview/QuickReviewPage.tsx` (same bundle, `/quick-review`) |
  | Drop to create | `components/shared/DropOverlay.tsx`; Explorer/tray via `src-tauri/src/handoff.rs` and `windows/installer-hooks.nsh` |
  | Links and sign-in | `src-tauri/src/links.rs` → `desktop/deepLinkRouter.ts`; PKCE only in the Windows build |
  | React ↔ Rust contract | `desktop/bridge.ts` ↔ `src-tauri/src/commands.rs`; per-window permissions in `capabilities/` |
```

`CHANGELOG.md` → Unreleased → Added, extend the Windows app entry:

```markdown
- **Windows app, full desktop integration** - tray with the due count,
  taskbar badge, study reminders as Windows notifications with Quick
  review / Later, a Quick Review corner window on Ctrl+Alt+Space, drag a
  file onto the window (or right-click it in Explorer) to make a course,
  `auramind://` links, a navy Windows 11 title bar and no white flash on
  launch
```

- [ ] **Step 3: Full verification**

Run each and read the output:

```bash
cd auramind-gemini
npm run type-check
npm run lint
npx vitest run
npm run size
cd ../api && npx vitest run && cd ../auramind-gemini
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all green; initial JS payload still well under 500 KB (Tauri packages load only in the app).

Then a signed local build and launch:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$USERPROFILE/.tauri/auramind-updater.key")" TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run build:desktop
./src-tauri/target/release/auramind-desktop.exe &
```

Capture the window (PowerShell `PrintWindow` script used in PR #119) and confirm: navy title bar, no landing page, tray icon present. Close with Quit from the tray.

- [ ] **Step 4: Commit, push, update PR #119**

```bash
git add docs DEPLOYMENT.md ARCHITECTURE.md CHANGELOG.md
git commit -m "docs: the Windows app's desktop features and hand checklist"
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin feat/windows-desktop-app
```

Append a "Third round: full Windows integration" section to PR #119's description (what shipped, verification output, the checklist, and the two manual prerequisites: the Supabase redirect for OAuth and running the checklist on a real PC).

---

## Self-review record

- **Spec coverage:** §3 Look → Tasks 5, 6, 16; §4 Nudges → 8, 13, 14, 17; §5 Quick Review → 7, 15; §6 Drop to create → 3, 9, 11; §7 Links and sign-in → 2, 9, 14; §8 Errors → 1, 3, 8, 11, 14, 17; §9 Testing → every task + 18; contract table → 6–10, 17.
- **Placeholder scan:** no TBD/TODO; every code step has code.
- **Type consistency:** `DueState`, `PlannedNudge`, `FileHandoff`, `ShortcutResult` are defined once in `bridge.ts` (Task 10) and match the Rust serde shapes in Tasks 3, 4, 6, 7 (camelCase). Command argument names match (`due`, `nudges`, `accelerator`, `enabled`, `path`).
- **Review Focus:** each of the five lines has its test in the named task.
