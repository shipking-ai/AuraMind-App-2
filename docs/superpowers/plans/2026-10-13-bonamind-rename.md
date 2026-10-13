# BonaMind Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish AuraMind → BonaMind and Prof. Aura → Prof. Linnea across web, API, Android, iOS, Windows and docs, without losing any user's stored data.

**Architecture:** Four PRs merged in order. PR1 moves every stored value and every storage reader/writer to the new names together, and makes every surface accept both link schemes. PR2 changes visible copy. PR3 renames code and switches link senders to `bonamind://`. PR4 renames docs and turns on a repo-wide guard script.

**Tech Stack:** React 19 + Vite + Vitest (jsdom) in `auramind-gemini/`; Vercel API (`api/`, Vitest); Capacitor 8 Android (Java, JUnit) and Wear (Kotlin, JUnit); iOS (Swift, hand-kept `project.pbxproj`); Tauri 2 (Rust, `cargo test`); `fake-indexeddb` (new dev dependency).

**Spec:** `docs/superpowers/specs/2026-10-13-bonamind-rename-design.md`

## Global Constraints

- Permanent names (never edit): `com.auramind.app` (any file), the `com/auramind/app/` Java/Kotlin package paths, the `auramind-gemini/` folder, `auramind_biometric_creds`, `auramind_study_session`, `auramind-upload`, `/auramind/sync`, `/auramind/grade`, `android:pathPrefix="/auramind"`, `supabase/migrations/**`, `supabase/migrations-extra/**`, `CHANGELOG.md` entries before the rename, `docs/superpowers/**` files dated before 2026-10-13.
- Legacy prefix rule: a key that starts with `auramind` followed by `_`, `-`, `.` or `:` moves to `bonamind` + the same rest. Only the prefix changes.
- Migration marker key: `bonamind_storage_migrated_v1`.
- Offline database names: legacy `auramind-offline`, new `bonamind-offline`, version `1`, stores `decks`, `cards`, `syncQueue` (schema unchanged).
- Tutor name: `Prof. Linnea`. Avatar files `prof-aura-*` → `prof-linnea-*`.
- Code names: `ProfAura*` → `ProfLinnea*`, `Aura*` → `Bona*`, `AuraMind*` → `BonaMind*`, except the Android stand-ins `AuraMindWidgetProvider` (phone) and `AuraMindTileService` (wear), which stay registered under their old names.
- Repo: `shipking-ai/BonaMind`. Updater URL: `https://github.com/shipking-ai/BonaMind/releases/latest/download/latest.json`.
- Commits: Conventional Commits, with **no** `Co-Authored-By` or tool footers (owner rule). Every PR updates `HANDOFF.md` (owner rule).
- Never pipe a test runner through `grep`/`tail` when its exit code matters. Never use Bash heredocs to write code containing backslashes; use the Edit/Write tools.
- PR boundaries are hard stops: open the PR, then wait for the owner to merge (and, after PR1 and PR3, to ship Android and Windows builds) before starting the next PR's branch from fresh `main`.

## Review Focus

1. **Import-time storage reads.** Modules that read localStorage while being imported (theme, `appPreferences`) must see migrated values. Test: `src/index.tsx`'s first import is the migration module (Task 1).
2. **Another tab holds `auramind-offline` open during migration.** The delete is blocked; the app must still use the verified `bonamind-offline` and lose no records. Test in Task 2.
3. **Legacy-looking text inside a key's suffix**, such as `auramind:quiz:auramind_x`. Only the leading prefix may change. Test in Task 1.
4. **The new scheme must not widen the deep-link allowlist.** `bonamind://app/admin`, `bonamind://evil/dashboard` and `https://…` must stay rejected exactly as their `auramind://` forms are. Tests in Task 4.
5. **Phone and watch on different versions.** The Wear data-layer paths and the two stand-in registrations must survive every rename. A source-pinning test lands in Task 10.

---

# PR1 — storage migration and accept-both links

Branch: rename the current `docs/bonamind-rename-spec` branch to `feat/rename-1-storage` (it already carries the spec and this plan). All paths below are relative to `auramind-gemini/` unless they start with `api/`, `.github/` or a root file.

### Task 1: Legacy key migration (localStorage sync, Preferences async)

**Files:**
- Create: `src/lib/legacyNames.ts`, `src/lib/storageMigration/legacyKeys.ts`, `src/lib/storageMigration/runFirst.ts`
- Modify: `src/index.tsx` (first import), `src/components/native/NativeRuntime.tsx` (call the Preferences migration on mount)
- Test: `src/__tests__/storageMigration.test.ts`

**Interfaces:**
- Produces, in `src/lib/legacyNames.ts`, the only web module allowed to spell legacy names:
  - `LEGACY_PREFIX = 'auramind'`
  - `LEGACY_SCHEME = 'auramind'`
  - `LEGACY_OFFLINE_DB = 'auramind-offline'`
- Produces, in `legacyKeys.ts`:
  - `MIGRATION_MARKER = 'bonamind_storage_migrated_v1'`
  - `legacyKeyTarget(key: string): string | null`
  - `interface SyncKeyStore { keys(): string[]; get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void }`
  - `interface AsyncKeyStore` (same methods, each returning a `Promise`)
  - `type MigrationReport = { skipped: boolean; moved: string[]; dropped: string[]; failed: string[] }`
  - `migrateLegacyKeys(store: SyncKeyStore): MigrationReport`
  - `migrateLegacyKeysAsync(store: AsyncKeyStore): Promise<MigrationReport>`
  - `localStorageStore(ls?: Storage): SyncKeyStore`
  - `preferencesStore(p: { keys(): Promise<{ keys: string[] }>; get(o: { key: string }): Promise<{ value: string | null }>; set(o: { key: string; value: string }): Promise<void>; remove(o: { key: string }): Promise<void> }): AsyncKeyStore`

