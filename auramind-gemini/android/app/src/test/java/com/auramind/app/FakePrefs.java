package com.auramind.app;

import android.content.SharedPreferences;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** In-memory SharedPreferences for plain JVM tests (no Robolectric here). */
final class FakePrefs implements SharedPreferences {
    final Map<String, Object> values = new HashMap<>();

    @Override public Map<String, ?> getAll() { return new HashMap<>(values); }
    @Override public String getString(String key, String def) { return values.containsKey(key) ? (String) values.get(key) : def; }
    @SuppressWarnings("unchecked")
    @Override public Set<String> getStringSet(String key, Set<String> def) { return values.containsKey(key) ? (Set<String>) values.get(key) : def; }
    @Override public int getInt(String key, int def) { return values.containsKey(key) ? (Integer) values.get(key) : def; }
    @Override public long getLong(String key, long def) { return values.containsKey(key) ? (Long) values.get(key) : def; }
    @Override public float getFloat(String key, float def) { return values.containsKey(key) ? (Float) values.get(key) : def; }
    @Override public boolean getBoolean(String key, boolean def) { return values.containsKey(key) ? (Boolean) values.get(key) : def; }
    @Override public boolean contains(String key) { return values.containsKey(key); }
    @Override public void registerOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) {}
    @Override public void unregisterOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) {}

    @Override public Editor edit() {
        return new Editor() {
            private final Map<String, Object> pending = new HashMap<>();
            private final Set<String> removed = new HashSet<>();
            private boolean clear;

            @Override public Editor putString(String k, String v) { pending.put(k, v); return this; }
            @Override public Editor putStringSet(String k, Set<String> v) { pending.put(k, v == null ? null : new HashSet<>(v)); return this; }
            @Override public Editor putInt(String k, int v) { pending.put(k, v); return this; }
            @Override public Editor putLong(String k, long v) { pending.put(k, v); return this; }
            @Override public Editor putFloat(String k, float v) { pending.put(k, v); return this; }
            @Override public Editor putBoolean(String k, boolean v) { pending.put(k, v); return this; }
            @Override public Editor remove(String k) { removed.add(k); return this; }
            @Override public Editor clear() { clear = true; return this; }
            @Override public boolean commit() {
                if (clear) values.clear();
                for (String k : removed) values.remove(k);
                values.putAll(pending);
                return true;
            }
            @Override public void apply() { commit(); }
        };
    }
}
