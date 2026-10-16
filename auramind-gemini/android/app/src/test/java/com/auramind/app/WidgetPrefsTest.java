package com.auramind.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class WidgetPrefsTest {
    @Test
    public void newKeyWins() {
        FakePrefs prefs = new FakePrefs();
        prefs.edit().putString("bonamind_widget_due", "4").putString("auramind_widget_due", "9").commit(); // legacy-name: ok

        assertEquals("4", WidgetPrefs.read(prefs, "widget_due", "0"));
    }

    @Test
    public void fallsBackToOldKey() {
        // After an update the widget can refresh before the app has opened
        // and moved its keys; it must still show the real count.
        FakePrefs prefs = new FakePrefs();
        prefs.edit().putString("auramind_widget_due", "7").commit(); // legacy-name: ok

        assertEquals("7", WidgetPrefs.read(prefs, "widget_due", "0"));
    }

    @Test
    public void fallbackValueWhenNeither() {
        FakePrefs prefs = new FakePrefs();

        assertEquals("0", WidgetPrefs.read(prefs, "widget_due", "0"));
        assertNull(WidgetPrefs.read(prefs, "widget_deck", null));
    }
}
