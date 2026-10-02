/**
 * APP IDENTITY — the single source of truth for every user-visible product
 * name. This is the file a rename edits.
 *
 * Why this exists
 * ---------------
 * The product name was previously hardcoded in ~150 places across four
 * languages that cannot import each other:
 *
 *   TypeScript   src/lib/seo.ts, src/lib/pwa.ts, and inline JSX copy
 *   HTML         index.html <title> / meta / og: / twitter:
 *   XML          android/app/src/main/res/values/strings.xml
 *   plist        ios/App/App/Info.plist + ios/App/AuraMindWidgets/Info.plist
 *
 * Renaming meant a manual sweep across all of them, and missing one produced
 * a build that still said the old name in production. `src/lib/branding.ts`
 * was already the intended home for this, but only the legal/footer pages
 * actually imported it — the shell surfaces above bypassed it entirely.
 *
 * Consumers
 * ---------
 *   vite-plugins/brand-html.ts   rewrites index.html at build time
 *   capacitor.config.ts          native appName
 *   src/lib/pwa.ts               PWA manifest name/short_name
 *   src/lib/seo.ts               document title / og tags
 *   scripts/check-brand-sync.cjs verifies the native files that cannot
 *                                  import TypeScript (strings.xml, Info.plist)
 *
 * That last one is the important part: XML and plist cannot import a .ts
 * file, so they are synced by hand and then *asserted* by the check script.
 * Run `npm run brand:sync` after a rename to rewrite them.
 *
 * What is NOT here
 * ----------------
 * The package/bundle id is deliberately absent. It is load-bearing and
 * permanent:
 *
 *   com.auramind.app
 *
 * Google Play and the App Store both key a listing to that identifier
 * forever. Changing it after the first upload orphans the live listing, every
 * tester install link, and the 14-day closed-testing clock, with no way back.
 * A rename of the *display* name is always safe; a rename of the *package*
 * id is not. It lives in capacitor.config.ts as `appId` for that reason.
 */

/**
 * The display name. Must be a single word with no tagline: Google Play
 * rejects a store listing whose app name looks like a marketing slogan.
 */
export const APP_NAME = 'AuraMind';

/**
 * Home-screen / launcher label. Short enough not to truncate on a phone
 * home screen (Android caps this at roughly 12 characters before ellipsis),
 * and the PWA manifest `short_name` reuses it so an installed web app and
 * the native app agree.
 *
 * Only define this if the product name genuinely needs shortening. If the
 * short form is the same word as APP_NAME, leave it undefined — that keeps
 * the two from drifting apart.
 */
export const APP_SHORT_NAME = undefined as string | undefined;

/**
 * Store-listing tagline. Kept separate from APP_NAME on purpose: Play and
 * the App Store treat the name and the subtitle as distinct fields, and only
 * the subtitle may carry a description.
 */
export const APP_TAGLINE = 'Your AI Learning System';

/**
 * PWA manifest `description`, and the fallback meta description for the web
 * build. Longer than the tagline by design — this is prose for the install
 * prompt and search results, not a headline.
 *
 * Starts from APP_NAME by interpolation rather than typing the word out, so a
 * rename here cannot leave the description advertising the old product.
 */
export const APP_DESCRIPTION =
  `${APP_NAME} turns any PDF, video, or topic into a personalized course — ` +
  'AI flashcards, quizzes, FSRS v5 spaced repetition, and a tutor that ' +
  'remembers exactly what you struggle with.';

/**
 * Open Graph / Twitter title. Typically `name - tagline`, matching the
 * convention of the app title in the tab bar.
 */
export const APP_SOCIAL_TITLE = `${APP_NAME} - ${APP_TAGLINE}`;

/** PWA manifest `name`: the full, unabbreviated title. */
export const APP_MANIFEST_NAME = `${APP_NAME} - ${APP_TAGLINE}`;

/**
 * Resolved short name. Falls back to APP_NAME so callers never have to
 * branch on whether APP_SHORT_NAME was defined.
 */
export const APP_SHORT_NAME_RESOLVED = APP_SHORT_NAME ?? APP_NAME;

/**
 * The complete identity, for consumers that prefer one import.
 */
export const APP_IDENTITY = {
  name: APP_NAME,
  shortName: APP_SHORT_NAME_RESOLVED,
  tagline: APP_TAGLINE,
  description: APP_DESCRIPTION,
  socialTitle: APP_SOCIAL_TITLE,
  manifestName: APP_MANIFEST_NAME,
} as const;