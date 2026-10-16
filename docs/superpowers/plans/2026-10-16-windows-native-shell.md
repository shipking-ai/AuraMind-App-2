# Windows Native Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Windows app (Tauri) its own simple, Windows 11-style layout — sidebar, Today, Library, in-app study session, Settings — that follows Windows light/dark mode, while the website and phone apps stay unchanged.

**Architecture:** Same pattern as the iPhone app: `NovaDashboardShell` returns a `WindowsShell` when `isDesktopApp()`, `NovaHub` picks Windows screens per route, and `StudyModePage` keeps its engine but hands rendering to Windows session components. Reused pages (Create, Linnea, Classes) are restyled by one scoped stylesheet. The title bar follows the theme through the existing JS↔Rust bridge.

**Tech Stack:** React 19, React Router 7, Tailwind 4 + plain CSS variables, Vitest + Testing Library (jsdom), Tauri 2 (Rust, `windows` crate DWM calls).

**Spec:** `docs/superpowers/specs/2026-10-16-windows-native-shell-design.md`

## Global Constraints

- All paths below are relative to `auramind-gemini/` unless they start with `docs/`, `scripts/` or `.github/`.
- Windows-only: every new behaviour is gated on `isDesktopApp()` (`src/lib/platform.ts`, true when `"__TAURI_INTERNALS__" in window`). Web, Android and iPhone output must not change.
- Not under the Windows shell: `/admin*` routes, `/quick-review`, `/auth`, `/subscribe`, `/` .
- Font stack: `"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`. Body 14px, rows 32px, radius 4–8px, 1px borders.
- CSS variables (in `src/styles/windows.css`, under `html.platform-desktop.dark` and `html.platform-desktop.light`): `--win-bg`, `--win-surface`, `--win-border`, `--win-text`, `--win-text-muted`; accent `--win-accent: #8b5cf6` used only for the selection bar, primary buttons and progress.
- Dark values: bg `#1c1c22`, surface `#26262f`, border `#30303a`, text `#e8e8ee`, muted `#9a9aab`, sidebar `#202028`. Light values: bg `#f3f3f6`, surface `#ffffff`, border `#e1e1e8`, text `#1b1b22`, muted `#6b6b7a`, sidebar `#ebebf0`.
- Motion 150–250 ms; none when `html[data-reduce-motion="true"]`.
- Sidebar: 240px expanded, 48px collapsed; preference key `bonamind_win_sidebar` = `"expanded"` (default) | `"collapsed"`; auto-collapsed below 900px window width without writing the preference.
- Today: minutes = `max(1, ceil(due × 20 / 60))`; "remembered this week" = `useStudyStats(user.id).retention7d` (last 7 days, shared `deriveRetention7d`), shown only when that week's answered count ≥ 10.
- Ratings come from `Rating` in `src/types` (`AGAIN=0, HARD=3, GOOD=4, EASY=5`); keys 1–4 map to AGAIN, HARD, GOOD, EASY.
- Brand: product "BonaMind", tutor "Prof. Linnea" / "Linnea"; `node scripts/check-brand.mjs` must stay green.
- Tests: run from `auramind-gemini/` with `npx vitest run <files> --maxWorkers=4` (this PC times out at default parallelism).
- Every PR updates `HANDOFF.md` (owner rule). Conventional Commits; no AI attribution lines (owner rule).

## Review Focus

1. Windows mode switch while the app is open — the window, title bar and app colours all follow without a restart (Task 1 test: `applyTheme` re-runs on `resolvedTheme` change).
2. A user with many courses due — Today's list stays short: the first 5, then "See all in Library" (Task 3 test).
3. Opening a deck page (`/deck/:id`, outside `/dashboard`) from Library — the user can get back: Open navigates to `/deck/:id` and that page's back control returns to `/dashboard/decks` (Task 4 test pins the navigation target; the deck page is unchanged).
4. A study session with no cards (deck with nothing due) — a Windows empty state with **Back to Today**, not the website's black "No cards to study" screen (Task 5 test).
5. Typing in Linnea's chat box or the Library search — Space, 1–4, Esc and Ctrl+B do nothing there (Task 2 and Task 5 tests).

