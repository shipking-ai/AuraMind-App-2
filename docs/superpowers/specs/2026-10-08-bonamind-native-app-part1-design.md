# BonaMind native mobile app — Part 1: foundation and core loop

- **Date:** 2026-10-08
- **Branch:** `docs/native-app-part1-spec`
- **Status:** approved in conversation, section by section; this document awaits review

## 1. Intent

**What was asked:** iPhone and Android apps made *just for mobile*, not a
website in a wrapper. They must look awesome, feel native to iOS, carry a lot
of animation, and say BonaMind everywhere, including the codebase.

**Who it's for:** students who study on their phone every day, many of them
on iPhone.

**Success looks like:**
- Real native controls: on iOS 26 the tab bar, sheets and toolbars are Apple's
  own Liquid Glass components; on Android they are Android's own.
- A signature BonaMind look, *Aurora + Paper*, that makes people say "wow" on
  first launch, with motion on every meaningful interaction.
- The core loop works end to end: sign in → see what's due → study with
  swipeable cards → ask Prof. Linnea → reviews land in the same database the
  website uses, with no scheduling drift between the two.
- Built entirely from a Windows PC: iOS builds run in the cloud.

**Constraints:**
- The developer works on Windows. The only Mac is a Late 2013 iMac (macOS
  Catalina, Xcode 12.4 maximum), which cannot build this project: the
  current iOS project needs Xcode 15+ and Liquid Glass needs Xcode 26. All iOS
  builds go through EAS Build or GitHub's macOS runners.
- There is no Apple Developer Program membership yet. Anything that needs one
  (TestFlight, Sign in with Apple, APNs, App Groups) is built behind a switch
  and turned on later.
- The website (`auramind-gemini/`) is live and must not regress.

**Decisions made in the conversation:**

| Question | Decision |
|---|---|
| Technology | **React Native + Expo** (Expo Router, native tabs). Not Capacitor, not Swift/Kotlin, not Flutter |
| Visual direction | **Aurora + Paper**: Aurora's dark night sky and drifting glow, Paper's cream cards and serif type |
| Theme | **Dark only** for v1 |
| iOS feel | Follow iOS 26 Liquid Glass rules (§4.2) |
| Android feel | Same BonaMind look, **Android-native controls** |
| Code sharing | **A · Shared package** `@bonamind/core` in npm workspaces |
| Naming | Everything new is BonaMind from day one; the existing codebase is renamed in a separate project (§3) |
| App IDs | iOS **`com.bonamind.app`** (new; never published before). Android keeps **`com.auramind.app`** so the Play listing and closed testing carry over |
| Tutor name | **Prof. Linnea** (was Prof. Aura). Chosen after a web search found no AI assistant or tutor by that name. A trademark check is still required before launch |
| Fonts | **Bona Sans** (renamed Sora, OFL) and **Bona Script** (renamed Great Vibes, OFL), plus **Instrument Serif** (OFL) for display |

## 2. Prototype reference

Three interactive mockups were reviewed in the conversation and define the
look:
1. Directions A/B/C (Aurora, Paper, Bloom). Aurora and Paper were chosen to combine.
2. Aurora + Paper animated home screen and flip-card study.
3. **The iOS 26 prototype (the reference):** collapsing large title, a floating
   glass tab bar that minimizes on scroll with a separate search button, a
   Prof. Linnea sheet that morphs out of a sparkle button with medium and
   large detents, Dynamic Island progress, swipe-to-rate cards with stamps
   and confetti, and the streak roll celebration.

The native build must be **at least** as lively as prototype 3, with the
upgrades in §4.3 that a browser can't do.

## 3. Roadmap

Part 1 is one of several sub-projects. Each gets its own spec → plan →
implementation cycle.