- [ ] **Step 1: Write the failing tests** in `src/__tests__/storageMigration.test.ts`, using an in-memory `Map`-backed `SyncKeyStore` and its async twin:

```ts
it('maps each legacy separator and only the leading prefix', () => {
  expect(legacyKeyTarget('auramind_theme')).toBe('bonamind_theme');
  expect(legacyKeyTarget('auramind-saved-quizzes')).toBe('bonamind-saved-quizzes');
  expect(legacyKeyTarget('auramind.aurachat.sessions.v1')).toBe('bonamind.aurachat.sessions.v1');
  expect(legacyKeyTarget('auramind:quiz:auramind_x')).toBe('bonamind:quiz:auramind_x');
  expect(legacyKeyTarget('auramindtheme')).toBeNull();
  expect(legacyKeyTarget('bonamind_theme')).toBeNull();
  expect(legacyKeyTarget('other_auramind_x')).toBeNull();
});
it('moves keys, keeps an existing new value, and sets the marker', () => {
  // seed auramind_theme=dark, auramind_ci_tour_step=3, auramind_dailyGoal=10, bonamind_dailyGoal=25, unrelated=x
  // expect bonamind_theme=dark, bonamind_ci_tour_step=3, bonamind_dailyGoal=25, no auramind_* keys, unrelated=x, marker='1'
  // expect report.moved to contain 'auramind_theme' and report.dropped to equal ['auramind_dailyGoal']
});
it('does nothing on a second run once the marker is set', () => { /* report.skipped === true; a re-seeded auramind_x stays put */ });
it('restores the old key when writing the new one throws, and leaves the marker unset', () => {
  // store.set throws for 'bonamind_big' only
  // expect auramind_big still present with its value, report.failed=['auramind_big'], other keys moved, marker absent
});
it('keeps going when one key throws on read', () => { /* get throws for one key; the others still move; marker absent */ });
it('migrates Capacitor Preferences the same way', async () => { /* migrateLegacyKeysAsync over the async twin: auramind_widget_due → bonamind_widget_due */ });
it('runs before every other module', () => {
  const src = readFileSync(resolve(__dirname, '../index.tsx'), 'utf8');
  expect(src.match(/^import\s+[^;]*?['"]([^'"]+)['"]/m)?.[1]).toBe('./lib/storageMigration/runFirst');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd auramind-gemini && npx vitest run src/__tests__/storageMigration.test.ts`
Expected: FAIL, with the import of `../lib/storageMigration/legacyKeys` unresolved.

- [ ] **Step 3: Implement `legacyKeys.ts` and `legacyNames.ts`**
  - `legacyKeyTarget` matches `^${LEGACY_PREFIX}([_\-.:])`.
  - Each per-key step follows spec steps 3 and 4: if the new key exists, remove the old one and record it in `dropped`. Otherwise get the value, remove the old key, set the new key, and if the set throws, set the old key back and record it in `failed`.
  - Each key runs in its own `try`.
  - The marker is set only when `failed` is empty.
  - Snapshot `keys()` before mutating.
  - `localStorageStore` enumerates with `ls.length` / `ls.key(i)`.
  - The sync and async loops share `legacyKeyTarget`. Keep each loop short; don't build an abstraction over both.