---

### Task 1: Theme follows Windows (app, window and title bar)

**Files:**
- Modify: `src/lib/appPreferences.ts` (add `themeDefaults`), `src/hooks/useTheme.tsx:26-27`, `src/pages/settings/SettingsPage.tsx:318`, `src/desktop/bridge.ts` (add `applyTheme`), `src/desktop/DesktopChrome.tsx` (call it before `appReady`), `src-tauri/src/chrome.rs` (theme-aware title bar + command), `src-tauri/src/lib.rs` (register command), `src-tauri/tauri.conf.json:24` (drop `"theme": "Dark"`)
- Test: `src/__tests__/windowsTheme.test.ts`, Rust unit test in `chrome.rs`

**Interfaces:**
- Produces: `themeDefaults(): { theme: 'system' | 'dark'; autoNightMode: boolean }` from `src/lib/appPreferences.ts`; `desktop.applyTheme(theme: 'light' | 'dark'): Promise<void>` on the bridge; Rust `title_bar_colors(dark: bool) -> [(u32 /*DWMWA attr id*/, Option<&'static str>); 3]` and command `set_title_bar_theme(dark: bool)`.

- [ ] **Step 1: Write the failing tests** (`src/__tests__/windowsTheme.test.ts`)

```ts
type W = Window & { __TAURI_INTERNALS__?: unknown };
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; localStorage.clear(); });

it('defaults to following Windows with auto night mode off in the Windows app', async () => {
  (window as W).__TAURI_INTERNALS__ = {};
  const { themeDefaults } = await import('../lib/appPreferences');
  expect(themeDefaults()).toEqual({ theme: 'system', autoNightMode: false });
});
it('keeps the dark default and auto night mode on the website', async () => {
  const { themeDefaults } = await import('../lib/appPreferences');
  expect(themeDefaults()).toEqual({ theme: 'dark', autoNightMode: true });
});
it('keeps an explicit stored choice', () => {
  (window as W).__TAURI_INTERNALS__ = {};
  localStorage.setItem('bonamind_theme', JSON.stringify('dark'));
  // render ThemeProvider with a probe; matchMedia mocked to light
  expect(probe.resolvedTheme).toBe('dark');
});
it('tells the window when the resolved theme changes', () => {
  // desktop on, bridge.applyTheme mocked, matchMedia mock fires a change dark→light
  expect(applyTheme).toHaveBeenLastCalledWith('light');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/windowsTheme.test.ts --maxWorkers=4`
Expected: FAIL — `themeDefaults` is not exported.

- [ ] **Step 3: Implement**
  - `themeDefaults()` returns `{ theme: 'system', autoNightMode: false }` when `isDesktopApp()`, else `{ theme: 'dark', autoNightMode: true }`. `ThemeProvider` and `SettingsPage` use it as the `useAppPreference` / `useLocalStorage` fallbacks.
  - `ThemeProvider`: after `applyPreferenceToDocument`, when `isDesktopApp()` call `void desktop.applyTheme(resolvedTheme)`.
  - `desktop.applyTheme(theme)`: `getCurrentWindow().setTheme(theme)`, `setBackgroundColor(theme === 'light' ? '#f3f3f6' : '#1c1c22')`, then `call('set_title_bar_theme', { dark: theme === 'dark' })`; every failure is swallowed (cosmetic), like `setTitle`.
  - Rust: `title_bar_colors(dark)` returns caption/text/border as `#0b1022` / `#e8e6ff` / `#8B5CF6` when dark, and `None` (= `DWMWA_COLOR_DEFAULT`, 0xFFFFFFFF, i.e. follow Windows) for caption and text plus `#8B5CF6` border when light. `brand_title_bar(window, dark)` applies them; startup calls it with the system theme (`window.theme()`); `set_title_bar_theme` calls it for the main window. Remove `"theme": "Dark"` from `tauri.conf.json` so the frame follows the system.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/windowsTheme.test.ts src/__tests__/desktopChrome.test.tsx src/__tests__/desktopIdentity.test.ts --maxWorkers=4`
Expected: PASS. Rust: the `chrome.rs` test `title_bar_colors_follow_theme` (dark → three colours; light → caption/text `None`) runs in the `desktop-windows.yml` CI build (`cargo test`); locally only if `cargo` is installed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appPreferences.ts src/hooks/useTheme.tsx src/pages/settings/SettingsPage.tsx src/desktop src-tauri src/__tests__/windowsTheme.test.ts
git commit -m "feat(windows): follow the Windows light or dark mode, title bar included"
```

