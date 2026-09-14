# M6 Store Submission — operator playbook

This doc is the single-page checklist for everything you, the maintainer,
must provision *outside* the codebase before the first production cut of
AuraMind. Pair it with the M5 platform hardening + the brand surface
shipped in `lib/branding.ts`.

**Android is the only wired release pipeline.** `mobile-android.yml`
builds and signs the AAB; `deploy.yml` ships the web app to Vercel.
There is no iOS or desktop build.

Run `node scripts/check-mobile-env.js` (from `auramind-gemini/`) to see
which secrets are missing. Items marked **🟠 MUST provision** block the
store upload they name; **🟡 optional** items unlock better UX but a
build still works without them.

---

## 1. GitHub repo secrets (Settings → Secrets and variables → Actions)

All secrets are encrypted at rest and only exposed to jobs that
declare `secrets:` access. None of these values should land in this
repo, in commit history, or in a notes tool.

### Wired today

These are consumed by workflows that exist in `.github/workflows/`.

| Secret                               | Used by            | Required for |
|--------------------------------------|--------------------|--------------|
| 🟠 `ANDROID_KEYSTORE_B64`            | mobile-android.yml | Android release keystore (base64) |
| 🟠 `ANDROID_KEYSTORE_PASSWORD`       | mobile-android.yml | Android keystore password |
| 🟠 `ANDROID_KEY_ALIAS`               | mobile-android.yml | Android key alias (e.g. `auramind-release`) |
| 🟠 `ANDROID_KEY_PASSWORD`            | mobile-android.yml | Android key password |
| 🟠 `PLAY_STORE_SERVICE_ACCOUNT_JSON` | mobile-android.yml | Google Play API service-account JSON |
| 🟠 `VERCEL_TOKEN`                    | deploy.yml         | Web deploy to Vercel |
| 🟠 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | deploy.yml | Client Supabase config (public) |
| 🟠 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`   | migration-drift.yml | Server-side schema checks |
| 🟠 `VITE_STRIPE_PUBLISHABLE_KEY`     | deploy.yml         | Client Stripe config (public) |
| 🟡 `VITE_POSTHOG_KEY`                | deploy.yml         | Product analytics |

Generate the Android release keystore first. **The backup is
irreplaceable**: losing the keystore means you cannot upload updates to
the existing Play listing. Keep two offline copies.

Android is the only native target. There is no iOS project, so no Apple
secrets are needed.

---

## 2. Google Play Console

### 2.1 Create the app record

1. https://play.google.com/console → All apps → Create app.
2. App name: AuraMind
3. Default language: English (United States)
4. App or game → App
5. Free or paid: Free

### 2.2 Service-account JSON for API uploads

1. Google Cloud Console → IAM & Admin → Service Accounts → Create.
2. Grant the "Service Account User" role on the **Play Internal Apps
   Admin** (or the new release-management role once migrated).
3. Create a JSON key. Download + store in a password manager.
4. In Play Console → Setup → API access → Link the service account.

### 2.3 First track upload (internal testing → production)

`store/android/changelogs/en-US.txt` is the changelog fed to
`fastlane supply` on every `r0adkll/upload-google-play` invocation.
The circle of trust:

1. Build → push to **internal testing** track.
2. Roll out to internal testers. Verify end-to-end against the Maven
   crash + the AI deck flow.
3. Promote internal → closed beta → production with 10% → 50% → 100%
   staged rollout.

### 2.4 Play Store listing fields

`store/android/listings/en-US/full_description.txt` syncs on every CI
build. The values map (Play → mint → asciidoc):

- **App name**: 30 char cap, exact "AuraMind"
- **Short description**: 80 char cap
- **Full description**: 4000 char cap
- **App icon**: 512×512 PNG (also auto-generates adaptive from supplied
  foreground/background)
- **Feature graphic**: 1024×500 PNG
- **Screenshots**: 2–8 phone (320–3840px), 2–8 tablet (7"+ and 10"+)

---

## 3. Pre-flight check (everything in one place)

From `auramind-gemini/scripts/check-mobile-env.js`:

```bash
# Android only (cheapest minimal check):
node scripts/check-mobile-env.js

# Android + Play Store upload:
node scripts/check-mobile-env.js --with-play

```

The script never prints secret values. It verifies file-existence and
plausible shape (length, prefix, JSON marker) and exits 0 when all
required items are present.

---

## 4. Routine cadence after launch

| Action                                           | Cadence      |
|--------------------------------------------------|--------------|
| Upload a maintenance AAB to Play Internal         | Every release |
| Verify the Play listing still renders correctly   | Per release  |
| Rotate the Play service-account key               | Annually     |
| Regenerate supabase JWT signing keys              | Quarterly    |
