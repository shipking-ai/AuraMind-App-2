# Windows app: a simple, Windows-native layout — design

Date: 2026-10-16. Status: approved in conversation; this file is the written spec.

## Why

The Windows app (Tauri, `auramind-gemini/src-tauri/`) renders the website's
dashboard in a window. It looks like the browser. The owner wants it to feel
like a Windows app and to be simpler: a Windows 11 look **and** only the core
study screens up front.

The iPhone and Android apps already solve the same problem with their own
layouts inside the shared React app (`IOSShell`, `AndroidMobileScreens`). The
Windows app gets the same treatment.

## Decisions (owner, 2026-10-16)

| Question | Decision |
|---|---|
| What "simple" means | Both: Windows 11 look, and only core screens up front |
| Layout | A sidebar (like Windows Settings): Today, Library, Create, Linnea; Settings at the bottom |
| Sidebar | Collapses to an icon strip with ☰ or Ctrl+B, anywhere; the choice is remembered |
| During study | Session opens in the content area; the sidebar stays as the user left it (no auto-collapse) |
| Study page | Removed as a page: sessions start from Today or a course in Library |
| Classes | In the sidebar only for people who teach or have joined a class |
| Admin pages | Keep the website layout; reached from Settings |
| Theme | Follows Windows light/dark live; manual Light / Dark / System in Settings |
| Today | Due count + time estimate + Start review, streak, "remembered this week", courses with cards due (mockup approved) |
| Approach | Option 1 now: Windows shell and own Today, Library, Study session, Settings; Create and Linnea reuse the existing pages restyled. Option 3 (Windows-native Create and Linnea) later, once there is usage |

Mockups: `.superpowers/brainstorm/1172-1792179147/content/` (`layout.html`
option A, `study-v2.html`, `today.html`) — local only, git-ignored.

## Scope

**In:** the Windows app's dashboard (`/dashboard/*`) layout, its Today,
Library, study session and Settings screens, a Windows style layer for the
reused pages, and the Windows theme default.

**Unchanged:** the website, the PWA, the Android and iPhone apps, the native
Expo app, the API, the database, study scheduling (FSRS), the offline queue,
and every Windows desktop integration (tray, badge, notifications, Quick
Review window, Explorer verb, deep links, updater).

**Out (Phase 2):** Windows-native rebuilds of Create (`GeneratorPage`) and
Prof. Linnea (`AIChatPage`).

## Structure

All new code lives in `auramind-gemini/src/components/windows/` plus one
stylesheet. Selection points mirror the iPhone's:

- **Shell.** `NovaDashboardShell` returns `IOSShell` on iPhone. On Windows
  (`isDesktopApp()`) and outside `/admin`, it returns **`WindowsShell`**:
  window content area, sidebar, and the routed page. Unlike the iPhone shell
  it also wraps the immersive study routes (`/dashboard/study/:deckId`), so
  the sidebar stays during a session. The Quick Review window
  (`/quick-review`) is not under `/dashboard` and is unaffected.
- **Sidebar** (`WindowsSidebar`): ☰ toggle, Today (`/dashboard`), Library
  (`/dashboard/decks`), Create (`/dashboard/generator`), Linnea
  (`/dashboard/chat`), Classes (`/dashboard/classes`, members only),
  spacer, Settings (`/dashboard/settings`). The selected item shows a violet
  indicator bar. Collapsed, items show icons with tooltips.
- **Screens.** `NovaHub` already picks `IOSToday` / `AndroidOverview` /
  `NovaOverview` per route. On Windows it picks **`WindowsToday`**,
  **`WindowsLibrary`** and **`WindowsSettings`** for `/`, `/decks` and
  `/settings`. `/dashboard/study` redirects to `/dashboard` on Windows.
  `/dashboard/settings/all` keeps the full `SettingsPage`.
- **Study session.** `StudyModePage` keeps all loading, grading, scheduling,
  saving and offline logic. It already hands rendering to
  `IOSStudySession` / `IOSStudyComplete` on iPhone; on Windows it hands it to
  **`WindowsStudySession`** / **`WindowsStudyComplete`** with the same props
  shape (card, index, total, flipped, onFlip, onRate, onExit, intervals).
- **Reused pages.** `GeneratorPage`, `AIChatPage`, the Classes pages and any
  route without a Windows screen render inside the Windows content area,
  restyled by `src/styles/windows.css` (scoped to `.platform-desktop`, which
  `DesktopChrome` already sets on `<html>`): Windows surfaces and text
  colours in light and dark, decorative backgrounds and glows hidden.

## Screens

### Today (`WindowsToday`)

- Greeting with the user's first name.
- Main card: cards due now (`isDue`), "about N min" (20 s per card, rounded
  up, minimum 1), **Start review** → `startQuickStudy()` (mixed session over
  all due cards).
- Two stats: streak (`user.streak`) and "remembered this week" — the share of
  the current week's reviews not graded Again. Hidden below 10 reviews in the
  week.
- "Courses with cards due": decks with due > 0, sorted by due count
  descending; a row click → `startStudyForDeck(deck.id)`.
- Nothing due: "You're all caught up", the next due time, **Create a
  course**.
