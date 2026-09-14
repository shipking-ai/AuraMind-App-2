# AuraMind — Google Play Store Listing

> **v1 copy approved for upload directly into the Play Console.** Brand: AuraMind
> (CogniVect, Inc). The "About" section is unchanged — CogniVect is internal-only
> for v1. See `store/PRE_LAUNCH_CHECKLIST.md` for the full pre-flight.

---

## App name (≤ 30 chars)
**AuraMind**

## Short description (≤ 80 chars)
**AI flashcards with FSRS spaced repetition — study smarter, remember longer.**

## Full description (≤ 4000 chars)

```
Stop cramming. Start retaining.

AuraMind uses FSRS — the modern spaced-repetition algorithm shown to retain 30% more per study session than legacy Anki-style schedulers — to schedule the right card at the right moment, every time.

WHAT YOU GET

• AI-generated flashcards — drop a PDF, a video link, or a topic; AuraMind turns it into a deck in under a minute.
• Personalized spaced repetition — the algorithm learns YOUR memory and reshapes its schedule around it. The longer you use AuraMind, the faster you remember.
• Active recall + retrieval practice — proven to outperform re-reading by 2-3x.
• Offline-first — all your decks live on your device; sync when you're back online.
• Streaks, leagues, and friends — gentle pressure to keep your study habit alive, but never burn-out inducing.
• Memory Palace + Flow Mode — turn your hardest topic into a visual walkthrough or enter distraction-free deep-study mode.
• Concept Maps — see how ideas in a deck connect to each other.

PRIVACY-FIRST

Your decks and notes stay on your device. We don't sell your study data. We use post-hoc analytics (PostHog) only for product improvement, and Sentry only for crash reports. The full privacy policy is at https://auramind.app/privacy.

BUILT FOR STUDENTS WHO ACTUALLY STUDY

Whether you're prepping for med school (USMLE), law school (BAR), grad school cumulative exams, or learning a new language — AuraMind adapts to whatever you're mastering.
```

## Promotional short description (≤ 80 chars)
**Smart flashcards. Personalized spaced repetition. Built for serious students.**

## What's new (per release)

```
• Smarter study scheduling — your deck adapts to how *you* remember.
• Faster deck creation — drop a PDF and watch AuraMind build flashcards.
• Memory Palaces for hard topics — map knowledge to a vivid mental walkthrough.
• Friend streaks and gentle leagues — compete without losing focus.
```

## Graphics inventory

| Asset | Dimensions | Format | Storage path | Status |
|---|---|---|---|---|
| App icon | 512×512 | PNG, no transparency | `store/graphics/android/icon-512.png` | ✅ generated |
| Feature graphic | 1024×500 | PNG or JPG, ≤ 1 MB | `store/graphics/android/feature-1024x500.png` | ✅ generated |
| Phone screenshot #1 | 1080×1920 | PNG | `store/graphics/android/screenshots/01-home.png` | ✅ generated |
| Phone screenshot #2 | 1080×1920 | PNG | `store/graphics/android/screenshots/02-dashboard.png` | ✅ generated |
| Phone screenshot #3 | 1080×1920 | PNG | `store/graphics/android/screenshots/03-study.png` | ✅ generated |
| Phone screenshot #4 | 1080×1920 | PNG | `store/graphics/android/screenshots/04-ai-create.png` | ✅ generated |
| Phone screenshot #5 | 1080×1920 | PNG | `store/graphics/android/screenshots/05-progress.png` | ✅ generated |
| Phone screenshot #6 | 1080×1920 | PNG | `store/graphics/android/screenshots/06-onboarding.png` | ✅ generated |
| Phone screenshot #7 | 1080×1920 | PNG | `store/graphics/android/screenshots/07-profile.png` | ✅ generated |
| Tablet screenshot #1 | 1600×2560 | PNG | `store/graphics/android/screenshots/08-tablet-home.png` | ⬜ capture on tablet later |
| Promo video (optional) | 1920×1080, ≤ 30s | MP4 | `store/graphics/android/promo-30s.mp4` | ⬜ optional |

Screenshots `02`–`05` + `07` are captured from the purpose-built mobile UI
mockups (see `Mobile UI Examples/`); `01` + `06` are captures of the real app
marketing/auth pages. Regenerate anytime with:

```bash
cd auramind-gemini
npm run build && npm run preview   # serves the real app on :4173
node scripts/capture-store-screenshots.mjs
```

Capture them with `auramind-gemini/scripts/capture-store-screenshots.mjs`.

## Content rating (IARC)

- Violence: None
- Sexual content: None
- Profanity: None
- Drugs: None
- Gambling: None

Expected rating: **PEGI 3 / ESRB E / IARC General** (everyone, no objectionable content).

## Pricing & distribution

- **Pricing:** Free
- **In-app purchases:** Yes (AuraMind Premium subscription — Stripe backs this; Play subs are auto-mapped from Stripe via RevenueCat webhook — see `stripe-webhook.ts`).
- **Ads:** Planned for the free tier only — Google AdMob native/rewarded placements; Premium removes ads. Gravity is an optional future integration for clearly labeled sponsored suggestions in Prof. Aura.
- **Target age:** 13+ (US COPPA safe-harbor)
- **Privacy policy URL:** `https://auramind.app/privacy`
- **Terms of service URL:** `https://auramind.app/terms`
- **Support email:** `hello@auramind.app`

## Pre-launch checklist (Android-specific)

- [x] AAB signed and built (alias `auramind-upload`, SHA256 `C2:58:01:CB:...`) — see `auramind-gemini/android/keystore/README.md`
- [ ] AAB uploaded to Internal Testing track
- [ ] Closed testing runs cleanly for ≥ 14 days with at least 5 internal testers
- [ ] Privacy policy URL returns 200 (not 404)
- [x] App icon and feature graphic generated
- [x] Phone screenshots (7) generated
- [ ] Tablet screenshots (2+) captured
- [ ] Content rating questionnaire complete
- [ ] Data safety form accurate (we collect: account email, optional name/profile photo, study progress. We do NOT sell it.)
- [ ] Target audience selected (13+)
- [ ] News + Marketing opt-in chosen (we skip both)
- [ ] Pricing set to "Free" + USD
