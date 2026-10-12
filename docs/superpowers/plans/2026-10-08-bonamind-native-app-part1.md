# BonaMind Native App — Part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a native Expo app (`mobile/`) with the Aurora + Paper look and the core loop (sign in → Today → study with swipe cards → Prof. Linnea), sharing scheduling and data logic with the website through `@bonamind/core`.

**Architecture:**
- `packages/core` is platform-free TypeScript. It holds the domain types, FSRS scheduling, review planning, Supabase queries, the offline outbox and the Linnea streaming client.
- The website and the mobile app each consume core through a `file:` dependency.
- The website's moved files become one-line re-exports, so none of its imports change.
- The mobile app uses Expo Router native tabs, Reanimated 4 and Skia for motion, `expo-sqlite` for offline data, and pushes reviews through core's outbox to the same `record_card_review` RPC and `cards` rows the website uses.

**Tech Stack:**
- TypeScript, Vitest (core and web), `ts-fsrs` ^5.4.2, `@supabase/supabase-js` ^2.117.2.
- Expo (latest stable SDK at kickoff, pinned exactly), Expo Router (native tabs).
- `react-native-reanimated` 4, `react-native-gesture-handler`, `@shopify/react-native-skia`.
- `expo-sqlite`, `expo-secure-store`, `expo-haptics`, `expo-symbols`, `expo-glass-effect`, `expo-blur`, `expo-font`, `react-native-webview`, `@react-native-community/netinfo`, `@tanstack/react-query` v5, `zustand`, `@sentry/react-native`.
- Jest (`jest-expo`) with React Native Testing Library; Maestro for end-to-end; EAS Build.

**Spec:** `docs/superpowers/specs/2026-10-08-bonamind-native-app-part1-design.md`

**Deviations from the spec (decided while planning, with evidence):**
1. **`file:` links instead of npm workspaces (spec §6.1).**
   - `ci.yml`, `mobile-android.yml`, `mobile-ios.yml` and Vercel all run `npm ci` inside `auramind-gemini/` against its own `package-lock.json`. Workspaces would replace that lockfile with a root one and break every one of those pipelines and the live deploy.
   - `"@bonamind/core": "file:../packages/core"` in each app keeps one source of truth and leaves the existing pipelines untouched.
2. **Review idempotency uses the existing key (spec §7).**
   - `record_card_review` (migration `20260916000000_card_reviews_history.sql`) already inserts `ON CONFLICT (user_id, card_id, reviewed_at) DO NOTHING`.
   - The outbox replays each review's original `reviewedAt`, so retries are idempotent with no client UUID and no migration.
   - Study sessions get a client UUID as `study_sessions.id`, inserted with an upsert that ignores duplicates.
3. **Courses = decks (spec §11 open item, resolved).** No migration creates a course table. A "course" in Part 1 is a `decks` row.

## Global Constraints

- Node `>=22.22.2` everywhere (matches both existing `package.json` engines fields).
- Dark theme only. Every color comes from `mobile/src/design/tokens.ts`; no hex literals in components.
- Fonts:
  - Display: Instrument Serif.
  - UI: **Bona Sans**, the Sora files copied as `BonaSans-*.ttf` with their OFL license.
  - Flourish: **Bona Script**, Great Vibes copied as `BonaScript-Regular.ttf`.
- Tutor name: **Prof. Linnea**. App name **BonaMind**, tagline **Your AI Learning System**.
- No new file, identifier, route, storage key or user-visible string in `packages/core/` or `mobile/` contains `auramind` or `Prof. Aura` (case-insensitive). Allowlisted exceptions:
  - the Android package `com.auramind.app` in `mobile/app.config.ts`;
  - the OFL license text's upstream copyright lines.
- App IDs: iOS `com.bonamind.app`, Android `com.auramind.app`. URL scheme: `bonamind`. OAuth redirect: `bonamind://auth/callback`.
- `@bonamind/core`:
  - `tsconfig` `lib: ["ES2022"]`, no DOM types.
  - No React, React Native, `import.meta.env` or `process.env` imports.
  - Dependencies are injected.
- Mobile env vars:
  - Only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL` (default `https://bonamind.app`), `EXPO_PUBLIC_TURNSTILE_SITE_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_APPLE_SIGN_IN` and `EXPO_PUBLIC_E2E`.
  - Each is read by static property access in `mobile/src/env.ts`. Never `process.env[name]`.
- All text uses the system font scaling (Dynamic Type); never set `allowFontScaling={false}`. Card faces scroll instead of shrinking text.
- Every animation respects Reduce Motion (it becomes a crossfade of 200 ms or less, or no motion) and the in-app haptics toggle.
- The website's `npm run type-check`, `npm run lint`, `npm test` and `npm run build` (in `auramind-gemini/`) stay green after every task that touches it.
- Conventional Commits; no AI attribution lines in commits or PRs.

## Review Focus

1. **Device clock ahead of real time.**
   - The risk: a review stamped in the future makes the conflict rule refuse every later schedule update from the website.
   - Expected: `reviewedAt` more than 5 minutes in the future is clamped to now when it's enqueued.
   - Test owner: Task 7.
2. **A card deleted on the website while its review is queued on the phone.**
   - The risk: the RPC raises `P0002`, and the item would retry five times.
   - Expected: `P0002`, `42501` and `22000` are permanent. The item goes to dead letter on its first failure, and flushing continues with the rest.
   - Test owners: Task 5 (error classification) and Task 7 (outbox behavior).
3. **App killed mid-session after rating 3 of 10.**
   - Expected: the 3 reviews are already in the outbox and flush on next launch. A partial `study_sessions` row (`cardsStudied: 3`) is enqueued when the app goes to the background.
   - Test owner: Task 18.
4. **New account with no decks, or decks with nothing due.**
   - Expected: Today shows "All caught up" with no Start review button. Courses shows an invitation to create on the web. Opening study on a deck with nothing due shows the completion state, not a crash.
   - Test owners: Tasks 15 and 18.
5. **Linnea's stream cut off mid-answer** (network drop, or an aborted request that wasn't a sheet close).
   - Expected: the partial text stays visible, followed by Linnea's network line and a retry chip. Closing the sheet aborts silently, with no error line.
   - Test owner: Task 19.

---

## File Structure

```
packages/core/
  package.json  tsconfig.json  vitest.config.ts
  src/index.ts                 barrel
  src/identity.ts              APP_NAME, APP_TAGLINE, TUTOR_NAME
  src/types.ts                 Card, Deck, StudySession, Rating, SRSResult, FSRSState, CardCitation, CardSourceType
  src/time.ts                  isoToMs, isoToMsOrUndef, msToIso
  src/scheduling/fsrs.ts       moved from auramind-gemini/src/services/study/fsrs.ts
  src/scheduling/srs.ts        moved from auramind-gemini/src/services/study/srs.ts
  src/review/planReview.ts     rating → schedule update + review record; row mapping
  src/stats.ts                 computeStreak, deriveRetention7d, dueCards
  src/data/rows.ts             mapCardRow, mapDeckRow, mapSessionRow
  src/data/queries.ts          createBonaMindData, PermanentSyncError
  src/sync/outbox.ts           createOutbox, createMemoryOutboxStore, OutboxItem, OutboxStore
  src/linnea/stream.ts         streamLinnea, LinneaError
  src/linnea/copy.ts           LINNEA_SYSTEM_PROMPT, linneaOpening, linneaErrorLine, LINNEA_CHIPS
  test/…                       Vitest specs, golden fixtures, brand-name guard
mobile/                        Expo app (created in Task 9)
  app.config.ts  eas.json  metro.config.js  jest.config.js
  app/_layout.tsx              providers, fonts, auth gate, Sentry
  app/(auth)/welcome.tsx
  app/(tabs)/_layout.tsx       NativeTabs: today, courses, you, search
  app/(tabs)/today.tsx  courses.tsx  you.tsx  search.tsx
  app/courses/[id].tsx  app/study/[deckId].tsx  app/linnea.tsx
  src/env.ts
  src/design/tokens.ts  motion.ts  haptics.ts  settings.ts
  src/design/components/…      PaperCard, GlassButton, SerifTitle, ProgressBar, CountUp, AuroraBackground, Confetti, OfflinePill
  src/study/CardStack.tsx  RatingBar.tsx  Celebration.tsx
  src/data/supabase.ts  secureStorage.ts  auth.ts  db.ts  sqliteOutboxStore.ts  cachedQuery.ts  sync.ts
  src/auth/TurnstileGate.tsx  oauth.ts  apple.ts
  src/linnea/useLinneaChat.ts
  assets/fonts/BonaSans-*.ttf  BonaScript-Regular.ttf  OFL-BonaSans.txt  OFL-BonaScript.txt
  e2e/core-loop.yaml  e2e/mint-session.mjs
.github/workflows/mobile.yml   (new)  ci.yml (core job added)
```

