# BonaMind Wear OS companion — signing notes

The watch app (`android/wear`, package `com.auramind.app.wear`) is a separate
APK that must be signed to ship on the Play Store. It shares the **same
release keystore and credentials** as the phone app — see
`auramind-gemini/android/keystore/README.md`.

## Rules (identical to the phone app)

- The keystore and passwords **never enter git**. They come from CI secrets
  (`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`) or a developer's `keystore.env`.
- The release build **loud-fails** without credentials — it never silently
  signs with the debug key.
- **Back up the keystore** (two offline copies: encrypted USB + password
  manager). Losing it means you cannot ship updates to the existing listing.

## Building

```bash
# Compile-only check (no credentials needed)
cd auramind-gemini/android && ./gradlew :wear:assembleDebug

# Signed release (with ANDROID_KEYSTORE_* env vars set)
./gradlew :wear:bundleRelease
```

The release AAB lands at `wear/build/outputs/bundle/release/app-release.aab`.

## Play Store note

Wear OS apps are companion apps: declare the phone app as the companion
dependency in Play Console, upload the watch AAB alongside the phone AAB, and
test on a Wear OS emulator or device before release.