# Spec — Memory Sparks (sporadic resurfacing)

Status: approved direction (2026-09-20), implementation spec.
Surfaces: in-app pop-up sparks, notification sparks (+ tap-to-speak), interleaved study sessions.
Phase 2 (out of scope here): background TTS via Android Foreground Service, server-driven push sparks.

## Problem

FSRS schedules *due* work, but once a card leaves the due queue it is silent until
its due date. Recall decays continuously — the moment a memory is worth
strengthening is *before* the review, when retrievability is fading but retrieval
still succeeds. Sparks resurface cards in that window, sporadically, across three
surfaces, so old material keeps coming back without the user scheduling anything.

## Core module — sparkScheduler (`services/memory/sparkScheduler.ts`, pure)

**Inputs:** cards with their FSRS state, current time, spark history, preferences.

**Eligibility** (a card is spark-eligible when ALL hold):

- `retrievability` (via `calculateRetrievability(getFSRSState(card))`) is in the
  band **[0.65, 0.90]** — fading but not forgotten.
- Card has been reviewed at least once (`repetition > 0` or `lastReviewed > 0`).
- Not reviewed in the last **3 hours** (`now - lastReviewed >= minRereviewGapMs`).
- Not sparked in the last **20 minutes** and not already sparked today more than
  the per-card cap (2/day) — from the spark log, not from card fields.

**Sporadic policy** (the "random pop-up" feel, deterministic + testable):

- Eligibility is checked on a **jittered poll** (~every 90 s ± 20%); firing is a
  **coin flip at 15%** per poll. Expected sparks: roughly 2–5/hour while active
  in-app, before caps.
- **Daily cap:** 12 sparks/day across all surfaces (per-surface share: pop-ups
  and notifications draw from the same budget; interleaving is exempt — it rides
  existing sessions).
- **Quiet hours:** default 22:00–08:00 local; sparks (pop-ups *and*
  notification scheduling) are suppressed. 10-minute grace ramp at both edges
  (probability scaled by ramp position).
- **Pick:** among eligible cards, weighted toward *lowest* retrievability with
  jitter: `weight = (0.95 - R)^2 * (0.7 + 0.6 * rand())`. Feels unpredictable,
  always relevant.
- **Cross-surface suppression:** the spark log records
  `{ cardId, ts, surface }`. A card sparked in-app today is not sent to
  notifications today, and vice versa. A card reviewed normally is suppressed
  for 3 h everywhere (same minRereviewGap).

**Log:** `localStorage["auramind:sparkLog"]` — array of
`SparkEvent { cardId, ts, surface: 'popup' | 'notification' | 'interleave' }`,
trimmed to 7 days. No DB migration; the log is device-local by design.

**API (pure, all clock/vals injected):**

```ts
pickSparkCard(cards, { now, history, prefs }): Card | null
shouldFireNow({ now, history, prefs }): boolean        // caps + quiet hours + coin
isQuietHour(now, prefs): boolean
recordSpark(surface, cardId, now?): void               // mutates log + storage
getSparkLog(): SparkEvent[]
clearSparkLog(): void
```

Determinism for tests: `rand` is an injectable `() => number`; `now` always a
parameter. No `Date.now()` inside pure functions.

## Surface 1 — in-app pop-up (`components/memory/MemorySpark.tsx`)

Mounted once in `NovaDashboardShell` (covers `/dashboard/*` and `/admin/*`).

- **When:** dashboard/decks/overview routes only — never while a study session,
  chat, generator, or modal is open. Gate on `location.pathname` + a
  "busy" check (`document.visibilityState === 'visible'`).
- **Poll:** every 90 s (jittered), `shouldFireNow` → `pickSparkCard` over the
  workspace cards.
- **UI:** bottom card, Nova style. Shows the **front**; spoken aloud through
  `services/voice/speechOutput.speak()` (same path as everything else that
  talks, so the global voice preference applies).
  - **Reveal** → back shown + spoken; **Again/Hard/Good/Easy** grade it through
    `calculateSRS` → `dbService.updateCard` → `cardReviewsService.recordReview`
    (fire-and-forget, mirroring `StudyModePage.handleRate`), tagged
    `analyticsService.track('spark_reviewed', { cardId, surface: 'popup' })`.
  - **Dismiss** → no review recorded; card suppressed 20 min via the log.
  - Auto-dismiss after 45 s without input.
- Entitled users only (`hasFreeAccess` or subscription active — same gate the
  AI features use). Quiet hours apply; spark toggles off = surface off.