---

### Task 1: Scaffold `@bonamind/core` with identity, guards and CI

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`, `packages/core/src/identity.ts`, `packages/core/test/identity.test.ts`, `packages/core/test/brandNames.test.ts`, `packages/core/test/noPlatformApis.test.ts`
- Modify: `.github/workflows/ci.yml` (add a `core` job)

**Interfaces:**
- Produces:
  - `APP_NAME = 'BonaMind'`, `APP_TAGLINE = 'Your AI Learning System'`, `TUTOR_NAME = 'Prof. Linnea'`, all exported from `@bonamind/core`.
  - Package name `@bonamind/core`, `"main": "src/index.ts"`, `"types": "src/index.ts"`, `"private": true`. Source-only: consumers transpile it.
  - Scripts: `test` (`vitest run`), `type-check` (`tsc --noEmit`).
  - `ts-fsrs` and `@supabase/supabase-js` as `peerDependencies` and as `devDependencies` at the website's exact versions (`^5.4.2`, `^2.117.2`).

- [ ] **Step 1: Write the failing tests**

```ts
// test/identity.test.ts
import { APP_NAME, APP_TAGLINE, TUTOR_NAME } from '../src';
it('names the product and tutor', () => {
  expect(APP_NAME).toBe('BonaMind');
  expect(APP_TAGLINE).toBe('Your AI Learning System');
  expect(TUTOR_NAME).toBe('Prof. Linnea');
});

// test/brandNames.test.ts — walks packages/core/src, packages/core/test and (if present) ../../mobile/{app,src,e2e,app.config.ts}
it('contains no legacy brand names', () => {
  const offenders = scan(roots, /auramind|prof\.?\s*aura\b/i, ALLOW);
  expect(offenders).toEqual([]);
});
// ALLOW = [{ file: 'mobile/app.config.ts', match: 'com.auramind.app' }]; skips *.ttf, OFL-*.txt, node_modules, and this test file itself

