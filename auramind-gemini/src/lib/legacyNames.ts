/**
 * Pre-rename names, kept only so data and links from before the move to
 * BonaMind keep working. This is the one web source file allowed to spell
 * them (enforced by src/__tests__/legacyStorageNames.test.ts); everything
 * else imports from here.
 */

/** The product's and the tutor's names before the rename, for mapping saved text. */
export const LEGACY_BRAND = 'AuraMind';
export const LEGACY_TUTOR = 'Prof. Aura';

/** Storage keys used to start with this, followed by `_`, `-`, `.` or `:`. */
export const LEGACY_PREFIX = 'auramind';

/** Deep links on installed builds, notifications and pinned shortcuts. */
export const LEGACY_SCHEME = 'auramind';

/** IndexedDB database that held offline decks, cards and queued reviews. */
export const LEGACY_OFFLINE_DB = 'auramind-offline';

/**
 * Error prefix raised by the join-classroom RPC. It lives in an applied,
 * append-only migration (supabase/migrations/20260919000000_classroom_portal.sql),
 * so the server keeps sending it and the client must keep matching it.
 */
export const CLASSROOM_ERROR_URN = 'urn:auramind:classroom';

/**
 * Windows 11 widget tag (PWA manifest `widgets[].tag`, matched in
 * public/widget-sw.js). The widget board finds pinned widgets by tag, so a
 * new tag would unpin everyone's widget. Permanent, like the Android stand-ins.
 */
export const WINDOWS_WIDGET_TAG = 'auramind-due';

/**
 * Wear OS data-layer paths shared with the watch app (WearSyncPlugin.java,
 * WearData.kt, both manifests). The phone and watch apps update separately,
 * so a changed path breaks sync for anyone on mixed versions. Permanent.
 */
export const WEAR_SYNC_PATH = '/auramind/sync';
export const WEAR_GRADE_PATH = '/auramind/grade';

/** The owner's Google Group for launch notifications: a real address. */
export const NOTIFY_LIST_EMAIL = 'auramind-app@googlegroups.com';