- [ ] **Step 4: Implement `runFirst.ts` and wire it in.** `runFirst.ts` calls `migrateLegacyKeys(localStorageStore())` inside `try {} catch {}`, so a missing or blocked localStorage never stops boot, and it exports nothing. Make `import './lib/storageMigration/runFirst';` the first line of `src/index.tsx`, above `import React`. In `NativeRuntime.tsx`'s existing native-only mount effect, add `void import('../../lib/nativeShim').then(({ Preferences }) => migrateLegacyKeysAsync(preferencesStore(Preferences))).catch(() => {});`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd auramind-gemini && npx vitest run src/__tests__/storageMigration.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add auramind-gemini/src/lib/legacyNames.ts auramind-gemini/src/lib/storageMigration auramind-gemini/src/index.tsx auramind-gemini/src/components/native/NativeRuntime.tsx auramind-gemini/src/__tests__/storageMigration.test.ts
git commit -m "feat(storage): move auramind-prefixed keys to bonamind on startup"
```

### Task 2: Offline review database migration

**Files:**
- Create: `src/services/offline/offlineDb.ts`
- Modify: `src/services/offline/offlineStudyService.ts:11-69` (drop `DB_NAME`, `DB_VERSION` and the upgrade body; `openDB()` delegates), `package.json` (devDependency `fake-indexeddb`)
- Test: `src/__tests__/offlineDb.test.ts`

**Interfaces:**
- Consumes: `LEGACY_OFFLINE_DB` from Task 1.
- Produces, from `offlineDb.ts`:
  - `OFFLINE_DB_NAME = 'bonamind-offline'`, `OFFLINE_DB_VERSION = 1`
  - `upgradeOfflineDb(db: IDBDatabase): void`, moved verbatim from the current `onupgradeneeded`
  - `type CopyStores = (from: IDBDatabase, to: IDBDatabase) => Promise<void>`
  - `copyAllStores: CopyStores`, which uses one `readwrite` transaction on `to` over `decks`, `cards` and `syncQueue`, and `getAll()` from `from`
  - `openOfflineDb(factory?: IDBFactory, copy?: CopyStores): Promise<IDBDatabase>`, whose defaults are `indexedDB` and `copyAllStores`

- [ ] **Step 1: Install the test dependency**

Run: `cd auramind-gemini && npm install -D fake-indexeddb@6`
Expected: it is added to `devDependencies`, and `npm ls fake-indexeddb` shows one version.

- [ ] **Step 2: Write the failing tests.** Give each test a fresh `new IDBFactory()` from `fake-indexeddb`, with a helper `seedLegacy(factory, { decks, cards, syncQueue })` that creates `auramind-offline` v1 through `upgradeOfflineDb`:

```ts
it('creates bonamind-offline fresh when there is no legacy database', async () => {
  // db.name === 'bonamind-offline'; (await factory.databases()).map(d => d.name) excludes 'auramind-offline'
});
it('copies every record, then deletes the legacy database', async () => {
  // seed 2 decks, 3 cards, 4 syncQueue; open → db.name 'bonamind-offline', counts 2/3/4; legacy gone
});
it('keeps using the legacy database when the copy fails, and throws the half-made copy away', async () => {
  const failing: CopyStores = async () => { throw new Error('quota'); };
  // db.name === 'auramind-offline', its syncQueue count still 4; databases() has no 'bonamind-offline'
  // a second openOfflineDb(factory) with the real copy then migrates: name 'bonamind-offline', syncQueue 4
});
it('rebuilds a stale bonamind-offline left by an earlier try while the legacy one exists', async () => {
  // seed legacy with 4 syncQueue + create bonamind-offline holding 1 stray record → result has exactly the 4 legacy records
});
it('uses the verified copy when another tab blocks the legacy delete', async () => {
  // hold an open connection to auramind-offline (no versionchange handler) during openOfflineDb
  // → resolves with name 'bonamind-offline' and syncQueue count 4
});
it('does not create auramind-offline while probing for it', async () => { /* fresh factory → after open, databases() lacks 'auramind-offline' */ });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd auramind-gemini && npx vitest run src/__tests__/offlineDb.test.ts`
Expected: FAIL, with `../services/offline/offlineDb` unresolved.

- [ ] **Step 4: Implement `openOfflineDb`, following the spec's numbered algorithm.**
  - **Existence probe:** call `factory.open(LEGACY_OFFLINE_DB)` with no version. In `onupgradeneeded` with `oldVersion === 0`, call `request.transaction.abort()` and resolve "absent" from `onerror`.
  - **Deletes:** wrap `deleteDatabase` so it resolves `'deleted' | 'blocked'`. Resolve `'blocked'` from `onblocked`, and don't await completion after that.
  - **Before deleting the legacy database:** close the probe connection and the source connection.
  - **After verifying counts:** close and reopen nothing. Return the `to` connection.
  - **Caching:** `offlineStudyService.openDB()` keeps its `dbPromise` cache and calls `openOfflineDb()`.

- [ ] **Step 5: Run the tests to verify they pass, then run the offline service's neighbours**

Run: `cd auramind-gemini && npx vitest run src/__tests__/offlineDb.test.ts src/__tests__/rateCard.test.ts src/__tests__/wearGradeService.test.ts`
Expected: PASS for all three files.

- [ ] **Step 6: Commit**

```bash
git add auramind-gemini/package.json auramind-gemini/package-lock.json auramind-gemini/src/services/offline auramind-gemini/src/__tests__/offlineDb.test.ts
git commit -m "feat(offline): move queued reviews to bonamind-offline without loss"
```

### Task 3: Rename every web storage name, and enforce it

**Files:**
- Modify: every non-test file under `src/` and `public/` that matches the rule below (about 60), and the 10 test files that seed those keys
- Modify: `public/widget-sw.js` (add an `activate` handler that deletes the `auramind-widget-state` cache)
- Test: `src/__tests__/legacyStorageNames.test.ts`

**Interfaces:**
- Consumes: `legacyNames.ts` (Task 1). Its file is the only exempt source file.

- [ ] **Step 1: Write the failing enforcement test.**
  - Walk `src/**` and `public/**`, skipping `__tests__/`, `*.test.*`, `src/lib/legacyNames.ts`, `public/widget-sw.js`'s single legacy-cache line (mark it with a trailing `// legacy-name: ok` and skip lines carrying that marker), and binary files.
  - In every remaining line, first strip `com.auramind.app` and `auramind-gemini`. Then fail on `/auramind(?=_|\.|:(?!\/\/)|-)/` and report `file:line`. The match is case-sensitive: capitalised "AuraMind" is visible copy, which PR2 handles.
  - A second `it` asserts that `public/widget-sw.js` contains `caches.delete(` and the legacy cache name only on the marked line.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd auramind-gemini && npx vitest run src/__tests__/legacyStorageNames.test.ts`
Expected: FAIL, listing roughly 300 `file:line` hits (for example `src/lib/deepLinks.ts:15`).

- [ ] **Step 3: Apply the mechanical rename**

Run (from the repo root; perl edits in place, no heredoc):
`git grep -lzP "(?<![\w./])auramind(?=_|\.|:(?!//)|-(?!gemini))" -- auramind-gemini/src auramind-gemini/public | xargs -0 perl -pi -e 's{(?<![\w./])auramind(?=_|\.|:(?!//)|-(?!gemini))}{bonamind}g'`
The sweep also rewrites the files that must keep legacy names, so restore them at once:
`git checkout -- auramind-gemini/src/lib/legacyNames.ts auramind-gemini/src/__tests__/storageMigration.test.ts auramind-gemini/src/__tests__/offlineDb.test.ts`
Then fix by hand whatever the test still lists, such as `'/__auramind-widget-state'` (preceded by `_`). Then add the `activate` handler in `widget-sw.js`: `event.waitUntil(caches.delete(LEGACY_STATE_CACHE))`, where `const LEGACY_STATE_CACHE = 'auramind-widget-state'; // legacy-name: ok`.
Expected: `git diff --stat` touches `src/` and `public/` only, and `git grep -n "com.bonamind" -- auramind-gemini` prints nothing.

- [ ] **Step 4: Run the enforcement test, then the whole web suite and type-check**

Run: `cd auramind-gemini && npx vitest run src/__tests__/legacyStorageNames.test.ts && npm run type-check && npm test -- --run`
Expected: all PASS. If a test that seeds keys still fails, update the seeded literal (the test files were swept too); never revert source.

- [ ] **Step 5: Commit**

```bash
git add auramind-gemini/src auramind-gemini/public
git commit -m "refactor(storage): read and write bonamind-prefixed keys everywhere"
```

### Task 4: Accept both link schemes on every surface

**Files:**
- Modify: `src/lib/deepLinks.ts` (`parseDeepLink`, `consumePendingRoute`), `src/desktop/deepLinkRouter.ts:12`, `android/app/src/main/AndroidManifest.xml:59` (a second `<data>`), `ios/App/App/Info.plist:66-69` (second `<string>`, comment updated), `src-tauri/tauri.conf.json:78`, `src-tauri/src/links.rs:23-27`, `api/index.ts:2077`
- Test: `src/__tests__/deepLinks.test.ts`, `src/__tests__/deepLinkRouter.test.ts`, `src/__tests__/iosNativeSource.test.ts:193`, `api/tests/pushSend.test.ts`, `src-tauri/src/links.rs` (tests module)

**Interfaces:**
- Consumes: `LEGACY_SCHEME` (Task 1).
- Produces: `APP_SCHEME = 'bonamind'` exported from `src/lib/deepLinks.ts`. `parseDeepLink` accepts the protocol `${APP_SCHEME}:` or `${LEGACY_SCHEME}:`, with the allowlist unchanged.

- [ ] **Step 1: Write the failing tests**
  - **Web (`deepLinks.test.ts`):**
    - `parseDeepLink('bonamind://app/study')` → `'/dashboard/study'`, the same as the `auramind://` form.
    - `parseDeepLink('bonamind://app/admin')` → `null`.
    - `parseDeepLink('bonamind://app/__e2e/x')` → `null`.
    - `parseDeepLink('https://bonamind.app/dashboard')` → `null`.
  - **Desktop router (`deepLinkRouter.test.ts`):** `routeDeepLink('bonamind://auth/callback?code=abc', d)` resolves `'signed-in'`.
  - **Native source (`iosNativeSource.test.ts`):**
    - The manifest matches both `android:scheme="auramind"` and `android:scheme="bonamind"`.
    - `Info.plist` lists both `<string>auramind</string>` and `<string>bonamind</string>`.
    - `tauri.conf.json`'s `plugins["deep-link"].desktop.schemes` equals `["bonamind","auramind"]`.
  - **Rust (`links.rs`):**
    - `is_app_url("bonamind://app/study")` and `is_app_url("bonamind://auth/callback?code=abc")` are true.
    - `is_app_url("https://bonamind.app/app/study")` stays false.
  - **API (`pushSend.test.ts`):**
    - `link: 'bonamind://app/dashboard'` → 200.
    - `link: 'https://bonamind.app'` → 400.
    - `link: 'bonamindx://app'` → 400.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd auramind-gemini && npx vitest run src/__tests__/deepLinks.test.ts src/__tests__/deepLinkRouter.test.ts src/__tests__/iosNativeSource.test.ts` then `cd ../api && npx vitest run tests/pushSend.test.ts`
Expected: the new cases FAIL and the old cases pass. (Rust is checked in CI; see Step 4.)

- [ ] **Step 3: Implement**
  - **API:** the check accepts `v.startsWith('bonamind://') || v.startsWith('auramind://')`, with the message `'link must be a bonamind:// deep link'`. The default reminder link stays `auramind://` until Task 13.
  - **Web:** `consumePendingRoute` rebuilds the route with `bonamind://app`.
  - **Rust:** `is_app_url` accepts both schemes.
  - **Info.plist:** the comment names both schemes.

- [ ] **Step 4: Run them to verify they pass**

Run: the Step 2 commands, then `cargo test --manifest-path auramind-gemini/src-tauri/Cargo.toml links` if Rust is installed locally. If it isn't, ledger a ruling that `desktop-windows.yml` (`cargo test`) is the check.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add auramind-gemini/src/lib/deepLinks.ts auramind-gemini/src/desktop/deepLinkRouter.ts auramind-gemini/android/app/src/main/AndroidManifest.xml auramind-gemini/ios/App/App/Info.plist auramind-gemini/src-tauri api/index.ts auramind-gemini/src/__tests__ api/tests/pushSend.test.ts
git commit -m "feat(links): accept bonamind:// alongside auramind:// everywhere"
```

### Task 5: Native storage (Android prefs, widget fallback, Wear queue, iOS keys) and the Android unit tests in CI

**Files:**
- Create: `android/app/src/main/java/com/auramind/app/LegacyPrefs.java`, `android/app/src/main/java/com/auramind/app/WidgetPrefs.java`, `android/app/src/test/java/com/auramind/app/FakePrefs.java`, `android/app/src/test/java/com/auramind/app/LegacyPrefsTest.java`, `android/app/src/test/java/com/auramind/app/WidgetPrefsTest.java`, `android/wear/src/main/java/com/auramind/app/wear/LegacyPrefs.kt`, `android/wear/src/test/java/com/auramind/app/wear/LegacyPrefsTest.kt`
- Modify: `SpokenReminderReceiver.java:45,100,111`, `AuraMindWidgetProvider.java:42-44,79-100`, `QuickReviewTileService.java:28,79-81`, `wear/.../GradeQueue.kt:73` (every `getSharedPreferences(PREFS…)` goes through one `prefs(context)` helper), `ios/App/App/AuraMindIntents.swift:26-29`, `.github/workflows/ci.yml:178` (`./gradlew assembleDebug :app:testDebugUnitTest`)

**Interfaces:**
- Produces (Java):
  - `LegacyPrefs.migrate(SharedPreferences from, SharedPreferences to): boolean` copies every entry by its runtime type (String, Integer, Long, Float, Boolean, `Set<String>`) only when `to` is empty and `from` isn't, commits, then clears `from`. It returns whether it copied.
  - `WidgetPrefs.read(SharedPreferences p, String suffix, String fallback): String` reads `"bonamind_" + suffix`, then `"auramind_" + suffix`, then `fallback`.
- Produces (Kotlin, wear): `object LegacyPrefs { fun migrate(from: SharedPreferences, to: SharedPreferences): Boolean }`, with the same rules.
- New file names: `bonamind_spoken_reminder`, `bonamind_wear_grade_queue`. Widget keys: `bonamind_widget_due`, `bonamind_widget_deck`, `bonamind_widget_streak` (written by the web after Task 3).

- [ ] **Step 1: Write the failing tests.** `FakePrefs` is an in-memory `SharedPreferences` + `Editor`, and the Kotlin test has its own small fake.
  - `LegacyPrefsTest`:
    - `copiesEveryTypeThenClearsOld`: String, int, long, float, boolean and a String set all arrive, and `from.getAll()` is empty.
    - `leavesNonEmptyTargetAlone`: `to` holds `k=new`, `from` holds `k=old` → `to` is still `new`, `from` is untouched, and it returns false.
    - `noOpWhenOldIsEmpty`.
  - `WidgetPrefsTest`:
    - `newKeyWins`: both keys set → the new value.
    - `fallsBackToOldKey`: only `auramind_widget_due=7` → `"7"`.
    - `fallbackValueWhenNeither`.
  - Wear `LegacyPrefsTest.kt`: the same three cases as `LegacyPrefsTest`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd auramind-gemini/android && ./gradlew :app:testDebugUnitTest :wear:testDebugUnitTest`
Expected: FAIL to compile (`LegacyPrefs` and `WidgetPrefs` are undefined). If no JDK is available locally, ledger a ruling that CI's `Compile debug APK` step (now with `:app:testDebugUnitTest`) and the existing `:wear:testDebugUnitTest` step are the check, and keep going.

- [ ] **Step 3: Implement**
  - The helpers.
  - The receiver and GradeQueue `prefs(context)` helpers: `LegacyPrefs.migrate(ctx.getSharedPreferences("auramind_…"), ctx.getSharedPreferences("bonamind_…"))`, then return the new prefs.
  - The widget and tile read through `WidgetPrefs.read(prefs, "widget_due", "0")` and so on.
  - Swift keys `bonamind_widget_due`, `bonamind_widget_deck`, `bonamind_pending_route`.
  - The CI step.

- [ ] **Step 4: Run them to verify they pass**

Run: the Step 2 command.
Expected: BUILD SUCCESSFUL, with the new tests passing.

- [ ] **Step 5: Commit**

```bash
git add auramind-gemini/android auramind-gemini/ios/App/App/AuraMindIntents.swift .github/workflows/ci.yml
git commit -m "feat(android): move native prefs to bonamind names with a widget fallback"
```

### Task 6: PR1 wrap-up

- [ ] **Step 1: Full verification.** Run `cd auramind-gemini && npm run type-check && npm run lint && npm test -- --run && npm run build`, then `cd ../api && npm test`.
  Expected: all green. Record the counts.
- [ ] **Step 2: Update `HANDOFF.md`** with:
  - a "Rename — PR1" entry covering what moved, the marker key, and the offline-database rule;
  - the owner steps: ship Android and Windows builds; add `bonamind://auth/callback` to the Supabase redirect allow-list before PR3;
  - a trap: "`src/lib/legacyNames.ts` is the only web file allowed to spell legacy names".
  Commit it as `docs(handoff): rename PR1 storage migration`.
- [ ] **Step 3: Push and open the PR.** Title: `feat(rename): move stored data to BonaMind names (rename 1/4)`. The body summarises the spec stages and the owner steps. Then **stop for the owner's merge, the deploy and the native builds.**

---

# PR2 — Prof. Linnea and visible copy

Branch: `feat/rename-2-linnea`, from `main` after PR1 merges.

### Task 7: Website copy guard and the web/native copy sweep

**Files:**
- Test: `src/__tests__/visibleBrand.test.ts`
- Modify: every file that the test lists. This includes `src/lib/profAuraPersonality.ts` (text only), `src/lib/chat-prompts.ts`, the chat components, `android/app/src/main/res/values/strings.xml`, `ios/App/App/Info.plist` (`NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`), `src-tauri/tauri.conf.json` (product text only), `scripts/generate-android-assets.mjs`, `public/favicons,logos/favicon.svg` and `src/services/monitoring/sentryService.ts`.
- Rename: `store/graphics/prof-aura-variant-*.svg` → `prof-linnea-variant-*.svg`, plus any `public/**/prof-aura*` asset, along with their references.

- [ ] **Step 1: Write the failing test.** Scan `src/**` (excluding tests and `legacyNames.ts`), `public/**`, `index.html`, `strings.xml`, both `Info.plist` files and `tauri.conf.json` for `/AuraMind|Prof\.? ?Aura|ProfAura(?![A-Za-z])/`. Only text inside string literals, JSX text, XML and plist values counts, so code identifiers like `ProfAuraAvatar` (renamed in PR3) don't. The simplest form: strip identifiers matching `/\bProfAura[A-Z]\w*/` and import paths before matching. Report `file:line`.
- [ ] **Step 2: Run it to verify it fails**

Run: `cd auramind-gemini && npx vitest run src/__tests__/visibleBrand.test.ts`
Expected: FAIL, listing the copy hits.
- [ ] **Step 3: Replace the copy:** `Prof. Aura` → `Prof. Linnea`, a standalone tutor "Aura" → "Linnea" (read each hit; "aurora" and CSS class names stay), and `AuraMind` → `BonaMind`. Rename the avatar files with `git mv`. Run `npm run brand:sync` if `strings.xml` or the plists changed, then `node scripts/brand-sync.mjs`.
- [ ] **Step 4: Run it to verify it passes, plus the suite**

Run: `cd auramind-gemini && npx vitest run src/__tests__/visibleBrand.test.ts && npm test -- --run`
Expected: PASS. Update copy assertions and snapshots that name the tutor; never weaken the guard.
- [ ] **Step 5: Commit** as `feat(brand): Prof. Linnea and BonaMind in every visible string`.

### Task 8: API copy, store text, and PR2 wrap-up

**Files:**
- Modify: `api/stripe-webhook.ts` (email subjects and bodies), `api/index.ts:777,2352,2431` (description, `User-Agent: … BonaMind/1.0`), `api/server.js:117,126`, `api/scripts/verify-launch.mjs`, the tutor system prompt if the API holds one, `store/android/listing.md`, `store/android/listings/en-US/full_description.txt`, `store/android/changelogs/en-US.txt`, `store/PRE_LAUNCH_CHECKLIST.md`
- Test: `api/tests/brandCopy.test.ts`

- [ ] **Step 1: Write the failing test.** Read every `api/**/*.{ts,js,mjs}` file (excluding `node_modules` and tests) and fail on `/AuraMind|Prof\.? ?Aura/`, ignoring `auramind://` and `com.auramind.app`.
- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && npx vitest run tests/brandCopy.test.ts`
Expected: FAIL, listing `stripe-webhook.ts` hits.
- [ ] **Step 3: Replace the copy in the API and the store text files.**
- [ ] **Step 4: Run** `cd api && npm test`.
  Expected: all PASS.
- [ ] **Step 5: Commit** as `feat(brand): BonaMind in emails, API strings and store text`, then update HANDOFF ("Rename — PR2"; owner: paste the store text into Play Console). Open PR `feat(rename): Prof. Linnea and BonaMind copy (rename 2/4)` and **stop for the owner's merge.**

---

# PR3 — code names and `bonamind://` senders