// test/noPlatformApis.test.ts
it('core source never touches browser or RN globals', () => {
  expect(grepSrc(/\b(window|document|localStorage|import\.meta\.env|process\.env|from ['"]react(-native)?['"])/)).toEqual([]);
});
```

- [ ] **Step 2: Run** `cd packages/core && npm install && npm test`. Expected: FAIL (`../src` has no exports).
- [ ] **Step 3: Implement** `identity.ts`, the barrel, and `tsconfig.json`: `strict`, `lib: ["ES2022"]`, `types: []`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `noEmit`.
- [ ] **Step 4: Run** `npm test && npm run type-check`. Expected: all PASS.
- [ ] **Step 5: Add the CI `core` job** in `ci.yml`: Node 22.x, `cache-dependency-path: packages/core/package-lock.json`, `cd packages/core && npm ci && npm run type-check && npm test`.
- [ ] **Step 6: Commit** `feat(core): scaffold @bonamind/core with identity and brand guard`

---

### Task 2: Move domain types into core and link core into the website

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/time.ts`, `packages/core/test/time.test.ts`
- Modify:
  - `auramind-gemini/src/types/index.ts`: replace the definitions of `CardSourceType`, `CardCitation`, `FSRSState`, `Card`, `Deck`, `StudySession`, `Rating`, `SRSResult` with `export { … } from '@bonamind/core'` (and `export type` for the type-only ones).
  - `auramind-gemini/package.json`: add `"@bonamind/core": "file:../packages/core"`.
  - `auramind-gemini/vite.config.ts`: `resolve.dedupe: ['ts-fsrs', '@supabase/supabase-js']`; make sure Vitest transpiles the linked TypeScript source (`server.deps.inline: ['@bonamind/core']`).
  - `.github/workflows/ci.yml`, `mobile-android.yml`, `mobile-ios.yml`, `desktop-windows.yml`: before `npm ci` in `auramind-gemini/`, nothing else is needed, because `file:` installs a symlink. Add `packages/core/**` to the `paths:` filters of `mobile-android.yml` and `mobile-ios.yml`.

**Interfaces:**
- Produces:
  - Core exports the eight types above, with identical shapes. `Rating` stays a numeric enum: `AGAIN = 0`, `HARD = 3`, `GOOD = 4`, `EASY = 5`.
  - `isoToMs(v: string | number | null | undefined, fallback: number): number`
  - `isoToMsOrUndef(v: string | number | null | undefined): number | undefined`
  - `msToIso(ms: number): string`

- [ ] **Step 1: Write `time.test.ts`**
  - `isoToMs('2026-10-08T00:00:00.000Z', 0) === 1791417600000`
  - `isoToMs(null, 5) === 5`
  - `isoToMsOrUndef('garbage') === undefined`
  - `msToIso(1791417600000) === '2026-10-08T00:00:00.000Z'`
- [ ] **Step 2: Run** `npm test` in core. Expected: FAIL.
- [ ] **Step 3: Implement** `time.ts` and `types.ts`. Copy the type definitions verbatim from `auramind-gemini/src/types/index.ts:1-97`, keeping their comments.
- [ ] **Step 4: Run** core `npm test && npm run type-check`. Expected: PASS.
- [ ] **Step 5: Link and verify the website.** Run `cd auramind-gemini && npm install && npm run type-check && npm run lint && npm test && npm run build`. Expected: all green. This is the proof that the link works under Vite, Vitest and `tsc`.
- [ ] **Step 6: Check Vercel.** In the Vercel project for the site, open Settings → General and confirm "Include files outside the root directory in the Build Step" is enabled. It's the default for projects created after 2023. Push the branch and confirm the preview deploy builds. **If this setting is off, stop and ask the owner to enable it.**
- [ ] **Step 7: Commit** `refactor(core): move domain types into @bonamind/core and link the website`

---

### Task 3: Move FSRS scheduling into core, guarded by golden fixtures

**Files:**
- Create: `packages/core/test/goldenHistories.ts`, `packages/core/test/__golden__/scheduling.json` (generated), `packages/core/test/schedulingGolden.test.ts`, `auramind-gemini/src/__tests__/schedulingGolden.test.ts`
- Move: `auramind-gemini/src/services/study/fsrs.ts` → `packages/core/src/scheduling/fsrs.ts`; `…/srs.ts` → `packages/core/src/scheduling/srs.ts` (imports change to `../types`)
- Modify: the website's `fsrs.ts` and `srs.ts` become `export * from '@bonamind/core/src/scheduling/fsrs'` (and `…/srs`). Core has no `exports` map, so deep paths resolve. Core's barrel re-exports both.
- Test: the existing `fsrsScheduler.test.ts`, `srs.test.ts` and `fsrsAdaptation.test.ts` stay in the website, unchanged.

**Interfaces:**
- Produces, unchanged in name and signature:
  - `scheduleFSRS`, `calculateSRS(card, rating, weightsOverride?, retentionOverride?)`, `previewIntervals`, `formatInterval`, `getFSRSState`, `createInitialFSRSState`, `fsrsToCardResult`, `applyPersonalizedDifficultyInit`
  - `FSRS_PARAMETERS`, `DEFAULT_WEIGHTS`, `PROFILE_DIFFICULTY_CENTER`
  - every other current export of both files
- `goldenHistories.ts` exports `GOLDEN_HISTORIES: { name: string; card: Card; ratings: Rating[] }[]` with these six histories:
  1. new card, Good ×4
  2. new card, Again then Good ×3
  3. new card, Easy ×3
  4. new card, Hard, Good, Again, Good
  5. legacy SM-2 card (`interval: 10, easeFactor: 2.5, repetition: 4`, no `fsrsState`, `lastReviewed` 10 days before), Good
  6. card with `fsrsState { repetitions: 0, difficulty: 3, … }`, Good
- `runHistory(h, calc: typeof calculateSRS)` starts with the clock at `2026-01-01T09:00:00Z` (`vi.setSystemTime`). It applies each rating, merges the result into the card (`nextReview`, `lastReviewed`, `fsrsState`), advances the clock by the returned interval in days, and returns the per-step results.

- [ ] **Step 1: Write the website golden test first, against the current code.** `expect(GOLDEN_HISTORIES.map(h => runHistory(h, calculateSRS))).toMatchFileSnapshot('../../../packages/core/test/__golden__/scheduling.json')`, importing `calculateSRS` from `../services/study/srs` and the histories from `../../../packages/core/test/goldenHistories`.
- [ ] **Step 2: Generate** the fixture: `cd auramind-gemini && npx vitest run src/__tests__/schedulingGolden.test.ts -u`. Expected: the `scheduling.json` file is created. Commit it **before** moving code: `test(core): golden scheduling fixtures from the current scheduler`.
- [ ] **Step 3: Write** core's `schedulingGolden.test.ts`, the same assertion against `../src/scheduling/srs`. Run it. Expected: FAIL (module missing).
- [ ] **Step 4: Move** `fsrs.ts` and `srs.ts` into core (`git mv`, then leave re-export stubs at the old paths).
- [ ] **Step 5: Run** core `npm test` (no `-u`). Expected: PASS, so the golden output is identical. Then run the website's `npm run type-check && npm test && npm run build`. Expected: all green, including the existing FSRS and SRS suites and the website golden test.
- [ ] **Step 6: Commit** `refactor(core): move FSRS scheduling into @bonamind/core`

---

### Task 4: `planReview`: one function for "rating → update + record"

**Files:**
- Create: `packages/core/src/review/planReview.ts`, `packages/core/test/planReview.test.ts`
- Modify: `auramind-gemini/src/services/study/rateCard.ts`. It builds `update` from `planReview(card, rating, Date.now()).update`; everything else stays as it is.

**Interfaces:**
- Produces:

```ts
export interface CardScheduleUpdate {
  interval: number; repetition: number; easeFactor: number;
  nextReview: number; lastReviewed: number; fsrsState?: FSRSState;
}
export interface ReviewRecord {
  cardId: string; rating: Rating; reviewedAt: number; srsResult: SRSResult;
}
export function planReview(
  card: Card, rating: Rating, reviewedAt: number,
  opts?: { weightsOverride?: number[]; retention?: number },
): { update: CardScheduleUpdate; record: ReviewRecord };
export function toCardScheduleRow(u: CardScheduleUpdate): {
  interval: number; repetition: number; ease_factor: number;
  next_review: string; last_reviewed: string; fsrs_state?: FSRSState;
};
```

- [ ] **Step 1: Write tests.**
  - `planReview(newCard, Rating.GOOD, T).update.nextReview === T + update.interval * 86_400_000`
  - `update.lastReviewed === T`
  - `record.srsResult` equals `calculateSRS(newCard, Rating.GOOD)` field for field
  - `toCardScheduleRow` maps to snake_case with ISO strings: `next_review === msToIso(T + interval*86_400_000)`
  - `fsrs_state` is omitted when `fsrsState` is undefined
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** both functions. The update's numbers match `rateCard.ts:20-29` exactly.
- [ ] **Step 4: Run** core tests, then the website's `npm test -- rateCard bugFixRegression`. Expected: PASS. `rateCard.test.ts` is unchanged and green.
- [ ] **Step 5: Commit** `feat(core): planReview shared by web rateCard and mobile`

---

### Task 5: Core data queries and row mappers

**Files:**
- Create: `packages/core/src/data/rows.ts`, `packages/core/src/data/queries.ts`, `packages/core/test/rows.test.ts`, `packages/core/test/queries.test.ts`, `packages/core/test/fakeSupabase.ts`

**Interfaces:**
- Consumes: `toCardScheduleRow`, `CardScheduleUpdate`, `ReviewRecord` (Task 4); `isoToMs`, `msToIso` (Task 2).
- Produces:

```ts
export function mapCardRow(row: Record<string, any>): Card;      // same fields as cardService.ts:145-169
export function mapDeckRow(row: Record<string, any>, cardCount: number): Deck; // deckService.ts:41-49
export function mapSessionRow(row: Record<string, any>): StudySession;        // sessionService.ts:87+
export class PermanentSyncError extends Error { constructor(public code: string, message: string) }
export type NewStudySession = Omit<StudySession, 'userId'> & { id: string; deckId: string };
export interface BonaMindData {
  listDecks(userId: string): Promise<Deck[]>;
  listCards(userId: string): Promise<Card[]>;
  listStudySessions(userId: string): Promise<StudySession[]>;
  getDisplayName(userId: string): Promise<string | null>;     // user_profiles.full_name
  pushReview(userId: string, record: ReviewRecord, update: CardScheduleUpdate): Promise<void>;
  pushStudySession(userId: string, s: NewStudySession): Promise<void>;
}
export function createBonaMindData(client: SupabaseClient): BonaMindData;
```

- `pushReview` does two things, in this order:
  1. `rpc('record_card_review', { p_user_id, p_card_id, p_rating, p_srs_result, p_srs_algorithm: 'fsrs', p_reviewed_at: msToIso(record.reviewedAt) })`
  2. `from('cards').update(toCardScheduleRow(update)).eq('id', cardId).or('last_reviewed.is.null,last_reviewed.lt.' + iso)`. This is the conflict rule: a newer server review is never overwritten.
- `pushStudySession`: `from('study_sessions').upsert({ id, user_id, deck_id, started_at, ended_at, cards_studied, correct_answers, total_answers, accuracy, duration_ms }, { onConflict: 'id', ignoreDuplicates: true })`.
- Errors whose code is `P0002`, `42501` or `22000` throw `PermanentSyncError`. All other errors are rethrown as they are.

- [ ] **Step 1: Write `rows.test.ts`.** Cover each mapper with a real-shaped row: ISO timestamps become milliseconds, `fsrs_state` given as a JSON string gets parsed, and `ease_factor` null becomes `2.5`.
- [ ] **Step 2: Write `queries.test.ts`** against `fakeSupabase` (records each call; returns scripted `{ data, error }`):
  - `pushReview` calls the RPC with `p_reviewed_at === '2026-10-08T12:00:00.000Z'` and then `update` with `.or('last_reviewed.is.null,last_reviewed.lt.2026-10-08T12:00:00.000Z')`.
  - An RPC error `{ code: 'P0002' }` rejects with `PermanentSyncError` with code `'P0002'`, and the `update` is not called.
  - An RPC error `{ code: '08006' }` rejects with a plain `Error` (transient).
  - `pushStudySession` upserts with `onConflict: 'id', ignoreDuplicates: true`.
  - `listDecks` attaches `cardCount` from the `cards.deck_id` counts.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(core): Supabase queries and row mappers for mobile`

---

### Task 6: Move study stats into core

**Files:**
- Create: `packages/core/src/stats.ts`, `packages/core/test/stats.test.ts`
- Modify: `auramind-gemini/src/hooks/useStudyStats.ts`. Import `computeStreak`, `deriveRetention7d` and `toLocalDateKey` from `@bonamind/core` and delete the local copies. `deriveRetention7d` stays re-exported from this file, because the website's test imports it from here.

**Interfaces:**
- Produces:
  - `computeStreak(sessions: StudySession[], now?: Date): number`
  - `deriveRetention7d(sessions: StudySession[], now?: number): number | undefined`
  - `toLocalDateKey(v: number | string | Date): string`
  - `dueCards(cards: Card[], now: number): Card[]`: cards with `nextReview <= now`, sorted by `nextReview` ascending.

- [ ] **Step 1: Write tests.**
  - Sessions on Oct 6, 7 and 8, with now = Oct 8 → streak 3.
  - Sessions on Oct 6 and 7, with now = Oct 8 → streak 2 (yesterday anchors the streak).
  - Sessions on Oct 5 and 6, with now = Oct 8 → 0.
  - `dueCards` excludes a card due one minute in the future.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** by moving the bodies from `useStudyStats.ts:25-95`, with `now` injected.
- [ ] **Step 4: Run** core tests and the website's `npm test -- useStudyStats`. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(core): share streak and retention stats`

---

### Task 7: Offline outbox

**Files:**
- Create: `packages/core/src/sync/outbox.ts`, `packages/core/test/outbox.test.ts`

**Interfaces:**
- Consumes: `BonaMindData.pushReview` and `pushStudySession`, `PermanentSyncError`, `NewStudySession` (Task 5).
- Produces:

```ts
export const MAX_ATTEMPTS = 5;
export const MAX_FUTURE_SKEW_MS = 5 * 60_000;
type Base = { id: string; userId: string; reviewedAt: number; attempts: number };
export type OutboxItem =
  | (Base & { kind: 'review'; record: ReviewRecord; update: CardScheduleUpdate })
  | (Base & { kind: 'session'; session: NewStudySession });
export interface OutboxStore {
  add(item: OutboxItem): Promise<void>;
  list(userId: string): Promise<OutboxItem[]>;          // ordered by reviewedAt ASC, then id
  update(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
  moveToDeadLetter(item: OutboxItem, reason: string): Promise<void>;
  clearOtherUsers(userId: string): Promise<number>;
}
export function createMemoryOutboxStore(): OutboxStore;
export function createOutbox(deps: {
  store: OutboxStore;
  data: Pick<BonaMindData, 'pushReview' | 'pushStudySession'>;
  now?: () => number;
  newId?: () => string;
  onDeadLetter?: (item: OutboxItem, reason: string) => void;
}): {
  enqueueReview(userId: string, record: ReviewRecord, update: CardScheduleUpdate): Promise<void>;
  enqueueSession(userId: string, session: NewStudySession): Promise<void>;
  flush(userId: string): Promise<{ sent: number; dead: number; stoppedEarly: boolean }>;
  pending(userId: string): Promise<number>;
  adoptUser(userId: string): Promise<number>;   // = store.clearOtherUsers(userId); called on every sign-in
};
```

**Rules:**
- `flush` processes the list in order.
- A transient error increments `attempts`, stops the flush (preserving order), and returns `stoppedEarly: true`.
- When `attempts` reaches `MAX_ATTEMPTS`, or the error is a `PermanentSyncError`, the item goes to dead letter and the flush continues.

- [ ] **Step 1: Write tests** using a memory store and a scripted fake `data`:
  - `flushes in reviewedAt order`: enqueue reviews stamped T+2 then T+1, flush → `pushReview` is called for T+1 first.
  - `retry after a lost response is harmless`: the first push succeeds but the test's store fails `remove` once; the next flush pushes the same `reviewedAt` again and the item is then removed. Assert both calls carry the identical `reviewedAt`.
  - `transient failure stops the flush`: the second item throws `Error('net')` → `{ sent: 1, stoppedEarly: true }`, the third item is not attempted, and the second item has `attempts === 1`.
  - `dead-letters after 5 attempts`.
  - **Review Focus 2:** `PermanentSyncError('P0002')` dead-letters on its first failure, and the flush continues to the next item.
  - **Review Focus 1:** with `now = T` and `record.reviewedAt = T + 10 * 60_000`, the stored item's `reviewedAt === T`, and both `record.reviewedAt` and `update.lastReviewed` are clamped to `T`.
  - `adoptUser('u2')` removes items queued by `'u1'`, and `pending('u2') === 0`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): offline outbox with ordered, idempotent replay`

---

### Task 8: Prof. Linnea streaming client and copy

**Files:**
- Create: `packages/core/src/linnea/stream.ts`, `packages/core/src/linnea/copy.ts`, `packages/core/test/linneaStream.test.ts`, `packages/core/test/linneaCopy.test.ts`

**Interfaces:**
- Produces:

```ts
export type LinneaMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LinneaErrorKind = 'busy' | 'rate_limited' | 'unavailable' | 'auth' | 'network';
export class LinneaError extends Error { constructor(public kind: LinneaErrorKind, message?: string) }
export function streamLinnea(opts: {
  apiBaseUrl: string; token: string; messages: LinneaMessage[];
  signal?: AbortSignal; fetchImpl?: typeof fetch;
}): AsyncGenerator<string>;
export const LINNEA_SYSTEM_PROMPT: string;
export const LINNEA_CHIPS: readonly ['Quiz me', 'Explain it simply'];
export function linneaOpening(weak: Pick<Card, 'front' | 'lapses'>[], firstName?: string | null): string;
export function linneaErrorLine(kind: LinneaErrorKind): string;
```

- **Request:** `POST ${apiBaseUrl}/api/ai/chat/stream` with headers `Authorization: Bearer ${token}` and `Content-Type: application/json`, and body `{ messages, temperature: 0.7, max_tokens: 1200, stream: true }`. No `model`; the server uses its allowlisted default.
- **Response parsing:** read lines starting `data: `. Yield `choices[0].delta.content` when it's a non-empty string, and stop at `data: [DONE]`.
- **Status → error kind:** 429 → `rate_limited`; 503 → `unavailable`; 401 or 403 → `auth`; any other non-2xx → `busy`; a thrown fetch or body read error → `network`. An abort is rethrown as is, so callers can tell it apart.
- **Copy** (exact):
  - `LINNEA_SYSTEM_PROMPT`: "You are Prof. Linnea, the tutor inside BonaMind. You are warm, precise and brief: two to four sentences unless asked for more. You teach by asking one good question at a time, use vivid everyday analogies, and never shame a mistake. When the student is weak on a topic, offer a short fix they can do in three minutes."
  - `linneaOpening([])` (with no name) → "Hi, I'm Prof. Linnea. What are you studying today?"
  - With weak cards: "Hey {firstName}. {front of the card with the most lapses, truncated to 60 chars} keeps tripping you up. Want a three-minute fix?" With no first name, the line starts "Hey there."
  - `linneaErrorLine`:
    - `busy` and `unavailable`: "I'm a little overloaded. Try me again in a moment."
    - `rate_limited`: "We've been talking a lot. Give me a minute to catch my breath."
    - `auth`: "Your session expired. Sign in again and I'll be right here."
    - `network`: "I can't reach the internet right now. Your cards still work offline."

- [ ] **Step 1: Write stream tests** with a fake `fetchImpl` whose body is a `ReadableStream` that emits SSE chunks split mid-line:
  - It yields `['Meta', 'phase']` from two deltas.
  - It stops at `[DONE]`, even when more chunks follow.
  - Statuses 429, 503 and 401 reject with the right `kind`.
  - A rejected `fetchImpl` gives `network`.
  - An aborted `signal` gives a `DOMException` named `AbortError`, not a `LinneaError`.
  - It sends exactly the body above, with no `model` key.
- [ ] **Step 2: Write copy tests** for every exact string above, the 60-character truncation (ending with "…"), and the pick of the highest-lapse card.
- [ ] **Step 3: Run.** Expected: FAIL. **Step 4: Implement.** **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(core): Prof. Linnea streaming client and voice`

---

### Task 9: Scaffold the Expo app `mobile/`

**Files:**
- Create: `mobile/` via `npx create-expo-app@latest mobile --template default`, then trim the template screens.
- Create: `app.config.ts`, `eas.json`, `metro.config.js`, `jest.config.js`, `src/env.ts`, `src/__tests__/env.test.ts`, `src/__tests__/appConfig.test.ts`, `assets/fonts/*`, `.github/workflows/mobile.yml`
- Modify: `packages/core/test/brandNames.test.ts` now scans `mobile/` as well; it skips the scan if the folder is absent.

**Interfaces:**
- Consumes: `APP_NAME` (Task 1).
- Produces:
  - `env`: `{ supabaseUrl, supabaseAnonKey, apiBaseUrl, turnstileSiteKey, sentryDsn?, appleSignIn: boolean, e2e: boolean }`, each read by static `process.env.EXPO_PUBLIC_*` access.
  - `app.config.ts`:
    - `name: APP_NAME`, `slug: 'bonamind'`, `scheme: 'bonamind'`, `userInterfaceStyle: 'dark'`, `newArchEnabled: true`.
    - `ios.bundleIdentifier: 'com.bonamind.app'`, `android.package: 'com.auramind.app'`.
    - `android.versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1)`.
    - Plugins: `expo-router`, `expo-font`, `expo-secure-store`, `expo-sqlite`, `@sentry/react-native/expo`, `expo-apple-authentication`.

- [ ] **Step 1: Create** the app, then pin every `expo*`, `react-native*` and `react*` dependency to the exact installed version (remove `^`). Record the Expo SDK major version in `mobile/README.md`. Add `"@bonamind/core": "file:../packages/core"`.
- [ ] **Step 2: Configure Metro** for the linked package: `watchFolders: [path.resolve(__dirname, '../packages/core')]`, `resolver.nodeModulesPaths: [path.resolve(__dirname, 'node_modules')]`, and `resolver.disableHierarchicalLookup: true`, so `ts-fsrs` and `@supabase/supabase-js` resolve from `mobile/node_modules` only.
- [ ] **Step 3: Add the fonts.**
  - Copy `auramind-gemini/public/fonts/AuraSans-{Regular,Italic,Bold,BoldItalic}.ttf` → `mobile/assets/fonts/BonaSans-*.ttf`, and `AuraScript-Regular.ttf` → `BonaScript-Regular.ttf`.
  - Copy the OFL texts as `OFL-BonaSans.txt` and `OFL-BonaScript.txt`. Keep the upstream copyright lines unchanged.
  - Add `@expo-google-fonts/instrument-serif`.
- [ ] **Step 4: Write tests.**
  - `appConfig.test.ts`: bundle ID, package, scheme and name are as above.
  - `env.test.ts`: `src/env.ts` source contains no `process.env[`; `apiBaseUrl` defaults to `'https://bonamind.app'`.
- [ ] **Step 5: Run** `cd mobile && npx jest`. Expected: PASS. Run `npx tsc --noEmit` and `npx expo export --platform ios --dev false` (to prove that Metro resolves core). Expected: success.
- [ ] **Step 6: Add `.github/workflows/mobile.yml`.** It runs on PRs touching `mobile/**` or `packages/core/**`: Node 22.x; `npm ci` in core and in mobile; `npx tsc --noEmit`; `npx eslint .`; `npx jest --ci`; core `npm test`.
- [ ] **Step 7: Commit** `feat(mobile): scaffold the BonaMind Expo app`

---

### Task 10: Design tokens, motion, haptics and settings

**Files:**
- Create: `mobile/src/design/tokens.ts`, `motion.ts`, `haptics.ts`, `settings.ts`, `mobile/src/design/__tests__/motion.test.tsx`, `haptics.test.ts`

**Interfaces:**
- Produces:
  - `colors` (spec §4.1 values):
    - `night: '#0A0A0F'`, `surface: '#15151E'`, `raised: '#1A1A24'`
    - `violet: '#7C3AED'`, `violetBright: '#8B5CF6'`, `violetSoft: '#A78BFA'`, `violetMist: '#C4B5FD'`
    - `cyan: '#22D3EE'`, `pink: '#EC4899'`
    - `paper: '#F5EFE3'`, `ink: '#1C1917'`, `inkMuted: '#78716C'`
    - `good: '#34D399'`, `again: '#F87171'`, `hard: '#FCD34D'`, `streak: '#FB923C'`
    - `text: '#F0EFFE'`, `textMuted: '#9090A8'`
  - `fonts`: `{ display: 'InstrumentSerif_400Regular', displayItalic: 'InstrumentSerif_400Regular_Italic', ui: 'BonaSans', uiBold: 'BonaSans-Bold', script: 'BonaScript' }`.
  - `radius`: `{ card: 24, tile: 18, pill: 999 }`.
  - `springs`, a record of Reanimated `WithSpringConfig`:
    - `rise { damping: 14, stiffness: 160 }`
    - `flip { damping: 12, stiffness: 140 }`
    - `pop { damping: 10, stiffness: 220 }`
    - `sheet { damping: 18, stiffness: 200 }`
    - `settle { damping: 16, stiffness: 180 }`
  - `useMotion(): { reduce: boolean; spring(name: keyof typeof springs): WithSpringConfig | { duration: number } }`. When `reduce` is true it returns `{ duration: 180 }`.
  - `haptic(kind: 'light' | 'selection' | 'success' | 'warning'): void`. A no-op when `useSettings.getState().hapticsEnabled` is false.
  - `useSettings`: a zustand store `{ hapticsEnabled: boolean; setHapticsEnabled(v: boolean): void }`, persisted with `expo-secure-store` under the key `bonamind.settings`.

- [ ] **Step 1: Write tests.**
  - With `useReducedMotion` mocked to true, `spring('flip')` returns `{ duration: 180 }`; with it false, it returns `springs.flip`.
  - With `hapticsEnabled = false`, `haptic('success')` does not call `Haptics.notificationAsync`.
  - With it true, `success` maps to `NotificationFeedbackType.Success` and `light` maps to `ImpactFeedbackStyle.Light`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): design tokens, motion and haptics wrappers`

---

### Task 11: Core components

**Files:**
- Create: `mobile/src/design/components/{PaperCard,GlassButton,SerifTitle,ProgressBar,CountUp,OfflinePill}.tsx`, `mobile/src/design/components/__tests__/components.test.tsx`

**Interfaces:**
- Consumes: Task 10.
- Produces:
  - `PaperCard({ children, style? })`: opaque paper background, `radius.card`.
  - `GlassButton({ symbol, androidIcon, label, onPress })`: an icon-only button. On iOS it uses `expo-symbols` `SymbolView`, wrapped in `GlassView` from `expo-glass-effect` when `isLiquidGlassAvailable()`, otherwise a `BlurView`. On Android it's a ripple button with a Material icon. `label` is the accessibility label.
  - `SerifTitle({ children, size: 'large' | 'title' | 'card', italic? })`.
  - `ProgressBar({ value: number /* 0..1 */, color })`: animates width with `springs.settle`.
  - `CountUp({ to: number, durationMs = 900 })`: eases out over the duration; shows `to` immediately when motion is reduced.
  - `OfflinePill({ visible })`: the text "Offline · reviews will sync", in a glass pill.

- [ ] **Step 1: Write tests.**
  - `CountUp` shows its final value immediately when `useMotion().reduce` is true.
  - `ProgressBar` clamps a value of 1.4 to 100%.
  - `GlassButton` exposes `accessibilityRole="button"` and its label.
  - `OfflinePill` renders the exact text and renders nothing when `visible={false}`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): paper, glass and type components`

---

### Task 12: Aurora background and confetti (Skia)

**Files:**
- Create: `mobile/src/design/components/AuroraBackground.tsx`, `Confetti.tsx`, `__tests__/aurora.test.tsx`

**Interfaces:**
- Produces:
  - `AuroraBackground({ intensity?: number /* 0..1, default 0.6 */, warmth?: SharedValue<number> /* 0..1 */ })`.
    - A full-screen Skia `Canvas` with three drifting glows, using `colors.violet`, `colors.cyan` and `colors.pink` (radial gradients with blur 40). Drift cycles are 9 s, 11 s and 13 s.
    - A fourth glow follows the touch point (from a `Gesture.Manual` on the parent) with a 1.2 s lag.
    - `warmth` tints the violet glow toward `colors.pink` as it rises.
    - The drift runs on the UI thread through shared values, never through React state.
  - `Confetti({ trigger: number, origin: { x: number; y: number }, mode: 'burst' | 'rain' })`: 40 particles for a burst, 80 for rain, in the six accent colors. Each change to `trigger` fires it once.
- Both components are static when motion is reduced: the aurora drawn once with no drift and no finger glow, and confetti renders nothing.

- [ ] **Step 1: Write tests** (Skia is mocked via `@shopify/react-native-skia/lib/module/mock`):
  - With motion reduced, `AuroraBackground` starts no `withRepeat` animation; spy on `withRepeat` and expect 0 calls.
  - With motion reduced, `Confetti` renders no particles.
  - A burst renders 40 particles and rain renders 80.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Manual check.** Run on the Android emulator (`npx expo run:android`) and watch the performance monitor: at least 58 fps on the Today screen while dragging. Record the result in the commit message body.
- [ ] **Step 6: Commit** `feat(mobile): GPU aurora and confetti`

---

### Task 13: Auth session: Supabase client, chunked secure storage, sign-in methods

**Files:**
- Create: `mobile/src/data/secureStorage.ts`, `supabase.ts`, `auth.ts`, `mobile/src/auth/TurnstileGate.tsx`, `oauth.ts`, `apple.ts`, `mobile/src/data/__tests__/secureStorage.test.ts`, `mobile/src/auth/__tests__/oauth.test.ts`

**Interfaces:**
- Consumes: `env` (Task 9).
- Produces:
  - `chunkedSecureStorage: { getItem(k): Promise<string|null>; setItem(k, v): Promise<void>; removeItem(k): Promise<void> }`.
    - Values are split into 1800-character chunks under `${k}.0…n`, with the count stored in `${k}.n`.
    - `removeItem` deletes every chunk.
  - `supabase`: `createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { storage: chunkedSecureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`. It also calls `startAutoRefresh` and `stopAutoRefresh` on `AppState` changes.
  - `useAuth(): { status: 'loading' | 'signed-in' | 'signed-out'; session: Session | null; userId: string | null }`.
  - Sign-in functions, all taking `captchaToken` where Supabase requires it:
    - `signInWithPassword(email, password, captchaToken)`
    - `sendEmailCode(email, captchaToken)`
    - `verifyEmailCode(email, code)`
  - `signInWithGoogle()`:
    - calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'bonamind://auth/callback', skipBrowserRedirect: true } })`;
    - opens the URL with `WebBrowser.openAuthSessionAsync(url, 'bonamind://auth/callback')`;
    - passes `?code=` from the callback to `exchangeCodeForSession`.
  - `signInWithApple()`: present only when `env.appleSignIn`. Uses `expo-apple-authentication`, then `supabase.auth.signInWithIdToken({ provider: 'apple', token })`.
  - `TurnstileGate({ onToken(token: string): void; onError(): void })`:
    - a `react-native-webview` with `source={{ html, baseUrl: 'https://bonamind.app' }}`;
    - the HTML renders the Turnstile widget with `env.turnstileSiteKey` and `postMessage`s the token.
- **Owner action (blocking for OAuth, listed in the PR):** add `bonamind://auth/callback` to Supabase → Authentication → URL Configuration → Redirect URLs.

