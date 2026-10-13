/**
 * Imported first by src/index.tsx, so it runs before any module that reads
 * localStorage while it is being imported (theme, app preferences). A missing
 * or blocked localStorage must never stop the app from starting.
 */
import { localStorageStore, migrateLegacyKeys } from './legacyKeys';

try {
  migrateLegacyKeys(localStorageStore());
} catch {
  // Private mode or blocked storage: readers fall back to their defaults.
}