Branch: `feat/rename-3-code`, from `main` after PR2 merges **and** after the owner confirms that the PR1 Android and Windows builds have shipped and Supabase lists `bonamind://auth/callback`.

### Task 9: Web code names

**Files:**
- Rename (with `git mv`): `src/components/auramind/` → `src/components/bonamind/`, and every file named for a renamed identifier:
  - `src/components/chat/ProfAura.tsx`
  - `src/components/ui/ProfAuraEmptyState.tsx`
  - `src/components/auramind/ProfAuraAvatar.tsx`
  - `src/hooks/useMoodForProfAura.ts`
  - `src/lib/profAuraPersonality.ts`
- Modify: every importer. Also `package.json` `"name": "bonamind"`, `src/__tests__/bugFixRegression.test.ts:746`, and `ComparisonSection.tsx` id `"bonamind"`.
- Test: extend `src/__tests__/visibleBrand.test.ts` with a second `it`: no identifier anywhere in `src/**` matches `/\b(ProfAura\w*|Aura(Mind)?[A-Z]\w*|useAuraMind|clampAuraScroll|VoiceAura|AndroidAura|AuraSans)\b/`.

- [ ] **Step 1: Add the identifier `it`, then run it to verify it fails**

Run: `cd auramind-gemini && npx vitest run src/__tests__/visibleBrand.test.ts`
Expected: FAIL, listing identifiers.
- [ ] **Step 2: Rename the identifiers and files.** The mapping is in Global Constraints: `ProfAura*`→`ProfLinnea*`, `Aura*`→`Bona*`, `useAuraMind`→`useBonaMind`, `clampAuraScroll`→`clampBonaScroll`, `AuraSans`→`BonaSans`.
  - Capacitor plugin registration names (`registerPlugin('AuraListen')` and the others) become `BonaListen`, `BonaLiveActivity`, `BonaLiveUpdate`, `BonaDevice` and `BonaSpeech`, **in lock-step with Tasks 10 and 11**.
  - Rename the CSS font-family token only if it isn't a webfont file name.
