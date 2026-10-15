# Android release keystore

This directory holds the **release upload keystore** for BonaMind
(`com.auramind.app`). It is gitignored — the keystore and its passwords must
never be committed.

## What's here

| File | Purpose | Committed? |
|---|---|---|
| `release.keystore` | RSA 2048 upload key, alias `auramind-upload` | ❌ no |
| `keystore.env` | Local dev credentials (gitignored) | ❌ no |

## ⚠️ Back this up. It is irreplaceable.

The release keystore is the **only** key that can sign updates to the existing
Play Store listing. If it's lost, you cannot publish a single update — you'd
have to republish as a brand-new app with a new package name.

Store **two offline copies** in a secure location (encrypted USB + password
manager like 1Password/Bitwarden), each containing:

1. `release.keystore` (the file itself)
2. The keystore password
3. The key alias (`auramind-upload`)
4. The key password

## Local dev

`keystore.env` was generated with a random password and sets the four env vars
the Gradle `release` build needs:

```
ANDROID_KEYSTORE_PATH=android/keystore/release.keystore
ANDROID_KEYSTORE_PASSWORD=...
ANDROID_KEY_ALIAS=auramind-upload
ANDROID_KEY_PASSWORD=...
```

Source it before building:

```powershell
# PowerShell
Get-Content android/keystore/keystore.env | ForEach-Object {
  if ($_ -match '^([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2]) }
}
```

Then build the signed AAB:

```bash
cd android && ./gradlew bundleRelease
```

## CI/CD

GitHub Actions reads the same four values from **repository secrets**
(see `docs/M6-store-submission-playbook.md` §1):

- `ANDROID_KEYSTORE_B64` — base64 of `release.keystore`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The workflow decodes `ANDROID_KEYSTORE_B64` to `android/keystore/release.keystore`
on the runner and removes it afterwards.

## Inspect the key

```bash
keytool -list -v -keystore android/keystore/release.keystore
```
