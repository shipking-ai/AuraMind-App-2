package com.auramind.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import org.junit.Test;

public class LegacyPrefsTest {
    @Test
    public void copiesEveryTypeThenClearsOld() {
        FakePrefs from = new FakePrefs();
        FakePrefs to = new FakePrefs();
        Set<String> tags = new HashSet<>(Arrays.asList("a", "b"));
        from.edit().putString("config", "{\"hour\":8}").putInt("count", 3).putLong("at", 99L)
                .putFloat("volume", 0.5f).putBoolean("on", true).putStringSet("tags", tags).commit();

        assertTrue(LegacyPrefs.migrate(from, to));

        assertEquals("{\"hour\":8}", to.getString("config", null));
        assertEquals(3, to.getInt("count", 0));
        assertEquals(99L, to.getLong("at", 0L));
        assertEquals(0.5f, to.getFloat("volume", 0f), 0f);
        assertTrue(to.getBoolean("on", false));
        assertEquals(tags, to.getStringSet("tags", null));
        assertTrue(from.getAll().isEmpty());
    }

    @Test
    public void leavesNonEmptyTargetAlone() {
        FakePrefs from = new FakePrefs();
        FakePrefs to = new FakePrefs();
        from.edit().putString("k", "old").commit();
        to.edit().putString("k", "new").commit();

        assertFalse(LegacyPrefs.migrate(from, to));

        assertEquals("new", to.getString("k", null));
        assertEquals("old", from.getString("k", null));
    }

    @Test
    public void noOpWhenOldIsEmpty() {
        FakePrefs from = new FakePrefs();
        FakePrefs to = new FakePrefs();

        assertFalse(LegacyPrefs.migrate(from, to));

        assertTrue(to.getAll().isEmpty());
    }
}