| # | Sub-project | Summary |
|---|---|---|
| R | **Rename project** | AuraMind → BonaMind and Prof. Aura → Prof. Linnea across the existing code (1,331 mentions in 273 files), Aura Sans/Script → Bona Sans/Script (file names and the fonts' internal name tables). 142 `auramind_*` storage keys are migrated so no user loses saved data. The `auramind-gemini/` folder rename is coordinated with Vercel's Root Directory setting. Runs alongside Part 1 |
| **1** | **Native foundation + core loop** | This document |
| 2 | Course creation | PDF, video, lecture and topic → course, natively |
| 3 | Settings, billing, notifications | Stripe on the US storefront, In-App Purchase elsewhere; reminder notifications |
| 4 | iOS superpowers | Live Activity, Siri / App Intents, Home Screen widgets, native dictation |
| 5 | Store launch | Replace the Capacitor builds on Play; TestFlight → App Store |

Part 1 does not depend on the rename project. New code uses BonaMind names
from the start, and Part 1 touches only the website files it moves into core.

## 4. Design language

### 4.1 Aurora + Paper

- **Canvas:** near-black night `#0A0A0F`, always dark.
- **Aurora:** three slow-drifting glows (violet `#7C3AED`, cyan `#22D3EE`,
  pink `#EC4899`) plus one that follows the finger, rendered on the GPU (§4.3).
- **Paper:** everything you *read or study* is an opaque cream card
  (`#F5EFE3`, ink `#1C1917`, muted ink `#78716C`).
- **Opaque dark surfaces** for lists and tiles: `#15151E` / `#1A1A24`.
- **Type:**
  - Instrument Serif for display text: large titles, card faces, numbers, and Prof. Linnea's voice (in italic).
  - Bona Sans for interface text.
  - Bona Script is reserved for rare flourishes.
- **Accents:** violet `#7C3AED` for primary actions, `#A78BFA` / `#C4B5FD` for
  highlights. Semantic colors: good `#34D399`, again `#F87171`, hard `#FCD34D`,
  streak `#FB923C`.
- All colors live as tokens in `mobile/src/design/tokens.ts`. Components never
  hard-code a hex value.

### 4.2 iOS 26 rules (Liquid Glass)

- **Glass is only for controls and navigation:** the tab bar, toolbar buttons
  and sheets. Content stays opaque. Never put glass on cards or rows, and
  never stack glass on glass.
- **Tab bar:** Expo Router native tabs, i.e. Apple's real `UITabBar`. It
  floats, minimizes on scroll and expands on scroll-up. Search sits in its own
  button beside it. No custom tab bar background, because that blocks the
  glass.
- **Large titles** collapse into the navigation bar on scroll.
- **Sheets:**
  - Medium detents are inset glass that nests in the display corners; full height becomes opaque.
  - Sheets open from their source button (a zoom transition where the OS supports it, otherwise a spring scale from the button).
  - No custom `presentationBackground`.
- **Toolbar buttons** use symbols (SF Symbols via `expo-symbols`), not text.
- **Test with** Reduce Transparency, Increase Contrast and Reduce Motion
  turned on.
- **Older iOS versions** get the classic system look automatically. The
  native components handle this, so there's no special code.

### 4.3 Motion

Motion is a feature, not decoration. Every item below has a named spring in
the tokens, and every one respects **Reduce Motion** (it becomes a short
crossfade or no motion) and the in-app haptics toggle.

| Moment | Motion | Haptic |
|---|---|---|
| App launch / Today | Staggered spring rise of each block; due count counts up; recall ring draws; course bars fill in sequence | — |
| Aurora | Skia shader: slow drift, a finger-follow glow, and color warming as the session goes well | — |
| Start review button | Periodic light sweep; press squish | Light impact |
| Card flip | 3D flip with overshoot | Light impact |
| Card drag | Card follows the thumb 1:1 with rotation; Good/Again/Easy stamps fade in by direction | Selection ticks at the thresholds |
| Rate | Fling off-screen with velocity; confetti burst on Good/Easy; next card pops up from the stack | Success (good/easy), warning (again) |
| Progress | Bar and Dynamic-Island-area ring spring forward | — |
| Session complete | Flame grows in; streak number rolls up; full-screen confetti rain | Success notification |
| Prof. Linnea | Breathing orb with ripple; typing dots; messages pop in; tokens stream | Light on send |
| Tab switch | Native tab bar animation; symbol bounce (SF Symbols effect) | System default |
| Sparkle button | SF Symbol wiggle every few seconds while Linnea has something to say | — |

### 4.4 Android

Android gets the same tokens, type, aurora, paper cards and motion, with
Android's own:
- tab bar (Expo Router native tabs → Material bottom navigation)
- predictive back gesture
- haptics
- system sheets

No faux Liquid Glass on Android.

### 4.5 Accessibility

- All four ratings are reachable without swiping:
  - Long-press a flipped card to open a four-button rating bar (Again / Hard / Good / Easy).
  - VoiceOver/TalkBack users get the four ratings as named accessibility actions.
- Text uses Dynamic Type sizes; card text reflows rather than shrinking.
- Contrast is at least WCAG AA for text on paper and on the dark canvas.
- Reduce Motion turns off the drift, the fling and the confetti, and replaces them with a calm crossfade.

## 5. Part 1 screens

1. **Welcome and sign-in.**
   - Full-screen aurora with a serif "BonaMind" headline and the tagline "Your AI Learning System".
   - Sign-in methods: email + password, email one-time code, and Google.
   - The project has Supabase captcha (Cloudflare Turnstile) turned on, so the app gets a captcha token from a small embedded web view.
   - **Sign in with Apple** is built in Part 1 behind a switch. App Store guideline 4.8 requires it once Google sign-in is offered on iOS, and it needs the Apple Developer Program to configure, so the switch stays off until then.
2. **Today tab.** The collapsing "Today" large title, the paper "Due today" card (count-up, the estimated time, and a Start review button), the streak and recall tiles, and a "Your courses" list with animated progress. The sparkle toolbar button opens Prof. Linnea.
3. **Courses tab.** Courses as paper cards. A course detail screen shows progress, its decks, and Study this course.
4. **Study session (full screen).**
   - The card stack from prototype 3: tap to flip, then swipe right for Good, left for Again, up for Easy. Long-press opens the rating bar, which is the only way to pick Hard.
   - Progress shows in a pill near the top, where the Dynamic Island sits. The real Live Activity is Part 4.
   - The session ends with the streak celebration.
5. **Prof. Linnea sheet.** Medium and large detents, streaming answers, and suggestion chips ("Quiz me", "Explain it simply"). The opening message comes from the user's actual weak spots when that data is available.
6. **You tab.** Name, streak, sign out, and an "Open BonaMind on the web" link for features not yet native.

**Not in Part 1:**
- Creating courses (until Part 2 they're made on the website and appear in the app).
- Billing, notifications, settings beyond sign-out.
- The iOS superpowers.
- Light mode.

## 6. Architecture

### 6.1 Repository layout

```
package.json            npm workspaces: packages/*, auramind-gemini, mobile
packages/core/          @bonamind/core — shared, platform-free TypeScript
auramind-gemini/        website (folder renamed by the rename project)
mobile/                 Expo app "BonaMind"
api/                    unchanged in Part 1
```

### 6.2 `@bonamind/core`

The single source of truth for anything both apps compute or write.

**Contents in Part 1:**
- Domain types (`Card`, `Rating`, deck/course types).
- Scheduling: `fsrs.ts` (`ts-fsrs`, FSRS-6) and `srs.ts`.
- The pure "rating → card update + review log" step that `rateCard.ts` performs today.
- The Supabase queries Part 1 needs, against the existing tables `decks`, `cards`, `card_reviews`, `study_sessions` and `user_profiles`. In Part 1 a course is a `decks` row with its `cards`. The implementation plan confirms whether any course grouping sits above decks.
- The Prof. Linnea streaming client for `POST /api/ai/chat/stream` (OpenAI-style SSE deltas).
- App identity constants (app name, tagline). The bundle IDs stay out of it on purpose, as in `app-identity.ts`.

**Rules:**
- Its `tsconfig` has `lib: ["ES2022"]` with **no DOM** types, and no React or React Native imports.
- No `import.meta.env`. Configuration is injected.
- Dependencies are passed in, not reached for. The current `rateCard.ts` calls `dbService` singletons directly; in core it receives an injected `SupabaseClient`, a clock, and a storage adapter.

**Website migration:**
- Each moved website file becomes a one-line re-export from `@bonamind/core`, so no website import changes.
- The website's existing tests keep covering the moved logic, and the website's own test suite, type-check, lint and build must stay green after every move.
- The `CLIENT_ENV` allowlist and the `clientSecretExposure` test stay in the website, untouched.

### 6.3 `mobile/`

- **Expo:** the latest stable Expo SDK at kickoff, pinned exactly, with the New Architecture. The native tabs API is still marked unstable upstream, so its version is pinned and its import path checked against that SDK.
- **`app/` (Expo Router):**
  - `(auth)/welcome`
  - `(tabs)/_layout` with native tabs: `today`, `courses`, `you`
  - `courses/[id]`
  - `study/[deckId]` (full-screen modal)
  - `linnea` (form sheet, medium and large detents)
- **`src/design/`:**
  - Tokens, named springs, and type scale.
  - Components: `AuroraBackground` (Skia), `PaperCard`, `GlassButton`, `SerifTitle`, `ProgressBar`, `CountUp`, `Confetti` and `CardStack`.
  - `motion.ts` and `haptics.ts` wrappers that apply Reduce Motion and the haptics toggle centrally.
- **`src/data/`:**
  - The Supabase client with a chunked secure-storage session adapter (secure-store values are capped at about 2 KB), and auto-refresh tied to app state.
  - TanStack Query for server state.
  - `expo-sqlite` for the offline card cache and the review outbox.
- **Libraries:**
  - `react-native-reanimated` 4 and `react-native-gesture-handler` for gestures and springs.
  - `@shopify/react-native-skia` for the aurora and confetti.
  - `expo-haptics`, `expo-symbols`, `expo-font`, `expo-secure-store`, `expo-sqlite`.
  - `@sentry/react-native` for crash reports, with personal data scrubbed.
- **`app.config.ts`:**
  - The name comes from core.
  - iOS `bundleIdentifier: com.bonamind.app`, Android `package: com.auramind.app`.
  - The URL scheme is `bonamind`.
  - The Android version code continues above the last Capacitor build, so the new app installs as an update on Play.

### 6.4 Builds and CI

- **EAS Build profiles:** `development` (dev client), `preview` (internal testers) and `production`. EAS supplies Xcode 26, which Liquid Glass requires.
- **Free iPhone install path:** a GitHub macOS job runs `expo prebuild` + `xcodebuild` unsigned and packages an IPA for Sideloadly. This is the same technique as today's `ios-device-ipa` job, and it works before the Apple Developer Program.
- **New workflow `mobile.yml`:** on every PR touching `mobile/` or `packages/core/`, it runs type-check, lint, Jest and the core tests. Builds and Maestro runs are manual (`workflow_dispatch`) to save minutes.
- **Root workflows:** the existing workflows gain `packages/core/**` in their path filters, so a core change re-tests the website.

## 7. Data flow and offline

- **Sign-in:**
  - Supabase auth with the session in chunked secure storage.
  - The token refreshes when the app returns to the foreground.
  - The Supabase anon key and URL are public by design and live in `app.config.ts` extra / EAS env. No server-only secret ever ships in the app.
- **Today and Courses:**
  - TanStack Query fetches through core's queries and also writes them to SQLite.
  - On launch the app shows the last-known data instantly, then revalidates.
  - A spinner appears only on a first install with an empty cache.
- **Study:**
  1. Starting a session downloads the deck's due cards to SQLite.
  2. Each rating runs core's FSRS on the device, so the next card appears instantly.
  3. The new card state is written to SQLite, and a review is added to the outbox. Each review has a client-generated UUID that is also the `card_reviews` id, so retries are idempotent.
  4. The outbox flushes in `reviewedAt` order to the same tables the website writes.
  5. **Conflict rule:** if the server's card has a `last_review` newer than the queued review, the review log is still inserted but the card's schedule is not overwritten.
- **Prof. Linnea:**
  - Streams from `/api/ai/chat/stream` with the Bearer token. Closing the sheet aborts the request.
  - In Part 1, conversations persist on the device only.
- **API:** unchanged. Native requests aren't subject to browser CORS, and authorization still rides on the Supabase Bearer token.

## 8. Error handling

| Situation | Behavior |
|---|---|
| Offline | Glass pill "Offline · reviews will sync". Studying is never blocked |
| Session expired, refresh fails | Back to Welcome. The outbox is kept and flushed only after the **same user id** signs back in; otherwise it's discarded |
| AI busy, rate-limited or down (429/503/model error) | Prof. Linnea replies in her voice ("I'm a little overloaded, try me again in a moment") with a retry chip. Raw errors are never shown |
| Captcha failure | Friendly retry; the form keeps what the user typed |
| Outbox write rejected (RLS or validation) | Kept with a retry count; after 5 failures it's moved to a dead-letter table locally and reported to Sentry without card content |
| Crash | Sentry, with personal data scrubbed |

## 9. Testing

- **Core:**
  - Vitest unit tests; the existing FSRS/SRS tests move with the code.
  - **Golden scheduling fixtures:** fixed review histories, each with the exact schedule it must produce, guarding against drift.
  - Outbox tests: idempotency, ordering, the conflict rule, and the same-user rule.
- **Website regression:** after every move, the full website suite, type-check, lint and build stay green. A move that changes website behavior is wrong.
- **Mobile:**
  - Jest (`jest-expo`) and React Native Testing Library for screens and components.
  - Tests that the motion and haptics wrappers honor Reduce Motion and the toggle.
- **End to end:** Maestro flows on a GitHub macOS runner (iOS simulator) and an Android emulator:
  - sign in → study 5 cards → go offline → rate → back online → reviews present on the server.
  - Screenshots and a video upload as artifacts.
- **Devices:**
  - Android: dev build sideloaded directly.
  - iPhone: the unsigned IPA via Sideloadly with a free Apple ID.
- **Performance targets:**
  - Swipe, flip and aurora at full frame rate (60 fps, 120 on ProMotion) on a mid-range device.
  - Warm launch to a data-filled Today screen in under 2 s.
  - Checked with the React Native performance monitor during manual passes.

## 10. Success criteria

1. Signing in on a phone shows the same courses and due counts as the website for that account.
2. Studying on the phone and then opening the website shows the same next-due dates. Golden fixtures prove the scheduling matches.
3. A session started in airplane mode completes, and its reviews appear on the server after reconnecting, exactly once.
4. On iOS 26 the tab bar and sheets are the system Liquid Glass components (verified in a simulator screenshot); on Android they are Android's own.
5. Every interaction in §4.3 is implemented, and each one calms down under Reduce Motion.
6. No new file, type, route, key or user-visible string in `mobile/` or `packages/core/` says AuraMind or Prof. Aura. The only exception is the Android package ID `com.auramind.app`. A test enforces this, with that single allowlisted exception.
7. The website's CI is green throughout.

## 11. Risks and open items

- **Native tabs are "unstable" upstream:** pin the version; fall back to a custom glass tab bar only if a blocking bug appears.
- **The sheet zoom transition from a button** may not be exposed on every SDK; if not, fall back to a spring scale from the button.
- **Turnstile in a web view:** confirm Cloudflare allows the embedded origin; otherwise a Supabase-side alternative is evaluated in the plan.
- **Prof. Linnea trademark:** search the USPTO and EUIPO in classes 9, 41 and 42 before any store listing uses the name.
- **Android Play continuity:** the version code and signing key must match the existing Capacitor app (same upload key) for the update to install over it.
- **Course model:** confirm whether courses are decks or group decks (§6.2) before building the Courses tab.

## 12. Out of scope for Part 1

Course creation, billing, notifications, Live Activity, Siri, widgets,
dictation, light mode, chat history sync with the website, the website
redesign, and the rename project's changes to existing code.