## Surface 2 — notification sparks + tap-to-speak (Phase 1 scope)

New hook `useSparkSync` (sibling of `useReminderSync`, mounted next to it):
schedules **2–4 one-shot notifications per day at re-randomized times** within
waking hours.

- **Pure planner** in `lib/sparkNotificationSchedule.ts`:
  `buildSparkNotifications({ count, earliestHour, latestHour, now, rand })` →
  N one-shot times (sorted, ≥ 2 h apart, inside waking hours), each with a
  card front chosen by the scheduler at schedule time. IDs
  `7411–7414` (past the reminder IDs 7401–7404). Fixed IDs + cancel-first, the
  same repair pattern reminders use (a changed plan replaces, never stacks).
- **Body:** card front as text ("Quick recall: *Luke?*" style). **Tap:**
  deep-link to `/dashboard/spark/:cardId` — new lightweight route that speaks
  the prompt (TTS through `speechOutput`), shows Reveal + the four grade
  buttons, records a real review (same path as Surface 1), then navigates back.
  Works from cold start; the route reads the card from the workspace store.
- **Re-randomized daily:** the hook re-plans whenever the calendar day changes
  or the app starts, cancelling yesterday's pending IDs first.
- Native only (`Capacitor.isNativePlatform()`), permission
  `checkPermissions` on app start (never request — the reminder rule), cancel +
  reschedule on preference change. Web build: notifications surface is off
  (no web push sender exists; web users get pop-ups + interleaving).

**Widget (cheap add):** existing Android widget subtitle TextView shows the
front of the next near-due card when one exists — no new RemoteViews types.
(If the RemoteViews layout is tighter than expected, drop this item; it is not
load-bearing.)

## Surface 3 — interleaved sessions (`services/memory/sessionComposer.ts`, pure)

- `composeSessionQueue(dueCards, allCards, { now, rand, resurfaceRatio = 0.2 })`
  → ordered queue: majority due-now cards, plus "resurfaced" cards from *other*
  decks whose retrievability is in the spark band (max ratio 20% of the queue,
  minimum queue size 6 before interleave kicks in).
- **Expanding gaps:** first resurfaced card after ~5 due cards, subsequent
  insertions at growing intervals (~+2 each), so they thin out toward the end.
- In-session re-appearance of *missed* resurfaced cards grows the gap the same
  way (handled naturally: a lapsed card re-enters the due sub-queue).
- Reviews recorded by the normal study path are real FSRS reviews — early
  review just reschedules from now, no migration or special-casing needed.
- Tagged `surface: 'interleave'` in the spark log so analytics can split spark
  reps from organic reps.

## Settings (SettingsPage, "Memory sparks" section)

- `auramind_sparksEnabled` (default **true**) — master switch.
- `auramind_sparksPopup` (default true) / `auramind_sparksNotifications`
  (default true) — per-surface toggles.
- `auramind_sparksQuietStart` / `auramind_sparksQuietEnd` (default "22:00" /
  "08:00") — quiet hours.
- Voice reuses the global TTS voice preference; no separate toggle.

All read through `useAppPreference` (the existing localStorage preference
store); no backend.

## Testing

- **Unit (pure modules):** eligibility band edges (0.649 / 0.65 / 0.90 / 0.901),
  caps and quiet hours (boundary + grace ramp), cross-surface suppression,
  log trimming, weighted pick stays in-eligible-set, composer ratio + expanding
  gaps + deck-exclusion, notification time planner (count, spacing, waking
  hours, determinism given `rand`).
- **Component:** MemorySpark renders front → reveal → grade wiring calls
  `recordReview` once with the right rating; dismiss records nothing.
- **E2E (Playwright, seeded-session approach):** inject a spark log + a card in
  the band via the workspace, force `shouldFireNow` (by stubbing rand through
  the E2E harness route), assert the pop-up appears, grade it, assert zero
  page errors. Notification surface asserted at the planner level only (native
  bridge is not present in CI).

## Non-goals (Phase 2)

- True background voice (Android Foreground Service + native TTS).
- Server-driven push sparks (needs the push sender from HANDOFF outstanding
  items).
- Wearable sparks. Cross-device spark-log sync.

## Repo traps respected

- No `style.transform` inline on motion components; no `<button>` inside
  `<motion.button>` (nested-button E2E bug).
- `repeats` flag on recurring native notifications (reminder one-shot trap);
  spark notifications are one-shots by design, so they avoid the trap entirely.
- `import.meta.env` only via static reads of allowlisted vars (none needed
  here).
- Spark log is display/state data in localStorage — never a permission source.