---

### Task 2: Windows shell and sidebar

**Files:**
- Create: `src/components/windows/WindowsShell.tsx`, `src/components/windows/WindowsSidebar.tsx`, `src/components/windows/useWindowsSidebar.ts`, `src/components/windows/useClassMembership.ts`, `src/styles/windows.css`
- Modify: `src/components/dashboard/nova/NovaDashboardShell.tsx` (return `WindowsShell` next to the `IOSShell` branch, ~line 742), the stylesheet entry that imports `android-native.css` (import `windows.css` beside it)
- Test: `src/__tests__/windowsShell.test.tsx`, `src/__tests__/windowsSidebar.test.tsx`

**Interfaces:**
- Consumes: `isDesktopApp()`, `useAppPreference`, `classroomService.fetchMyClassrooms(userId): Promise<ClassroomMembership[]>`, `useDashboardWorkspace()`.
- Produces: `<WindowsShell>{children}</WindowsShell>`; `useWindowsSidebar(): { collapsed: boolean; toggle(): void }` (collapsed = preference or narrow window); `useClassMembership(userId: string | undefined): boolean`; CSS classes `win-shell`, `win-sidebar`, `win-content`, `win-card`, `win-button`, `win-button-primary`, `win-row`, `win-muted` that later tasks use.

- [ ] **Step 1: Write the failing tests**

`windowsShell.test.tsx` (render `NovaDashboardShell` inside a `MemoryRouter` and `DashboardWorkspaceProvider`, as `crossPlatformRuntime.test.tsx` does):
```ts
it('uses the Windows shell in the Windows app', () => { setDesktop(true); renderAt('/dashboard'); expect(screen.getByRole('navigation', { name: 'BonaMind' })).toHaveClass('win-sidebar'); });
it('keeps the website shell in a browser', () => { renderAt('/dashboard'); expect(document.querySelector('.win-shell')).toBeNull(); });
it('wraps a study session so the sidebar stays', () => { setDesktop(true); renderAt('/dashboard/study/deck-1'); expect(document.querySelector('.win-sidebar')).not.toBeNull(); });
it('leaves admin pages on the website layout', () => { setDesktop(true); renderAt('/admin'); expect(document.querySelector('.win-shell')).toBeNull(); });
```

