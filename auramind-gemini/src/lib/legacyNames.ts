/**
 * Pre-rename names, kept only so data and links from before the move to
 * BonaMind keep working. This is the one web source file allowed to spell
 * them (enforced by src/__tests__/legacyStorageNames.test.ts); everything
 * else imports from here.
 */

/** Storage keys used to start with this, followed by `_`, `-`, `.` or `:`. */
export const LEGACY_PREFIX = 'auramind';

/** Deep links on installed builds, notifications and pinned shortcuts. */
export const LEGACY_SCHEME = 'auramind';

/** IndexedDB database that held offline decks, cards and queued reviews. */
export const LEGACY_OFFLINE_DB = 'auramind-offline';
