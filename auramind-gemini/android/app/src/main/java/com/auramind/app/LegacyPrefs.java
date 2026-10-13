package com.auramind.app;

import android.content.SharedPreferences;

import java.util.Map;
import java.util.Set;

/**
 * Moves a SharedPreferences file from its pre-rename name to its BonaMind
 * name. Callers open both files and call this before their first read; it
 * copies only when the new file is still empty, so a value written under the
 * new name is never overwritten, and it clears the old file only after the
 * copy committed.
 */
final class LegacyPrefs {
    private LegacyPrefs() {}

    /** Returns whether anything was copied. */
    @SuppressWarnings("unchecked")
    static boolean migrate(SharedPreferences from, SharedPreferences to) {
        Map<String, ?> old = from.getAll();
        if (old.isEmpty() || !to.getAll().isEmpty()) return false;
        SharedPreferences.Editor editor = to.edit();
        for (Map.Entry<String, ?> entry : old.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            if (value instanceof String) editor.putString(key, (String) value);
            else if (value instanceof Integer) editor.putInt(key, (Integer) value);
            else if (value instanceof Long) editor.putLong(key, (Long) value);
            else if (value instanceof Float) editor.putFloat(key, (Float) value);
            else if (value instanceof Boolean) editor.putBoolean(key, (Boolean) value);
            else if (value instanceof Set) editor.putStringSet(key, (Set<String>) value);
        }
        if (!editor.commit()) return false;
        from.edit().clear().commit();
        return true;
    }
}