- [ ] **Step 3: Run** `npm run type-check && npm run lint && npm test -- --run && npm run build`.
  Expected: all green.
- [ ] **Step 4: Commit** as `refactor(web): BonaMind and Prof. Linnea code names`.

### Task 10: Android code names and the stand-ins

**Files:**
- Rename: `AuraDevicePlugin`, `AuraListenPlugin`, `AuraLiveUpdatePlugin`, `AuraSpeechPlugin` and `AuraSpeechEngine` → `Bona*`; `res/xml/auramind_widget_info.xml` → `bonamind_widget_info.xml`.
- Move the code of `AuraMindWidgetProvider.java` into `BonaMindWidgetProvider.java`, and of `wear/.../AuraMindTileService.kt` into `BonaMindTileService.kt`.
- Create stand-ins:
  - `AuraMindWidgetProvider.java`: `public class AuraMindWidgetProvider extends BonaMindWidgetProvider {}` with the spec's doc comment.
  - `AuraMindTileService.kt`: `class AuraMindTileService : BonaMindTileService()`. Make `BonaMindTileService` `open`.
- Modify: `MainActivity.java` plugin registrations, `@CapacitorPlugin(name = "Bona…")` to match Task 9, and both manifests (the meta-data resource name only; the `android:name` values stay).
- Test: `src/__tests__/androidIdentity.test.ts` (Review Focus 5), `android/app/src/test/java/com/auramind/app/StandInTest.java`, `android/wear/src/test/java/com/auramind/app/wear/StandInTest.kt`

