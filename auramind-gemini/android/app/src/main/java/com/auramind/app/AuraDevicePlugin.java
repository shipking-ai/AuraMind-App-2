package com.auramind.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.WindowManager;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * AuraDevice — the launcher and window integrations a WebView cannot reach.
 *
 *  - Dynamic shortcuts: long-pressing the launcher icon lists the decks the
 *    user studied most recently, next to the three static shortcuts.
 *  - Pinned shortcuts: "Add to home screen" for a single deck, through the
 *    launcher's own confirmation dialog.
 *  - Keep awake: the screen stays on while a study session is open, the way
 *    a reader or a video player behaves.
 *
 * Every shortcut is an auramind://app/dashboard/study/<deckId> VIEW intent,
 * so it lands in the same deep-link path (and allowlist) as the static ones.
 */
@CapacitorPlugin(name = "AuraDevice")
public class AuraDevicePlugin extends Plugin {

    /** Launchers show at most four or five; three are static. */
    private static final int MAX_DYNAMIC = 2;
    private static final String PREFIX = "deck_";

    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setRecentDecks(PluginCall call) {
        JSArray decks = call.getArray("decks");
        if (decks == null) {
            call.reject("decks is required");
            return;
        }
        Context context = getContext();
        List<ShortcutInfoCompat> shortcuts = new ArrayList<>();
        try {
            for (int i = 0; i < decks.length() && shortcuts.size() < MAX_DYNAMIC; i++) {
                JSONObject deck = decks.getJSONObject(i);
                String id = deck.optString("id", "");
                String title = deck.optString("title", "").trim();
                if (id.isEmpty() || title.isEmpty()) continue;
                shortcuts.add(buildDeckShortcut(context, id, title, i));
            }
        } catch (JSONException e) {
            call.reject("decks must be [{ id, title }]");
            return;
        }
        // setDynamicShortcuts replaces the whole dynamic set, so a deleted
        // deck drops off the launcher on the next publish.
        ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts);
        call.resolve();
    }

    @PluginMethod
    public void reportDeckUsed(PluginCall call) {
        String id = call.getString("id");
        if (id != null && !id.isEmpty()) {
            // Feeds the launcher's ranking and Android's app-suggestion model.
            ShortcutManagerCompat.reportShortcutUsed(getContext(), PREFIX + id);
        }
        call.resolve();
    }

    @PluginMethod
    public void canPinShortcuts(PluginCall call) {
        JSObject out = new JSObject();
        out.put("supported", ShortcutManagerCompat.isRequestPinShortcutSupported(getContext()));
        call.resolve(out);
    }

    @PluginMethod
    public void pinDeck(PluginCall call) {
        String id = call.getString("id", "");
        String title = call.getString("title", "").trim();
        if (id.isEmpty() || title.isEmpty()) {
            call.reject("id and title are required");
            return;
        }
        Context context = getContext();
        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(context)) {
            call.reject("unsupported", "This launcher does not support pinned shortcuts.");
            return;
        }
        // The launcher shows its own confirmation; true only means the
        // request was delivered, not that the user accepted it.
        boolean requested = ShortcutManagerCompat.requestPinShortcut(
                context, buildDeckShortcut(context, id, title, 0), null);
        JSObject out = new JSObject();
        out.put("requested", requested);
        call.resolve(out);
    }

    private static ShortcutInfoCompat buildDeckShortcut(Context context, String id, String title, int rank) {
        Intent intent = new Intent(Intent.ACTION_VIEW,
                Uri.parse("auramind://app/dashboard/study/" + Uri.encode(id)));
        intent.setClass(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // Short labels are cut at ~10 characters on most launchers.
        String shortLabel = title.length() > 12 ? title.substring(0, 11) + "…" : title;
        return new ShortcutInfoCompat.Builder(context, PREFIX + id)
                .setShortLabel(shortLabel)
                .setLongLabel(context.getString(R.string.shortcut_deck_long, title))
                .setIcon(IconCompat.createWithResource(context, R.drawable.ic_shortcut_review))
                .setIntent(intent)
                .setRank(rank)
                .build();
    }
}
