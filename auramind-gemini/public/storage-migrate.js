/**
 * Moves localStorage keys from their pre-rename names (`auramind` followed by // legacy-name: ok
 * `_`, `-`, `.` or `:`) to the same key under `bonamind`, before any app
 * module runs. It is a classic script in index.html's <head> for that reason:
 * the bundler can hoist shared chunks above the entry's own code, but nothing
 * module-based runs until the page has parsed past this.
 *
 * Same rules as migrateLegacyKeysAsync in src/lib/storageMigration/legacyKeys.ts
 * (the Capacitor Preferences twin):
 *   - the new key already exists: it wins, and the old key is removed;
 *   - otherwise: read, remove the old key (freeing space on a full store),
 *     write the new key, and put the old value back if that write fails;
 *   - the run-once marker is set only when every key moved.
 * CSP-safe: no inline script, no eval. Never throws.
 */
(function () {
  var LEGACY = /^auramind([_\-.:])/; // legacy-name: ok
  var MARKER = 'bonamind_storage_migrated_v1';
  try {
    var ls = window.localStorage;
    if (ls.getItem(MARKER) !== null) return;
    var keys = [];
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i);
      if (k !== null) keys.push(k);
    }
    var failed = false;
    keys.forEach(function (oldKey) {
      if (!LEGACY.test(oldKey)) return;
      var newKey = oldKey.replace(LEGACY, 'bonamind$1');
      var value = null;
      try {
        if (ls.getItem(newKey) !== null) {
          ls.removeItem(oldKey);
          return;
        }
        value = ls.getItem(oldKey);
        if (value === null) return;
        ls.removeItem(oldKey);
        ls.setItem(newKey, value);
      } catch (e) {
        failed = true;
        if (value !== null) {
          try {
            if (ls.getItem(oldKey) === null) ls.setItem(oldKey, value);
          } catch (e2) {
            // Nothing more to try.
          }
        }
      }
    });
    if (!failed) ls.setItem(MARKER, '1');
  } catch (e) {
    // Private mode or blocked storage: the app reads its defaults.
  }
})();