- [ ] **Step 1: Write the failing tests.**
  - `androidIdentity.test.ts` reads the files as text and asserts:
    - the phone manifest has `android:name=".AuraMindWidgetProvider"` and no `.BonaMindWidgetProvider`;
    - the wear manifest has `android:name=".AuraMindTileService"` and no `.BonaMindTileService`;
    - `WearSyncPlugin.java` and `WearData.kt` both contain `"/auramind/sync"` and `"/auramind/grade"`;
    - both manifests keep `android:pathPrefix="/auramind"`;
    - `AuraMindWidgetProvider.java` matches `/extends BonaMindWidgetProvider\s*\{\s*\}/`.
  - `StandInTest.java`: `assertTrue(BonaMindWidgetProvider.class.isAssignableFrom(AuraMindWidgetProvider.class))`.
  - `StandInTest.kt`: the same check for the tile.
- [ ] **Step 2: Run them to verify they fail**

Run: `cd auramind-gemini && npx vitest run src/__tests__/androidIdentity.test.ts`
Expected: FAIL on the `extends BonaMindWidgetProvider` assertion.
- [ ] **Step 3: Do the renames and moves.**
- [ ] **Step 4: Run** `npx vitest run src/__tests__/androidIdentity.test.ts`, then `cd android && ./gradlew assembleDebug :app:testDebugUnitTest :wear:testDebugUnitTest :wear:assembleDebug`.
  Expected: PASS / BUILD SUCCESSFUL. If there's no local JDK, ledger a ruling that CI is the check.