- No courses: one welcome card with **Create your first course**.

### Library (`WindowsLibrary`)

- Search (title), sort (Due first — default / Recently studied / A–Z),
  **New course** → `/dashboard/generator`.
- Rows: title, card count, due count, last studied.
- Click → study that course (`startStudyForDeck(deck.id)`). Right-click →
  menu: Study, Open (`/deck/:id`, where renaming already lives), Delete
  (confirm dialog → the workspace's `deleteDeck`).

### Study session (`WindowsStudySession`, `WindowsStudyComplete`)

- Top: course name, progress bar, "i / n".
- Card: question; after reveal, the answer below it.
- Grade buttons 1 Again, 2 Hard, 3 Good, 4 Easy, each showing its next
  interval (`formatInterval`); Good is the primary button.
- Keys: Space reveals; 1–4 grade (only after reveal); Esc ends (confirm if
  at least one card was graded). Keys are ignored while focus is in a text
  field. No undo: `StudyModePage` has none today, and adding one is out of
  scope.
- Complete: cards reviewed, % correct, time taken; **Back to Today**,
  **Study again** (`onRestart`).

### Settings (`WindowsSettings`)

- Account (name, email, plan), Appearance (Light / Dark / System), the
  existing `DesktopSettingsSection` (start with Windows, notifications, Quick
  Review shortcut, updates), Study (daily goal, reminders).
- Links: **More settings** (`/dashboard/settings/all`), **Admin** (admins
  only, `/admin`), **Sign out**.

### Classes visibility

`classroomService.fetchMyClassrooms(userId)` on sign-in; Classes shows when
it returns at least one membership (student or teacher). The result is
cached for the session; a failed lookup hides the item (the
`/dashboard/classes` route itself still works, e.g. from a class invite
link).

## Look

- Font: `"Segoe UI Variable", "Segoe UI", system-ui`.
- Sizes: 14px body, 32px rows, 4–8px corner radius, 1px quiet borders.
- Colour: neutral surfaces from CSS variables in `windows.css`
  (`--win-bg`, `--win-surface`, `--win-border`, `--win-text`,
  `--win-text-muted`), defined for `html.dark` and `html.light`; BonaMind
  violet (`#8b5cf6`) only for the selection bar, primary buttons and
  progress.
- Motion: 150–250 ms fades/slides; none under Reduce motion
  (`data-reduce-motion`).
- Sidebar: 240px expanded, 48px collapsed.

## Theme

On Windows, the `bonamind_theme` default becomes `system` and
`bonamind_autoNightMode` defaults to off (otherwise the app forces dark
20:00–07:00 regardless of Windows). An explicit user choice still wins. The
existing `ThemeProvider` already follows `prefers-color-scheme` live, and
WebView2 reports the Windows setting. The window background colour set at
launch follows the resolved theme so a light window doesn't flash navy.

## Sidebar state

- Preference key `bonamind_win_sidebar`: `expanded` (default) or
  `collapsed`; toggled by ☰ and Ctrl+B (ignored in text fields).
- Under 900px window width the sidebar renders collapsed without changing
  the preference; above it, the preference applies.
- Starting or ending a session never changes it.

## Errors and loading

- Loading: placeholder blocks in the screen's layout, no spinners.
- Failed loads and offline: a short message with **Try again**; study works
  offline from the existing cache and queue.
- Unknown or admin routes: website layout inside the content area (admin
  outside the Windows shell, as now).

## Testing

Vitest (jsdom), in `src/__tests__/`:

- `windowsShell.test.tsx`: shell renders only when `isDesktopApp()` (not on
  web, iPhone, Android); not on `/admin`; wraps `/dashboard/study/:deckId`.
- `windowsSidebar.test.tsx`: items and order; Classes only with a
  membership; ☰ and Ctrl+B toggle and persist `bonamind_win_sidebar`;
  Ctrl+B ignored in inputs; narrow width renders collapsed without writing
  the preference.
- `windowsToday.test.tsx`: due count, minutes estimate, sort order, the
  caught-up and no-courses states, the 10-review threshold, Start review and
  row clicks call the workspace actions.
- `windowsLibrary.test.tsx`: search, sorts, context-menu actions (Study,
  Open, Delete), delete confirmation.
- `windowsStudySession.test.tsx`: Space / 1–4 / Esc map to `onFlip` /
  `onRate` / exit; grades blocked before reveal; Esc confirms after a
  grade; keys ignored in text fields; complete screen buttons.
- `windowsTheme.test.ts`: on desktop the theme default is `system` and auto
  night mode defaults off; an explicit stored choice is kept; web/mobile
  defaults unchanged.
- Existing `desktopIdentity`, `desktopIntegration` and platform tests stay
  green.

Visual check: the desktop build (`vite --mode desktop`) in the in-app
browser, screenshots of each screen in light and dark, plus the
`desktop-windows.yml` CI build. `docs/windows-app-checklist.md` gains the
new screens.

## Release

The 2.1.0 Windows draft (`desktop-v2.1.0`) has the old website layout. The
owner decides whether to publish it now (rename and fixes reach Windows
sooner) or hold for this layout as 2.2.0.
