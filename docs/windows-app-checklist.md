# Windows app — hand checklist

Run on a real Windows 11 PC before each desktop release. CI can't click
notifications, the tray or Explorer. Tick every box; note the build.

Build: ____________  Date: ____________  Tester: ____________

## Install
- [ ] The installer shows the navy/violet header and sidebar art and the BonaMind icon.
- [ ] It installs without an administrator prompt; a Start menu entry appears.
- [ ] Uninstall removes the app and the Explorer menu entry.

## Window
- [ ] Launch: no white flash; the window appears once the app has drawn.
- [ ] In Windows dark mode the title bar is navy with light text and a violet border; in light mode it's Windows' own light title bar (violet border kept).
- [ ] Switch Windows between light and dark (Settings → Personalization → Colors) with the app open: the app, its window and title bar follow without a restart.
- [ ] Hovering maximize shows Snap Layouts.
- [ ] Signed in, it opens to the dashboard; signed out, to sign-in (never the marketing page).
- [ ] The title follows the page ("Library · BonaMind").
- [ ] Right-click on empty space shows no browser menu; in a text field it does.
- [ ] Ctrl+N opens the generator; Ctrl+, opens Settings.

## Layout (Windows 11 style)
- [ ] The sidebar shows Today, Library, Create, Linnea and Settings (Classes too, only for an account in a class); the current place has a violet bar.
- [ ] ☰ and Ctrl+B collapse the sidebar to icons and back; the choice survives a restart; Ctrl+B does nothing while typing.
- [ ] Narrowing the window below ~900px collapses the sidebar; widening restores your choice.
- [ ] Today: the due count, "about N min", Start review, streak, "remembered this week" (after 10 reviews this week) and up to 5 courses with cards due; "You're all caught up" when nothing is due.
- [ ] Library: search, the Sort menu, click to study, right-click → Study / Open / Delete (Delete asks first).
- [ ] A session opens inside the window with the sidebar unchanged: Space shows the answer, 1–4 grade (each shows its next interval), Esc ends (asks once a card is graded); the summary offers Back to Today and Study again.
- [ ] Create and Linnea are readable in both light and dark (no dark panels in light mode, no glows).
- [ ] Settings: Light / Dark / System, the Windows section, daily goal, Reminders and More settings links, Admin only for admins, Sign out.
- [ ] The normal Windows mouse pointer is used (no custom dot-and-ring cursor).

## Tray, badge, notifications
- [ ] The tray icon shows "BonaMind · N cards due"; the menu matches the design.
- [ ] With cards due, the tray icon has a dot and the taskbar icon a number (1–9, 9+).
- [ ] Reviewing the last due card clears the dot and the badge.
- [ ] Set the reminder time 2 minutes ahead: a notification "N cards are ready" arrives with Quick review / Later.
- [ ] Quick review opens the corner panel; clicking the body opens the main window.
- [ ] "Pause reminders for today" stops further notifications until midnight.
- [ ] ✕ hides to the tray, and the first time a notification says it's still running. Quit exits.
- [ ] Settings → Start with Windows on; sign out of Windows and back in: BonaMind starts in the tray with no window.
- [ ] Turn BonaMind's notifications off in Windows: Settings shows the warning and its button opens the right Windows page.

## Quick Review
- [ ] Ctrl+Alt+Space opens the panel bottom-right, above the taskbar, frosted.
- [ ] With two monitors, it opens on the one the mouse is on (including a monitor left of the main one).
- [ ] Space flips, 1–4 rate, Esc hides; clicking the document behind it doesn't hide it.
- [ ] After a rating, the tray count drops.
- [ ] Finishing shows "All caught up · next card due in …" and hides after 2 seconds.
- [ ] Change the shortcut in Settings; the new one works; a taken one shows the explanation.

## Drop to create
- [ ] Dragging a PDF over the window shows the violet "Drop to make a course" glow; dropping opens the generator with it loaded.
- [ ] Dropping an .exe shows "BonaMind can't make a course from .exe files."
- [ ] Right-click a PDF in Explorer → Show more options → "Make a course with BonaMind" opens the generator with it.
- [ ] The same works when BonaMind wasn't running (cold start).
- [ ] Tray → "New course from file…" opens a picker filtered to documents and audio.

## Links and sign-in
- [ ] Win+R → `bonamind://app/study` focuses BonaMind on Study.
- [ ] `bonamind://app/admin` is ignored.
- [ ] (With `VITE_DESKTOP_OAUTH=true` and the Supabase redirect added) Continue with Google opens the browser and returns signed in.

## Updates
- [ ] About → Check for updates reports the installed version or offers the newer one.