`windowsSidebar.test.tsx`:
```ts
it('lists the places in order', () => { expect(navLabels()).toEqual(['Today', 'Library', 'Create', 'Linnea', 'Settings']); });
it('shows Classes only for class members', async () => { fetchMyClassrooms.mockResolvedValue([membership]); expect(await findNavLabels()).toEqual(['Today', 'Library', 'Create', 'Linnea', 'Classes', 'Settings']); });
it('hides Classes when the lookup fails', async () => { fetchMyClassrooms.mockRejectedValue(new Error('x')); /* still 5 items */ });
it('marks the current place', () => { renderAt('/dashboard/decks'); expect(link('Library')).toHaveAttribute('aria-current', 'page'); });
it('collapses and expands with ☰ and Ctrl+B and remembers it', () => {
  click(button('Collapse sidebar')); expect(localStorage.getItem('bonamind_win_sidebar')).toBe('"collapsed"');
  fireEvent.keyDown(window, { key: 'b', ctrlKey: true }); expect(localStorage.getItem('bonamind_win_sidebar')).toBe('"expanded"');
});
it('ignores Ctrl+B while typing', () => { fireEvent.keyDown(input, { key: 'b', ctrlKey: true }); expect(sidebar()).not.toHaveClass('is-collapsed'); });
it('collapses on a narrow window without changing the preference', () => { setWidth(800); expect(sidebar()).toHaveClass('is-collapsed'); expect(localStorage.getItem('bonamind_win_sidebar')).toBeNull(); });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/windowsShell.test.tsx src/__tests__/windowsSidebar.test.tsx --maxWorkers=4`
Expected: FAIL — `../components/windows/...` modules not found.

- [ ] **Step 3: Implement**
  - `NovaDashboardShell`: `if (isDesktopApp() && !isOnAdminRoute) return <WindowsShell>{overlays}<PageTransition …>{children}</PageTransition></WindowsShell>` — placed before the iPhone branch and **not** gated on `immersive`, so study routes keep the sidebar.
  - Sidebar: `<nav aria-label="BonaMind" className="win-sidebar">`, ☰ button labelled "Collapse sidebar" / "Expand sidebar", `NavLink`s with icons from `src/components/icons` (`Home`, `BookOpen`, `Plus`, `Sparkles`, `Users`, `Settings`) and `end` on Today; collapsed shows icons with `title` tooltips. Paths: Today `/dashboard`, Library `/dashboard/decks`, Create `/dashboard/generator`, Linnea `/dashboard/chat`, Classes `/dashboard/classes`, Settings `/dashboard/settings`.
  - `useWindowsSidebar`: preference via `useAppPreference('bonamind_win_sidebar', 'expanded')`; narrow via `matchMedia('(max-width: 899px)')`; Ctrl+B listener on `window`, skipped when `isTextTarget(e.target)` (export from `src/desktop/DesktopChrome.tsx`).
  - `useClassMembership`: fetch once per `userId`, `false` on error or empty.
  - `windows.css`: the Global Constraints variables and the shared classes; `.win-shell` is a full-height flex row with the `--win-bg` background and the Segoe stack.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/windowsShell.test.tsx src/__tests__/windowsSidebar.test.tsx src/__tests__/crossPlatformRuntime.test.tsx src/__tests__/desktopChrome.test.tsx --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/windows src/styles/windows.css src/components/dashboard/nova/NovaDashboardShell.tsx src/__tests__/windowsShell.test.tsx src/__tests__/windowsSidebar.test.tsx <stylesheet entry>
