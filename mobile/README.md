# BonaMind mobile

The native BonaMind app for iPhone and Android, built with **Expo SDK 57**
(React Native 0.86, Expo Router, New Architecture). Versions of `expo*`,
`react*` and `@react-native*` packages are pinned exactly; upgrade them
together with `npx expo install --fix`.

Shared logic (types, FSRS scheduling, Supabase queries, the offline outbox,
the Prof. Linnea client) comes from `@bonamind/core` in `../packages/core`,
linked as a `file:` dependency. Install it first:

```bash
cd ../packages/core && npm ci && cd ../../mobile && npm ci
```

| Task | Command |
|---|---|
| Dev server | `npm start` |
| Tests | `npm test` |
| Type-check | `npm run type-check` |
| Lint | `npm run lint` |
| Android dev build | `npm run android` |

iOS builds run in the cloud (EAS Build or the `mobile-builds.yml` GitHub
workflow); there is no local Xcode requirement.

Env (all public by design, read in `src/env.ts`): `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`,
`EXPO_PUBLIC_TURNSTILE_SITE_KEY`, `EXPO_PUBLIC_SENTRY_DSN`,
`EXPO_PUBLIC_APPLE_SIGN_IN`, `EXPO_PUBLIC_E2E`.

Fonts: Bona Sans is Sora and Bona Script is Great Vibes, both under the SIL
Open Font License (see `assets/fonts/OFL-*.txt`).
