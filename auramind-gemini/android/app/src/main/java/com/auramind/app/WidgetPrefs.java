package com.auramind.app;

import android.content.SharedPreferences;

/**
 * Reads a widget value the web layer writes through Capacitor Preferences.
 *
 * Keys are `bonamind_<suffix>`. After an app update the widget or tile can
 * refresh before the app has been opened and has moved its keys from the
 * pre-rename `auramind_<suffix>`, so that name is the fallback; without it // legacy-name: ok
 * the widget would show zero cards due until the next app launch.
 */
final class WidgetPrefs {
    static final String PREFS = "CapacitorStorage";

    private WidgetPrefs() {}

    static String read(SharedPreferences prefs, String suffix, String fallback) {
        String current = prefs.getString("bonamind_" + suffix, null);
        if (current != null) return current;
        return prefs.getString("auramind_" + suffix, fallback); // legacy-name: ok
    }
}
