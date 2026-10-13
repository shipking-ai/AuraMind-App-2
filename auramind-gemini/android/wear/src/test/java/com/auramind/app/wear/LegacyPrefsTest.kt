package com.auramind.app.wear

import android.content.SharedPreferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** In-memory SharedPreferences for plain JVM tests. */
private class FakePrefs : SharedPreferences {
    val values = mutableMapOf<String, Any?>()

    override fun getAll(): MutableMap<String, *> = values.toMutableMap()
    override fun getString(key: String, def: String?) = if (key in values) values[key] as String? else def
    @Suppress("UNCHECKED_CAST")
    override fun getStringSet(key: String, def: MutableSet<String>?) =
        if (key in values) values[key] as MutableSet<String>? else def
    override fun getInt(key: String, def: Int) = (values[key] as Int?) ?: def
    override fun getLong(key: String, def: Long) = (values[key] as Long?) ?: def
    override fun getFloat(key: String, def: Float) = (values[key] as Float?) ?: def
    override fun getBoolean(key: String, def: Boolean) = (values[key] as Boolean?) ?: def
    override fun contains(key: String) = key in values
    override fun registerOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener) {}
    override fun unregisterOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener) {}

    override fun edit(): SharedPreferences.Editor = object : SharedPreferences.Editor {
        val pending = mutableMapOf<String, Any?>()
        val removed = mutableSetOf<String>()
        var clear = false
        override fun putString(k: String, v: String?) = apply { pending[k] = v }
        override fun putStringSet(k: String, v: MutableSet<String>?) = apply { pending[k] = v?.toMutableSet() }
        override fun putInt(k: String, v: Int) = apply { pending[k] = v }
        override fun putLong(k: String, v: Long) = apply { pending[k] = v }
        override fun putFloat(k: String, v: Float) = apply { pending[k] = v }
        override fun putBoolean(k: String, v: Boolean) = apply { pending[k] = v }
        override fun remove(k: String) = apply { removed += k }
        override fun clear() = apply { clear = true }
        override fun commit(): Boolean {
            if (clear) values.clear()
            removed.forEach { values.remove(it) }
            values.putAll(pending)
            return true
        }
        override fun apply() { commit() }
    }
}

class LegacyPrefsTest {
    @Test
    fun `copies every entry then clears the old file`() {
        val from = FakePrefs()
        val to = FakePrefs()
        from.edit().putString("queue", "[{\"cardId\":\"c1\"}]").putBoolean("overflowed", true).commit()

        assertTrue(LegacyPrefs.migrate(from, to))

        assertEquals("[{\"cardId\":\"c1\"}]", to.getString("queue", null))
        assertTrue(to.getBoolean("overflowed", false))
        assertTrue(from.all.isEmpty())
    }

    @Test
    fun `leaves a non-empty target alone`() {
        val from = FakePrefs()
        val to = FakePrefs()
        from.edit().putString("queue", "old").commit()
        to.edit().putString("queue", "new").commit()

        assertFalse(LegacyPrefs.migrate(from, to))

        assertEquals("new", to.getString("queue", null))
        assertEquals("old", from.getString("queue", null))
    }

    @Test
    fun `does nothing when the old file is empty`() {
        val from = FakePrefs()
        val to = FakePrefs()

        assertFalse(LegacyPrefs.migrate(from, to))

        assertTrue(to.all.isEmpty())
    }
}