- [ ] **Step 5: Commit** as `refactor(android): Bona* class names, stand-ins keep placed widgets and tiles`.

### Task 11: iOS code names

**Files:**
- Rename: `ios/App/App/AuraListenPlugin.swift`, `AuraLiveActivityPlugin.swift`, `AuraMindIntents.swift`, the folder `ios/App/AuraMindWidgets/` and `AuraMindWidgetsBundle.swift` → `Bona*` / `BonaMind*`. Types: `AuraMindSiri`, `AuraMindShortcuts`, `AuraMindVerb`/`Unverb`, `AuraMindWidgetsBundle` and the plugin classes.
- Modify: `ios/App/App.xcodeproj/project.pbxproj` (file references, group paths, the widget extension target name and product name, `INFOPLIST_FILE` paths), `.github/workflows/mobile-ios.yml:109` (the `AuraListen` grep → `BonaListen`), and any `Info.plist` mention.
- Test: `src/__tests__/iosNativeSource.test.ts`. Add a check that every `path = …;` in `project.pbxproj` that names a `.swift` or `Info.plist` file exists on disk under `ios/App/`, and that no `Aura` remains in `project.pbxproj`.

- [ ] **Step 1: Add the pbxproj checks, then run them to verify they fail**

Run: `cd auramind-gemini && npx vitest run src/__tests__/iosNativeSource.test.ts`
Expected: FAIL on "no Aura in project.pbxproj".
- [ ] **Step 2: Rename the files, folder and types, and edit `project.pbxproj` by hand.** Keep every object ID; change only names and paths. The `PRODUCT_BUNDLE_IDENTIFIER`s aren't Aura-named, so leave them.
- [ ] **Step 3: Run the test.**
  Expected: PASS. The authoritative check is the unsigned build in `mobile-ios.yml` on the PR, so ledger it as pending until CI reports.
- [ ] **Step 4: Commit** as `refactor(ios): BonaMind type and target names`.

### Task 12: Windows code names and the updater URL

**Files:**
- Modify: `src-tauri/Cargo.toml` (`name = "bonamind-desktop"`, lib `bonamind_desktop_lib`), `src-tauri/src/main.rs:5`, `src-tauri/src/guard.rs:19,59,70,71` (`bonamind.app`), `src-tauri/src/handoff.rs:78,106,107,112` (`bonamind-…`), the `src-tauri/src/links.rs` tests and doc comments (use `bonamind://` in examples and keep one `auramind://` case), `src-tauri/tauri.conf.json:82` (the updater URL from Global Constraints), `Cargo.lock`, and `src/__tests__/iosNativeSource.test.ts`, or the existing tauri config test if one asserts the endpoint.
- Test: a vitest case asserting the `tauri.conf.json` updater endpoint equals the Global Constraints URL and `identifier` is still `com.auramind.app`.

- [ ] **Step 1: Write the vitest case, then run it to verify it fails**

Run: `cd auramind-gemini && npx vitest run -t "updater endpoint"`
Expected: FAIL, because the URL still says AuraMind-App-2.
- [ ] **Step 2: Make the edits.** First confirm that `tauri.conf.json` has no `mainBinaryName` (the exe name comes from `productName: "BonaMind"`), so the crate rename doesn't change `BonaMind.exe`. Record that in the ledger.
- [ ] **Step 3: Run** the vitest case, plus `cargo test --manifest-path src-tauri/Cargo.toml` if Rust is installed locally. If it isn't, ledger a ruling that `desktop-windows.yml` is the check.
  Expected: PASS.
- [ ] **Step 4: Commit** as `refactor(desktop): bonamind crate names and the BonaMind updater URL`.

### Task 13: Switch link senders to `bonamind://`, and PR3 wrap-up

**Files:**
- Modify:
  - `src/components/auth/AuthPage.tsx:155` (`redirectTo: "bonamind://auth/callback"`) and `src/lib/env.ts:51` (comment)
  - `api/index.ts:2151` (default link `bonamind://app/dashboard`) and `api/_lib/push.ts:126` (comment)
  - `android/app/src/main/res/xml/shortcuts.xml:18,31,44`
  - `BonaDevicePlugin.java:126`, `BonaLiveUpdatePlugin.java:127`, `BonaMindWidgetProvider.java:150`, `QuickReviewTileService.java:39`
  - `BonaMindIntents.swift` `reviewURL`
  - `BonaMindWidgets/StudySessionLiveActivity.swift:84`
  - the comments that describe the scheme
