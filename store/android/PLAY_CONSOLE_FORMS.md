# Google Play Console — ready-to-paste form answers

Every field below is pre-drafted from the codebase. Forms live in
Play Console → **App content**. Copy values verbatim; `<!-- -->` notes are
guidance, not form content.

## Store listing

| Field | Value |
|---|---|
| App name | AuraMind |
| Short description (≤80) | from `listings/en-US/short_description.txt` (71 chars — fixed 2026-09-11, was 84) |
| Full description (≤4000) | from `listings/en-US/full_description.txt` (2156 chars) |
| App icon 512×512 | `../graphics/android/icon-512.png` |
| Feature graphic 1024×500 | `../graphics/android/feature-1024x500.png` |
| Phone screenshots | `../graphics/android/screenshots/01…07` (1080×1920 — all specs-valid) |
| Privacy policy | https://auramind.app/privacy (verified 200 on 2026-09-11) |

## App content → Data safety

Collection: **Yes** (account email, optional profile name + photo, study
progress, crash logs, billing metadata via Stripe).

| Data type | Collected | Purpose |
|---|---|---|
| Name (optional), Email address | Yes | Account management; app functionality |
| User photo (optional) | Yes | App functionality (profile) |
| User interaction (study progress, card grades) | Yes | App functionality |
| Crash logs | Yes | Analytics (Sentry) |
| Product interaction (PostHog) | Yes | Analytics |
| Purchase history (billing metadata) | Yes | App functionality — subscriptions |
| **Audio** (voice/transcript) | Yes, **shared off-device** | App functionality |

Audio disclosure — two features send audio or transcripts off-device:

1. **Audio → flashcards**: microphone audio (or an uploaded recording) is
   proxied through our server to Groq Whisper for transcription
   (`/api/ai/transcribe` → `src/services/api/groqService.ts`). The audio
   itself is not stored; the transcript becomes deck content in the user's
   own account.
2. **Voice study mode**: uses the WebView's `SpeechRecognition`
   (`src/services/voice/speechEngine.ts`); the WebView's speech provider
   processes spoken answers to text. No transcript is retained beyond the
   study session.

Declare **Audio → collected, shared, transient** (not stored long-term) and
encrypt-in-transit = Yes, deletion mechanism = Yes (account deletion in
Settings + 30-day server retention noted in the Terms).

## App content → Ads

**No ads** (AdMob is on the pre-launch wishlist, §7 of
`store/PRE_LAUNCH_CHECKLIST.md`, but no ad SDK is in the build — verified:
no admob dependency in `android/app/build.gradle`).

## App content → Content rating (IARC)

Drafted answers — flag anything the questionnaire phrases differently:

- Category: **Education** / study tool
- Violent references: None
- Sexual content: None
- Language: None
- Controlled substances: None
- User-generated content shared between users: **Yes (limited)** — Leagues
  publish display name, profile photo, and XP to a 15-person weekly
  leaderboard (`league_memberships` is public-read by design, see
  `supabase/migrations/20260719_league_tables.sql`). There is **no
  free-form user content sharing** (no chat, no messaging, no comments),
  so the stricter UGC moderation questions (report/block/moderate) can be
  answered "the app does not allow free-form content sharing". IARC will
  follow up with a stricter flow if answered Yes — pick the limited/
  leaderboard-only framing.
- Gambling / prize promotions: None
- Age rating expected: **Everyone / PEGI 3** (U)
- Target audience: **13+** (per checklist §5 — accounts and subscriptions)

## App content → News, COVID, government apps

- Not a news app, no COVID features, not a government app.

## App content → Data access / Account deletion

- Account deletion URL: use **https://auramind.app** → dashboard settings
  in-app deletion (checklist requires in-app deletion — implemented via
  `DeleteAccountModal`). Provide the privacy contact email used on
  auramind.app/privacy.

## Pricing & distribution

- Free with in-app products: **AuraMind Premium** subscription (Stripe —
  note: Play Billing vs Stripe: selling digital study features inside an
  Android app technically requires Play Billing; the current build uses
  Stripe Checkout in the webview. **Known review risk — either add a Play
  Billing SKU or be ready to defend the web-only checkout exemption.**
  This is the single biggest review-risk item in this file.)
- Countries: all available (adjust to taste)

## Release

| Item | Value |
|---|---|
| Phone AAB | `android/app/build/outputs/bundle/release/app-release.aab` (75.8 MB, rebuilt 2026-09-11 18:47, signed `CN=AuraMind, O=CogniVect Inc`) |
| Wear AAB | `android/wear/build/outputs/bundle/release/wear-release.aab` (3.7 MB, same cert SHA256 `C2:58…CB:3E`) |
| First upload status | **draft** — Play rejects `completed` on a draft app; publish the first release by hand, then flip the workflow input |
| Track order | internal → closed (alpha, 12 testers × 14 days for post-2023 personal accounts) → production staged 10/50/100% |
| Release notes | `changelogs/en-US.txt` (314/500 chars) |
| **versionCode** | **must be ≥ 8.** CI run #7 (2026-09-09) succeeded and uploaded versionCode 7 as a draft — Play burned it. The locally-built AAB from 2026-09-11 was built with `ANDROID_VERSION_CODE=8`. CI runs keep using `github.run_number`, which is already ≥ 8 — fine. Never upload anything lower than 8. |

## Wear OS note

The wear module builds with the **same upload keystore** but declares
`com.auramind.app.wear` — if you intend it as a *companion* (embedded in
the phone listing) it must be built into the phone AAB or embedded via the
`wearApp` gradle config; a standalone `com.auramind.app.wear` listing
requires its own store record. Decide before the first upload: the
package name + listing relationship cannot be changed afterwards.

## Post-upload checklist

- [ ] Pre-launch report read after each internal release (crashes, ANRs)
- [ ] mapping.txt uploaded to Sentry for symbolication
- [ ] Play App Signing accepted (Google keeps the app signing key)
- [ ] Backup the release keystore offline ×2 (irreplaceable)