git commit -m "feat(windows): Windows 11 shell with a collapsible sidebar"
```

---

### Task 3: Today

**Files:**
- Create: `src/components/windows/todayModel.ts`, `src/components/windows/WindowsToday.tsx`
- Modify: `src/pages/dashboard/NovaHub.tsx:90` (Windows picks `WindowsToday`)
- Test: `src/__tests__/windowsToday.test.tsx`

**Interfaces:**
- Consumes: `useDashboardWorkspace()` (`user`, `decks`, `cards`, `startQuickStudy()`, `startStudyForDeck(deckId)`), `useStudyStats(userId)` (`retention7d`, `sessions`), CSS classes from Task 2.
- Produces (pure, `todayModel.ts`): `dueCount(cards: Card[], now: number): number`; `reviewMinutes(due: number): number`; `coursesWithDue(decks: Deck[], cards: Card[], now: number): Array<{ deck: Deck; due: number }>` (due > 0, due desc, then title); `nextDueAt(cards: Card[], now: number): number | undefined`; `weekAnswered(sessions: StudySession[], now: number): number` (sum of `totalAnswers ?? cardsStudied` over the last 7 days). A card is due when `(nextReview ?? 0) <= now`.

- [ ] **Step 1: Write the failing tests**

```ts
it('estimates about 20 seconds a card, at least a minute', () => { expect(reviewMinutes(24)).toBe(8); expect(reviewMinutes(1)).toBe(1); });
it('lists courses with cards due, most due first', () => { expect(coursesWithDue(decks, cards, NOW).map(c => [c.deck.title, c.due])).toEqual([['Biology 101', 12], ['Spanish A2', 8], ['World History', 4]]); });
it('shows the due count and starts a mixed review', () => { render(); expect(screen.getByText('24')).toBeVisible(); expect(screen.getByText('about 8 min')).toBeVisible(); click(button('Start review')); expect(startQuickStudy).toHaveBeenCalled(); });
it('studies one course from its row', () => { click(row('Spanish A2')); expect(startStudyForDeck).toHaveBeenCalledWith('d-spanish'); });
it('shows the first 5 courses and a link to the rest', () => { renderWith(sevenCoursesDue); expect(rows()).toHaveLength(5); expect(link('See all in Library')).toHaveAttribute('href', '/dashboard/decks'); });
it('shows "remembered this week" only after 10 reviews', () => { renderWith({ retention7d: 0.91, weekAnswered: 9 }); expect(screen.queryByText('91%')).toBeNull(); renderWith({ retention7d: 0.91, weekAnswered: 10 }); expect(screen.getByText('91%')).toBeVisible(); });
it('says you are caught up when nothing is due', () => { renderWith(nothingDue); expect(screen.getByText("You're all caught up")).toBeVisible(); expect(button('Create a course')).toBeVisible(); });
it('welcomes a user with no courses', () => { renderWith(noDecks); expect(button('Create your first course')).toBeVisible(); });
it('offers Try again when the stats fail to load', () => { renderWith({ statsError: 'offline' }); click(button('Try again')); expect(refresh).toHaveBeenCalled(); expect(button('Start review')).toBeVisible(); });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/windowsToday.test.tsx --maxWorkers=4`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `todayModel.ts` and `WindowsToday`**

Greeting by local hour (morning < 12 ≤ afternoon < 18 ≤ evening) + first word of `user.name`. Stats: streak = `user.streak ?? 0` ("N days" / "streak"); remembered = `Math.round(retention7d * 100)%` when `weekAnswered(sessions) >= 10`. Next due shown with `toLocaleTimeString` when today, else weekday + time. Create buttons go to `/dashboard/generator`. Loading (`useStudyStats().loading`) shows placeholder blocks for the stats only; `useStudyStats().error` replaces the two stats with "Couldn't load your stats" and **Try again** (`refresh()`), while the due card and course list (from the workspace, which works offline) still render.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/windowsToday.test.tsx src/__tests__/crossPlatformRuntime.test.tsx --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/windows/todayModel.ts src/components/windows/WindowsToday.tsx src/pages/dashboard/NovaHub.tsx src/__tests__/windowsToday.test.tsx
git commit -m "feat(windows): Today screen"
```

---

### Task 4: Library

**Files:**
- Create: `src/components/windows/WindowsLibrary.tsx`, `src/components/windows/libraryModel.ts`
- Modify: `src/pages/dashboard/NovaHub.tsx:91`
- Test: `src/__tests__/windowsLibrary.test.tsx`

**Interfaces:**
- Consumes: `useDashboardWorkspace()` (`decks`, `cards`, `startStudyForDeck`, `deleteDeck(id)`), `dueCount` from Task 3.
- Produces: `libraryRows(decks, cards, now, query: string, sort: 'due' | 'recent' | 'az'): Array<{ deck: Deck; cards: number; due: number; lastStudied?: number }>` — `cards` = card count (fallback `deck.cardCount`), `lastStudied` = max `card.lastReviewed`; query matches title case-insensitively; sorts: due desc then title / lastStudied desc (never-studied last) / title A–Z.

