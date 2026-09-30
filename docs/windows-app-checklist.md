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