- [ ] **Step 1: Write tests.**
  - A 5,000-character value round-trips through `chunkedSecureStorage` (with a fake `SecureStore`) as 3 chunks.
  - `removeItem` leaves zero keys.
  - `oauth.test.ts`: given the callback `bonamind://auth/callback?code=abc`, `exchangeCodeForSession` is called with `'abc'`; a cancelled browser session resolves to `{ cancelled: true }` and makes no exchange call.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): Supabase session and sign-in methods`

---

### Task 14: Offline store, cached queries and the sync engine

**Files:**
- Create: `mobile/src/data/db.ts`, `sqliteOutboxStore.ts`, `cachedQuery.ts`, `sync.ts`, `mobile/src/data/__tests__/sqliteOutboxStore.test.ts`, `sync.test.ts`

**Interfaces:**
- Consumes: `createOutbox`, `OutboxStore` (Task 7); `createBonaMindData` (Task 5); `supabase` and `useAuth` (Task 13); `OfflinePill` (Task 11).
- Produces:
  - `openBonaDb(): Promise<SQLiteDatabase>` opens `bonamind.db`, with migration v1:
    - `kv(key TEXT PRIMARY KEY, json TEXT, updated_at INTEGER)`
    - `outbox(id TEXT PRIMARY KEY, user_id TEXT, kind TEXT, reviewed_at INTEGER, attempts INTEGER, payload TEXT)`
    - `dead_letter(id TEXT PRIMARY KEY, user_id TEXT, payload TEXT, reason TEXT, at INTEGER)`
  - `createSqliteOutboxStore(db): OutboxStore`, with `list` ordered by `reviewed_at, id`.
  - `useCachedQuery<T>(key: string[], fetcher: () => Promise<T>)`: TanStack `useQuery` with `initialData` read synchronously from `kv` (loaded at startup into memory). An effect writes `data` back to `kv` whenever it changes; TanStack v5 has no `onSuccess`.
  - `data = createBonaMindData(supabase)` and `outbox = createOutbox({ store, data, onDeadLetter: reportDeadLetter })` as app singletons. `reportDeadLetter` sends Sentry the item kind and error code only, never card text.
  - `useSync(): { online: boolean; pending: number; flushNow(): Promise<void> }`:
    - flushes on app foreground, on a NetInfo transition to online, and 300 ms after each enqueue;
    - calls `outbox.adoptUser(userId)` whenever `useAuth().userId` changes to non-null.

- [ ] **Step 1: Write tests.**
  - The SQLite store passes the same ordering, dead-letter and `clearOtherUsers` behavior as the Task 7 memory store. Run the Task 7 contract tests against it, through an `expo-sqlite` mock backed by `better-sqlite3`.
  - `sync.test.ts`: a NetInfo transition from offline to online triggers exactly one flush; a user change calls `adoptUser` with the new ID.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): SQLite cache, outbox store and sync engine`