- [ ] **Step 1: Write the failing tests**

```ts
it('filters by title and sorts by due first by default', () => { expect(libraryRows(decks, cards, NOW, 'bio', 'due').map(r => r.deck.title)).toEqual(['Biology 101']); });
it('sorts recently studied first, never-studied last', () => { expect(titles(libraryRows(decks, cards, NOW, '', 'recent'))).toEqual(['Spanish A2', 'Biology 101', 'New deck']); });
it('studies a course on click', () => { click(row('Biology 101')); expect(startStudyForDeck).toHaveBeenCalledWith('d-bio'); });
it('opens the course page from the right-click menu', () => { contextMenu(row('Biology 101')); click(menuitem('Open')); expect(location.pathname).toBe('/deck/d-bio'); });
it('asks before deleting', () => { contextMenu(row('Biology 101')); click(menuitem('Delete')); expect(deleteDeck).not.toHaveBeenCalled(); click(button('Delete course')); expect(deleteDeck).toHaveBeenCalledWith('d-bio'); });
it('goes to Create from New course', () => { click(button('New course')); expect(location.pathname).toBe('/dashboard/generator'); });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/windowsLibrary.test.tsx --maxWorkers=4`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — rows are `<button class="win-row">`; the context menu is a positioned `role="menu"` with `menuitem`s Study / Open / Delete, closed by Esc or outside click; the confirm is a `role="dialog"` ("Delete "{title}"? Its cards are deleted too.") with **Cancel** / **Delete course**. Sort is a `<select>` labelled "Sort".

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/windowsLibrary.test.tsx --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/windows/WindowsLibrary.tsx src/components/windows/libraryModel.ts src/pages/dashboard/NovaHub.tsx src/__tests__/windowsLibrary.test.tsx
git commit -m "feat(windows): Library with search, sort and a right-click menu"
```

---

### Task 5: Study session

**Files:**
- Create: `src/components/windows/WindowsStudySession.tsx` (exports `WindowsStudySession`, `WindowsStudyComplete`, `WindowsStudyEmpty`)
- Modify: `src/pages/study/StudyModePage.tsx` (Windows hand-off beside the `iosDesign` branches, ~lines 622–700), `src/pages/dashboard/NovaHub.tsx:92` (`/study` → `<Navigate to="/dashboard" replace />` on Windows)
- Test: `src/__tests__/windowsStudySession.test.tsx`

**Interfaces:**
- Consumes: from `StudyModePage` — `currentCard`, `index`, `studyCards.length`, `flipped`, `toggleFlip`, `handleRate(r: Rating)`, `gradeIntervals: Partial<Record<Rating, number>>`, `sessionStats.total`, `sessionStats.correct`, `elapsedMs`, `handleRestart`, `deck`; `formatInterval` from `src/services/study/srs`; `isTextTarget` from Task 2.
- Produces: `WindowsStudySession(props: { deckTitle: string; card: Card; index: number; total: number; flipped: boolean; onFlip(): void; onRate(r: Rating): void; onExit(): void; intervals: Partial<Record<Rating, number>> })`; `WindowsStudyComplete(props: { deckTitle: string; reviewed: number; correct: number; elapsedMs: number; onRestart(): void; onDone(): void })`; `WindowsStudyEmpty(props: { onDone(): void })`.

- [ ] **Step 1: Write the failing tests**

```ts
it('shows the answer with Space and grades with 1–4', () => {
  key(' '); expect(onFlip).toHaveBeenCalled();
  rerender({ flipped: true }); key('3'); expect(onRate).toHaveBeenCalledWith(Rating.GOOD);
  key('1'); expect(onRate).toHaveBeenLastCalledWith(Rating.AGAIN);
});
it('does not grade before the answer is shown', () => { key('4'); expect(onRate).not.toHaveBeenCalled(); });
it('shows each grade with its next interval', () => { rerender({ flipped: true, intervals: { [Rating.GOOD]: 3 } }); expect(button(/Good/)).toHaveTextContent('3d'); });
it('ends with Esc, asking first once a card is graded', () => {
  key('Escape'); expect(onExit).toHaveBeenCalledTimes(1);           // nothing graded yet
  rerender({ index: 4 }); key('Escape'); expect(onExit).toHaveBeenCalledTimes(1);
  click(button('End session')); expect(onExit).toHaveBeenCalledTimes(2);
});
it('ignores keys while typing', () => { key(' ', textInput); expect(onFlip).not.toHaveBeenCalled(); });
it('shows progress', () => { expect(screen.getByText('9 / 24')).toBeVisible(); });
it('sums up the session', () => { renderComplete({ reviewed: 24, correct: 21, elapsedMs: 492_000 }); expect(screen.getByText('88%')).toBeVisible(); click(button('Back to Today')); expect(onDone).toHaveBeenCalled(); click(button('Study again')); expect(onRestart).toHaveBeenCalled(); });
it('has a Windows empty state with a way back', () => { renderEmpty(); click(button('Back to Today')); expect(onDone).toHaveBeenCalled(); });
it('StudyModePage uses the Windows session in the Windows app', async () => { setDesktop(true); renderStudyRoute('deck-1'); expect(await screen.findByRole('button', { name: /Good/ })).toHaveClass('win-button-primary'); });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/windowsStudySession.test.tsx --maxWorkers=4`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — keys 1/2/3/4 → `Rating.AGAIN/HARD/GOOD/EASY`; Esc confirm is a `role="dialog"` "End this session?" with **Keep studying** / **End session**, shown when `index > 0`; `% correct = round(correct / reviewed × 100)`; time as `m min s s`. In `StudyModePage`, compute `const windowsDesign = isDesktopApp() && preview === null` and render the three Windows components in the same places the `iosDesign` ones render (complete, no cards, session); `onExit`/`onDone` → `navigate('/dashboard')`. FlowMode and voice controls are not shown in the Windows session (out of scope).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/windowsStudySession.test.tsx src/__tests__/liveActivityDriver.test.tsx src/__tests__/bugFixRegression.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/windows/WindowsStudySession.tsx src/pages/study/StudyModePage.tsx src/pages/dashboard/NovaHub.tsx src/__tests__/windowsStudySession.test.tsx
git commit -m "feat(windows): keyboard-first study session inside the app"
```

