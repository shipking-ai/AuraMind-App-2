package com.auramind.app;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * Quick Settings tile: "Review · 12 due", one swipe down from anywhere.
 *
 * It reads the same CapacitorStorage prefs as the home-screen widget (see
 * AuraMindWidgetProvider and src/lib/widgetBridge.ts), so the tile and the
 * widget always agree on the count and neither reimplements FSRS in Java.
 *
 * Tapping collapses the shade and opens the review queue through the
 * auramind:// deep link, the same entry point as the launcher shortcuts.
 */
public class QuickReviewTileService extends TileService {

    private static final String PREFS = "CapacitorStorage";
    private static final String KEY_DUE = "auramind_widget_due";

    @Override
    public void onStartListening() {
        super.onStartListening();
        render();
    }

    @Override
    public void onClick() {
        super.onClick();
        Intent launch = new Intent(Intent.ACTION_VIEW, Uri.parse("auramind://app/dashboard/study"));
        launch.setClass(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (Build.VERSION.SDK_INT >= 34) {
            // API 34 removed startActivityAndCollapse(Intent) for apps
            // targeting it; the PendingIntent overload is the replacement.
            PendingIntent pending = PendingIntent.getActivity(this, 0, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            startActivityAndCollapse(pending);
        } else {
            startLegacy(launch);
        }
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    @SuppressWarnings("deprecation")
    private void startLegacy(Intent launch) {
        startActivityAndCollapse(launch);
    }

    private void render() {
        Tile tile = getQsTile();
        if (tile == null) return;
        int due = readDue(this);
        tile.setIcon(Icon.createWithResource(this, R.drawable.ic_shortcut_review));
        tile.setLabel(getString(R.string.tile_review_label));
        // ACTIVE draws the tile in the accent colour: a signal that there is
        // something to do. A clear queue sits back as INACTIVE.
        tile.setState(due > 0 ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        String subtitle = due > 0
                ? getResources().getQuantityString(R.plurals.tile_review_due, due, due)
                : getString(R.string.tile_review_clear);
        if (Build.VERSION.SDK_INT >= 29) {
            tile.setSubtitle(subtitle);
        }
        tile.setContentDescription(getString(R.string.tile_review_label) + ", " + subtitle);
        tile.updateTile();
    }

    static int readDue(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            String raw = prefs.getString(KEY_DUE, "0");
            return raw == null || raw.isEmpty() ? 0 : Math.max(0, Integer.parseInt(raw.replaceAll("\"", "").trim()));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** Ask the system to re-bind the tile so a new due count shows up. */
    static void requestRefresh(Context context) {
        try {
            TileService.requestListeningState(context,
                    new ComponentName(context, QuickReviewTileService.class));
        } catch (RuntimeException ignored) {
            // Tile not added, or the system refused; it re-renders when opened.
        }
    }
}