---

### Task 15: Navigation shell, Today tab and Search

**Files:**
- Create: `mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`, `today.tsx`, `search.tsx`, `mobile/app/__tests__/today.test.tsx`, `search.test.tsx`

**Interfaces:**
- Consumes: Tasks 10–14; `dueCards`, `computeStreak`, `deriveRetention7d` (Task 6).
- Produces:
  - **Root layout:** loads the fonts, then:
    - initializes Sentry when `env.sentryDsn` is set, with `beforeSend` removing `user.email` and request bodies;
    - wraps the app in `QueryClientProvider` and `GestureHandlerRootView`;
    - gates on `useAuth().status`: `signed-out` → redirect to `/(auth)/welcome`;
    - renders `<OfflinePill visible={!useSync().online} />` above all screens;
    - puts `AuroraBackground` behind the tabs, and behind the study and welcome screens.
  - **Tabs layout:** native tabs from `expo-router` (the import path depends on the pinned SDK: `expo-router/unstable-native-tabs` or `expo-router/native-tabs`).
    - Tabs:
      - `today`: SF Symbol `sun.max`, Material `today`
      - `courses`: `books.vertical`, `library_books`
      - `you`: `person.crop.circle`, `person`
      - `search`: `role="search"` on iOS
    - Set `minimizeBehavior="onScrollDown"`. Don't set a tab bar background.
  - **Today:**
    - A large title "Today" via a native stack header (`headerLargeTitle: true`, `headerTransparent: true`, `headerBlurEffect` unset), with the date as a subtitle.
    - A paper "Due today" card: `CountUp` of the due count, the estimated time "About {ceil(due*30/60)} minutes", and a Start review button that opens `/study/[deckId]` for the deck with the most due cards. The button has a light sweep every 2.6 s (none when motion is reduced) and a press squish to 0.97 with `haptic('light')`.
    - Streak and recall tiles, and "Your courses" rows with `ProgressBar` (reviewed cards / total).
    - The sparkle toolbar `GlassButton` (`symbol="sparkles"`, label "Ask Prof. Linnea") pushes `/linnea`. Its symbol uses the `wiggle` effect every 4 s; there's no wiggle when motion is reduced.
    - Blocks rise in staggered (70 ms per block, `springs.rise`).
  - **Search:** filters cached deck titles and card fronts, case-insensitively, as you type.

