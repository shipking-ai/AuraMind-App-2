# AuraMind Pre-Launch Checklist

> **Single source of truth for "are we ready to ship?"** Every box below must
> be ticked before a Play submission. Items map directly to the boxes
> Google's review team checks. Update this checklist with the date of
> each completion so we have an audit trail.

**Target first release date:** ___________

---

## 1. Branding & legal

- [ ] **Privacy policy URL returns 200** — `https://auramind.app/privacy`
- [ ] **Terms of service URL returns 200** — `https://auramind.app/terms`
- [ ] **Support URL returns 200** — `https://auramind.app/support` (or
      `mailto:hello@auramind.app` works)
- [ ] **Privacy policy lists**: CogniVect, Inc as operator; data collected
      (account email, optional profile photo, study progress, crash logs,
      Stripe-billing metadata); all third-party SDKs (Sentry, PostHog,
      Stripe); storage duration; user's rights under GDPR + CCPA; contact
      channel.
- [ ] **Terms of service lists**: subscription auto-renew, cancellation
      procedure, refund policy, prohibited content rules, limitation of
      liability (limited to CogniVect and its affiliates), jurisdiction.
- [ ] **Both pages render CogniVect footer** (the parent-company byline
      "AuraMind — a CogniVect product") at the bottom, with the year-frozen
      copyright line on the right.

## 2. Build artifacts

- [x] Android AAB signed with the **production upload keystore**
      (`auramind-gemini/android/keystore/release.keystore`).
- [ ] Wear OS companion AAB signed with the **same upload keystore**
      (`com.auramind.app.wear` — `./gradlew :wear:bundleRelease`).
- [x] Android `versionCode` increments by 1 every release (currently `1`).
- [x] Android target SDK ≥ 34 (we ship **36**).
- [ ] No leftover debug logs in release AAB (verify with `adb logcat`
      on a sideloaded release build — there should be no `console.log`.
      We use Sentry's `beforeSend` stripper to strip browser debug logs.)
- [x] ProGuard / R8 mapping file generated
      (`auramind-gemini/android/app/build/outputs/mapping/release/mapping.txt`)
      — upload to Sentry/Crashlytics for symbolicated crashes.

## 3. Capabilities & permissions

- [ ] Android: `INTERNET` permission declared
      (already in `AndroidManifest.xml`).
- [ ] Android: Push Notifications permission declared IF google-services.json
      is present; the build script auto-applies the plugin when present.
## 4. Closed Testing

- [ ] Google Play Internal Testing track has ≥ 5 internal testers.
- [ ] Internal Testing track has been running ≥ 14 days with no P0 bugs.
- [ ] At least 5 distinct real-device installs (mixed Pixel + Samsung).

## 5. Store listings

### Google Play Console

- [ ] App name "AuraMind" entered.
- [ ] Short + long description from `store/android/listing.md` pasted.
- [x] Phone screenshots generated (7) — `store/graphics/android/screenshots/`.
- [ ] Wear OS companion app build tested on a Wear OS emulator/device (review
      flow + Tile + complication) and uploaded to Internal Testing.
- [ ] Tablet screenshots captured (2+).
- [x] Feature graphic generated — `store/graphics/android/feature-1024x500.png`.
- [x] App icon generated — `store/graphics/android/icon-512.png`
      (with adaptive icon foreground).
- [ ] Privacy policy URL set.
- [ ] Content rating (IARC) questionnaire complete.
- [ ] Data safety form accurate (we collect: account email, optional name,
      optional profile photo, study progress, crash logs, billing metadata).
- [ ] Target audience 13+ selected.
- [ ] Pricing Free, in-app products configured.
- [ ] Closed Testing → Production release submitted.

## 6. Operational readiness

- [ ] Stripe webhook endpoint live + verified.
- [ ] Sentry crash reporting live + verified (test crash on a closed-testing build).
- [ ] PostHog analytics live + verified (test event lands).
- [ ] Error budget alert wired (e.g., Sentry PagerDuty).
- [ ] On-call rotation documented (one human responsible for launches).
- [ ] Runbook (this file!) up to date with each launch.

## 7. Monetization & advertising (free tier)

- [ ] Integrate Google AdMob for Android free-tier native/rewarded placements.
- [ ] Keep ads off the auth screen, onboarding, active flashcards, voice study,
      and exam-focused sessions.
- [ ] Premium subscription removes all ads.
- [ ] Use rewarded ads only when the learner explicitly opts in (for example,
      an extra AI generation or audio allowance).
- [ ] Evaluate Gravity separately for clearly labeled sponsored suggestions
      inside Prof. Aura responses; it is optional and not a replacement for
      standard Android ad inventory.
- [ ] Complete consent, Data safety, and Google Play "Contains ads" disclosures
      before enabling the ad SDK in a release build.

## 8. Final go/no-go

- [ ] All "P0" bugs from Internal Testing closed.
- [ ] No crashlytics signal during last 7-day Internal Testing window.
- [ ] Marketing website updated with current screenshots.
- [ ] Email blast drafted (or skipped if silent launch).
- [ ] Twitter post drafted.
- [ ] Play Store link recorded for analytics attribution.
- [ ] Date of release: _____________

**Sign-off:**

- Engineering: ___________________________
- Product: ___________________________
- Design: ___________________________