---

### Task 6: Settings

**Files:**
- Create: `src/components/windows/WindowsSettings.tsx`
- Modify: `src/pages/dashboard/NovaHub.tsx:101` (Windows picks `WindowsSettings`; `/settings/all` unchanged)
- Test: `src/__tests__/windowsSettings.test.tsx`

**Interfaces:**
- Consumes: `useDashboardWorkspace()` (`user`, `onLogout`), `useTheme()` (`theme`, `setTheme`), `DesktopSettingsSection` (`src/desktop/DesktopSettingsSection.tsx`), `useAppPreference('bonamind_dailyGoal', '20')`, `isAdminOrHigher(user.role)` (same import `NovaDashboardShell` uses).

- [ ] **Step 1: Write the failing tests**

```ts
it('switches between Light, Dark and System', () => { click(radio('Light')); expect(setTheme).toHaveBeenCalledWith('light'); });
it('includes the Windows settings', () => { expect(screen.getByText('Start with Windows')).toBeVisible(); });
it('links to the full settings page', () => { expect(link('More settings')).toHaveAttribute('href', '/dashboard/settings/all'); });
it('shows Admin only to admins', () => { renderAs('user'); expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull(); renderAs('admin'); expect(link('Admin')).toHaveAttribute('href', '/admin'); });
it('signs out', () => { click(button('Sign out')); expect(onLogout).toHaveBeenCalled(); });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/windowsSettings.test.tsx --maxWorkers=4`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — sections Account (name, email, plan from `user`), Appearance (three radios bound to `theme`), Windows (`<DesktopSettingsSection />`), Study (daily goal number input 5–200, and a **Reminders** row linking to `/dashboard/settings/all`), then the links and **Sign out**. Plan decision against the spec ("Study: daily goal, reminders"): the reminder controls live inside the 1,000-line `SettingsPage` with no extracted component, so the Windows screen links to them rather than duplicating them; extracting them is Phase 2 work. Ledger this as a ruling.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/windowsSettings.test.tsx src/__tests__/desktopSettings.test.tsx --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/windows/WindowsSettings.tsx src/pages/dashboard/NovaHub.tsx src/__tests__/windowsSettings.test.tsx
git commit -m "feat(windows): Settings screen"
```

---

### Task 7: Reused pages, visual check, docs

**Files:**
- Create: `scripts/capture-windows-screens.mjs`
- Modify: `src/styles/windows.css` (overrides for the reused pages), `docs/windows-app-checklist.md`, `HANDOFF.md`, `CHANGELOG.md` (`[Unreleased]` → Added)
- Test: visual check (below); full suite

- [ ] **Step 1: Restyle reused pages** — under `html.platform-desktop .win-content`: hide decorative layers (the Nova background/glow elements, `[data-decorative]`, the aurora canvas); map the dark hard-coded surfaces and text used by `GeneratorPage`, `AIChatPage` and the Classes pages (`bg-[#0A0A0F]`, `bg-white/[0.0x]`, `text-white`, `text-zinc-*`, `border-white/*`) to the `--win-*` variables, so they read correctly in light and dark. Overrides stay in this file, scoped to the Windows app; no page component changes.

- [ ] **Step 2: Visual check** — create `scripts/capture-windows-screens.mjs` (Playwright, like `scripts/render-banner.mjs`): serve `npx vite --mode desktop --port 3002`; `page.addInitScript` defines `window.__TAURI_INTERNALS__ = { invoke: () => Promise.resolve(null), transformCallback: () => 0 }` so `isDesktopApp()` is true and bridge calls resolve harmlessly; sign in with the storage state written by `scripts/e2e-seed-session.mjs` (needs `SUPABASE_SERVICE_ROLE_KEY` in the local env; if it's absent, stop and ask the owner); `page.emulateMedia({ colorScheme })` for light and dark at 1280×820 and 860×820. Screenshot Today, Library (context menu open), a study session (answer shown), the complete screen, Settings, Create and Linnea into `docs/assets/windows/` (git-ignored scratch is fine; commit only if the owner wants them). Expected: no website hero sections, glows or unreadable text; at 860px the sidebar is collapsed. Rust: `cargo test --manifest-path src-tauri/Cargo.toml chrome` passes locally.

- [ ] **Step 3: Docs** — `docs/windows-app-checklist.md`: add the new screens (Today numbers, Library right-click, Space/1–4/Esc, Ctrl+B, follow Windows light/dark live, title bar colour). `HANDOFF.md`: a dated section (what shipped, where it lives, the theme defaults, Phase 2 = native Create and Linnea) and update the Surfaces note. `CHANGELOG.md` `[Unreleased]` → Added: "Windows app: its own simple Windows 11 layout…".

- [ ] **Step 4: Full verification**

Run: `npx vitest run --maxWorkers=4` then `npx tsc --noEmit` then `npm run lint` (all in `auramind-gemini/`), and `node scripts/check-brand.mjs` from the repo root.
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/styles/windows.css docs/windows-app-checklist.md HANDOFF.md CHANGELOG.md
git commit -m "feat(windows): restyle Create, Linnea and Classes; checklist and handoff"
```