- [ ] **Step 1: Write tests** (`useCachedQuery` mocked with fixtures; the clock is fixed):
  - With 12 due cards, it renders "12 cards" after the count-up completes and "About 6 minutes".
  - Start review routes to the deck with the most due cards.
  - **Review Focus 4:** with 0 decks, it renders "All caught up" with no Start review button; with decks but 0 due, it renders the same.
  - Search for "mito" finds the card "Mitosis phases" and the deck "Cell biology" when that deck contains it.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): native tabs, Today and Search`

---

### Task 16: Welcome and sign-in screen

**Files:**
- Create: `mobile/app/(auth)/welcome.tsx`, `mobile/app/(auth)/__tests__/welcome.test.tsx`

**Interfaces:**
- Consumes: Task 13 sign-in functions, `TurnstileGate`, `AuroraBackground`.
- Produces:
  - **Layout:** a full-screen aurora with "BonaMind" in `SerifTitle size="large"`, the tagline, and buttons "Continue with email", "Continue with Google", and "Continue with Apple" (only when `env.appleSignIn`).
  - **Email sheet:**
    - A password mode and an "Email me a code" mode with a 6-digit entry.
    - The `TurnstileGate` token is required before submitting.
    - Field values persist when the captcha fails.
  - **Error copy:**
    - wrong password: "That email and password don't match. Try again or use a code."
    - captcha failed: "We couldn't verify you're human. Try again."
    - network: "You're offline. Connect to sign in."

- [ ] **Step 1: Write tests.**
  - The Apple button is absent when `env.appleSignIn` is false.
  - Submitting without a captcha token doesn't call `signInWithPassword`.
  - An `invalid_credentials` error shows the exact wrong-password copy, and the email field keeps its value.
  - A Turnstile `onError` shows the captcha copy.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): welcome and sign-in`

