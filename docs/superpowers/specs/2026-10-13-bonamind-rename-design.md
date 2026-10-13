# BonaMind rename — design

Date: 2026-10-13
Status: draft for owner review

## Goal

Finish the move from AuraMind to BonaMind, and rename the tutor from
Prof. Aura to Prof. Linnea. The rename covers everything users see and
everything in the code. Nobody loses a setting, a streak, an offline
review or a home-screen widget along the way.

Earlier PRs (#143, #144, #145) already renamed the app name, the Windows
and widget display names, the Open Graph card and the marketing surface.
This finishes the job.

## Decisions already made

- **Scope: users and code, keep the folder.** The `auramind-gemini/`
  folder and the app IDs stay as they are.
- **The GitHub repo is now `shipking-ai/BonaMind`.** The owner renamed
  it on 2026-10-13. GitHub redirects the old `AuraMind-App-2` URLs, so
  nothing broke, but every reference moves to the new name (see Stage 3
  and Stage 4).
- **Native code names are renamed too.** Android classes that the system
  remembers by name keep working through stand-in subclasses (see
  "Android").
- **Approach: staged PRs plus a guard test.** One big find-and-replace
  would mix a data migration with thousands of cosmetic edits, and
  reviewers couldn't tell them apart.

## What never changes (permanent identities)

| Identity | Where | Why it stays |
|---|---|---|
| `com.auramind.app` | Android `applicationId` and the Java package `com.auramind.app` | Play Store identity. Changing it makes a new app with no users. |
| `com.auramind.app` | Tauri `identifier` | Windows install and update identity. Changing it orphans installs and their saved data. |
| `auramind-gemini/` | Folder name | Owner decision. About 277 path references, and the CI paths depend on it. |
| `auramind_biometric_creds` | Android `EncryptedSharedPreferences` file (`BiometricAuthPlugin`) | Encrypted with a Keystore key. Moving it means decrypting and re-encrypting sign-in tokens, and a failure signs people out of biometric unlock. Nobody sees the file name. |
| `auramind_study_session` | Android notification channel ID (`AuraLiveUpdatePlugin`) | Android keeps each user's sound, vibration and mute choices per channel ID. A new ID resets them and leaves the old channel listed in system settings. The visible channel name is renamed in Stage 2. |
| `auramind-upload` | Release signing key alias (`android/app/build.gradle`, `android/wear/build.gradle`, keystore README) | The alias is stored inside the upload keystore. Changing it means re-keying the keystore. |
| `/auramind/sync`, `/auramind/grade`, `pathPrefix="/auramind"` | Wear OS data-layer paths (`WearSyncPlugin.java`, `WearData.kt`, both manifests) | The phone app and the watch app update separately. If one side changes its path first, phone-to-watch sync breaks. |
| `supabase/migrations/`, `supabase/migrations-extra/` | Applied SQL | Append-only history. No database object is Aura-named, so nothing needs a new migration. |
| `CHANGELOG.md` entries before the rename, `docs/superpowers/` specs and plans dated before 2026-10-13 | History | Records of what was true at the time. |

The iOS bundle ID can change freely (the iOS app has no users yet), but
it isn't Aura-named today, so it is left alone.

## Stage 1 — data migration (PR1)

Nothing visible changes. Every stored value moves from its old name to
its new name, and **in the same PR** every line of code that reads or
writes it switches to the new name. Moving the data and switching the
code apart would open a gap where the code reads a name the data has
just left.

Each surface ships as one unit: the web bundle deploys at once, and the
Android and Windows apps carry their own copy of the web bundle next to
their native code. So the migration and the renamed readers always
arrive together. Two things cross that boundary, and each gets a
fallback below: the Android widget and tile (they can refresh before the
app's web layer has run the migration), and deep links sent by the
server (old installed builds don't know the new scheme).

### Web storage (localStorage and Capacitor Preferences)

About 90 distinct keys are stored under four prefix styles:
`auramind_*` (settings, XP, streak, achievements, consent, widget
state), `auramind-*` (saved quizzes, card metadata),
`auramind.*` (saved chat history, subscription status, tutor
personality) and `auramind:*` (quiz cache, notifications, tutorials
done). Some are built at runtime, so the migration works **by prefix,
not by a fixed list**: any key that starts with `auramind` followed by
`_`, `-`, `.` or `:` moves to the same key with `bonamind` in front.
Only the prefix changes; the rest of the key stays as it is.

Some modules read localStorage while they are being imported, before
any startup code runs. A first import in `src/index.tsx` doesn't run
first in the built bundle, because the bundler evaluates the entry's
shared chunks ahead of the entry's own code. So the localStorage
migration is a **classic script**, `public/storage-migrate.js`, loaded
first in `index.html`'s `<head>`. Classic scripts run while the page is
still parsing, before any module script. Capacitor Preferences only has
an async API, and only native surfaces read it (the widget keys and the
iOS pending route). Its migration (`migrateLegacyKeysAsync`) runs right
after startup without blocking the first render. Both follow the same
steps:

1. If the marker `bonamind_storage_migrated_v1` is set, stop.
2. For every key with a legacy prefix, work out the new key.
3. If the new key **already exists**, keep it (a newer value always
   wins) and remove the old key.
4. Otherwise read the old value, remove the old key, then write the new
   key. Removing first frees the space the write needs on a nearly full
   store. If the write fails, put the old value back under the old key.
5. Once every key is handled, set the marker.

Errors (storage full, private mode, a throwing accessor) are caught for
each key. A key that fails stays under its old name, the other keys
still move, and the marker is **not** set, so the next launch tries
again. Until then that one setting shows its default; nothing is lost.

**Readers and writers:** in this same PR every string in
`auramind-gemini/src/` and `auramind-gemini/public/` that starts with
`auramind` plus `_`, `-`, `.` or `:` becomes `bonamind` plus the same
character. That's about 60 source files and 10 test files. The only
exceptions are the `auramind-gemini` folder name and the migration's own
legacy-prefix list. This sweep also picks up names that aren't stored
data: window event names (`auramind:open-replay`), the `auramind-due`
notification tag, the widget message type and download file names.
Renaming them in the same bundle is harmless, and it keeps the rule
simple enough for a test to enforce. No reader keeps a fallback to the
old name.

Names outside the web source are renamed in Stage 3: the `auramind-api`
label, the `auramind-desktop` crate, the `auramind-dir-` test name, the
`auramind-ios-unsigned-ipa` CI artifact name, and test fixtures such as
`auramind-does-not-exist`.

### Offline review database (IndexedDB)

`offlineStudyService.ts` keeps queued reviews in the database
`auramind-offline`. A queued review that is lost is lost for good, so
this one is careful. In this PR the service switches to
`bonamind-offline`, and its open step moves the records. **No database
is ever deleted.** A delete that another tab blocks stays queued, then
removes the database whenever that tab closes, and every open behind it
hangs. The first review of this design found both failures: two tabs
booting together (which a service-worker update causes) lost every
queued review.

1. Where the browser has Web Locks, the move runs under the lock
   `bonamind-offline-migration`, so tabs take turns.
2. Open `bonamind-offline`, creating it if needed. Check whether
   `auramind-offline` exists by opening it without a version; if that
   would create it, abort the upgrade so nothing is created. If it
   doesn't exist, use `bonamind-offline`.
3. Otherwise copy every legacy record into `bonamind-offline` **by key,
   only where the key is absent**. A record already there is newer and
   wins.
4. Remove from `auramind-offline` each record whose key
   `bonamind-offline` now holds. Records written to the legacy database
   later (an old-bundle tab, a rolled-back deploy) stay there and move
   on the next launch.
5. If the copy fails, keep using `auramind-offline` for this session
   (nothing was removed from it). The next launch tries again.

A crash at any point is safe, and every launch drains whatever is left.
An empty `auramind-offline` stays on the device, at no cost.

### Widget service-worker cache

The cache `auramind-widget-state` holds only derived state that the app
rewrites on its next sync. It is renamed to `bonamind-widget-state`, and
the old cache is deleted in the service worker's `activate` step. No
copy.

### Android native storage

- **SharedPreferences** `auramind_spoken_reminder` (SpokenReminderReceiver)
  and `auramind_wear_grade_queue` (the Wear `GradeQueue.kt`): a small
  helper `LegacyPrefs.migrate(context, old, new)` copies every entry from
  the old file into the new one on first read, if the new file is empty,
  then clears the old file. The wear module gets its own copy of the
  helper (it's a separate app module).
- **Capacitor Preferences keys** that native code reads
  (`auramind_widget_due`, `auramind_widget_deck`, `auramind_widget_streak`):
  the widget and tile read the `bonamind_` key first and fall back to the
  `auramind_` key. After an update, the widget can refresh before the
  user opens the app (and before the web migration runs); the fallback
  keeps it showing real numbers instead of zeros. This fallback is the
  one reader that keeps the old name, and it is allow-listed.

### iOS

`auramind_pending_route` (written by the Siri intents, read by the web
layer) becomes `bonamind_pending_route` on both sides in this PR. The
iOS app has no users, so there is no fallback and no migration beyond
the shared web one.

### Windows

- `guard.rs` names the old `auramind.app` domain. That moves to
  `bonamind.app` (the old domain no longer serves the app).
- `handoff.rs` temp-dir prefix `auramind-handoff-` becomes
  `bonamind-handoff-`. Temp files are short-lived, so no migration.
- Saved data sits under the `com.auramind.app` identifier, which doesn't
  change, so the app keeps finding it.

### Deep links: accept both schemes

Every surface accepts both `auramind://` and `bonamind://` from this PR
on. Everything new (shortcuts, widget, tile, Live Activity, Siri
intents, push notifications) sends `bonamind://` from Stage 3 on, after
the builds that understand it have shipped. An Android or Windows user
who never updates and taps a Stage 3 push notification still gets the
app opened on its home screen; only the jump to the linked page is
missed.

| Surface | Change |
|---|---|
| Android `AndroidManifest.xml` | A second `<data android:scheme="bonamind" android:host="app" />` beside the existing one |
| iOS `Info.plist` | Add `bonamind` to `CFBundleURLSchemes` |
| Tauri `tauri.conf.json` | `"schemes": ["bonamind", "auramind"]`; `links.rs::is_app_url` accepts both |
| Web router (Capacitor `appUrlOpen` handler) | Strips either scheme |
| API `POST /api/push/send` (`api/index.ts`) | The zod check accepts `bonamind://` and `auramind://`. The default reminder link becomes `bonamind://app/dashboard` |
| OAuth return (`auramind://auth/callback`) | The app sends `bonamind://auth/callback` from Stage 3. The owner adds that URL to Supabase's redirect allow-list **before** Stage 3 ships; the old entry stays |

Accepting `auramind://` costs one string comparison, and pinned
shortcuts, old notifications and OAuth links that are already out there
keep working. The old scheme stays accepted indefinitely.

### Stage 1 tests

- `migrateLegacyStorage`: copies by prefix; never overwrites an existing
  new key; removes old keys after copying; sets the marker; a second run
  does nothing; one throwing key leaves the marker unset and the other
  keys migrated; a dynamic key (`auramind_ci_tour_step`) is covered.
- IndexedDB migration (fake-indexeddb): records come across with
  matching counts and the old database is deleted; a failure partway
  through keeps the old database, removes the half-made new one, and the
  service still reads the old queue.
- `LegacyPrefs.migrate`: a plain JUnit test (the app module has JUnit
  and no Robolectric) over an in-memory `SharedPreferences` fake that
  lives in the test folder: entries copy across, the old file is
  cleared, and a non-empty new file is left alone.
- Widget key fallback: the widget's key-reading helper is a static
  function over a `SharedPreferences`, tested the same way (new key
  wins; old key used when the new one is missing).
- A web test that walks the source for `auramind_` / `auramind-` storage
  keys outside the migration file, so a missed reader fails CI in this
  PR rather than in Stage 4.
- Deep links: `links.rs` accepts both schemes; the push-send zod check
  accepts both and rejects `https://`; the web handler routes both.

## Stage 2 — Prof. Linnea and visible copy (PR2)

Everything a person reads changes; code names don't move yet.

- **Website persona.** `profAuraPersonality.ts`, the moods, the empty
  states, the chat tour and the prompts keep their personality and say
  Prof. Linnea. The system prompt the API sends names Prof. Linnea.
- **Avatar files** `prof-aura-*` (store graphics and in-app images)
  become `prof-linnea-*`. The artwork stays.
- **Every remaining visible "AuraMind" or "Aura"**: screen copy,
  notifications, emails, the Android widget label and tile label
  (`strings.xml`), Siri phrases, the favicon title, `tauri.conf.json`
  product text, Sentry release names, the not-found page and the
  onboarding tutorial.
- **Store text**: `store/android/listing.md`, `full_description.txt`,
  the changelog and `store/PRE_LAUNCH_CHECKLIST.md`.
- **Chat history isn't rewritten.** Stored messages that say "Prof. Aura"
  stay as they were written.

**Tests:** a website brand test, modelled on
`packages/core/test/brandNames.test.ts`, that reads `src/**` string
literals and JSX text, `strings.xml` and the store text files and fails
on "AuraMind", "Prof. Aura" or "Prof Aura". Update the snapshots and
copy assertions that name the tutor.

## Stage 3 — code names (PR3)

Pure renames with no behaviour change, except that senders switch to
`bonamind://` (made safe by Stage 1's accept-both).

### Web and API

- `ProfAura*` becomes `ProfLinnea*` (`ProfAura`, `ProfAuraPersonality`,
  `ProfAuraEmptyState`, `ProfAuraMood`, `ProfAuraAvatar`,
  `useMoodForProfAura` and their files).
- `Aura*` becomes `Bona*` (`AuraSpeech`, `AuraSpeechEngine`,
  `AuraChatMode`, `VoiceAura`, `AndroidAura`, `AuraSans`,
  `AuraAiClient`, `AuraAiModule`, `clampAuraScroll`). `useAuraMind`
  becomes `useBonaMind`. The `components/auramind/` folder becomes
  `components/bonamind/`.
- The Capacitor plugin JS names change in step with the native side
  (`AuraListen`, `AuraLiveActivity`, `AuraLiveUpdate`, `AuraDevice`
  become `BonaListen`, `BonaLiveActivity`, `BonaLiveUpdate`,
  `BonaDevice`). JS and native ship in the same build, so the
  registration names can't drift apart.

### Android

- Phone app classes `AuraDevicePlugin`, `AuraListenPlugin`,
  `AuraLiveUpdatePlugin`, `AuraSpeechPlugin` and `AuraSpeechEngine`
  become `Bona*`. The `@xml/auramind_widget_info` resource becomes
  `@xml/bonamind_widget_info` (Android looks it up through the receiver,
  not by remembered name).
- **`AuraMindWidgetProvider` (phone) and `AuraMindTileService` (the Wear
  OS tile, in the `wear` module) need care.** Android remembers placed
  widgets and added tiles by the class name registered in the manifest.
  If that name disappears, Android removes the widget from the home
  screen and the tile from the watch. So the real code moves to
  `BonaMindWidgetProvider` and `BonaMindTileService`, and two
  three-line stand-ins under the old names stay as the **only**
  registered entries:

  ```java
  /** Registered under the pre-rename name so placed widgets keep working. Do not delete or rename. */
  public class AuraMindWidgetProvider extends BonaMindWidgetProvider {}
  ```

  The phone manifest keeps `android:name=".AuraMindWidgetProvider"` and
  the wear manifest keeps `android:name=".AuraMindTileService"` exactly
  as they are. The new classes are not registered themselves, so the
  widget picker and the tile list each show one BonaMind entry (the
  labels come from `strings.xml`, renamed in Stage 2). The phone's Quick
  Settings tile, `QuickReviewTileService`, isn't Aura-named and doesn't
  change.
- The Java package stays `com.auramind.app` (it's tied to the app ID).

### iOS

A full rename: `AuraMindWidgets` / `AuraMindWidgetsBundle`,
`AuraMindIntents`, `AuraMindShortcuts`, `AuraMindSiri`,
`AuraMindVerb`/`Unverb` and the plugin classes. The Xcode project file
(`project.pbxproj`) is maintained by hand, so the rename edits file
references, group names and target names in it together. The existing
unsigned iOS CI build (`mobile-ios.yml`) is the check that it still
builds.

### Windows

Rust identifiers and test fixtures that say `auramind` (including
`links.rs` tests and `guard.rs`) move to `bonamind`. `tauri.conf.json`
keeps `"identifier": "com.auramind.app"`.

The updater endpoint in `tauri.conf.json` moves to
`https://github.com/shipking-ai/BonaMind/releases/latest/download/latest.json`.
Installed copies keep the old URL until they update, and they reach the
new one through GitHub's redirect. That redirect lasts as long as no new
repo is created under the old name; HANDOFF records that as a trap.

### Native app (`mobile/`)

Already BonaMind-named. The guard test covers it from Stage 4 on.

### Stage 3 tests

The existing web, API, Android, Rust and iOS suites are the check: a
rename that breaks an import fails type-check or the build. On top of
that: a JUnit test asserts each stand-in extends its new class, and a
manifest check (a small test that parses `AndroidManifest.xml`) asserts
the registered names are still `.AuraMindWidgetProvider` and
`.AuraMindTileService`. The Stage 2 brand test widens to code names.

## Stage 4 — docs, CI and the guard test (PR4)

- `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`,
  `CONTRIBUTING.md`, `HANDOFF.md` and `auramind-gemini/README.md` say
  BonaMind and Prof. Linnea. Paths keep `auramind-gemini/`.
- CI workflow step names and artifact names say BonaMind.
- Repo URLs say `shipking-ai/BonaMind`: root `package.json`
  (`repository`, `bugs`), `.github/ISSUE_TEMPLATE/config.yml` and the
  clone steps in `CONTRIBUTING.md`.
- `CHANGELOG.md` gets an entry for the rename. Older entries stay.

### The guard test

`scripts/check-brand.mjs`, run by CI on every PR (added to the existing
lint or test workflow):

1. List tracked files with `git ls-files`.
2. Search each for `AuraMind`, `auramind` and `Prof. Aura` (also
   `Prof Aura` and `ProfAura`).
3. Drop every hit that matches the allow-list.
4. Fail with `file:line` for each remaining hit.

The allow-list lives in the script, and every entry carries a one-line
reason:

| Entry | Reason |
|---|---|
| `com.auramind.app` (any file) | Permanent app ID (Android, Windows) |
| `com/auramind/app/` path segments and `package com.auramind.app` | Java package tied to the app ID |
| `auramind-gemini` (any file) | Folder name, owner decision |
| `AuraMindWidgetProvider`, `AuraMindTileService` (their two stand-in files and the phone and wear `AndroidManifest.xml`) | Keep placed widgets and tiles working |
| `auramind_biometric_creds`, `auramind_study_session`, `auramind-upload`, `/auramind/sync`, `/auramind/grade`, `/auramind` path prefix | Encrypted credentials file, notification channel ID, signing key alias and Wear data-layer paths (see "What never changes") |
| The legacy names in the Stage 1 migration files (`migrateLegacyStorage`, the IndexedDB migration, `LegacyPrefs` callers, the widget key fallback, the scheme handlers and scheme registrations, the push-send check) | They exist to name the old values |
| `supabase/migrations/**`, `supabase/migrations-extra/**` | Append-only history |
| `CHANGELOG.md` above the rename entry | History |
| `docs/superpowers/**` files dated before 2026-10-13 | Historical records |
| `**/package-lock.json` | Generated; follows `package.json` names |

Plain "Aura" isn't searched, because it appears inside normal words
("aurora") and would need its own allow-list. Each Stage 2 and Stage 3
PR removes the plain-"Aura" names it touches, and review checks for
strays.

**Guard test tests:** the script runs against a fixture directory and
fails on a planted `AuraMind`, passes on each allow-listed form, and
reports the correct `file:line`.

## Rollout

1. **PR1, data migration and accept-both links.** Merge and deploy the
   web app. The owner ships new Android and Windows builds. Owner: add
   `bonamind://auth/callback` to Supabase's redirect allow-list (keep the
   old entry) before PR3 merges.
2. **PR2, Prof. Linnea and copy.** Web deploy only. The new Android and
   Windows strings ride along with the next builds. The owner pastes the
   new listing text into Play Console.
3. **PR3, code names and `bonamind://` senders.** Merge after the PR1
   Android and Windows builds are out, so most installed apps already
   accept the new scheme. The owner ships new Android and Windows
   builds.
4. **PR4, docs, CI and the guard test.** The guard goes green on main.

Each PR gets its own HANDOFF update, per the standing rule.

## Done looks like

- A returning web, Android or Windows user keeps their theme, reminders,
  XP, streak, achievements, consent choice, queued offline reviews and
  placed widgets and tiles.
- Old `auramind://` links (shortcuts, notifications, OAuth returns)
  still open the app.
- Every screen, notification, store listing and doc says BonaMind and
  Prof. Linnea.
- `scripts/check-brand.mjs` passes on main with only the allow-listed
  exceptions.

## Out of scope

- Renaming the `auramind-gemini/` folder or either app ID.
- Rewriting stored chat history.
- New avatar artwork (files are renamed, not redrawn).
- Retiring the `auramind://` scheme.
