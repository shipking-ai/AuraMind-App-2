package com.auramind.app.wear

import android.content.SharedPreferences

/**
 * Moves a SharedPreferences file from its pre-rename name to its BonaMind
 * name. Copies only when the new file is still empty, and clears the old file
 * only after the copy committed, so queued grades are never lost or doubled.
 * (The phone app has its own copy; the two modules don't share code.)
 */
object LegacyPrefs {
    @Suppress("UNCHECKED_CAST")
    fun migrate(from: SharedPreferences, to: SharedPreferences): Boolean {
        val old = from.all
        if (old.isEmpty() || to.all.isNotEmpty()) return false
        val editor = to.edit()
        for ((key, value) in old) {
            when (value) {
                is String -> editor.putString(key, value)
                is Int -> editor.putInt(key, value)
                is Long -> editor.putLong(key, value)
                is Float -> editor.putFloat(key, value)
                is Boolean -> editor.putBoolean(key, value)
                is Set<*> -> editor.putStringSet(key, value as Set<String>)
            }
        }
        if (!editor.commit()) return false
        from.edit().clear().commit()
        return true
    }
}