---

### Task 17: Courses tab and course detail

**Files:**
- Create: `mobile/app/(tabs)/courses.tsx`, `mobile/app/courses/[id].tsx`, `mobile/app/__tests__/courses.test.tsx`

**Interfaces:**
- Consumes: `useCachedQuery` with `data.listDecks` and `data.listCards`; `dueCards`.
- Produces:
  - **Courses list:** a large title "Courses" and decks as `PaperCard`s showing the title, `cardCount`, due count and a `ProgressBar`. Empty state: "Create your first course on the web", with an "Open BonaMind on the web" link to `${env.apiBaseUrl}`.
  - **Detail:** the title, description, due count, mastered count (cards with `interval >= 21`), and a "Study this course" button routing to `/study/[deckId]`.

- [ ] **Step 1: Write tests.**
  - With two decks, it renders both titles with their due counts.
  - Tapping a deck routes to `/courses/<id>`.
  - **Review Focus 4:** the empty state shows the exact copy and the web link.
  - The detail screen's mastered count uses the threshold `interval >= 21`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): courses and course detail`

---

### Task 18: Study session: card stack, rating and celebration

**Files:**
- Create: `mobile/src/study/CardStack.tsx`, `RatingBar.tsx`, `Celebration.tsx`, `mobile/app/study/[deckId].tsx`, `mobile/src/study/__tests__/CardStack.test.tsx`, `mobile/app/__tests__/study.test.tsx`

**Interfaces:**
- Consumes: `planReview` (Task 4); `outbox.enqueueReview` and `enqueueSession`, `useSync` (Task 14); `Confetti`, `ProgressBar` and `haptic`; `computeStreak`.
- Produces:
  - `CardStack({ cards: Card[]; onRate(card: Card, rating: Rating): void; onEmpty(): void })`.
    - **Flip:** a tap flips the card in 3D (`springs.flip`, `haptic('light')`).
    - **Before the flip:** a drag rubber-bands at 0.22×.
    - **After the flip:** the card follows the thumb with rotation `dx / 13` degrees, and stamps fade in by direction (Good to the right, Again to the left, Easy upward), each crossing `haptic('selection')`. On release:
      - `dx > 90` or velocity x above 800 → Good;
      - `dx < -90` or velocity x below -800 → Again;
      - `dy < -90` or velocity y below -800 → Easy;
      - otherwise the card springs back.
    - **Long-press** (when flipped) opens `RatingBar` with Again, Hard, Good and Easy.
    - **Accessibility:** `accessibilityActions` are `again`, `hard`, `good` and `easy`.
    - **Rating:** `haptic('success')` for Good and Easy, `haptic('warning')` for Again. Again moves the card to the end of the queue.
    - **Long text:** card faces scroll their content.
  - **`study/[deckId]` screen:**
    - Loads `dueCards` for the deck from the cache.
    - On each rating, it calls `planReview(card, rating, Date.now())`, then `outbox.enqueueReview(userId, record, update)`, then updates the cached card.
    - The progress pill (top center) shows "{deck title} · {n} left" and a ring.
    - A confetti burst plays on Good and Easy.
    - Drives `AuroraBackground`'s `warmth` with the session's (good + easy) / rated ratio, so the glow warms as the session goes well.
    - When the queue empties, it calls `outbox.enqueueSession(userId, { id: uuid, deckId, startTime, endTime, cardsStudied, correctAnswers, totalAnswers, accuracy, duration })` once and shows `Celebration`. The flame grows in, the streak number rolls from the old value to the new one (computed with the local session included), confetti rains, and a "Done" button appears.
    - A glass close button (`symbol="xmark"`) enqueues a partial session when at least 1 card has been rated, then dismisses.

- [ ] **Step 1: Write `CardStack` tests** (gesture-handler test utils, `fireGestureHandler`):
  - Tapping flips the card (the back face is visible to accessibility).
  - A pan with `translationX: 120` after a flip calls `onRate(card, Rating.GOOD)`.
  - `translationX: -120` → `AGAIN`; `translationY: -120` → `EASY`.
  - A pan before the flip doesn't rate.
  - The `hard` accessibility action → `HARD`.
  - A 2,000-character front renders inside a `ScrollView`.
- [ ] **Step 2: Write study screen tests:**
  - Rating 2 cards Good enqueues 2 reviews whose `record.rating === Rating.GOOD`.
  - Finishing all cards enqueues exactly 1 session with `cardsStudied === 2`.
  - **Review Focus 3:** after 3 of 10 ratings, an `AppState` change to `background` enqueues a session with `cardsStudied: 3`. A later return to `active` and finishing the deck enqueues a second session for only the remaining cards, under a new ID.
  - **Review Focus 4:** a deck with 0 due shows the completion state immediately and enqueues no session.
- [ ] **Step 3: Run.** Expected: FAIL. **Step 4: Implement.** **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Manual check** on the Android emulator: swipes at 58 fps or more, and the haptics fire. Turn on Settings → Accessibility → Remove animations and confirm the crossfades. On the first sideloaded iPhone build (Task 21), repeat with Reduce Motion, Reduce Transparency and Increase Contrast, and time a warm launch to a data-filled Today screen (target: under 2 s). Record the results in the PR.
- [ ] **Step 7: Commit** `feat(mobile): swipe study session with celebration`