- Test: `src/__tests__/linkSenders.test.ts`, which greps the files above and asserts no `auramind://` appears outside `legacyNames.ts`, `deepLinks.ts`, `deepLinkRouter.ts`, `links.rs`, `api/index.ts`'s accept-both check, `AndroidManifest.xml`, `Info.plist` and `tauri.conf.json`.

- [ ] **Step 1: Write the test, then run it to verify it fails**

Run: `cd auramind-gemini && npx vitest run src/__tests__/linkSenders.test.ts`
Expected: FAIL, listing the senders.
- [ ] **Step 2: Switch the senders.**
- [ ] **Step 3: Run the full verification:** web `type-check`, `lint`, `test`, `build`; then API `npm test`.
  Expected: green.
- [ ] **Step 4: Commit** as `feat(links): send bonamind:// links from every surface`.
- [ ] **Step 5: Update HANDOFF** ("Rename — PR3"). Owner steps: ship Android and Windows builds. Traps: the stand-in classes; the Wear paths; the old updater URL works only through GitHub's redirect, so never create a repo named `AuraMind-App-2`. Open the PR `refactor(rename): code names and bonamind:// links (rename 3/4)` and **stop for the owner's merge.**

---

# PR4 — docs, CI and the guard

Branch: `feat/rename-4-guard`, from `main` after PR3 merges.

### Task 14: Repo-wide guard script, docs, repo URLs, CHANGELOG

**Files:**
- Create: `scripts/check-brand.mjs` (repo root), `scripts/check-brand.test.mjs` (uses `node:test`), `scripts/fixtures/check-brand/` (planted files)
- Modify: `.github/workflows/ci.yml` (step `Brand guard` → `node scripts/check-brand.mjs` and `node --test scripts/check-brand.test.mjs`, placed in the first job before `Install dependencies`); `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `CONTRIBUTING.md` (clone URL `https://github.com/shipking-ai/BonaMind.git`, `cd BonaMind`), `HANDOFF.md`, `auramind-gemini/README.md`; root `package.json` (`repository.url`, `bugs.url`); `.github/ISSUE_TEMPLATE/config.yml`; workflow step and artifact names (`auramind-ios-unsigned-ipa` → `bonamind-ios-unsigned-ipa`); `CHANGELOG.md` (a new top entry for the rename)

**Interfaces:**
- Produces:
  - `scanBrand({ root, files }: { root: string; files: string[] }): { file: string; line: number; text: string }[]`, exported from `check-brand.mjs`.
  - The CLI runs `git ls-files`, prints each hit as `file:line: text`, and exits 1 on any hit.
- The pattern is `/AuraMind|auramind|Prof\.? ?Aura|ProfAura/`. The allow-list is an array of `{ test: (file, line) => boolean, reason: string }` holding exactly the spec's allow-list rows:
  - the permanent names in Global Constraints;
  - the stand-in files and both manifests;
  - `auramind-gemini/src/lib/legacyNames.ts`, the `// legacy-name: ok` lines, `deepLinks.ts`/`deepLinkRouter.ts`/`links.rs`/`api/index.ts` accept-both lines, the scheme registrations in `AndroidManifest.xml`/`Info.plist`/`tauri.conf.json`, the `LegacyPrefs` and `WidgetPrefs` callers' old names, and the IndexedDB legacy name (via `legacyNames.ts`);
  - `supabase/migrations/**`, `supabase/migrations-extra/**`;
  - `CHANGELOG.md` lines below the rename entry;
  - `docs/superpowers/**` files whose name starts with a date before `2026-10-13`;
  - `**/package-lock.json`;
  - binary files.

- [ ] **Step 1: Write the failing `node:test` cases** against the fixtures:
  - a planted `src/a.ts` with `const x = 'AuraMind';` on line 2 → one hit at `src/a.ts:2`;
  - `com.auramind.app`, `auramind-gemini/x`, `supabase/migrations/2026_x.sql` and `docs/superpowers/specs/2026-10-01-old.md` → zero hits;
  - `docs/superpowers/specs/2026-10-14-new.md` containing `AuraMind` → one hit;
  - `Prof. Aura` and `ProfAuraAvatar` → one hit each.
- [ ] **Step 2: Run them to verify they fail**

Run: `node --test scripts/check-brand.test.mjs`
Expected: FAIL, because `scanBrand` is missing.
- [ ] **Step 3: Implement the script.**
- [ ] **Step 4: Run** `node --test scripts/check-brand.test.mjs`.
  Expected: PASS.
- [ ] **Step 5: Run the guard on the repo**

Run: `node scripts/check-brand.mjs`
Expected at first: hits in docs and workflows. Rename those docs, URLs and workflow names (paths keep `auramind-gemini/`), and add the CHANGELOG entry, until the guard exits 0. Never add an allow-list entry that the spec doesn't list. If something new seems to need one, stop and ask the owner.
- [ ] **Step 6: Final verification.** Run `node scripts/check-brand.mjs && node --test scripts/check-brand.test.mjs`, then web `npm test -- --run`.
  Expected: exit 0 and green.
- [ ] **Step 7: Commit** as `ci(brand): repo-wide BonaMind guard; docs and repo URLs renamed`. Update HANDOFF with "Rename — done", the guard's location, and how to add an allow-list entry (it needs a reason, and the owner decides). Open the PR `ci(rename): docs and brand guard (rename 4/4)`.