---

### Task 19: Prof. Linnea sheet

**Files:**
- Create: `mobile/app/linnea.tsx`, `mobile/src/linnea/useLinneaChat.ts`, `mobile/src/linnea/__tests__/useLinneaChat.test.ts`

**Interfaces:**
- Consumes: `streamLinnea`, `LinneaError`, `LINNEA_SYSTEM_PROMPT`, `LINNEA_CHIPS`, `linneaOpening`, `linneaErrorLine` (Task 8); the session token from `useAuth`; cached cards (for weak spots: the top 3 by `lapses`).
- Produces:
  - **Route:** `linnea` registered in the root stack with `presentation: 'formSheet'`, `sheetAllowedDetents: [0.5, 1]`, `sheetGrabberVisible: true` and `sheetCornerRadius` left at the system default. Where the pinned Expo Router exposes it, the sparkle button uses the iOS zoom transition source; otherwise the sheet uses the system presentation.
  - `useLinneaChat(): { messages: ChatItem[]; send(text: string): void; retry(): void; streaming: boolean }`
    - `ChatItem = { id; role: 'user' | 'linnea'; text; state: 'streaming' | 'done' | 'error'; errorKind? }`.
    - The conversation is persisted in `kv` under `linnea.thread.<userId>`.
    - Unmounting the sheet aborts the active stream.
  - **UI:**
    - A breathing orb header with "Prof. Linnea".
    - Messages in italic Instrument Serif (Linnea) or violet bubbles (user).
    - Typing dots until the first token arrives.
    - Chips from `LINNEA_CHIPS`.
    - On error, the error line plus a "Try again" chip.

- [ ] **Step 1: Write hook tests** with a fake `streamLinnea`:
  - The first open seeds `linneaOpening(weak, firstName)` as the opening Linnea message.
  - `send('Quiz me')` appends the user item, then streams `['Which', ' phase?']` into one Linnea item with `text === 'Which phase?'` and `state === 'done'`.
  - A `LinneaError('rate_limited')` produces an item with `state: 'error'` and the exact rate-limited line.
  - **Review Focus 5:** a stream that yields `'Metaphase lines'` and then throws `LinneaError('network')` keeps `'Metaphase lines'` and appends the network line with `state: 'error'`.
  - An `AbortError` (sheet closed) adds no error line.
  - The thread is restored from `kv` on remount.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): Prof. Linnea chat sheet`

---

### Task 20: You tab

**Files:**
- Create: `mobile/app/(tabs)/you.tsx`, `mobile/app/__tests__/you.test.tsx`

**Interfaces:**
- Consumes: `data.getDisplayName`, `computeStreak`, `useSettings`, `useSync`, `supabase.auth.signOut`.
- Produces: a large title "You" and:
  - the display name (falling back to the email's local part) and the streak;
  - a "Haptics" switch bound to `useSettings`;
  - "Open BonaMind on the web" (`Linking.openURL(env.apiBaseUrl)`);
  - "Sign out", which calls `flushNow()` first and then signs out. If `pending > 0` after the flush, it first shows the alert "You have {n} reviews waiting to sync. They'll upload next time you sign in to this account." with Cancel and Sign out buttons.

- [ ] **Step 1: Write tests.**
  - The haptics switch toggles `hapticsEnabled`.
  - Sign out with `pending: 2` after the flush shows the alert with "2 reviews".
  - Sign out with `pending: 0` signs out with no alert.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): You tab with haptics toggle and sign-out`

---

### Task 21: Builds, the free iPhone IPA, and Maestro end-to-end

**Files:**
- Create: `mobile/eas.json`, `mobile/e2e/core-loop.yaml`, `mobile/e2e/mint-session.mjs`, `mobile/app/e2e/session.tsx`, `.github/workflows/mobile-builds.yml`
- Modify: `mobile/app.config.ts` registers the `e2e/session` route only when `env.e2e` is true; in other builds it redirects to `/`.

**Interfaces:**
- Produces:
  - `eas.json` profiles:
    - `development`: `developmentClient: true`, `distribution: internal`
    - `preview`: `distribution: internal`, Android `apk`
    - `production`: `autoIncrement: false`, with the Android `versionCode` coming from `ANDROID_VERSION_CODE`
  - **`mobile-builds.yml`** (`workflow_dispatch` only):
    - **`ios-unsigned-ipa`** on `macos-26`: `npx expo prebuild --platform ios --clean`, then `xcodebuild -sdk iphoneos -configuration Release CODE_SIGNING_ALLOWED=NO build`, then package `Payload/BonaMind.app` into `BonaMind-unsigned.ipa`. The artifact is named `bonamind-ios-unsigned-ipa`.
    - **`e2e-ios`** on `macos-26`: build for the simulator with `EXPO_PUBLIC_E2E=true`, run `node e2e/mint-session.mjs`, then `maestro test e2e/core-loop.yaml`. Uploads screenshots and the video.
    - **`e2e-android`** on `ubuntu-latest` with an emulator: the same flow.
  - **`mint-session.mjs`** uses the `SUPABASE_SERVICE_ROLE_KEY`, `E2E_EMAIL` and `EXPO_PUBLIC_SUPABASE_URL` secrets:
    - `auth.admin.generateLink({ type: 'magiclink', email })`, then `verifyOtp({ type: 'magiclink', token_hash })`;
    - prints only the refresh token, as a masked output.
    - The `e2e/session?rt=` route calls `supabase.auth.refreshSession({ refresh_token })`, so no captcha is involved.
  - **`core-loop.yaml`:**
    1. Open `bonamind://e2e/session?rt=${RT}`.
    2. Assert "Today".
    3. Tap "Start review".
    4. Flip and swipe right on 5 cards.
    5. Toggle airplane mode on (`setAirplaneMode`) before card 4 and off after card 5.
    6. Assert the completion screen.
    7. `runScript` checks the server through the service key: the test user has 5 new `card_reviews` since the start time, and each `reviewed_at` is distinct.
- **Owner actions** (listed in the PR):
  - create the Expo account and project;
  - add the GitHub secrets `EXPO_TOKEN`, `E2E_EMAIL` and `SUPABASE_SERVICE_ROLE_KEY`;
  - seed a test user with one deck of at least 5 due cards;
  - upload the existing Play upload keystore to EAS credentials, so `com.auramind.app` updates install over the Capacitor build;
  - set `ANDROID_VERSION_CODE` above the last `mobile-android.yml` run number.

- [ ] **Step 1: Write a test** in `mobile/app/__tests__/e2eRoute.test.tsx`: with `env.e2e` false, rendering `/e2e/session?rt=x` redirects to `/` and never calls `refreshSession`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** the route guard, `eas.json`, the scripts and the workflow. **Step 4: Run** jest. Expected: PASS.
- [ ] **Step 5: Dispatch** `mobile-builds.yml` once the owner has added the secrets. Expected:
  - `bonamind-ios-unsigned-ipa` exists and contains `Payload/BonaMind.app`;
  - both e2e jobs are green, with screenshots showing native tabs (on iOS 26, a Liquid Glass tab bar).
  - Attach the run URL to the PR.
- [ ] **Step 6: Commit** `ci(mobile): EAS profiles, unsigned iPhone IPA and Maestro core loop`

---

## Owner checklist (not code; needed before the related step can pass)

| When | Action |
|---|---|
| Task 2 Step 6 | Confirm the Vercel setting "Include files outside the root directory" is enabled |
| Task 13 | Add `bonamind://auth/callback` to the Supabase redirect URLs |
| Task 13 (optional) | Confirm in Cloudflare that the Turnstile widget allows the hostname `bonamind.app` (the web view uses that base URL) |
| Task 21 | Expo account and `EXPO_TOKEN`; e2e test user and secrets; Play upload key in EAS; `ANDROID_VERSION_CODE` |
| Before any store listing | USPTO and EUIPO trademark search for "Linnea" in classes 9, 41 and 42 |
